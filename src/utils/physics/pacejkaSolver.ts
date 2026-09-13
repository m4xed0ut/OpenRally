import type { VehicleConfig, IRapierVehicleController, SurfaceType } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';
import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3, Quaternion } from 'three';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';
import { getElevatedStructureHeight } from '@/utils/physics/elevatedStructures';
import { getSurfaceAtPosition, getInterpolatedSteeringAngle } from '@/utils/physics/tires';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';
import { GEAR_RATIOS, BRAKE_SPEED_THRESHOLD, REVERSE_FORCE_MULTIPLIER, REVERSE_MAX_SPEED } from '@/config/vehicle';
import { clamp } from '@/utils/math';

// Pre-allocated scratch instances to guarantee zero allocation / zero GC pressure in the simulation loop
const _chassisPos = new Vector3();
const _chassisQuat = new Quaternion();
const _invQuat = new Quaternion();
const _linvel = new Vector3();
const _angvel = new Vector3();
const _localAngvel = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();
const _up = new Vector3();

const _wheelLocalPos = new Vector3();
const _wheelMountWorld = new Vector3();
const _wheelForcePoint = new Vector3();
const _wheelForward = new Vector3();
const _wheelRight = new Vector3();
const _wheelVelWorld = new Vector3();
const _armVec = new Vector3();
const _rotationalVel = new Vector3();

const _suspensionImpulse = new Vector3();
const _tireImpulse = new Vector3();
const _stabilizationTorque = new Vector3();
const _worldUp = new Vector3(0, 1, 0);

/**
 * Dual-Track Pacejka Vehicle Dynamics Solver.
 * Implements physically authentic rally car simulation:
 * - 4 independent suspension struts with progressive spring and damping kinematics
 * - Front and rear Anti-Roll Bars (ARB) resisting chassis roll
 * - Pacejka Magic Formula lateral tire curves with stable drift plateau (no snap-spins)
 * - AWD active center differential with dynamic slide pull
 * - Contact patch forces applied at competition Roll Center height (no moment arm flippiness)
 * - Fully conforms to IRapierVehicleController for 100% visual wheel, particle, audio, and HUD compatibility.
 */
export class PacejkaVehicleSolver implements IRapierVehicleController {
  private _suspensionLengths: number[] = [0.35, 0.35, 0.35, 0.35];
  private _wheelInContact: boolean[] = [false, false, false, false];
  private _wheelSteeringAngles: number[] = [0, 0, 0, 0];
  private _wheelFrictions: number[] = [2.2, 2.2, 2.2, 2.2];
  private _wheelEngineForces: number[] = [0, 0, 0, 0];
  private _wheelBrakes: number[] = [0, 0, 0, 0];
  private _prevDistToGround: number[] = [0.65, 0.65, 0.65, 0.65];
  private _prevWheelContact: boolean[] = [false, false, false, false];
  private _airborneDuration: number = 0;
  private _landingSettleTimer: number = 0;
  private _bumpOversteerTimer: number = 0;
  private _bumpSeverity: number = 0;

  private readonly config: VehicleConfig;
  public surface: SurfaceType = 'tarmac';
  public groundedRatio: number = 1.0;
  public forwardSpeed: number = 0;
  public lateralSpeed: number = 0;
  public speedKmh: number = 0;
  public slipAngle: number = 0;
  public tireGrips: number[] = [2.2, 2.2, 2.2, 2.2];

  constructor(config: VehicleConfig) {
    this.config = config;
    const wheelCount = config.wheels.length;
    this._suspensionLengths = config.wheels.map((w) => w.suspensionRestLength ?? 0.35);
    this._wheelInContact = new Array(wheelCount).fill(false);
    this._wheelSteeringAngles = new Array(wheelCount).fill(0);
    this._wheelFrictions = new Array(wheelCount).fill(2.2);
    this._wheelEngineForces = new Array(wheelCount).fill(0);
    this._wheelBrakes = new Array(wheelCount).fill(0);
    this._prevDistToGround = new Array(wheelCount).fill(0.65);
    this._prevWheelContact = new Array(wheelCount).fill(false);
    this.tireGrips = new Array(wheelCount).fill(2.2);
  }

  /**
   * Resets suspension compression history.
   * Called during tab switches, window blur/focus, or physics respawns to prevent
   * velocity calculation spikes that could launch the vehicle into the air.
   */
  public resetSuspensionHistory(): void {
    const wheelCount = this.config.wheels.length;
    this._prevDistToGround = new Array(wheelCount).fill(-1);
    this._prevWheelContact = new Array(wheelCount).fill(false);
    this._airborneDuration = 0;
    this._landingSettleTimer = 0;
    this._bumpOversteerTimer = 0;
    this._bumpSeverity = 0;
  }

  // ─── IRapierVehicleController Implementation ───────────────────────────
  public setWheelEngineForce(wheelIndex: number, force: number): void {
    if (wheelIndex >= 0 && wheelIndex < this._wheelEngineForces.length) {
      this._wheelEngineForces[wheelIndex] = force;
    }
  }

  public setWheelBrake(wheelIndex: number, brake: number): void {
    if (wheelIndex >= 0 && wheelIndex < this._wheelBrakes.length) {
      this._wheelBrakes[wheelIndex] = brake;
    }
  }

  public setWheelSteering(wheelIndex: number, steering: number): void {
    if (wheelIndex >= 0 && wheelIndex < this._wheelSteeringAngles.length) {
      this._wheelSteeringAngles[wheelIndex] = steering;
    }
  }

