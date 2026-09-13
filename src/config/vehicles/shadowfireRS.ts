import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_SHADOWFIRE_RS_MODEL_PATH } from '@/config/assets';

/**
 * Shadowfire RS — Aggressive modern rough-terrain rally machine.
 * Reinforced long-travel suspension, wide track, and ferocious gravel grip.
 */
export const SHADOWFIRE_RS_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 150,
  chassisSize: [1.95, 0.6, 4.0],
  engine: {
    maxForce: 220,
    maxSpeed: 260,
    engineBrakingForce: 120, // Responsive modern rally engine braking
  },
  drivetrain: {
    frontBias: 0.52, // 52/48 front-biased AWD for pulling out of rough ruts
    frontPower: 225,
    rearPower: 195,
    slideFrontPowerBoost: 105,
  },
  brakes: {
    maxForce: 890,
    handbrakeForce: 450,
    frontBias: 0.55,
  },
  suspension: {
    frontAntiRollBarStiffness: 11.5,
    rearAntiRollBarStiffness: 6.5,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.6],    // ~39.1 degrees at 0 km/h (agile hairpins & recovery)
      [30, Math.PI / 7.5],   // ~24.0 degrees at 30 km/h
      [60, Math.PI / 12.0],  // ~15.0 degrees at 60 km/h
      [90, Math.PI / 18.0],  // ~10.0 degrees at 90 km/h
      [140, Math.PI / 26.0], // ~6.9 degrees at 140 km/h
      [220, Math.PI / 38.0], // ~4.7 degrees at 220 km/h
    ],
    steeringSpeed: 7.0,
    assists: {
      yawDamping: 0.20,
      driftGripMultiplier: 0.55,
    },
  },
  aerodynamics: {
    downforceFactor: 22,
  },
  wheels: [
    {
      // Front-left
      position: [-1.00, -0.2, 1.26],
      radius: 0.32,
      suspensionRestLength: 0.36,
      suspensionTravel: 0.23,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 9500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [1.00, -0.2, 1.26],
      radius: 0.32,
      suspensionRestLength: 0.36,
      suspensionTravel: 0.23,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 9500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.99, -0.2, -1.35],
      radius: 0.32,
      suspensionRestLength: 0.36,
      suspensionTravel: 0.23,
      suspensionStiffness: 20,
      suspensionDamping: 3.0,
      maxSuspensionForce: 9500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.99, -0.2, -1.35],
      radius: 0.32,
      suspensionRestLength: 0.36,
      suspensionTravel: 0.23,
      suspensionStiffness: 20,
      suspensionDamping: 3.0,
      maxSuspensionForce: 9500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_SHADOWFIRE_RS: VehiclePreset = {
  id: 'shadowfire_rs',
  name: 'Shadowfire RS',
  description: 'Aggressive modern widebody rally challenger equipped with heavy-duty long-travel suspension, supreme bump absorption, and tenacious rough-gravel grip.',
  category: 'rally',
  modelPath: VEHICLE_SHADOWFIRE_RS_MODEL_PATH,
  modelPositionOffset: [0, 0.10, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 8.7,
    acceleration: 9.1,
    handling: 8.8,
    offroad: 9.2,
    driveType: 'AWD',
  },
  config: SHADOWFIRE_RS_VEHICLE_CONFIG,
};
