import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_PHANTOM_B_MODEL_PATH } from '@/config/assets';

/**
 * Phantom B-Spec — Mid-engine lightweight Group B prototype.
 * High-revving turbo, responsive throttle steering, and nimble chassis.
 */
export const PHANTOM_B_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 140,
  chassisSize: [1.9, 0.6, 4.0],
  engine: {
    maxForce: 225,
    maxSpeed: 275,
    engineBrakingForce: 130, // Sharp Group B compression braking
  },
  drivetrain: {
    frontBias: 0.48, // 48/52 Rear-biased AWD
    frontPower: 210,
    rearPower: 225,
    slideFrontPowerBoost: 110,
  },
  brakes: {
    maxForce: 900,
    handbrakeForce: 460,
    frontBias: 0.53,
  },
  suspension: {
    frontAntiRollBarStiffness: 12.0,
    rearAntiRollBarStiffness: 7.5,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.5],    // ~40.0 degrees at 0 km/h (Group B rally hairpins)
      [30, Math.PI / 7.2],   // ~25.0 degrees at 30 km/h
      [60, Math.PI / 11.8],  // ~15.2 degrees at 60 km/h
      [90, Math.PI / 17.5],  // ~10.3 degrees at 90 km/h
      [140, Math.PI / 25.5], // ~7.1 degrees at 140 km/h
      [220, Math.PI / 37.0], // ~4.9 degrees at 220 km/h
    ],
    steeringSpeed: 7.4,
    assists: {
      yawDamping: 0.18,
      driftGripMultiplier: 0.54,
    },
  },
  aerodynamics: {
    downforceFactor: 24,
  },
  wheels: [
    {
      // Front-left
      position: [-0.89, -0.2, 1.36],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 23,
      suspensionDamping: 2.9,
      maxSuspensionForce: 9500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.89, -0.2, 1.36],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 23,
      suspensionDamping: 2.9,
      maxSuspensionForce: 9500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.89, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 21,
      suspensionDamping: 3.1,
      maxSuspensionForce: 9500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.89, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 21,
      suspensionDamping: 3.1,
      maxSuspensionForce: 9500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_PHANTOM_B: VehiclePreset = {
  id: 'apex_phantom_b',
  name: 'Phantom B-Spec',
  description: 'Ultra-lightweight mid-engine Group B prototype engineered for extreme acceleration, razor-sharp transient response, and high-rpm rally racing.',
  category: 'rally',
  modelPath: VEHICLE_PHANTOM_B_MODEL_PATH,
  modelPositionOffset: [0, 0.04, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 9.1,
    acceleration: 9.4,
    handling: 9.2,
    offroad: 8.6,
    driveType: 'AWD',
  },
  config: PHANTOM_B_VEHICLE_CONFIG,
};