  public setWheelFrictionSlip(wheelIndex: number, friction: number): void {
    if (wheelIndex >= 0 && wheelIndex < this._wheelFrictions.length) {
      this._wheelFrictions[wheelIndex] = friction;
    }
  }

  public wheelSuspensionLength(wheelIndex: number): number | null {
    return this._suspensionLengths[wheelIndex] ?? null;
  }

  public wheelChassisConnectionPointCs(wheelIndex: number): { x: number; y: number; z: number } | null {
    const wheel = this.config.wheels[wheelIndex];
    if (!wheel) return null;
    return { x: wheel.position[0], y: wheel.position[1], z: wheel.position[2] };
  }

  public wheelSteering(wheelIndex: number): number | null {
    return this._wheelSteeringAngles[wheelIndex] ?? null;
  }

  public wheelIsInContact(wheelIndex: number): boolean {
    return this._wheelInContact[wheelIndex] ?? false;
  }

  // ─── Core Physics Step ─────────────────────────────────────────────────
  public update(
    body: RapierRigidBody,
    input: InputState,
    dt: number,
    currentGear: number,
    heightmapData?: HeightmapData,
    levelData?: LevelData,
    powerMultiplier = 1.0,
  ): void {
    const rawPos = body.translation();
    const rawRot = body.rotation();
    const rawLinvel = body.linvel();
    const rawAngvel = body.angvel();
    const mass = typeof body.mass === 'function' ? body.mass() : this.config.chassisMass;

    _chassisPos.set(rawPos.x, rawPos.y, rawPos.z);
    _chassisQuat.set(rawRot.x, rawRot.y, rawRot.z, rawRot.w);
    _invQuat.copy(_chassisQuat).invert();
    _linvel.set(rawLinvel.x, rawLinvel.y, rawLinvel.z);
    _angvel.set(rawAngvel.x, rawAngvel.y, rawAngvel.z);

    _localAngvel.copy(_angvel).applyQuaternion(_invQuat);
    _forward.set(0, 0, 1).applyQuaternion(_chassisQuat);
    _right.set(1, 0, 0).applyQuaternion(_chassisQuat);
    _up.set(0, 1, 0).applyQuaternion(_chassisQuat);

    this.forwardSpeed = _linvel.dot(_forward);
    this.lateralSpeed = _linvel.dot(_right);
    const groundSpeed = Math.hypot(this.forwardSpeed, this.lateralSpeed);
    this.speedKmh = groundSpeed * 3.6;

    if (Math.abs(this.forwardSpeed) > 1.0) {
      this.slipAngle = Math.atan2(this.lateralSpeed, this.forwardSpeed);
    } else {
      this.slipAngle = 0;
    }

    // Determine terrain surface
    this.surface = getSurfaceAtPosition(rawPos.x, rawPos.y, rawPos.z, heightmapData, levelData);
    const surfaceDef = getSurfaceDefinition(this.surface);
    const tireModel = surfaceDef.tireModel;

    // Steering angle calculation:
    // In OpenRally convention: +1.0 is Left (KeyA), -1.0 is Right (KeyD).
    // In vehicle chassis local coordinates, rotating front wheels around local UP by a positive angle
    // angles the front wheels towards the driver's left, producing leftward yaw and trajectory.
    const maxSteerAngle = getInterpolatedSteeringAngle(this.speedKmh, this.config.handling.steeringCurve);
    const steerAngle = input.steering * maxSteerAngle;

    // Speed-scaled maximum realistic yaw rate (prevents oversteer controller from treating extreme spin rates at speed as intended)
    const maxAllowedYawRate = clamp(14.0 / Math.max(7.0, Math.abs(this.forwardSpeed)), 0.35, 1.8);
    const rawIntendedYaw = (this.forwardSpeed / 2.6) * Math.sin(steerAngle) * 0.65;
    const intendedYawRate = clamp(rawIntendedYaw, -maxAllowedYawRate, maxAllowedYawRate);
    const yawDiscrepancy = _localAngvel.y - intendedYawRate;

    // Dynamic Oversteer Steer-Correction (Counter-Steer Assistance):
    // When the chassis begins to oversteer beyond driver intent, prevent front wheels from tucking in
    // and exacerbating the spinout if a beginner holds full steering into the slide.
    let effectiveSteerAngle = steerAngle;
    if (!input.handbrake && this.speedKmh > 12.0) {
      const isOversteering =
        Math.abs(_localAngvel.y) > 0.20 &&
        Math.sign(_localAngvel.y) === Math.sign(yawDiscrepancy) &&
        Math.abs(_localAngvel.y) > Math.abs(intendedYawRate) + 0.10;

      if (isOversteering && Math.sign(steerAngle) === Math.sign(_localAngvel.y)) {
        // Driver is holding steering into the oversteer spin — ease steering to prevent tuck-in
        const oversteerRatio = clamp((Math.abs(_localAngvel.y) - (Math.abs(intendedYawRate) + 0.10)) / 0.8, 0, 0.60);
        effectiveSteerAngle *= (1.0 - oversteerRatio);
      }
    }

    // Gear ratio and drivetrain power setup
    const gearRatio = currentGear > 0 ? GEAR_RATIOS[currentGear] : 1.0;
    const absSlip = Math.abs(this.slipAngle);
    const slipAmount = Math.min(1.0, absSlip / (Math.PI / 4.5));

    // Cornering / drift powertrain boost: overcomes tire scrub during hard slides
    const driftPowerBoost = 1.0 + Math.abs(input.steering) * 0.35 + slipAmount * 0.65;

    const baseFrontPower =
      this.config.drivetrain.frontPower ??
      this.config.engine.frontMaxForce ??
      this.config.engine.maxForce * (this.config.drivetrain.frontBias ?? 0.5) * 2;

    const baseRearPower =
      this.config.drivetrain.rearPower ??
      this.config.engine.rearMaxForce ??
      this.config.engine.maxForce * (1.0 - (this.config.drivetrain.frontBias ?? 0.5)) * 2;

    const slideBoost =
      this.config.drivetrain.slideFrontPowerBoost ??
      this.config.engine.slideFrontPowerBoost ??
      this.config.engine.maxForce * 0.5;

    // Under slide, front axle power is boosted to claw forward, while rear power is modulated
    // to preserve lateral grip capacity and naturally pull the car straight ("flat out to pull out")
    let dynamicFrontPower = (baseFrontPower + slideBoost * slipAmount) * powerMultiplier;
    let dynamicRearPower = Math.max(30 * powerMultiplier, baseRearPower * (1.0 - slipAmount * 0.35)) * powerMultiplier;

    let groundedCount = 0;
    const wheelCount = this.config.wheels.length;

    // Array to store compression distances per wheel for ARB calculations
    const compressions: number[] = [0, 0, 0, 0];
    const normalForces: number[] = [0, 0, 0, 0];
    let maxBumpRate = 0;
    let maxTravelRatio = 0;

    // ─── 1. SUSPENSION STRUT KINEMATICS ──────────────────────────────────
    for (let i = 0; i < wheelCount; i++) {
      const wheel = this.config.wheels[i];
      _wheelLocalPos.set(wheel.position[0], wheel.position[1], wheel.position[2]);
      _wheelMountWorld.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos);

      // Sample terrain ground elevation at mount (X, Z)
      let groundHeight = 0.0;
      if (heightmapData && levelData) {
        groundHeight = getInterpolatedHeight(
          _wheelMountWorld.x,
          _wheelMountWorld.z,
          heightmapData.heights,
          heightmapData.rows,
          heightmapData.cols,
          levelData.terrainBase.width,
          levelData.terrainBase.depth,
        );

        // Sample elevated drivable structures (jump ramps, stone bridges)
        const structHeight = getElevatedStructureHeight(
          _wheelMountWorld.x,
          _wheelMountWorld.y,
          _wheelMountWorld.z,
          heightmapData,
          levelData,
        );
        if (structHeight !== null) {
          groundHeight = Math.max(groundHeight, structHeight);
        }
      }

      // Height difference from strut mount to ground along vertical axis
      const signedDist = _wheelMountWorld.y - groundHeight;
      const penetration = Math.max(0, -signedDist);
      const restLength = wheel.suspensionRestLength;
      const radius = wheel.radius;
      const maxContactDistance = restLength + radius + 0.08;

      const isContact = signedDist <= maxContactDistance;
      this._wheelInContact[i] = isContact;

      if (isContact) {
        groundedCount++;
        // Compression distance (how much the spring is compressed from rest)
        const targetClearance = restLength + radius;
        const rawCompression = targetClearance - signedDist;
        const compression = clamp(rawCompression, 0, wheel.suspensionTravel);
        compressions[i] = compression;
        this._suspensionLengths[i] = clamp(restLength - compression, 0.12, restLength + 0.1);

        // Compression velocity (rate of change of distance)
        const prevDist = this._prevDistToGround[i];
        let distVel = 0;
        if (prevDist >= -1.2 && dt <= 0.08 && this._prevWheelContact[i]) {
          const deltaDist = prevDist - signedDist;
          // Sub-millimeter deadband (0.4mm) to suppress Rapier contact micro-jitter at standstill
          if (Math.abs(deltaDist) > 0.0004) {
            distVel = clamp(deltaDist / Math.max(dt, 0.001), -5.0, 12.0);
          }
        } else if (prevDist >= -1.2 && dt <= 0.08 && !this._prevWheelContact[i]) {
          // Touchdown frame from flight: derive initial descent velocity so dampers start cushioning immediately
          const deltaDist = prevDist - signedDist;
          if (deltaDist > 0.001) {
            distVel = clamp(deltaDist / Math.max(dt, 0.001), 0, 10.0);
          }
        }
        this._prevDistToGround[i] = signedDist;
        this._prevWheelContact[i] = true;

        // Progressive Hydraulic Bump Stop (HBS):
        // Real rally dampers use fluid restriction to DISSIPATE landing energy as heat,
        // rather than storing it as elastic spring energy that catapults the vehicle back up.
        const travelRatio = compression / Math.max(0.01, wheel.suspensionTravel);
        if (distVel > maxBumpRate) maxBumpRate = distVel;
        if (travelRatio > maxTravelRatio) maxTravelRatio = travelRatio;

        // Fluid restriction ramps up compression damping deep in travel (> 60%)
        const hbsDampMultiplier = travelRatio > 0.60 
          ? 1.0 + Math.pow((travelRatio - 0.60) / 0.40, 2) * 2.8 
          : 1.0;

        // Rebound damping:
        // Boosted during landing settle window (3.6x) and post-bump rebound (up to 4.3x)
        // to firmly catch the chassis and prevent secondary trampoline pogo bounce or rear axle hop
        const bumpReboundBoost = this._bumpOversteerTimer > 0 ? (1.0 + 0.8 * this._bumpSeverity) : 1.0;
        const baseReboundMultiplier = this._landingSettleTimer > 0 ? 3.6 : (2.4 * bumpReboundBoost);
        const dampMultiplier = distVel > 0 ? (1.0 * hbsDampMultiplier) : baseReboundMultiplier;
        const dampingForce = distVel * wheel.suspensionDamping * mass * dampMultiplier;

        // Mild elastomeric bottom-out buffer with rebound hysteresis (energy absorption)
        let bumpStopForce = 0;
        if (rawCompression > wheel.suspensionTravel) {
          const bottomOut = rawCompression - wheel.suspensionTravel;
          // When rebounding out of bottom-out (distVel < 0), dissipate 65% of elastic push
          const reboundHysteresis = distVel < 0 ? 0.35 : 1.0;
          const penetrationBoost = 1.6 + penetration * 3.5;
          bumpStopForce = bottomOut * wheel.suspensionStiffness * mass * penetrationBoost * reboundHysteresis;
        }

        const springForce = compression * wheel.suspensionStiffness * mass + bumpStopForce;
        const baseMaxNormal = wheel.maxSuspensionForce ?? 8000;
        const maxNormal = penetration > 0
          ? baseMaxNormal * (1.0 + penetration * 3.0)
          : baseMaxNormal;
        const totalNormal = clamp(springForce + dampingForce, 0, maxNormal);
        normalForces[i] = totalNormal;

        // Apply normal force impulse:
        // When penetrating ground (penetration > 0.02) or chassis is tilted on steep slope,
        // blend normal impulse towards world UP to guarantee authoritative depenetration out of the terrain
        if (penetration > 0.02) {
          const depenetrateBlend = Math.min(1.0, penetration * 4.0);
          _suspensionImpulse.copy(_up).lerp(_worldUp, depenetrateBlend).normalize().multiplyScalar(totalNormal * dt);
        } else {
          _suspensionImpulse.copy(_up).multiplyScalar(totalNormal * dt);
        }

        // Apply impulse at or above ground level to avoid underground rotational moments
        _wheelMountWorld.y = Math.max(_wheelMountWorld.y, groundHeight);
        body.applyImpulseAtPoint(_suspensionImpulse, _wheelMountWorld, true);
      } else {
        this._suspensionLengths[i] = restLength;
        compressions[i] = 0;
        normalForces[i] = 0;
        this._prevDistToGround[i] = maxContactDistance;
        this._prevWheelContact[i] = false;
      }
    }



