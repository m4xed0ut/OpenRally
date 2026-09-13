import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_VANGUARD_GT_MODEL_PATH } from '@/config/assets';

/**
 * Vanguard GT-Aero — High-speed aerodynamic GT rally coupe.
 * Extended wheelbase, low drag profile, high-speed stability.
 */
export const VANGUARD_GT_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 155,
  chassisSize: [1.9, 0.6, 4.2],
  engine: {
    maxForce: 230,
    maxSpeed: 280,
    engineBrakingForce: 110, // Progressive GT sports engine braking
  },
  drivetrain: {
    frontBias: 0.40, // 40/60 RWD-biased AWD for exhilarating sports GT dynamics
    frontPower: 185,
    rearPower: 235,
    slideFrontPowerBoost: 95,
  },
  brakes: {
    maxForce: 920,
    handbrakeForce: 460,
    frontBias: 0.56,
  },
  suspension: {
    frontAntiRollBarStiffness: 13.5,
    rearAntiRollBarStiffness: 8.5,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.7],    // ~38.3 degrees at 0 km/h (sports GT coupe hairpins)
      [30, Math.PI / 7.8],   // ~23.1 degrees at 30 km/h
      [60, Math.PI / 12.5],  // ~14.4 degrees at 60 km/h
      [90, Math.PI / 18.5],  // ~9.7 degrees at 90 km/h
      [140, Math.PI / 27.0], // ~6.7 degrees at 140 km/h
      [220, Math.PI / 39.0], // ~4.6 degrees at 220 km/h
    ],
    steeringSpeed: 6.8,
    assists: {
      yawDamping: 0.22,
      driftGripMultiplier: 0.50,
    },
  },
  aerodynamics: {
    downforceFactor: 25,
  },
  wheels: [
    {
      // Front-left
      position: [-0.92, -0.2, 1.25],
      radius: 0.32,
      suspensionRestLength: 0.34,
      suspensionTravel: 0.21,
      suspensionStiffness: 24,
      suspensionDamping: 3.0,
      maxSuspensionForce: 9800,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.92, -0.2, 1.25],
      radius: 0.32,
      suspensionRestLength: 0.34,
      suspensionTravel: 0.21,
      suspensionStiffness: 24,
      suspensionDamping: 3.0,
      maxSuspensionForce: 9800,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left (wide rear track)
      position: [-1.02, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.34,
      suspensionTravel: 0.21,
      suspensionStiffness: 23,
      suspensionDamping: 3.2,
      maxSuspensionForce: 9800,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right (wide rear track)
      position: [1.02, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.34,
      suspensionTravel: 0.21,
      suspensionStiffness: 23,
      suspensionDamping: 3.2,
      maxSuspensionForce: 9800,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_VANGUARD_GT: VehiclePreset = {
  id: 'vanguard_gt',
  name: 'Vanguard GT-Aero',
  description: 'Grand touring aerodynamic rally coupe with extended wheelbase high-speed tracking, rear-biased AWD balance, and 280 km/h top end.',
  category: 'sports',
  modelPath: VEHICLE_VANGUARD_GT_MODEL_PATH,
  modelPositionOffset: [0, 0.08, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 9.4,
    acceleration: 8.8,
    handling: 8.9,
    offroad: 7.6,
    driveType: 'AWD',
  },
  config: VANGUARD_GT_VEHICLE_CONFIG,
};
