import { useSettingsStore } from '@/store/settingsStore';
import { getActiveGamepad } from './gamepad';

/**
 * Options for gamepad dual-rumble haptic effect.
 */
export interface GamepadRumbleOptions {
  /** High frequency / weak motor intensity (0.0 to 1.0) */
  weakMagnitude?: number;
  /** Low frequency / strong motor intensity (0.0 to 1.0) */
  strongMagnitude?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Delay before starting in milliseconds */
  startDelay?: number;
}

let lastRumbleTimestamp = 0;
let rumbleUntilTimestamp = 0;
const MIN_RUMBLE_INTERVAL_MS = 60; // Throttles frequent rumble requests

/**
 * Checks whether gamepad rumble is currently active or within effect duration.
 */
export function isGamepadRumbling(): boolean {
  return performance.now() < rumbleUntilTimestamp;
}

/**
 * Triggers dual-rumble vibration on the currently active gamepad.
 * Safely checks for vibrationActuator support and honors user settings.
 */
export function playGamepadRumble(options: GamepadRumbleOptions = {}): void {
  const { vibrationEnabled, vibrationIntensity } = useSettingsStore.getState();
  if (!vibrationEnabled || vibrationIntensity <= 0) return;

  const now = performance.now();
  if (now - lastRumbleTimestamp < MIN_RUMBLE_INTERVAL_MS) {
    return;
  }
  lastRumbleTimestamp = now;

  const gp = getActiveGamepad();
  if (!gp || !gp.connected) return;

  // Check for W3C vibrationActuator (or fallback actuator)
  // Type assertion for GamepadHapticActuator
  const actuator = (gp as unknown as {
    vibrationActuator?: {
      reset?: () => Promise<unknown>;
      playEffect?: (type: string, params: object) => Promise<unknown>;
    };
  }).vibrationActuator;
  if (!actuator || typeof actuator.playEffect !== 'function') return;

  const weak = Math.max(0, Math.min(1, (options.weakMagnitude ?? 0.3) * vibrationIntensity));
  const strong = Math.max(0, Math.min(1, (options.strongMagnitude ?? 0.3) * vibrationIntensity));
  const duration = Math.max(20, Math.min(2000, options.duration ?? 150));
  const startDelay = options.startDelay ?? 0;

  rumbleUntilTimestamp = weak > 0 || strong > 0 ? now + startDelay + duration : 0;

  try {
    actuator
      .playEffect('dual-rumble', {
        startDelay,
        duration,
        weakMagnitude: weak,
        strongMagnitude: strong,
      })
      .catch(() => {
        // Silently ignore browser haptic errors / permission restrictions
      });
  } catch {
    // Ignore unsupported browser environments
  }
}

/**
 * Immediately cancels and stops any active vibration / haptic rumble on the active gamepad.
 * @param force - If true, sends cancellation even if internal timer thinks rumble has expired
 */
export function stopGamepadRumble(force = false): void {
  const now = performance.now();
  if (!force && now >= rumbleUntilTimestamp) {
    return;
  }
  rumbleUntilTimestamp = 0;
  lastRumbleTimestamp = 0;

  const gp = getActiveGamepad();
  if (!gp || !gp.connected) return;

  const actuator = (gp as unknown as {
    vibrationActuator?: {
      reset?: () => Promise<unknown>;
      playEffect?: (type: string, params: object) => Promise<unknown>;
    };
  }).vibrationActuator;

  if (!actuator) return;

  try {
    if (typeof actuator.reset === 'function') {
      actuator.reset().catch(() => {});
    } else if (typeof actuator.playEffect === 'function') {
      actuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: 10,
          weakMagnitude: 0,
          strongMagnitude: 0,
        })
        .catch(() => {});
    }
  } catch {
    // Gracefully ignore browser haptic errors
  }
}

/**
 * Triggers high-impact collision vibration (e.g. wall crash, heavy bump).
 * @param severity - Impact severity factor (0.0 to 1.0)
 */
export function rumbleImpact(severity = 1.0): void {
  const s = Math.max(0.1, Math.min(1.0, severity));
  playGamepadRumble({
    strongMagnitude: 0.9 * s,
    weakMagnitude: 0.6 * s,
    duration: Math.round(180 + 120 * s),
  });
}

/**
 * Triggers subtle off-road surface vibration (e.g. driving on rough mud/gravel).
 * @param speedFactor - Speed factor (0.0 to 1.0)
 */
export function rumbleSurface(speedFactor = 0.5): void {
  const s = Math.max(0.1, Math.min(1.0, speedFactor));
  playGamepadRumble({
    strongMagnitude: 0.12 * s,
    weakMagnitude: 0.28 * s,
    duration: 80,
  });
}

/**
 * Triggers drift / tire slip vibration (e.g. hard cornering, tire screech).
 * @param slipFactor - Slip severity factor (0.0 to 1.0)
 */
export function rumbleSlip(slipFactor = 0.5): void {
  const s = Math.max(0.1, Math.min(1.0, slipFactor));
  playGamepadRumble({
    strongMagnitude: 0.05 * s,
    weakMagnitude: 0.45 * s,
    duration: 90,
  });
}
