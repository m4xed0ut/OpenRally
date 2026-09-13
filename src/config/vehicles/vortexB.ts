import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_VORTEX_B_MODEL_PATH } from '@/config/assets';

/**
 * Vortex Rally B — Twin-charged mid-engine Group B homologation icon.
 * Explosive turbo boost, lightweight tubular spaceframe, and legendary 80s rally pedigree.
 */
export const VORTEX_B_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 138,
  chassisSize: [1.84, 0.58, 4.1],
  engine: {
    maxForce: 235,
    maxSpeed: 280,
    engineBrakingForce: 130, // Sharp Group B compression braking
  },
  drivetrain: {
    frontBias: 0.46, // 46/54 Rear-biased AWD for aggressive rally drifts
    frontPower: 215,
    rearPower: 230,
    slideFrontPowerBoost: 110,
  },
  brakes: {
    maxForce: 900,
    handbrakeForce: 460,
    frontBias: 0.52,
  },
  suspension: {
    frontAntiRollBarStiffness: 12.0,
    rearAntiRollBarStiffness: 7.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.4],    // ~40.9 degrees at 0 km/h (aggressive rally hairpins)
      [30, Math.PI / 7.2],   // ~25.0 degrees at 30 km/h
      [60, Math.PI / 11.5],  // ~15.6 degrees at 60 km/h
      [90, Math.PI / 17.0],  // ~10.6 degrees at 90 km/h
      [140, Math.PI / 25.0], // ~7.2 degrees at 140 km/h
      [220, Math.PI / 36.0], // ~5.0 degrees at 220 km/h
    ],
    steeringSpeed: 7.6,
    assists: {
      yawDamping: 0.18,
      driftGripMultiplier: 0.56,
    },
  },
  aerodynamics: {
    downforceFactor: 26, // Large rally rear wing & hood vents
  },
  wheels: [
    {
      // Front-left
      position: [-0.88, -0.2, 1.13],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 9500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.88, -0.2, 1.13],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 9500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.90, -0.2, -1.05],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 21,
      suspensionDamping: 3.0,
      maxSuspensionForce: 9500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.90, -0.2, -1.05],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 21,
      suspensionDamping: 3.0,
      maxSuspensionForce: 9500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_VORTEX_B: VehiclePreset = {
  id: 'vortex_b',
  name: 'Vortex Rally B',
  description: 'Twin-charged mid-engine Group B icon. Lightweight tubular spaceframe, explosive acceleration, aggressive downforce, and legendary rally pedigree.',
  category: 'rally',
  modelPath: VEHICLE_VORTEX_B_MODEL_PATH,
  modelPositionOffset: [0, 0.04, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 9.3,
    acceleration: 9.6,
    handling: 9.4,
    offroad: 8.8,
    driveType: 'AWD',
  },
  config: VORTEX_B_VEHICLE_CONFIG,
};
