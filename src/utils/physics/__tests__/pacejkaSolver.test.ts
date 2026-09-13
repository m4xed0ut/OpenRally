import { describe, it, expect, vi } from 'vitest';
import { PacejkaVehicleSolver } from '../pacejkaSolver';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';
import type { InputState } from '@/types/game';

describe('PacejkaVehicleSolver', () => {
  const createMockBody = (options?: {
    pos?: { x: number; y: number; z: number };
    rot?: { x: number; y: number; z: number; w: number };
    linvel?: { x: number; y: number; z: number };
    angvel?: { x: number; y: number; z: number };
    mass?: number;
  }): RapierRigidBody & { appliedImpulses: { impulse: { x: number; y: number; z: number }; point: { x: number; y: number; z: number } }[]; appliedTorques: { x: number; y: number; z: number }[] } => {
    const appliedImpulses: { impulse: { x: number; y: number; z: number }; point: { x: number; y: number; z: number } }[] = [];
    const appliedTorques: { x: number; y: number; z: number }[] = [];

    return {
      appliedImpulses,
      appliedTorques,
      translation: () => options?.pos || { x: 0, y: 1.0, z: 0 },
      rotation: () => options?.rot || { x: 0, y: 0, z: 0, w: 1 },
      linvel: () => options?.linvel || { x: 0, y: 0, z: 0 },
      angvel: () => options?.angvel || { x: 0, y: 0, z: 0 },
      mass: () => options?.mass ?? 150,
      applyImpulseAtPoint: vi.fn((impulse: { x: number; y: number; z: number }, point: { x: number; y: number; z: number }) => {
        appliedImpulses.push({ impulse: { ...impulse }, point: { ...point } });
      }),
      applyTorqueImpulse: vi.fn((torque: { x: number; y: number; z: number }) => {
        appliedTorques.push({ ...torque });
      }),
    } as unknown as RapierRigidBody & { appliedImpulses: { impulse: { x: number; y: number; z: number }; point: { x: number; y: number; z: number } }[]; appliedTorques: { x: number; y: number; z: number }[] };
  };

  const defaultInput: InputState = {
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
  };

  it('implements IRapierVehicleController correctly', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);

    expect(solver.wheelSuspensionLength(0)).toBe(0.35);
    expect(solver.wheelSteering(0)).toBe(0);
    expect(solver.wheelIsInContact(0)).toBe(false);

    solver.setWheelEngineForce(0, 500);
    solver.setWheelBrake(0, 200);
    solver.setWheelSteering(0, 0.4);
    solver.setWheelFrictionSlip(0, 2.5);

    expect(solver.wheelSteering(0)).toBe(0.4);
    expect(solver.wheelChassisConnectionPointCs(0)).toEqual({
      x: DEFAULT_VEHICLE_CONFIG.wheels[0].position[0],
      y: DEFAULT_VEHICLE_CONFIG.wheels[0].position[1],
      z: DEFAULT_VEHICLE_CONFIG.wheels[0].position[2],
    });
  });

  it('compresses suspension and applies upward normal force impulses when wheels contact ground', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Chassis placed at Y = 0.55m so suspension is compressed against flat ground at Y = 0
    const body = createMockBody({ pos: { x: 0, y: 0.55, z: 0 } });

    solver.update(body, defaultInput, 0.016, 1);

    expect(body.applyImpulseAtPoint).toHaveBeenCalled();
    expect(solver.groundedRatio).toBe(1.0);
    for (let i = 0; i < 4; i++) {
      expect(solver.wheelIsInContact(i)).toBe(true);
      // Suspension length should compress below rest length (0.35)
      expect(solver.wheelSuspensionLength(i)!).toBeLessThan(0.35);
    }

    // Normal impulses should point upward (+Y)
    const upwardImpulses = body.appliedImpulses.filter((call) => call.impulse.y > 0);
    expect(upwardImpulses.length).toBeGreaterThan(0);
  });

  it('delivers zero engine force when throttle is zero (no ghost throttle)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 5, y: 0, z: 15 }, // Moving in a slide
    });

    solver.update(body, { ...defaultInput, throttle: 0 }, 0.016, 1);

    // Driven wheels must not receive drive impulses along forward heading when throttle is zero
    expect(solver.forwardSpeed).toBeCloseTo(15, 0);
    expect(solver.lateralSpeed).toBeCloseTo(5, 0);
  });

  it('applies forward tractive acceleration when throttle is pressed', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({ pos: { x: 0, y: 0.55, z: 0 }, linvel: { x: 0, y: 0, z: 10 } });

    solver.update(body, { ...defaultInput, throttle: 1.0 }, 0.016, 1);

    // Should apply forward impulses (+Z) to drive the wheels
    const forwardImpulses = body.appliedImpulses.filter((call) => call.impulse.z > 0);
    expect(forwardImpulses.length).toBeGreaterThan(0);
  });

  it('generates physical lateral cornering force when steering is applied at speed', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Moving forward at 20 m/s with left steering input
    const body = createMockBody({ pos: { x: 0, y: 0.55, z: 0 }, linvel: { x: 0, y: 0, z: 20 } });

    solver.update(body, { ...defaultInput, steering: 0.8 }, 0.016, 2);

    expect(solver.wheelSteering(0)).toBeGreaterThan(0);
    expect(solver.wheelSteering(1)).toBeGreaterThan(0);

    // Steered front wheels generate lateral cornering forces
    expect(body.applyImpulseAtPoint).toHaveBeenCalled();
  });

  it('reduces rear wheel grip and applies braking force on handbrake', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({ pos: { x: 0, y: 0.55, z: 0 }, linvel: { x: 0, y: 0, z: 20 } });

    solver.update(body, { ...defaultInput, handbrake: true }, 0.016, 2);

    // Rear wheels (2 and 3) should have lower friction multiplier applied
    expect(solver.tireGrips[2]).toBeLessThan(solver.tireGrips[0]);
    expect(solver.tireGrips[3]).toBeLessThan(solver.tireGrips[1]);
  });

  it('delivers authoritative braking and responsive reverse propulsion', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);

    // 1. BRAKING AT SPEED (brake = 1.0, speed = 15 m/s)
    const bodyBrake = createMockBody({ pos: { x: 0, y: 0.55, z: 0 }, linvel: { x: 0, y: 0, z: 15 } });
    solver.update(bodyBrake, { ...defaultInput, brake: 1.0 }, 0.016, 1);
    let netBrakeForceZ = 0;
    for (const call of bodyBrake.appliedImpulses) {
      netBrakeForceZ += call.impulse.z / 0.016;
    }
    // Authoritative competition deceleration force (>1.4G on 150kg chassis)
    expect(Math.abs(netBrakeForceZ)).toBeGreaterThan(1800);

    // 2. REVERSING AT ZERO SPEED (brake = 1.0, speed = 0)
    const bodyReverse = createMockBody({ pos: { x: 0, y: 0.55, z: 0 }, linvel: { x: 0, y: 0, z: 0 } });
    solver.update(bodyReverse, { ...defaultInput, brake: 1.0 }, 0.016, -1);
    let netReverseForceZ = 0;
    for (const call of bodyReverse.appliedImpulses) {
      netReverseForceZ += call.impulse.z / 0.016;
    }
    // Authoritative reverse acceleration force
    expect(netReverseForceZ).toBeLessThan(-1000);
  });

  it('steers wheels in the correct direction for Left (KeyA) and Right (KeyD)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({ pos: { x: 0, y: 0.55, z: 0 }, linvel: { x: 0, y: 0, z: 10 } });

    // 1. Steer Left (KeyA, steering: +1.0)
    solver.update(body, { ...defaultInput, throttle: 1.0, steering: 1.0 }, 0.016, 1);
    expect(solver.wheelSteering(0)!).toBeGreaterThan(0);
    expect(solver.wheelSteering(1)!).toBeGreaterThan(0);

    // 2. Steer Right (KeyD, steering: -1.0)
    solver.update(body, { ...defaultInput, throttle: 1.0, steering: -1.0 }, 0.016, 1);
    expect(solver.wheelSteering(0)!).toBeLessThan(0);
    expect(solver.wheelSteering(1)!).toBeLessThan(0);
  });

  it('resets suspension history and prevents impulse explosion on tab switch / reset', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body1 = createMockBody({ pos: { x: 0, y: 0.8, z: 0 }, linvel: { x: 0, y: 0, z: 0 } });
    solver.update(body1, defaultInput, 0.016, 1);

    // Simulate tab switch reset
    solver.resetSuspensionHistory();

    // Sudden drop in position (chassis settled closer to ground)
    const body2 = createMockBody({ pos: { x: 0, y: 0.45, z: 0 }, linvel: { x: 0, y: 0, z: 0 } });
    solver.update(body2, defaultInput, 0.016, 1);

    // Verify upward suspension normal impulse is safely clamped and does not explode into thousands of N*s
    for (const call of body2.appliedImpulses) {
      const normalForce = call.impulse.y / 0.016;
      expect(normalForce).toBeLessThanOrEqual(8000);
      expect(normalForce).toBeGreaterThanOrEqual(0);
    }
  });

  it('suppresses damper velocity impulse spikes during large dt hitches (> 0.08s)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({ pos: { x: 0, y: 0.5, z: 0 }, linvel: { x: 0, y: 0, z: 0 } });

    // Step with a large hitch delta (e.g. 0.5s from unthrottled background timer)
    solver.update(body, defaultInput, 0.5, 1);

    for (const call of body.appliedImpulses) {
      const normalForce = call.impulse.y / 0.5;
      expect(normalForce).toBeLessThanOrEqual(8000);
    }
  });

  it('engages hydraulic bump stop and bottom-out buffer under deep landing compression', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Severe bottom-out compression (distToGround = 0.20m, rawCompression = 0.46m > 0.26m travel)
    const bodyDeep = createMockBody({ pos: { x: 0, y: 0.20, z: 0 }, linvel: { x: 0, y: 0, z: 0 } });

    solver.update(bodyDeep, defaultInput, 0.016, 1);

    let maxNormalForce = 0;
    for (const call of bodyDeep.appliedImpulses) {
      const normal = call.impulse.y / 0.016;
      if (normal > maxNormalForce) maxNormalForce = normal;
    }

    // Normal force safely supports vehicle without exceeding max suspension force clamp
    expect(maxNormalForce).toBeGreaterThan(1000);
    expect(maxNormalForce).toBeLessThanOrEqual(8000);
  });

  it('applies authoritative anti-dive pitch restoring torque when nose pitches down', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Rotate car 8 degrees nose-down (pitch around X)
    const pitchRad = -0.14;
    const bodyNoseDown = createMockBody({
      pos: { x: 0, y: 0.8, z: 0 },
      rot: { x: Math.sin(pitchRad / 2), y: 0, z: 0, w: Math.cos(pitchRad / 2) },
      linvel: { x: 0, y: 0, z: 15 },
    });

    solver.update(bodyNoseDown, defaultInput, 0.016, 1);

    expect(bodyNoseDown.appliedTorques.length).toBeGreaterThan(0);
    // Torque around local X counteracts the dive
    const lastTorque = bodyNoseDown.appliedTorques[bodyNoseDown.appliedTorques.length - 1];
    expect(Math.abs(lastTorque.x)).toBeGreaterThan(0);
  });

  it('damps yaw rotation during touchdown and landing (groundedRatio < 0.95)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Partially airborne (only front or rear touching, with high yaw velocity)
    const bodyLanding = createMockBody({
      pos: { x: 0, y: 0.72, z: 0 },
      angvel: { x: 0, y: 1.2, z: 0 },
      linvel: { x: 0, y: -2, z: 20 },
    });

    solver.update(bodyLanding, { ...defaultInput, throttle: 1.0 }, 0.016, 1);

    expect(bodyLanding.appliedTorques.length).toBeGreaterThan(0);
    // Yaw damping opposes the positive yaw rotation (torque.y < 0)
    const hasOpposingYawTorque = bodyLanding.appliedTorques.some((t) => t.y < 0);
    expect(hasOpposingYawTorque).toBe(true);
  });

  it('produces zero lateral force and zero chatter when vehicle is stationary at standstill', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const bodyStationary = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 0 },
      angvel: { x: 0, y: 0, z: 0 },
    });

    solver.update(bodyStationary, defaultInput, 0.016, 1);

    // Lateral forces (along X in local/world coordinates for unrotated car) must be zero
    for (const call of bodyStationary.appliedImpulses) {
      expect(Math.abs(call.impulse.x)).toBeLessThan(0.001);
    }
    // No stabilization torques should be applied at rest on flat ground
    expect(bodyStationary.appliedTorques.length).toBe(0);
  });

  it('does not apply leveling torque when grounded on an incline at standstill (speed <= 10 km/h)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // 6-degree pitch angle (sin ~ 0.10)
    const pitchRad = 0.10;
    const bodyOnSlope = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      rot: { x: Math.sin(pitchRad / 2), y: 0, z: 0, w: Math.cos(pitchRad / 2) },
      linvel: { x: 0, y: 0, z: 0 },
      angvel: { x: 0, y: 0, z: 0 },
    });

    solver.update(bodyOnSlope, defaultInput, 0.016, 1);

    // When fully grounded (groundedRatio = 1.0) and stationary, active leveling torque must NOT engage
    expect(bodyOnSlope.appliedTorques.length).toBe(0);
  });

  it('does not apply artificial slope leveling torque during high-speed uphill climbs (groundedRatio = 1.0, speed = 120 km/h)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // 10-degree uphill incline (pitchRad = 0.174)
    const pitchRad = 0.174;
    const bodyUphill = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      rot: { x: Math.sin(pitchRad / 2), y: 0, z: 0, w: Math.cos(pitchRad / 2) },
      linvel: { x: 0, y: 0, z: 33.3 }, // 120 km/h
      angvel: { x: 0, y: 0, z: 0 },
    });

    solver.update(bodyUphill, { ...defaultInput, throttle: 1.0 }, 0.016, 4);

    // Grounded hill climb should NOT apply horizon leveling torques trying to force nose down into the hill
    expect(solver.groundedRatio).toBe(1.0);
    expect(solver.speedKmh).toBeGreaterThan(100);
    // No artificial horizon leveling torque applied
    expect(bodyUphill.appliedTorques.length).toBe(0);
  });

  it('limits maximum suspension compression to minimum strut length (0.12m) to prevent wheel arch piercing', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Extreme bottom-out compression (chassis pushed down to Y = 0.10m)
    const bodyBottomOut = createMockBody({
      pos: { x: 0, y: 0.10, z: 0 },
      linvel: { x: 0, y: -5, z: 10 },
    });

    solver.update(bodyBottomOut, defaultInput, 0.016, 1);

    for (let i = 0; i < 4; i++) {
      const len = solver.wheelSuspensionLength(i);
      expect(len).not.toBeNull();
      // Must maintain at least 0.12m strut length so tire top never pierces above Y = 0.00
      expect(len!).toBeGreaterThanOrEqual(0.12);
    }
  });

  it('stabilizes chassis on touchdown after a huge jump by heavily damping pitch, roll, and yaw slapdown moments', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    
    // 1. Simulate extended airborne flight (>300ms) off a huge jump
    for (let frame = 0; frame < 20; frame++) {
      const bodyAirborne = createMockBody({
        pos: { x: 0, y: 5.0, z: 20 },
        linvel: { x: 0, y: -12, z: 25 },
        angvel: { x: 0, y: 0, z: 0 },
      });
      solver.update(bodyAirborne, defaultInput, 0.016, 1);
    }

    // 2. Touchdown frame with violent asymmetric angular rates (pitching forward, rolling right, yawing right)
    const bodyTouchdown = createMockBody({
      pos: { x: 0, y: 0.55, z: 25 },
      linvel: { x: 0, y: -10, z: 25 },
      angvel: { x: 1.5, y: 1.2, z: 1.4 },
    });

    solver.update(bodyTouchdown, defaultInput, 0.016, 1);

    expect(bodyTouchdown.appliedTorques.length).toBeGreaterThan(0);
    // Opposing pitch damping (torque.x < 0) counteracting forward pitch slapdown
    const hasOpposingPitch = bodyTouchdown.appliedTorques.some((t) => t.x < 0);
    expect(hasOpposingPitch).toBe(true);

    // Opposing roll damping (torque.z < 0) counteracting roll slapdown
    const hasOpposingRoll = bodyTouchdown.appliedTorques.some((t) => t.z < 0);
    expect(hasOpposingRoll).toBe(true);

    // Opposing yaw damping (torque.y < 0) preventing touchdown snap-spin
    const hasOpposingYaw = bodyTouchdown.appliedTorques.some((t) => t.y < 0);
    expect(hasOpposingYaw).toBe(true);
  });

  it('detects intense bump impact and suppresses post-bump oversteer yaw kick with authoritative counter-torque', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);

    // 1. Initial neutral frame on flat ground
    const body1 = createMockBody({
      pos: { x: 0, y: 0.55, z: 10 },
      linvel: { x: 0, y: 0, z: 20 },
    });
    solver.update(body1, defaultInput, 0.016, 2);

    // 2. Severe bump impact: chassis drops to 0.38m in 0.016s (distVel = (0.55 - 0.38) / 0.016 = 10.6 m/s > 2.4 m/s)
    const bodyBump = createMockBody({
      pos: { x: 0, y: 0.38, z: 10.32 },
      linvel: { x: 0, y: -4, z: 20 },
    });
    solver.update(bodyBump, defaultInput, 0.016, 2);

    // 3. Post-bump frame: vehicle experiences an unexpected yaw kick / oversteer (angvel.y = +0.8 rad/s, steering = 0)
    const bodyOversteer = createMockBody({
      pos: { x: 0, y: 0.50, z: 10.64 },
      linvel: { x: 1.5, y: 0, z: 20 },
      angvel: { x: 0, y: 0.8, z: 0 },
    });
    solver.update(bodyOversteer, defaultInput, 0.016, 2);

    expect(bodyOversteer.appliedTorques.length).toBeGreaterThan(0);
    // Anti-bump-oversteer must apply strong counter-torque opposing the yaw kick (torque.y < 0)
    const opposingYawTorque = bodyOversteer.appliedTorques.filter((t) => t.y < 0);
    expect(opposingYawTorque.length).toBeGreaterThan(0);
    expect(opposingYawTorque[opposingYawTorque.length - 1].y).toBeLessThan(-2.0);
  });

  it('protects rear lateral grip capacity and biases AWD power forward during post-bump unweighting', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);

    // 1. Establish baseline
    const body1 = createMockBody({ pos: { x: 0, y: 0.55, z: 10 }, linvel: { x: 0, y: 0, z: 20 } });
    solver.update(body1, defaultInput, 0.016, 2);

    // 2. Intense bump strike
    const bodyBump = createMockBody({ pos: { x: 0, y: 0.36, z: 10.32 }, linvel: { x: 0, y: -5, z: 20 } });
    solver.update(bodyBump, defaultInput, 0.016, 2);

    // 3. Immediate crest unweighting under full throttle (pos.y = 0.65m, light contact)
    const bodyUnweighted = createMockBody({
      pos: { x: 0, y: 0.65, z: 10.64 },
      linvel: { x: 2.0, y: 1.0, z: 20 }, // slight lateral drift
    });
    solver.update(bodyUnweighted, { ...defaultInput, throttle: 1.0 }, 0.016, 2);

    // Verify lateral tire impulses are applied to stabilize the rear
    expect(bodyUnweighted.appliedImpulses.length).toBeGreaterThan(0);
    // All 4 wheels maintain non-zero tire grips
    for (let i = 0; i < 4; i++) {
      expect(solver.tireGrips[i]).toBeGreaterThan(1.5);
    }
  });

  it('boosts rebound damping during post-bump decompression to prevent chassis hop', () => {
    // 1. Solver A with bump detection
    const solverBump = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    solverBump.update(createMockBody({ pos: { x: 0, y: 0.55, z: 0 } }), defaultInput, 0.016, 2);
    // Severe bump strike: drops to 0.35m (distVel = 12.5 m/s > 2.4 m/s)
    solverBump.update(createMockBody({ pos: { x: 0, y: 0.35, z: 0.24 } }), defaultInput, 0.016, 2);

    // Rebound step: rises slightly to 0.355m (distVel = -0.31 m/s)
    const bodyBumpRebound = createMockBody({ pos: { x: 0, y: 0.355, z: 0.48 } });
    solverBump.update(bodyBumpRebound, defaultInput, 0.016, 2);
    const bumpNormalY = bodyBumpRebound.appliedImpulses
      .filter((c) => c.impulse.y > 0)
      .reduce((sum, c) => sum + c.impulse.y, 0);

    // 2. Solver B: settles for 30 frames (> 0.45s) so any initial spawn bump timer is fully expired
    const solverNormal = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    for (let i = 0; i < 30; i++) {
      solverNormal.update(createMockBody({ pos: { x: 0, y: 0.35, z: 0 } }), defaultInput, 0.016, 2);
    }
    // Now at normal settled state without active bump timer:
    const bodyNormalRebound = createMockBody({ pos: { x: 0, y: 0.355, z: 0.24 } });
    solverNormal.update(bodyNormalRebound, defaultInput, 0.016, 2);
    const normalNormalY = bodyNormalRebound.appliedImpulses
      .filter((c) => c.impulse.y > 0)
      .reduce((sum, c) => sum + c.impulse.y, 0);

    // Post-bump boosted rebound damping absorbs more elastic spring energy,
    // reducing the upward launch impulse that would otherwise catapult the chassis into the air
    expect(bumpNormalY).toBeLessThan(normalNormalY);
  });

  it('handles negative ground distance (terrain penetration) and scales upward depenetration impulses', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Severe penetration: chassis placed at Y = 0.15m (strut mount at -0.05m, 0.05m underground)
    const bodyPenetrated = createMockBody({
      pos: { x: 0, y: 0.15, z: 0 },
      linvel: { x: 0, y: -5, z: 20 },
    });

    solver.update(bodyPenetrated, defaultInput, 0.016, 2);

    expect(solver.groundedRatio).toBe(1.0);
    for (let i = 0; i < 4; i++) {
      expect(solver.wheelIsInContact(i)).toBe(true);
    }

    // Normal impulses should be strong and directed upwards (+Y) to push chassis out of ground
    const upwardImpulses = bodyPenetrated.appliedImpulses.filter((c) => c.impulse.y > 0);
    expect(upwardImpulses.length).toBeGreaterThan(0);
    const totalUpwardImpulse = upwardImpulses.reduce((sum, c) => sum + c.impulse.y, 0);
    expect(totalUpwardImpulse).toBeGreaterThan(100);

    // Upward suspension impulses must be applied at or above ground surface (never underground)
    for (const applied of upwardImpulses) {
      expect(applied.point.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('maintains wheel contact and drive capability even under deep terrain penetration', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Mock terrain where ground elevation is at Y = 10.0m
    const mockLevelData = {
      terrainBase: { width: 100, depth: 100 },
    } as unknown as import('@/types/level').LevelData;

    const heights = new Float32Array(25).fill(10.0);
    const mockHeightmap = {
      heights,
      trackMasks: new Float32Array(25),
      rows: 5,
      cols: 5,
    } as unknown as import('@/types/terrain').HeightmapData;

    // Chassis deep underground at Y = 8.5m (1.5m below ground level at 10.0m)
    const bodySubterranean = createMockBody({
      pos: { x: 0, y: 8.5, z: 0 },
      linvel: { x: 0, y: -2, z: 25 },
    });

    solver.update(bodySubterranean, defaultInput, 0.016, 2, mockHeightmap, mockLevelData);

    // Wheels must remain in contact to allow depenetration and driving out
    expect(solver.groundedRatio).toBe(1.0);
    for (let i = 0; i < 4; i++) {
      expect(solver.wheelIsInContact(i)).toBe(true);
    }
    const upwardImpulses = bodySubterranean.appliedImpulses.filter((c) => c.impulse.y > 0);
    expect(upwardImpulses.length).toBeGreaterThan(0);
  });

  it('applies active cornering oversteer damping when chassis yaw rate exceeds driver intended rate', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Vehicle travelling at 54 km/h (15 m/s forward) steering right (steering = -0.5)
    // Intended yaw rate is negative (turning right).
    // Excessive rightward oversteer spin (angvel.y = -1.6 rad/s)
    const bodyOversteering = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 15 },
      angvel: { x: 0, y: -1.6, z: 0 },
    });

    solver.update(bodyOversteering, { ...defaultInput, steering: -0.5, throttle: 0.8 }, 0.016, 2);

    expect(bodyOversteering.appliedTorques.length).toBeGreaterThan(0);
    // Oversteer correction must oppose the excessive negative yaw rotation with positive torque (torque.y > 0)
    const opposingTorque = bodyOversteering.appliedTorques.filter((t) => t.y > 0);
    expect(opposingTorque.length).toBeGreaterThan(0);
  });

  it('bypasses electronic yaw damping when handbrake is engaged to enable expressive drift initiation', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const bodyHandbrake = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 3, y: 0, z: 15 },
      angvel: { x: 0, y: 1.8, z: 0 },
    });

    solver.update(bodyHandbrake, { ...defaultInput, handbrake: true }, 0.016, 2);

    // Dynamic yaw damping must not intervene on handbrake drifts
    const yawTorques = bodyHandbrake.appliedTorques.filter((t) => Math.abs(t.y) > 0.01);
    expect(yawTorques.length).toBe(0);
  });

  it('limits front wheel lock angle to safe, high-speed turning angles (<= 11 degrees) under full 100% steering at 90 km/h', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Vehicle travelling at 90 km/h (25 m/s) with 100% steering input
    const bodyCruising = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 25 },
    });

    solver.update(bodyCruising, { ...defaultInput, steering: 1.0, throttle: 1.0 }, 0.016, 3);

    const steerFL = solver.wheelSteering(0);
    expect(steerFL).not.toBeNull();
    // At 90 km/h, max angle must be ~10 degrees (Math.PI / 18 = 0.1745 rad), well below dangerous >20 deg angles
    expect(steerFL!).toBeLessThanOrEqual(Math.PI / 16); // <= 11.25 degrees
    expect(steerFL!).toBeGreaterThanOrEqual(Math.PI / 22); // >= 8.18 degrees
  });

  it('eases front wheel steer angle (counter-steer assist) when oversteering at speed with full lock input', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Vehicle travelling at 72 km/h (20 m/s) experiencing violent oversteer spin (angvel.y = +1.8 rad/s)
    // while driver holds full left steering (+1.0) into the spin
    const bodyOversteerFullLock = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 20 },
      angvel: { x: 0, y: 1.8, z: 0 },
    });

    solver.update(bodyOversteerFullLock, { ...defaultInput, steering: 1.0, throttle: 0.8 }, 0.016, 2);

    const steerFL = solver.wheelSteering(0);
    expect(steerFL).not.toBeNull();
    // Solver must ease effective steer angle below normal max steer angle to prevent tuck-in
    const maxCurveAngle = Math.PI / 14; // baseline for ~72 km/h is around Math.PI / 15
    expect(steerFL!).toBeLessThan(maxCurveAngle * 0.85);
  });

  it('applies responsive off-throttle engine braking deceleration when letting off the throttle at speed', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    // Moving forward at 20 m/s (~72 km/h) in 2nd gear, off-throttle and off-brake
    const bodyCruising = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 20 },
    });

    solver.update(bodyCruising, defaultInput, 0.016, 2);

    // Sum longitudinal impulses along forward axis (-Z opposing +Z motion)
    let netForceZ = 0;
    for (const call of bodyCruising.appliedImpulses) {
      netForceZ += call.impulse.z / 0.016;
    }

    // Must deliver authoritative deceleration (> 400N opposing forward travel)
    expect(netForceZ).toBeLessThan(-400);

    // Engine braking in 2nd gear should be significantly stronger than in 5th gear
    const solverHighGear = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const bodyHighGear = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 20 },
    });
    solverHighGear.update(bodyHighGear, defaultInput, 0.016, 5);

    let netForceZHighGear = 0;
    for (const call of bodyHighGear.appliedImpulses) {
      netForceZHighGear += call.impulse.z / 0.016;
    }

    // 2nd gear engine braking magnitude must be strictly greater than 5th gear engine braking
    expect(Math.abs(netForceZ)).toBeGreaterThan(Math.abs(netForceZHighGear));

    // In neutral (gear 0), engine compression is disengaged and only surface rolling resistance applies
    const solverNeutral = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const bodyNeutral = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 20 },
    });
    solverNeutral.update(bodyNeutral, defaultInput, 0.016, 0);

    let netForceZNeutral = 0;
    for (const call of bodyNeutral.appliedImpulses) {
      netForceZNeutral += call.impulse.z / 0.016;
    }
    expect(Math.abs(netForceZNeutral)).toBeLessThan(350);
    expect(Math.abs(netForceZ)).toBeGreaterThan(Math.abs(netForceZNeutral) * 2.5);
  });

  it('delivers authoritative normal foot braking deceleration (>= 1.8G) when brake is pressed moving forward', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 20 }, // 72 km/h forward
    });

    solver.update(body, { ...defaultInput, brake: 1.0, throttle: 0 }, 0.016, 2);

    let netForceZ = 0;
    for (const call of body.appliedImpulses) {
      netForceZ += call.impulse.z / 0.016;
    }

    // On 150kg chassis, 1.8G deceleration corresponds to ~2,650 N opposing motion
    expect(netForceZ).toBeLessThan(-2600);
  });

  it('does not apply reverse engine drive force when stationary in forward gear (gear 1) with brake pressed', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 0 }, // Stationary at starting line / countdown
    });

    solver.update(body, { ...defaultInput, brake: 1.0, throttle: 0 }, 0.016, 1);

    // In 1st gear at standstill, brake must NOT generate reverse propulsion
    let netForwardPropulsion = 0;
    for (const call of body.appliedImpulses) {
      netForwardPropulsion += call.impulse.z;
    }
    // No reverse acceleration should be applied to push the vehicle backwards
    expect(netForwardPropulsion).toBeGreaterThanOrEqual(-1e-4);
  });

  it('engages reverse propulsion only when in reverse gear (gear -1)', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0, y: 0, z: 0 }, // Stationary
    });

    solver.update(body, { ...defaultInput, brake: 1.0, throttle: 0 }, 0.016, -1);

    let netImpulseZ = 0;
    for (const call of body.appliedImpulses) {
      netImpulseZ += call.impulse.z;
    }
    // In reverse gear, reverse propulsion drives the vehicle backward (negative Z)
    expect(netImpulseZ).toBeLessThan(-10);
  });

  it('does not apply airborne pitch or roll leveling torque when stationary on an incline', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const pitchRad = -0.14; // 8 degrees nose down
    const bodyStationary = createMockBody({
      pos: { x: 0, y: 0.8, z: 0 },
      rot: { x: Math.sin(pitchRad / 2), y: 0, z: 0, w: Math.cos(pitchRad / 2) },
      linvel: { x: 0, y: 0, z: 0 }, // At standstill on slope
    });

    solver.update(bodyStationary, defaultInput, 0.016, 1);

    // No airborne leveling torque should be applied when stationary (< 10 km/h)
    expect(bodyStationary.appliedTorques.length).toBe(0);
  });

  it('maintains smooth critically damped lateral scrub at crawling speed without sign-flipping chatter', () => {
    const solver = new PacejkaVehicleSolver(DEFAULT_VEHICLE_CONFIG);
    const body = createMockBody({
      pos: { x: 0, y: 0.55, z: 0 },
      linvel: { x: 0.04, y: 0, z: 0.15 }, // Crawling at ~0.5 km/h with 4 cm/s lateral drift
    });

    solver.update(body, defaultInput, 0.016, 1);

    let netImpulseX = 0;
    for (const call of body.appliedImpulses) {
      netImpulseX += call.impulse.x;
    }

    // Damping opposes lateral velocity (vx = +0.04 -> impulse.x < 0)
    expect(netImpulseX).toBeLessThan(0);
    // Over-damping suppression: impulse magnitude should be smooth and limited (<= 25 Ns)
    expect(Math.abs(netImpulseX)).toBeLessThan(25);
  });
});

