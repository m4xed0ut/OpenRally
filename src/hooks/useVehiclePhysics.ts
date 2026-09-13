import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3, Quaternion, Euler, type Object3D } from 'three';
import type { VehicleConfig, SurfaceType } from '@/types/vehicle';
import type { GameState, InputState } from '@/types/game';
import { useInputUpdater } from '@/hooks/useInput';
import { useGameStore } from '@/store/gameStore';
import { useRacingStore } from '@/store/racingStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useTagStore } from '@/store/tagStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { networkClient } from '@/network/networkClient';
import { getAllRemoteVehicleMeshes } from '@/components/vehicle/remoteVehicleRegistry';
import { DEFAULT_VEHICLE_CONFIG, MAX_DELTA } from '@/config/vehicle';
import { updateGearbox, handleManualGearShift, calculateRPM } from '@/utils/physics/powertrain';
import { applyAerodynamics } from '@/utils/physics/aerodynamics';
import { syncWheelVisuals } from '@/utils/physics/visuals';
import { emitGameEvent } from '@/utils/events';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { rumbleImpact, rumbleSlip, rumbleSurface, stopGamepadRumble } from '@/utils/input/gamepadHaptics';
import { PacejkaVehicleSolver } from '@/utils/physics/pacejkaSolver';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';
import { getElevatedStructureHeight } from '@/utils/physics/elevatedStructures';
import { getVehicleRestingHeight } from '@/utils/physics/suspension';

// ─── Pre-allocated scratch instances (Zero GC in hot frame loop) ──────
const _zeroVel = { x: 0, y: 0, z: 0 };
const _quat = new Quaternion();
const _forward = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _velocity = new Vector3();
const _euler = new Euler();
const _posTuple: [number, number, number] = [0, 0, 0];
const _spawnEuler = new Euler();
const _spawnQuat = new Quaternion();
const _settledPos = { x: 0, y: 0, z: 0 };
const _settledRot = { x: 0, y: 0, z: 0, w: 1 };
const _settledSuspensions: number[] = [0.25, 0.25, 0.25, 0.25];

const _frozenInput: InputState = {
  steering: 0,
  throttle: 0,
  brake: 0,
  handbrake: true,
  cameraToggle: false,
  reset: false,
  gearUp: false,
  gearDown: false,
};

const _telemetryState = {
  speed: 0,
  lateralSpeed: 0,
  slipAngle: 0,
  rpm: 1000,
  gear: 1,
  heading: 0,
  position: _posTuple,
  tireGrips: [1, 1, 1, 1] as [number, number, number, number],
  surface: 'tarmac' as SurfaceType,
  isAirborne: false,
};

/**
 * Custom hook orchestrating full vehicle physics via Dual-Track Pacejka Vehicle Dynamics Solver.
 * Handles powertrain, tire friction curves, suspension kinematics, aerodynamic downforce,
 * pause momentum preservation, multiplayer telemetry broadcasting, and gamepad haptics.
 */
