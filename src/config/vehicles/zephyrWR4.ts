import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_ZEPHYR_WR4_MODEL_PATH } from '@/config/assets';

/**
 * Zephyr WR-4 — Iconic symmetrical AWD gravel champion.
 * Unrivaled chassis balance, progressive sliding, and benchmark rally reliability.
 */
export const ZEPHYR_WR4_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 148,
  chassisSize: [1.9, 0.6, 4.0],
  engine: {
    maxForce: 215, // Peak balanced launch acceleration on 148kg chassis
    maxSpeed: 255,
    engineBrakingForce: 125, // Responsive engine braking (~0.32G)
  },
  drivetrain: {
    frontBias: 0.52, // Balanced 52/48 symmetrical AWD
    frontPower: 220, // Authoritative front pull
    rearPower: 180,  // Controlled rear drive
    slideFrontPowerBoost: 100, // Dynamic front recovery pull during hard slides
  },
  brakes: {
    maxForce: 880, // High-performance competition deceleration (~2.0G)
    handbrakeForce: 450, // Clean rear lockup for drift initiation
    frontBias: 0.55,
  },
  suspension: {
    frontAntiRollBarStiffness: 11.0, // Supple front ARB for bump compliance
    rearAntiRollBarStiffness: 6.5,   // Soft rear ARB maintains tire contact patch
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.6],    // ~39.1 degrees at 0 km/h (symmetrical AWD hairpins)
      [30, Math.PI / 7.5],   // ~24.0 degrees at 30 km/h
      [60, Math.PI / 12.0],  // ~15.0 degrees at 60 km/h
      [90, Math.PI / 18.0],  // ~10.0 degrees at 90 km/h
      [140, Math.PI / 26.0], // ~6.9 degrees at 140 km/h
      [220, Math.PI / 38.0], // ~4.7 degrees at 220 km/h
    ],
    steeringSpeed: 7.4,
    assists: {
      yawDamping: 0.20, // Progressive drift control without tank-slappers
      driftGripMultiplier: 0.55, // Smooth breakaway on handbrake
    },
  },
  aerodynamics: {
    downforceFactor: 16,
  },
  wheels: [
    {
      // Front-left
      position: [-0.88, -0.2, 1.38],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 8500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.88, -0.2, 1.38],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 22,
      suspensionDamping: 2.8,
      maxSuspensionForce: 8500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.89, -0.2, -1.23],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 20,
      suspensionDamping: 3.0,
      maxSuspensionForce: 8500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.89, -0.2, -1.23],
      radius: 0.32,
      suspensionRestLength: 0.35,
      suspensionTravel: 0.22,
      suspensionStiffness: 20,
      suspensionDamping: 3.0,
      maxSuspensionForce: 8500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_ZEPHYR_WR4: VehiclePreset = {
  id: 'zephyr_wr4',
  name: 'Zephyr WR-4',
  description: 'The golden standard of rally championships. Featuring symmetrical all-wheel drive, telepathic turn-in, and exceptionally controllable four-wheel drifts on loose surfaces.',
  category: 'rally',
  modelPath: VEHICLE_ZEPHYR_WR4_MODEL_PATH,
  modelPositionOffset: [0, 0.025, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 8.5,
    acceleration: 8.8,
    handling: 9.3,
    offroad: 9.0,
    driveType: 'AWD',
  },
  config: ZEPHYR_WR4_VEHICLE_CONFIG,
};