    this.groundedRatio = groundedCount / Math.max(1, wheelCount);

    // Track airborne flight duration and trigger landing stabilization window
    if (groundedCount === 0) {
      this._airborneDuration += dt;
      this._landingSettleTimer = 0;
    } else {
      if (this._airborneDuration > 0.18) {
        // Just touched down from a significant jump (>180ms flight)!
        this._landingSettleTimer = 0.45; // 450ms stabilization window
      }
      this._airborneDuration = 0;
      if (this._landingSettleTimer > 0) {
        this._landingSettleTimer = Math.max(0, this._landingSettleTimer - dt);
      }
    }

    // Track bump disturbance and trigger anti-bump-oversteer stabilization window
    const isIntenseBump = maxBumpRate > 2.4 || (maxTravelRatio > 0.60 && maxBumpRate > 1.2);
    if (isIntenseBump) {
      this._bumpOversteerTimer = 0.40; // 400ms post-bump stabilization window
      const severity = clamp((maxBumpRate - 1.5) / 5.0 + (maxTravelRatio - 0.5) * 1.2, 0.35, 1.0);
      this._bumpSeverity = Math.max(this._bumpSeverity, severity);
    } else if (this._bumpOversteerTimer > 0) {
      this._bumpOversteerTimer = Math.max(0, this._bumpOversteerTimer - dt);
      if (this._bumpOversteerTimer === 0) {
        this._bumpSeverity = 0;
      }
    }