export function useVehiclePhysics(
  chassisRef: React.RefObject<RapierRigidBody | null>,
  wheelRefs: React.RefObject<(Object3D | null)[]>,
  config: VehicleConfig = DEFAULT_VEHICLE_CONFIG
) {
  const getInput = useInputUpdater();
  const { levelPreset, heightmapData, levelData } = useTerrainData();

  const solverRef = useRef<PacejkaVehicleSolver | null>(null);
  const prevSurfaceRef = useRef<SurfaceType>('tarmac');
  const currentRpmRef = useRef<number>(1000);
  const prevSpeedKmhRef = useRef<number>(0);
  const prevGearRef = useRef<number>(1);
  const isAirborneRef = useRef<boolean>(false);
  const airborneTimeRef = useRef<number>(0);
  const settleFramesRef = useRef<number>(0);
  const isSettledRef = useRef<boolean>(false);

  const pausedStateRef = useRef<{
    linvel: { x: number; y: number; z: number };
    angvel: { x: number; y: number; z: number };
    pos: { x: number; y: number; z: number };
    rot: { x: number; y: number; z: number; w: number };
    speed: number;
    rpm: number;
    gear: number;
    isAirborne: boolean;
  } | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const prevGameStateRef = useRef<GameState>(useGameStore.getState().gameState);

  // Initialize or re-create solver when config or level changes
  useEffect(() => {
    solverRef.current = new PacejkaVehicleSolver(config);
    settleFramesRef.current = 0;
    isSettledRef.current = false;
    currentRpmRef.current = 1000;
    isAirborneRef.current = false;
    airborneTimeRef.current = 0;
    pausedStateRef.current = null;
    isPausedRef.current = false;
  }, [config, levelPreset.id]);

  // Frame update: apply forces, update solver, sync visuals, broadcast telemetry
  useFrame((_, delta) => {
    const gameState = useGameStore.getState().gameState;
    const prevGameState = prevGameStateRef.current;
    prevGameStateRef.current = gameState;

    const body = chassisRef.current;
    if (!body || (typeof body.isValid === 'function' && !body.isValid())) return;

    if (!solverRef.current) {
      solverRef.current = new PacejkaVehicleSolver(config);
    }
    const solver = solverRef.current;

    // ─── STABILITY GUARD & OUT-OF-BOUNDS SANITY CHECK ───
    const currentBodyPos = body.translation();
    const isCorrupted =
      !Number.isFinite(currentBodyPos.x) ||
      !Number.isFinite(currentBodyPos.y) ||
      !Number.isFinite(currentBodyPos.z) ||
      Math.abs(currentBodyPos.x) > 5000 ||
      Math.abs(currentBodyPos.y) > 5000 ||
      Math.abs(currentBodyPos.z) > 5000;

    const isEnteringMenu =
      (prevGameState === 'playing' || prevGameState === 'paused') &&
      (gameState === 'menu' || gameState === 'title');
    const isMenuOrTitle = gameState === 'menu' || gameState === 'title';
    const isMenuOutOfBounds = isMenuOrTitle && currentBodyPos.y < -1.0;

    const resetState = useGameStore.getState();
    const spawnPos = levelPreset.spawnPosition;
    const spawnRotY = levelPreset.spawnRotationY;
    const fallResetY = levelPreset.fallResetY;

    if (
      isCorrupted ||
      currentBodyPos.y < fallResetY ||
      isMenuOutOfBounds ||
      (isEnteringMenu && !isSettledRef.current) ||
      resetState.pendingReset
    ) {
      let spawnY = spawnPos[1];
      if (heightmapData && levelData) {
        const groundY = getInterpolatedHeight(
          spawnPos[0],
          spawnPos[2],
          heightmapData.heights,
          heightmapData.rows,
          heightmapData.cols,
          levelData.terrainBase.width,
          levelData.terrainBase.depth,
        );
        if (Number.isFinite(groundY)) {
          // Resting height: chassis sits above terrain when suspension is at normal weight sag
          spawnY = groundY + getVehicleRestingHeight(config);
        }
      }
      body.setTranslation({ x: spawnPos[0], y: spawnY, z: spawnPos[2] }, true);

      _spawnEuler.set(0, spawnRotY, 0);
      _spawnQuat.setFromEuler(_spawnEuler);
      body.setRotation({ x: _spawnQuat.x, y: _spawnQuat.y, z: _spawnQuat.z, w: _spawnQuat.w }, true);

      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);

      solver.resetSuspensionHistory();
      currentRpmRef.current = 1000;
      isAirborneRef.current = false;
      airborneTimeRef.current = 0;
      stopGamepadRumble(true);
      settleFramesRef.current = 0;
      isSettledRef.current = false;
      pausedStateRef.current = null;
      isPausedRef.current = false;

      emitGameEvent('vehicle_reset', {
        reason: isCorrupted
          ? 'stability_guard'
          : currentBodyPos.y < fallResetY || isMenuOutOfBounds
            ? 'out_of_bounds'
            : 'manual',
      });

      if (resetState.pendingReset) {
        resetState.triggerReset(false);
      }

      if (resetState.gameMode === 'timeattack' && gameState === 'playing') {
        useRacingStore.getState().startCountdown();
      } else if (resetState.gameMode === 'gymkhana_blitz' && gameState === 'playing') {
        useGymkhanaStore.getState().resetBlitz();
        useGymkhanaStore.getState().startCountdown();
      }
      return;
    }

    // ─── 0. PAUSE STATE HANDLING (FREEZE & RESTORE IDENTICAL PRE-PAUSE MOMENTUM) ───
    if (gameState === 'paused') {
      if (!isPausedRef.current) {
        const curLinvel = body.linvel();
        const curAngvel = body.angvel();
        const curPos = body.translation();
        const curRot = body.rotation();

        pausedStateRef.current = {
          linvel: { x: curLinvel.x, y: curLinvel.y, z: curLinvel.z },
          angvel: { x: curAngvel.x, y: curAngvel.y, z: curAngvel.z },
          pos: { x: curPos.x, y: curPos.y, z: curPos.z },
          rot: { x: curRot.x, y: curRot.y, z: curRot.z, w: curRot.w },
          speed: prevSpeedKmhRef.current,
          rpm: currentRpmRef.current,
          gear: prevGearRef.current,
          isAirborne: isAirborneRef.current,
        };
        isPausedRef.current = true;
      }

      if (pausedStateRef.current) {
        body.setTranslation(pausedStateRef.current.pos, true);
        body.setRotation(pausedStateRef.current.rot, true);
        body.setLinvel(_zeroVel, true);
        body.setAngvel(_zeroVel, true);
      }
      return;
    }

    // Resuming from pause back to 'playing':
    if (isPausedRef.current) {
      isPausedRef.current = false;
      if (pausedStateRef.current) {
        const saved = pausedStateRef.current;
        body.setTranslation(saved.pos, true);
        body.setRotation(saved.rot, true);
        body.setLinvel(saved.linvel, true);
        body.setAngvel(saved.angvel, true);
        prevSpeedKmhRef.current = saved.speed;
        currentRpmRef.current = saved.rpm;
        prevGearRef.current = saved.gear;
        isAirborneRef.current = saved.isAirborne;

        useGameStore.setState({
          speed: Math.round(saved.speed),
          rpm: Math.round(saved.rpm),
          gear: saved.gear,
        });

        pausedStateRef.current = null;
      }
    }

    // ─── 0.5. TITLE / MENU / LOADING SPAWN SETTLE ───
    if (gameState === 'title' || gameState === 'menu' || gameState === 'loading') {
      pausedStateRef.current = null;
      isPausedRef.current = false;

      // 1. If already settled in menu: keep vehicle 100% frozen, solid, and motionless
      if (isSettledRef.current) {
        const settledDistSq =
          (_settledPos.x - spawnPos[0]) ** 2 + (_settledPos.z - spawnPos[2]) ** 2;
        if (isMenuOrTitle && (settledDistSq > 100 || _settledPos.y < -1.0)) {
          isSettledRef.current = false;
          settleFramesRef.current = 0;
          body.setTranslation({ x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] }, true);
          body.setLinvel(_zeroVel, true);
          body.setAngvel(_zeroVel, true);
          return;
        }

        body.setTranslation(_settledPos, true);
        body.setRotation(_settledRot, true);
        body.setLinvel(_zeroVel, true);
        body.setAngvel(_zeroVel, true);

        // Keep visual wheels completely static at resting suspension length
        const wheels = wheelRefs.current;
        if (wheels) {
          for (let i = 0; i < config.wheels.length; i++) {
            const wheelObj = wheels[i];
            if (!wheelObj) continue;
            const connection = solver.wheelChassisConnectionPointCs(i);
            const suspension = _settledSuspensions[i] ?? (config.wheels[i].suspensionRestLength * 0.7);
            if (connection != null) {
              wheelObj.position.set(connection.x, connection.y - suspension, connection.z);
              wheelObj.rotation.y = 0;
            }
          }
        }
        return;
      }

      // 2. Settle & landing phase (first ~40 frames after spawn):
      settleFramesRef.current += 1;
      const safeDt = Math.min(delta, MAX_DELTA);
      solver.update(body, _frozenInput, safeDt, 1, heightmapData, levelData);
      syncWheelVisuals(solver, wheelRefs, config, 0, safeDt, 1000, 1);

      const currentLinvel = body.linvel();
      const p = body.translation();
      const isNearSpawn =
        Math.abs(p.y - spawnPos[1]) < 5.0 &&
        (p.x - spawnPos[0]) ** 2 + (p.z - spawnPos[2]) ** 2 < 36;

      const hasLanded =
        ((settleFramesRef.current >= 18 && Math.abs(currentLinvel.y) < 0.25) ||
          settleFramesRef.current >= 40) &&
        (!isMenuOrTitle || isNearSpawn);

      if (hasLanded) {
        const r = body.rotation();
        _settledPos.x = p.x;
        _settledPos.y = p.y;
        _settledPos.z = p.z;
        _settledRot.x = r.x;
        _settledRot.y = r.y;
        _settledRot.z = r.z;
        _settledRot.w = r.w;
        for (let i = 0; i < config.wheels.length; i++) {
          _settledSuspensions[i] = solver.wheelSuspensionLength(i) ?? (config.wheels[i].suspensionRestLength * 0.7);
        }
        isSettledRef.current = true;
        body.setLinvel(_zeroVel, true);
        body.setAngvel(_zeroVel, true);
        if (!useGameStore.getState().isSceneReady) {
          useGameStore.getState().setSceneReady(true);
          networkClient.sendClientReady();
        }
      } else if (settleFramesRef.current >= 40 && isMenuOrTitle && !isNearSpawn) {
        body.setTranslation({ x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] }, true);
        body.setLinvel(_zeroVel, true);
        body.setAngvel(_zeroVel, true);
        settleFramesRef.current = 0;
      }
      return;
    }

    if (isSettledRef.current) {
      isSettledRef.current = false;
    }

    // Freeze vehicle completely if player is in multiplayer spectator mode
    const isSpectating = useMultiplayerStore.getState().isSpectating;
    if (isSpectating) {
      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);
      return;
    }

    if (delta > 0.06) {
      solver.resetSuspensionHistory();
    }

    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 1 / 60;
    const dt = Math.max(0.001, Math.min(safeDelta, MAX_DELTA));
    const input = getInput(dt);

    const linvel = body.linvel();
    const pos = body.translation();
    const rot = body.rotation();

    _quat.set(rot.x, rot.y, rot.z, rot.w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    _right.set(1, 0, 0).applyQuaternion(_quat);
    _up.set(0, 1, 0).applyQuaternion(_quat);
    _velocity.set(linvel.x, linvel.y, linvel.z);

    // ─── EMERGENCY TERRAIN PENETRATION RECOVERY ───
    // Non-intrusive fail-safe: ONLY activates if chassis center of mass has
    // completely tunneled beneath terrain mesh (pos.y < centerGroundY - 0.25m).
    if (heightmapData && levelData) {
      const terrainW = levelData.terrainBase.width;
      const terrainD = levelData.terrainBase.depth;
      const halfW = terrainW / 2;
      const halfD = terrainD / 2;
      const isWithinTerrain = Math.abs(pos.x) < halfW - 3 && Math.abs(pos.z) < halfD - 3;

      if (isWithinTerrain) {
        let centerGroundY = getInterpolatedHeight(
          pos.x,
          pos.z,
          heightmapData.heights,
          heightmapData.rows,
          heightmapData.cols,
          terrainW,
          terrainD,
        );
        const structCenterY = getElevatedStructureHeight(
          pos.x,
          pos.y,
          pos.z,
          heightmapData,
          levelData,
        );
        if (structCenterY !== null) {
          centerGroundY = Math.max(centerGroundY, structCenterY);
        }

        if (centerGroundY > levelPreset.fallResetY && pos.y < centerGroundY - 0.25) {
          const recoveryY = centerGroundY + 0.35;
          body.setTranslation({ x: pos.x, y: recoveryY, z: pos.z }, true);
          pos.y = recoveryY;

          const curLv = body.linvel();
          if (curLv.y < 0) {
            body.setLinvel({ x: curLv.x, y: 1.0, z: curLv.z }, true);
          }
        }
      }
    }

    // ─── GAME MODES & COUNTDOWN LOGIC ───
    const state = useGameStore.getState();
    const tagState = useTagStore.getState();

    // Tick tag store freeze/immunity counters
    if (state.gameMode === 'tag') {
      tagState.tickDelta(dt);
    }

    const isCountingDown =
      (state.gameMode === 'timeattack' && useRacingStore.getState().raceStatus === 'countdown') ||
      (state.gameMode === 'gymkhana_blitz' && useGymkhanaStore.getState().status === 'countdown') ||
      (state.gameMode === 'tag' && tagState.phase === 'countdown');

    const isTagFrozen = state.gameMode === 'tag' && tagState.isFrozen;

    if (isCountingDown || isTagFrozen) {
      // Hold vehicle stationary on the starting grid while allowing natural vertical suspension settling
      body.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);
      body.setAngvel(_zeroVel, true);
    }

    const effectiveInput = (isCountingDown || isTagFrozen) ? _frozenInput : input;

    const isGymkhanaFinished =
      useGymkhanaStore.getState().showResultsModal ||
      (state.gameMode === 'gymkhana_blitz' && useGymkhanaStore.getState().status === 'completed');

    if (isGymkhanaFinished) {
      body.setLinvel({ x: linvel.x * 0.88, y: linvel.y * 0.88, z: linvel.z * 0.88 }, true);
      const curAngvel = body.angvel();
      body.setAngvel({ x: curAngvel.x * 0.85, y: curAngvel.y * 0.5, z: curAngvel.z * 0.85 }, true);
    }

    // ─── GEARBOX (AUTOMATIC / MANUAL) ───
    const transmissionMode = useSettingsStore.getState().transmissionMode;
    let currentGear: number;

    if (transmissionMode === 'manual') {
      currentGear = handleManualGearShift(state.gear, effectiveInput, isAirborneRef.current);
    } else {
      currentGear = updateGearbox(solver.speedKmh, solver.forwardSpeed, effectiveInput, state.gear, isAirborneRef.current, {
        slipAngle: solver.slipAngle,
      });
    }

    if (currentGear !== prevGearRef.current) {
      emitGameEvent('gear_shifted', {
        fromGear: prevGearRef.current,
        toGear: currentGear,
      });
      prevGearRef.current = currentGear;
    }

    // ─── 1. ADVANCE DUAL-TRACK PACEJKA VEHICLE DYNAMICS ───
    const powerMultiplier = (state.gameMode === 'tag' && tagState.isTagger) ? 1.5 : 1.0;
    solver.update(body, effectiveInput, dt, currentGear, heightmapData, levelData, powerMultiplier);

    const { surface, speedKmh, forwardSpeed, lateralSpeed, slipAngle, groundedRatio, tireGrips } = solver;

    if (surface !== prevSurfaceRef.current) {
      emitGameEvent('surface_changed', {
        from: prevSurfaceRef.current,
        to: surface,
      });
      prevSurfaceRef.current = surface;
    }

    const isAirborne = groundedRatio === 0;
    const wasAirborne = isAirborneRef.current;
    const flightDuration = airborneTimeRef.current;

    if (isAirborne) {
      airborneTimeRef.current += dt;
    } else {
      airborneTimeRef.current = 0;
    }
    isAirborneRef.current = isAirborne;

    // Suppress micro-wiggling at standstill or during race countdown
    if (isCountingDown || isTagFrozen) {
      const curLv = body.linvel();
      body.setLinvel({ x: 0, y: curLv.y, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else if (groundedRatio > 0.75 && effectiveInput.throttle === 0 && effectiveInput.brake === 0) {
      const curLv = body.linvel();
      const horizontalSpeed = Math.hypot(curLv.x, curLv.z);
      if (horizontalSpeed < 0.04) {
        body.setLinvel({ x: 0, y: curLv.y, z: 0 }, true);
        const curAv = body.angvel();
        if (Math.hypot(curAv.x, curAv.y, curAv.z) < 0.04) {
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
    }

    // ─── 2. GAMEPAD HAPTIC RUMBLE FEEDBACK ───
    const speedDelta = prevSpeedKmhRef.current - speedKmh;
    const isCrash = speedDelta > 25 && prevSpeedKmhRef.current > 30;

    if (isCrash) {
      rumbleImpact(Math.min(1.0, speedDelta / 60));
    } else if (isAirborne) {
      // Turn off gamepad vibration feedback completely when car is in the air
      stopGamepadRumble();
    } else if (wasAirborne && flightDuration > 0.15) {
      // Satisfying touchdown thud upon landing from an airborne jump
      const downwardSpeed = Math.max(0, -linvel.y);
      const landingSeverity = Math.min(1.0, Math.max(0.3, downwardSpeed / 10));
      rumbleImpact(landingSeverity);
    } else if (Math.abs(lateralSpeed) > 2.8 || (effectiveInput.handbrake && speedKmh > 12)) {
      rumbleSlip(Math.min(1.0, Math.abs(lateralSpeed) / 7));
    } else if (surface !== 'tarmac' && speedKmh > 15) {
      const surfaceIntensity = surface === 'sand' ? 1.3 : surface === 'mud' ? 1.1 : 0.9;
      rumbleSurface(Math.min(1.0, (speedKmh / 80) * surfaceIntensity));
    }
    prevSpeedKmhRef.current = speedKmh;

    // ─── 3. APPLY AERODYNAMIC DOWNFORCE ───
    applyAerodynamics(body, config, forwardSpeed, _velocity, pos.y, dt);

    const surfaceDef = getSurfaceDefinition(surface);

    // ─── 4. UPDATE ENGINE RPM & AUDIO TELEMETRY ───
    const targetRpm = calculateRPM(speedKmh, currentGear, effectiveInput, {
      currentRpm: currentRpmRef.current,
      dt,
      groundedRatio,
      isAirborne,
      slipAngle,
      steering: effectiveInput.steering,
      looseSurfaceTractionLoss: surfaceDef.looseSurfaceTractionLoss,
    });
    currentRpmRef.current = targetRpm;

    // ─── 5. SYNC VISUAL WHEELS ───
    syncWheelVisuals(solver, wheelRefs, config, forwardSpeed, dt, targetRpm, currentGear);

    // ─── 6. UPDATE HUD & GAME STORE TELEMETRY ───
    _euler.setFromQuaternion(_quat, 'YXZ');
    _posTuple[0] = Number.isFinite(pos.x) ? pos.x : spawnPos[0];
    _posTuple[1] = Number.isFinite(pos.y) ? pos.y : spawnPos[1];
    _posTuple[2] = Number.isFinite(pos.z) ? pos.z : spawnPos[2];

    _telemetryState.speed = Number.isFinite(speedKmh) ? Math.round(speedKmh) : 0;
    _telemetryState.lateralSpeed = Number.isFinite(lateralSpeed) ? lateralSpeed : 0;
    _telemetryState.slipAngle = Number.isFinite(slipAngle) ? slipAngle : 0;
    _telemetryState.rpm = Number.isFinite(targetRpm) ? Math.round(targetRpm) : 1000;
    _telemetryState.gear = currentGear;
    _telemetryState.heading = Number.isFinite(_euler.y) ? _euler.y : 0;
    _telemetryState.position = _posTuple;
    _telemetryState.tireGrips[0] = tireGrips[0] ?? 1.0;
    _telemetryState.tireGrips[1] = tireGrips[1] ?? 1.0;
    _telemetryState.tireGrips[2] = tireGrips[2] ?? 1.0;
    _telemetryState.tireGrips[3] = tireGrips[3] ?? 1.0;
    _telemetryState.surface = surface;
    _telemetryState.isAirborne = isAirborne;

    useGameStore.setState(_telemetryState);

    // ─── 7. MULTIPLAYER TELEMETRY BROADCAST ───
    if (useMultiplayerStore.getState().status !== 'disconnected' && !isSpectating && !!useMultiplayerStore.getState().currentRoom) {
      const curAngvel = body.angvel();
      const wheels = wheelRefs.current;
      const w0 = wheels?.[0]?.children[0]?.rotation.x ?? 0;
      const w1 = wheels?.[1]?.children[0]?.rotation.x ?? 0;
      const w2 = wheels?.[2]?.children[0]?.rotation.x ?? 0;
      const w3 = wheels?.[3]?.children[0]?.rotation.x ?? 0;

      const liveGymkhanaScore =
        resetState.gameMode === 'gymkhana_blitz'
          ? useGymkhanaStore.getState().totalScore + useGymkhanaStore.getState().currentDriftScore
          : undefined;

      networkClient.sendTelemetry({
        pos: [_posTuple[0], _posTuple[1], _posTuple[2]],
        rot: [rot.x, rot.y, rot.z, rot.w],
        linVel: [linvel.x, linvel.y, linvel.z],
        angVel: [curAngvel.x, curAngvel.y, curAngvel.z],
        steer: wheels?.[0]?.rotation.y ?? 0,
        wheelRots: [w0, w1, w2, w3],
        rpm: _telemetryState.rpm,
        gear: _telemetryState.gear,
        isDrifting: Math.abs(slipAngle) > 0.35 && speedKmh > 15,
        surface,
        score: liveGymkhanaScore,
      });
    }

    // ─── 8. RALLY TAG PROXIMITY CHECK (TAGGER TOUCHES REMOTE DRIVER) ───
    if (
      state.gameMode === 'tag' &&
      tagState.phase === 'active' &&
      tagState.isTagger &&
      !tagState.isFrozen
    ) {
      const remoteMeshes = getAllRemoteVehicleMeshes();
      for (const [remoteId, mesh] of remoteMeshes) {
        const dx = pos.x - mesh.position.x;
        const dy = pos.y - mesh.position.y;
        const dz = pos.z - mesh.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= 3.2 * 3.2) {
          networkClient.sendTagTouch(remoteId);
          break;
        }
      }
    }

    // ─── 9. CHECK MANUAL RESET (KEYBOARD 'R' OR GAMEPAD BUTTON) ───
    if (input.reset) {
      let resetSpawnY = spawnPos[1];
      if (heightmapData && levelData) {
        const groundY = getInterpolatedHeight(
          spawnPos[0],
          spawnPos[2],
          heightmapData.heights,
          heightmapData.rows,
          heightmapData.cols,
          levelData.terrainBase.width,
          levelData.terrainBase.depth,
        );
        if (Number.isFinite(groundY)) {
          resetSpawnY = groundY + getVehicleRestingHeight(config);
        }
      }
      body.setTranslation({ x: spawnPos[0], y: resetSpawnY, z: spawnPos[2] }, true);

      _spawnEuler.set(0, spawnRotY, 0);
      _spawnQuat.setFromEuler(_spawnEuler);
      body.setRotation({ x: _spawnQuat.x, y: _spawnQuat.y, z: _spawnQuat.z, w: _spawnQuat.w }, true);

      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);

      solver.resetSuspensionHistory();
      currentRpmRef.current = 1000;
      isAirborneRef.current = false;
      airborneTimeRef.current = 0;
      settleFramesRef.current = 0;
      isSettledRef.current = false;
      pausedStateRef.current = null;
      isPausedRef.current = false;
      stopGamepadRumble(true);

      emitGameEvent('vehicle_reset', {
        reason: 'manual',
      });

      if (resetState.gameMode === 'timeattack') {
        useRacingStore.getState().startCountdown();
      } else if (resetState.gameMode === 'gymkhana_blitz') {
        useGymkhanaStore.getState().resetBlitz();
        useGymkhanaStore.getState().startCountdown();
      }
    }
  });
}
