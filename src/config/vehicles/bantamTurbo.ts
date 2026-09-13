import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_BANTAM_TURBO_MODEL_PATH } from '@/config/assets';

/**
 * Bantam Turbo Maxi — Mid-engine widebody pocket rocket.
 * Ultra-short wheelbase, aggressive turn-in, and instantaneous pendulum drifts.
 */
export const BANTAM_TURBO_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 135,
  chassisSize: [1.9, 0.6, 3.8],
  engine: {
    maxForce: 200,
    maxSpeed: 245,
    engineBrakingForce: 115, // Responsive hot hatch compression braking
  },
  drivetrain: {
    frontBias: 0.42, // Rear-biased 42/58 AWD for lightning-quick Scandinavian flicks
    frontPower: 190,
    rearPower: 220,
    slideFrontPowerBoost: 95,
  },
  brakes: {
    maxForce: 850,
    handbrakeForce: 440,
    frontBias: 0.52,
  },
  suspension: {
    frontAntiRollBarStiffness: 12.0,
    rearAntiRollBarStiffness: 7.5,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.4],    // ~40.9 degrees at 0 km/h (agile pocket rocket hairpins)
      [30, Math.PI / 7.0],   // ~25.7 degrees at 30 km/h
      [60, Math.PI / 11.5],  // ~15.6 degrees at 60 km/h
      [90, Math.PI / 17.0],  // ~10.6 degrees at 90 km/h
      [140, Math.PI / 25.0], // ~7.2 degrees at 140 km/h
      [220, Math.PI / 36.0], // ~5.0 degrees at 220 km/h
    ],
    steeringSpeed: 8.0, // Agile yet smooth pocket rocket steering
    assists: {
      yawDamping: 0.16,
      driftGripMultiplier: 0.52,
    },
  },
  aerodynamics: {
    downforceFactor: 14,
  },
  wheels: [
    {
      // Front-left
      position: [-0.96, -0.2, 1.32],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 8000,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.96, -0.2, 1.32],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 8000,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left (widebody rear axle aligned with flared arches)
      position: [-1.02, -0.2, -1.52],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 21,
      suspensionDamping: 2.9,
      maxSuspensionForce: 8000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right (widebody rear axle aligned with flared arches)
      position: [1.02, -0.2, -1.52],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.21,
      suspensionStiffness: 21,
      suspensionDamping: 2.9,
      maxSuspensionForce: 8000,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_BANTAM_TURBO: VehiclePreset = {
  id: 'bantam_turbo',
  name: 'Bantam Turbo Maxi',
  description: 'Widebody mid-engine hot hatch legend engineered for nimble hairpin mastery, explosive corner exit traction, and effortless oversteer drifts.',
  category: 'rally',
  modelPath: VEHICLE_BANTAM_TURBO_MODEL_PATH,
  modelPositionOffset: [0, 0.12, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 8.2,
    acceleration: 8.9,
    handling: 9.6,
    offroad: 8.0,
    driveType: 'AWD',
  },
  config: BANTAM_TURBO_VEHICLE_CONFIG,
};