    // ─── 2. ANTI-ROLL BARS (ARB) ─────────────────────────────────────────
    if (this.config.suspension && wheelCount >= 4) {
      // Front axle (0: FL, 1: FR)
      const frontARB = this.config.suspension.frontAntiRollBarStiffness;
      if (frontARB > 0 && (this._wheelInContact[0] || this._wheelInContact[1])) {
        const deltaFront = compressions[0] - compressions[1];
        const arbForce = deltaFront * frontARB * mass * 0.4;

        _suspensionImpulse.copy(_up).multiplyScalar(arbForce * dt);
        _wheelLocalPos.set(this.config.wheels[0].position[0], this.config.wheels[0].position[1], this.config.wheels[0].position[2]);
        _wheelMountWorld.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos);
        body.applyImpulseAtPoint(_suspensionImpulse, _wheelMountWorld, true);

        _suspensionImpulse.negate();
        _wheelLocalPos.set(this.config.wheels[1].position[0], this.config.wheels[1].position[1], this.config.wheels[1].position[2]);
        _wheelMountWorld.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos);
        body.applyImpulseAtPoint(_suspensionImpulse, _wheelMountWorld, true);

        if (this._wheelInContact[0]) normalForces[0] = Math.max(mass * 9.81 * 0.12, normalForces[0] + arbForce);
        if (this._wheelInContact[1]) normalForces[1] = Math.max(mass * 9.81 * 0.12, normalForces[1] - arbForce);
      }

      // Rear axle (2: RL, 3: RR)
      const rearARB = this.config.suspension.rearAntiRollBarStiffness;
      if (rearARB > 0 && (this._wheelInContact[2] || this._wheelInContact[3])) {
        const deltaRear = compressions[2] - compressions[3];
        const arbForce = deltaRear * rearARB * mass * 0.4;

        _suspensionImpulse.copy(_up).multiplyScalar(arbForce * dt);
        _wheelLocalPos.set(this.config.wheels[2].position[0], this.config.wheels[2].position[1], this.config.wheels[2].position[2]);
        _wheelMountWorld.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos);
        body.applyImpulseAtPoint(_suspensionImpulse, _wheelMountWorld, true);

        _suspensionImpulse.negate();
        _wheelLocalPos.set(this.config.wheels[3].position[0], this.config.wheels[3].position[1], this.config.wheels[3].position[2]);
        _wheelMountWorld.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos);
        body.applyImpulseAtPoint(_suspensionImpulse, _wheelMountWorld, true);

        if (this._wheelInContact[2]) normalForces[2] = Math.max(mass * 9.81 * 0.12, normalForces[2] + arbForce);
        if (this._wheelInContact[3]) normalForces[3] = Math.max(mass * 9.81 * 0.12, normalForces[3] - arbForce);
      }
    }

    // ─── 3. PACEJKA TIRE FORCES & POWERTRAIN ─────────────────────────────
    if (this._bumpOversteerTimer > 0) {
      // Post-bump AWD torque bias: transfer drive torque forward to pull car straight through bump disturbance
      dynamicFrontPower += 110 * this._bumpSeverity * powerMultiplier;
      dynamicRearPower = Math.max(40 * powerMultiplier, baseRearPower * (1.0 - 0.40 * this._bumpSeverity) * powerMultiplier);
    }

    for (let i = 0; i < wheelCount; i++) {
      const wheel = this.config.wheels[i];
      if (!this._wheelInContact[i]) {
        this._wheelFrictions[i] = 2.0;
        this.tireGrips[i] = 2.0;
        this._wheelEngineForces[i] = 0;
        this._wheelBrakes[i] = 0;
        continue;
      }

      const currentSteer = wheel.steerable ? effectiveSteerAngle : 0;
      this._wheelSteeringAngles[i] = currentSteer;

      // Wheel heading vector in world space:
      // Rotated around chassis local UP axis by currentSteer
      _wheelForward
        .copy(_forward)
        .multiplyScalar(Math.cos(currentSteer))
        .addScaledVector(_right, Math.sin(currentSteer))
        .normalize();

      // Wheel lateral vector in world space (pointing to wheel's right):
      _wheelRight
        .copy(_right)
        .multiplyScalar(Math.cos(currentSteer))
        .addScaledVector(_forward, -Math.sin(currentSteer))
        .normalize();

      // Contact patch velocity: V_chassis + Omega x R_arm
      _wheelLocalPos.set(wheel.position[0], wheel.position[1], wheel.position[2]);
      _wheelMountWorld.copy(_wheelLocalPos).applyQuaternion(_chassisQuat).add(_chassisPos);
      _armVec.copy(_wheelMountWorld).sub(_chassisPos);
      _rotationalVel.crossVectors(_angvel, _armVec);
      _wheelVelWorld.copy(_linvel).add(_rotationalVel);

      // Resolve contact velocity into wheel longitudinal and lateral components
      const vx = _wheelVelWorld.dot(_wheelForward);
      const vy = _wheelVelWorld.dot(_wheelRight);
      const wheelSpeed = Math.hypot(vx, vy);

      // Blend factor to smoothly fade out singular slip angle below 0.6 m/s (~2.1 km/h)
      // Using C1-continuous Hermite smoothstep to eliminate derivative discontinuities
      const t = clamp(wheelSpeed / 0.6, 0, 1);
      const lowSpeedFactor = t * t * (3 - 2 * t);

      // Tire slip angle
      const wheelSlipAngle = -Math.atan2(vy, Math.abs(vx) + 0.35);

      // Base surface grip & Pacejka parameters
      const gripCurve = wheel.steerable ? tireModel.front : tireModel.rear;
      let peakMu = gripCurve.baseGrip;

      // Handbrake effect on rear wheels
      let handbrakeActive = false;
      if (input.handbrake && !wheel.steerable) {
        handbrakeActive = true;
        peakMu *= this.config.handling.assists.driftGripMultiplier;
      }

      // Dynamic loose surface traction reduction under wheelspin
      if (input.throttle > 0.15 && surfaceDef.looseSurfaceTractionLoss && wheel.powered) {
        const loss = surfaceDef.looseSurfaceTractionLoss * input.throttle;
        peakMu *= Math.max(0.85, 1.0 - loss);
      }

      this._wheelFrictions[i] = peakMu;
      this.tireGrips[i] = peakMu;

      // Minimum effective normal force for lateral grip capacity:
      // When rear axle is unweighted following an intense bump/crest, maintain a compliant dynamic grip floor
      // to prevent rear lateral grip from instantaneously collapsing into snap oversteer
      const rearGripFloor = (!wheel.steerable && this._bumpOversteerTimer > 0)
        ? (mass * 9.81 * 0.22 * this._bumpSeverity)
        : 0;
      const effectiveNormal = Math.max(normalForces[i], rearGripFloor);

      // ── Pacejka Magic Formula for Lateral Force ──
      // Fy = D * sin(C * atan(B * alpha - E * (B * alpha - atan(B * alpha))))
      const B = 7.5;  // Stiffness factor (smooth, progressive turn-in without twitchy snap)
      const C = 1.34; // Shape factor (fuller lateral plateau)
      const D = peakMu * Math.max(120, effectiveNormal); // Peak lateral force
      const E = 0.10; // Curvature factor (controls smooth slide plateau)

      const Balpha = B * wheelSlipAngle;
      const Fy_pacejka = D * Math.sin(C * Math.atan(Balpha - E * (Balpha - Math.atan(Balpha)))) * lowSpeedFactor;

      // Critically damped viscous tire scrub resistance at low speed / standstill:
      // Smoothly absorbs lateral micro-velocities without Pacejka limit-cycle chatter
      const zeroSpeedTaper = clamp(wheelSpeed / 0.20, 0, 1);
      const wheelMass = mass * 0.25;
      const maxStableScrubForce = (wheelMass * Math.abs(vy)) / Math.max(dt, 0.001) * 0.45;
      const rawScrub = -vy * wheelMass * 8.0 * (1.0 - lowSpeedFactor) * zeroSpeedTaper;
      const scrubDamping = clamp(rawScrub, -maxStableScrubForce, maxStableScrubForce);
      let Fy_raw = Fy_pacejka + scrubDamping;

      // At low speeds (wheelSpeed < 2.0 m/s), enforce critically damped lateral momentum clamping
      // to eliminate Euler limit-cycle yaw oscillations (chatter/wiggling) below ~7.2 km/h
      if (wheelSpeed < 2.0) {
        const maxMomentumForce = (wheelMass * Math.abs(vy)) / Math.max(dt, 0.001) * 0.90;
        const lowSpeedBlend = clamp(wheelSpeed / 2.0, 0, 1);
        const maxAllowedFy = clamp(maxMomentumForce + D * lowSpeedBlend * lowSpeedFactor, 0, D);
        Fy_raw = clamp(Fy_raw, -maxAllowedFy, maxAllowedFy);
      }

      // ── Longitudinal Tractive / Braking Force ──
      let Fx_drive = 0;
      const wheelBasePower = wheel.steerable ? dynamicFrontPower : dynamicRearPower;
      const effectiveBrakeForce = Math.max(this.config.brakes.maxForce, 800);
      const effectiveHandbrakeForce = Math.max(this.config.brakes.handbrakeForce, 450);

      const isMovingForward = this.forwardSpeed > BRAKE_SPEED_THRESHOLD;
      const isMovingBackward = this.forwardSpeed < -BRAKE_SPEED_THRESHOLD;

      if (currentGear === -1) {
        // ── Reverse Gear Dynamics ──
        // In reverse gear: throttle powers reverse; in automatic mode, holding brake also engages reverse
        const revInput = Math.max(input.brake, input.throttle);
        if (revInput > 0) {
          if (isMovingForward) {
            // Rolling forward while in reverse: input firmly brakes the forward motion to a standstill first
            const brakeBias = wheel.steerable ? this.config.brakes.frontBias * 2 : (1.0 - this.config.brakes.frontBias) * 2;
            Fx_drive = -effectiveBrakeForce * revInput * brakeBias;
          } else if (wheel.powered) {
            // Reverse tractive propulsion with reverse speed limiter
            const revGov = this.speedKmh >= REVERSE_MAX_SPEED ? 0.2 : 1.0;
            Fx_drive = -wheelBasePower * revInput * 2.0 * REVERSE_FORCE_MULTIPLIER * revGov;
          }
        }
      } else if (input.throttle > 0 && wheel.powered) {
        // ── Forward Gear Drive Propulsion ──
        if (currentGear === 0) {
          // Neutral: zero tractive drive force (engine revs freely in neutral)
          Fx_drive = 0;
        } else if (isMovingBackward) {
          // Rolling backward: pressing throttle (W) firmly brakes the vehicle to a halt before advancing
          const brakeBias = wheel.steerable ? this.config.brakes.frontBias * 2 : (1.0 - this.config.brakes.frontBias) * 2;
          Fx_drive = effectiveBrakeForce * input.throttle * brakeBias;
        } else {
          // Forward drive propulsion with top speed governor:
          // Enables vigorous acceleration through gears up to the advertised maxSpeed,
          // then smoothly stabilizes at the advertised top speed.
          const targetMaxSpeed = this.config.engine.maxSpeed;
          let speedGovernor = 1.0;
          if (this.speedKmh >= targetMaxSpeed) {
            const overspeed = this.speedKmh - targetMaxSpeed;
            speedGovernor = Math.max(0, 0.32 - overspeed * 0.1);
          } else if (this.speedKmh > targetMaxSpeed * 0.85) {
            const t = (this.speedKmh - targetMaxSpeed * 0.85) / (targetMaxSpeed * 0.15);
            speedGovernor = 1.0 - t * 0.68;
          }

          Fx_drive = wheelBasePower * input.throttle * gearRatio * driftPowerBoost * speedGovernor;
        }
      } else if (input.brake > 0) {
        // ── Forward Gears & Neutral Foot Braking ──
        // Authoritatively decelerates forward movement (~2.0G+) and holds stationary vehicle in place;
        // NEVER applies reverse drive propulsion in forward gears or neutral.
        const brakeBias = wheel.steerable ? this.config.brakes.frontBias * 2 : (1.0 - this.config.brakes.frontBias) * 2;
        const opposeSign = Math.abs(vx) > 0.08 ? Math.sign(vx) : clamp(vx / 0.08, -1, 1);
        Fx_drive = -effectiveBrakeForce * input.brake * brakeBias * opposeSign;
      } else if (Math.abs(vx) > 0.15) {
        // Off-throttle engine braking & rolling resistance:
        // Delivers responsive, natural deceleration when lifting off the throttle into corner entry
        const lowSpeedFade = clamp(Math.abs(vx) / 1.5, 0.0, 1.0);
        const rollResistanceForce = (surfaceDef.rollingResistance ?? 0.01) * normalForces[i] * lowSpeedFade;

        if (wheel.powered && currentGear !== 0) {
          const baseEngineBrake = this.config.engine.engineBrakingForce ?? 120;
          // In lower gears, higher transmission reduction multiplies engine compression drag
          const gearDragFactor = clamp(gearRatio * 0.75, 0.75, 1.55);
          const engineBrakeForce = baseEngineBrake * gearDragFactor * lowSpeedFade;
          Fx_drive = -(engineBrakeForce + rollResistanceForce) * Math.sign(vx);
        } else {
          Fx_drive = -rollResistanceForce * Math.sign(vx);
        }
      }

      if (handbrakeActive) {
        const hbOppose = Math.abs(vx) > 0.08 ? Math.sign(vx) : clamp(vx / 0.08, -1, 1);
        Fx_drive -= effectiveHandbrakeForce * hbOppose;
      }

      this._wheelEngineForces[i] = Fx_drive > 0 ? Fx_drive : 0;
      this._wheelBrakes[i] = Fx_drive < 0 ? -Fx_drive : 0;

      // ── Combined Slip Friction Ellipse ──
      // (Fx / Fx_max)^2 + (Fy / Fy_max)^2 <= 1
      const Fx_max = Math.max(100, peakMu * normalForces[i]);
      const Fy_max = Math.max(100, D);

      const normX = Fx_drive / Fx_max;
      const normY = Fy_raw / Fy_max;
      const combinedMag = Math.hypot(normX, normY);

      let finalFx = Fx_drive;
      let finalFy = Fy_raw;

      if (combinedMag > 1.0) {
        // Longitudinal priority:
        // Active forward foot braking gets high grip priority (up to 95% tire grip)
        // Driven acceleration retains 65% thrust in slides / reverse
        const isBrakingForward = input.brake > 0 && isMovingForward;
        const isDriven = wheel.powered && (input.throttle > 0 || (input.brake > 0 && !isMovingForward));
        const headroom = isBrakingForward ? 0.95 : isDriven ? 0.65 : 0.45;
        const clampedNormX = clamp(normX, -headroom, headroom);
        const remainingY = Math.sqrt(Math.max(0, 1.0 - clampedNormX * clampedNormX));
        finalFx = clampedNormX * Fx_max;
        finalFy = Math.sign(Fy_raw) * remainingY * Fy_max;
      }

      // Combine into 3D world force vector
      _tireImpulse
        .copy(_wheelForward)
        .multiplyScalar(finalFx * dt)
        .addScaledVector(_wheelRight, finalFy * dt);

      // Apply tire forces at competition Roll Center height:
      // (mount X and Z, but Y lowered to COM level - 0.06m to eliminate violent roll moment arms)
      _wheelForcePoint.copy(_wheelMountWorld);
      _wheelForcePoint.y = _chassisPos.y - 0.06;

      body.applyImpulseAtPoint(_tireImpulse, _wheelForcePoint, true);
    }

    // ─── 4. CHASSIS STABILIZATION & PURE ESC ANTI-SPIN ────────────────────
    let torqueX = 0;
    let torqueY = 0;
    let torqueZ = 0;

    // Dynamic yaw stability assist:
    // When landing or partially airborne (groundedRatio < 0.95), strong yaw rate damping prevents snap-spins
    // During post-jump landing settle window, authoritative yaw lock prevents touchdown spinouts
    // During post-bump window, active oversteer suppression catches bump-induced yaw kicks
    if (!input.handbrake) {
      const isLandingWindow = this._landingSettleTimer > 0;
      const isBumpWindow = this._bumpOversteerTimer > 0;
      const isPartiallyAirborne = this.groundedRatio < 0.95;
      const maxControllableYawRate = Math.max(maxAllowedYawRate + 0.35, 0.90);

      if (isLandingWindow && Math.abs(_localAngvel.y) > 0.05) {
        // Landing lock: firmly damps all unwanted yaw rotation upon touchdown
        torqueY = -_localAngvel.y * 6.0 * mass * dt;
      } else if (isBumpWindow) {
        // Post-bump oversteer suppression:
        // Oversteer occurs when actual yaw rate exceeds intended yaw rate, or car rotates opposite to driver steering
        const isOversteering = Math.abs(_localAngvel.y) > 0.20 && (
          (Math.sign(_localAngvel.y) === Math.sign(yawDiscrepancy) && Math.abs(_localAngvel.y) > Math.abs(intendedYawRate) + 0.15) ||
          (Math.abs(input.steering) > 0.1 && Math.sign(input.steering) !== Math.sign(_localAngvel.y)) // counter-steering against bump slide
        );

        if (isOversteering) {
          const bumpOversteerGain = (4.5 + 3.0 * this._bumpSeverity);
          torqueY = -yawDiscrepancy * bumpOversteerGain * mass * dt;
        } else if (Math.abs(_localAngvel.y) > 1.8) {
          const excess = _localAngvel.y - Math.sign(_localAngvel.y) * 1.8;
          torqueY = -excess * 3.5 * mass * dt;
        }
      } else if (Math.abs(_localAngvel.y) > maxControllableYawRate) {
        const excess = _localAngvel.y - Math.sign(_localAngvel.y) * maxControllableYawRate;
        torqueY = -excess * 3.5 * mass * dt;
      } else if (isPartiallyAirborne && Math.abs(_localAngvel.y) > 0.1) {
        // Landing stabilization: damps rotation while all 4 wheels settle onto the surface
        torqueY = -_localAngvel.y * 3.5 * mass * dt;
      } else {
        // Active cornering & straight-line yaw stability:
        // Smoothly assists player by opposing unwanted oversteer beyond driver's intended yaw rate
        const isOversteeringCorner =
          Math.abs(_localAngvel.y) > 0.18 &&
          ((Math.sign(_localAngvel.y) === Math.sign(yawDiscrepancy) && Math.abs(_localAngvel.y) > Math.abs(intendedYawRate) + 0.10) ||
           (Math.abs(input.steering) > 0.1 && Math.sign(input.steering) !== Math.sign(_localAngvel.y)));

        if (isOversteeringCorner && this.speedKmh > 5.0) {
          const cornerGain = this.config.handling.assists.yawDamping * 16.0;
          torqueY = -yawDiscrepancy * cornerGain * mass * dt;
        } else if (Math.abs(input.steering) < 0.15 && Math.abs(_localAngvel.y) > 0.12 && this.speedKmh > 4.5) {
          // Straight-line stability under throttle/bumps
          torqueY = -_localAngvel.y * this.config.handling.assists.yawDamping * 2.2 * mass * dt;
        }
      }

      torqueY = clamp(torqueY, -8.0 * mass * dt, 8.0 * mass * dt);
    }

    // High-speed pitch damping to eliminate porpoising and bucking over hill crests
    // During jump landing settle window, extra pitch damping prevents slapdown
    const speedFactor = clamp(this.speedKmh / 140, 0, 1);
    const landingPitchBoost = this._landingSettleTimer > 0 ? 3.5 : 0;
    const pitchDampGain = 3.5 + speedFactor * 3.5 + landingPitchBoost;
    if (Math.abs(_localAngvel.x) > 0.03) {
      torqueX = -_localAngvel.x * pitchDampGain * mass * dt;
    }

    // Roll damping (opposes angular velocity)
    // During jump landing settle window, extra roll damping prevents diagonal bucking and cartwheels
    const landingRollBoost = this._landingSettleTimer > 0 ? 3.5 : 0;
    const rollDampGain = 1.2 + speedFactor * 1.5 + landingRollBoost;
    if (Math.abs(_localAngvel.z) > 0.15) {
      torqueZ = -_localAngvel.z * rollDampGain * mass * dt;
    }

    // High-speed anti-squat assistance:
    // When accelerating hard uphill, rear suspension compresses more than front.
    // Apply progressive anti-squat restoring torque based on suspension compression delta,
    // keeping front tires in firm ground contact without unweighting the rear.
    if (this.groundedRatio >= 0.75 && input.throttle > 0.3) {
      const frontComp = (compressions[0] + compressions[1]) * 0.5;
      const rearComp = (compressions[2] + compressions[3]) * 0.5;
      const squatDelta = rearComp - frontComp;
      if (squatDelta > 0.03) {
        torqueX += (squatDelta - 0.03) * 6.0 * mass * dt;
      }
    }

    // Active pitch & roll leveling restoring torque:
    // Engage when airborne or unweighted (groundedRatio < 0.75) AND traveling at flight speed (> 10 km/h)
    // to prevent nose-dives and self-right jumping vehicles.
    // When stationary or during countdown, attitude is determined naturally by the terrain surface;
    // NEVER force the chassis to align with the global horizon while resting on an incline at standstill,
    // as that prevents proper ground contact and causes floating / instability.
    if (this.groundedRatio < 0.75 && this.speedKmh > 10.0) {
      const pitchSin = _forward.y;
      if (Math.abs(pitchSin) > 0.05) {
        const excessPitch = Math.sign(pitchSin) * (Math.abs(pitchSin) - 0.05);
        // Balanced gain: prevents nose-dive on landing while preserving dynamic weight transfer
        const pitchGain = pitchSin > 0 ? 15.0 : 13.0;
        torqueX += excessPitch * pitchGain * mass * dt;
      }

      const rollSin = _right.y;
      if (Math.abs(rollSin) > 0.12) {
        const excessRoll = Math.sign(rollSin) * (Math.abs(rollSin) - 0.12);
        torqueZ -= excessRoll * 6.0 * mass * dt;
      }
    }

    if (torqueX !== 0 || torqueY !== 0 || torqueZ !== 0) {
      _stabilizationTorque.set(torqueX, torqueY, torqueZ).applyQuaternion(_chassisQuat);
      body.applyTorqueImpulse(_stabilizationTorque, true);
    }
  }
}
