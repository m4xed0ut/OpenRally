import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_KODIAK_RAID_MODEL_PATH } from '@/config/assets';

/**
 * Kodiak Raid Pro — Heavy-duty cross-country raid powerhouse.
 * Massive suspension travel, indestructible off-road clearance, and unrelenting low-end torque.
 */
export const KODIAK_RAID_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 175,
  chassisSize: [2.0, 0.65, 4.1],
  engine: {
    maxForce: 245, // Massive low-end torque on 175kg heavy raid chassis
    maxSpeed: 235,
    engineBrakingForce: 140, // High heavy-chassis raid compression braking
  },
  drivetrain: {
    frontBias: 0.50, // Permanent locked 50/50 AWD
    frontPower: 240,
    rearPower: 240,
    slideFrontPowerBoost: 120, // Authoritative front axle pull out of deep ruts and dunes
  },
  brakes: {
    maxForce: 960, // Heavy-duty competition deceleration
    handbrakeForce: 480, // Firm rear lockup
    frontBias: 0.58,
  },
  suspension: {
    frontAntiRollBarStiffness: 9.0, // Supple ARB allows independent articulation on boulders and ruts
    rearAntiRollBarStiffness: 5.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.7],    // ~38.3 degrees at 0 km/h (heavy raid truck hairpins)
      [30, Math.PI / 8.0],   // ~22.5 degrees at 30 km/h
      [60, Math.PI / 13.0],  // ~13.8 degrees at 60 km/h
      [90, Math.PI / 19.0],  // ~9.5 degrees at 90 km/h
      [140, Math.PI / 28.0], // ~6.4 degrees at 140 km/h
      [220, Math.PI / 40.0], // ~4.5 degrees at 220 km/h
    ],
    steeringSpeed: 6.5,
    assists: {
      yawDamping: 0.24,
      driftGripMultiplier: 0.52,
    },
  },
  aerodynamics: {
    downforceFactor: 16,
  },
  wheels: [
    {
      // Front-left
      position: [-0.94, -0.15, 1.27],
      radius: 0.34,
      suspensionRestLength: 0.39,
      suspensionTravel: 0.26,
      suspensionStiffness: 24,
      suspensionDamping: 3.2,
      maxSuspensionForce: 12500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.94, -0.15, 1.27],
      radius: 0.34,
      suspensionRestLength: 0.39,
      suspensionTravel: 0.26,
      suspensionStiffness: 24,
      suspensionDamping: 3.2,
      maxSuspensionForce: 12500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.95, -0.15, -1.39],
      radius: 0.34,
      suspensionRestLength: 0.39,
      suspensionTravel: 0.26,
      suspensionStiffness: 22,
      suspensionDamping: 3.4,
      maxSuspensionForce: 12500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.95, -0.15, -1.39],
      radius: 0.34,
      suspensionRestLength: 0.39,
      suspensionTravel: 0.26,
      suspensionStiffness: 22,
      suspensionDamping: 3.4,
      maxSuspensionForce: 12500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_KODIAK_RAID: VehiclePreset = {
  id: 'kodiak_raid',
  name: 'Kodiak Raid Pro',
  description: 'Armored cross-country raid titan engineered to conquer extreme desert dunes, deep mud ruts, and massive high-flying jumps without flinching.',
  category: 'offroad',
  modelPath: VEHICLE_KODIAK_RAID_MODEL_PATH,
  modelPositionOffset: [0, 0.12, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 7.8,
    acceleration: 8.6,
    handling: 8.0,
    offroad: 9.8,
    driveType: 'AWD',
  },
  config: KODIAK_RAID_VEHICLE_CONFIG,
};
