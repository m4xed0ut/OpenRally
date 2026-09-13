import type { VehicleConfig } from '@/types/vehicle';

// ─── Speed & Movement ───────────────────────────────────────────────
/** Conversion factor: multiply m/s by this to get km/h */
export const MS_TO_KMH = 3.6;

/** Minimum forward speed (m/s) before braking force is applied instead of reverse */
export const BRAKE_SPEED_THRESHOLD = 0.5;

/** Reverse engine force multiplier (fraction of max engine force) */
export const REVERSE_FORCE_MULTIPLIER = 0.8;

// ─── Gearbox (5-speed automatic / manual) ───────────────────────────
export const GEAR_RATIOS = [0, 2.5, 1.8, 1.3, 1.0, 0.8]; // Index is gear (0=N/R, 1..5)
export const SHIFT_UP_SPEEDS = [0, 40, 80, 130, 180, 999]; // Shift to next gear when exceeding these speeds (km/h)
export const SHIFT_DOWN_SPEEDS = [0, 0, 30, 70, 120, 170]; // Shift to previous gear when falling below these speeds (km/h)

/** Maximum speeds (km/h) for each gear before hitting mechanical redline / rev limiter */
export const GEAR_MAX_SPEEDS: readonly number[] = [0, 52, 95, 145, 195, 245];

/** Maximum speed (km/h) in reverse gear */
export const REVERSE_MAX_SPEED = 45;

/** Terrain elevation threshold below which coastal sand friction is applied (ocean surface is at -8.0) */
export const SAND_ELEVATION_THRESHOLD = -5.0;

// ─── Frame Clamping ──────────────────────────────────────────────────
/** Maximum frame delta (seconds) to prevent physics explosion after tab switch */
export const MAX_DELTA = 0.05;

// ─── Default Vehicle Config ──────────────────────────────────────────
/** Default vehicle configuration — physics parameters for the Stage 1 car */
export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 150,
  chassisSize: [2, 0.6, 4],
  engine: {
    maxForce: 210, // Scaled for 1.4G launch acceleration on 150kg chassis: eliminates wheelies
    maxSpeed: 240,
    engineBrakingForce: 120, // Responsive off-throttle engine braking (~0.30G)
  },
  drivetrain: {
    frontBias: 0.65, // 65/35 front bias
    frontPower: 220, // Front axle power (N) - authoritative front pull
    rearPower: 140,  // Rear axle power (N) - compliant rear push (no power-oversteer spinouts)
    slideFrontPowerBoost: 100, // Front axle receives +100N extra power whenever the car gets into a slide!
  },
  brakes: {
    maxForce: 880, // Authoritative competition braking (~2.0G deceleration on 150kg chassis)
    handbrakeForce: 450, // Firm rear lockup for clean drift initiation
    frontBias: 0.50,
  },
  suspension: {
    frontAntiRollBarStiffness: 11.0, // Supple front ARB eliminates twitchy oversteer and keeps car level
    rearAntiRollBarStiffness: 6.5,   // Softer rear ARB keeps rear tires planted
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.6],      // ~39.1 degrees at 0 km/h (agile hairpins & recovery)
      [30, Math.PI / 7.5],     // ~24.0 degrees at 30 km/h (responsive slow corners)
      [60, Math.PI / 12.0],    // ~15.0 degrees at 60 km/h (crisp medium corners)
      [90, Math.PI / 18.0],    // ~10.0 degrees at 90 km/h (planted, stable sweepers)
      [140, Math.PI / 26.0],   // ~6.9 degrees at 140 km/h (safe high-speed bends)
      [220, Math.PI / 38.0],   // ~4.7 degrees at 220 km/h (rock-solid top speed tracking)
    ],
    steeringSpeed: 6.5, // Smooth, measured steering input
    assists: {
      yawDamping: 0.20, // Dynamic stability assist preventing spinouts
      driftGripMultiplier: 0.54, // Progressive rear breakaway on handbrake
    },
  },
  aerodynamics: {
    downforceFactor: 15, // Smooth high-speed stability without crushing suspension
  },
  wheels: [
    {
      // Front-left
      position: [-0.76, -0.2, 1.45],
      radius: 0.35,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 8000,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.76, -0.2, 1.45],
      radius: 0.35,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 8000,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.76, -0.2, -1.4],
      radius: 0.35,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 20,
      suspensionDamping: 3.0,
      maxSuspensionForce: 8000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.76, -0.2, -1.4],
      radius: 0.35,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 20,
      suspensionDamping: 3.0,
      maxSuspensionForce: 8000,
      steerable: false,
      powered: true,
    },
  ],
};
