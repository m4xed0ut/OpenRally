import { describe, it, expect, beforeEach } from 'vitest';
import { getElevatedStructureHeight, clearElevatedStructureCache } from '../elevatedStructures';
import type { LevelData, PropData } from '@/types/level';

describe('elevatedStructures', () => {
  beforeEach(() => {
    clearElevatedStructureCache();
  });

  const mockRamp: PropData = {
    id: 'jump_ramp_test',
    type: 'jump_ramp',
    position: [0, 8.0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };

  const mockBridge: PropData = {
    id: 'stone_bridge_test',
    type: 'stone_bridge',
    position: [50, 4.0, 50],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };

  const mockLevel: LevelData = {
    id: 'test_level',
    name: 'Test Level',
    terrainBase: {
      width: 1000,
      depth: 1000,
      subdivisions: 64,
      amplitude: 2,
      frequency: 0.01,
      octaves: 2,
      lacunarity: 2,
      persistence: 0.5,
      seed: 1,
    },
    track: {
      width: 10,
      falloff: 5,
      targetHeight: 8.0,
      points: [{ x: 0, z: 0 }],
    },
    heightModifiers: [],
    props: [mockRamp, mockBridge],
  };

  it('samples ramp deck elevation correctly along incline at rotY=0', () => {
    // Entrance at z = -4.0: baseY + 0.9325 + 0.25 * (-4) = 8.0 - 0.0675 = 7.9325
    const entryHeight = getElevatedStructureHeight(0, 8.5, -4.0, undefined, mockLevel);
    expect(entryHeight).toBeCloseTo(7.9325, 3);

    // Center at z = 0.0: baseY + 0.9325 = 8.9325
    const centerHeight = getElevatedStructureHeight(0, 9.0, 0.0, undefined, mockLevel);
    expect(centerHeight).toBeCloseTo(8.9325, 3);

    // Peak at z = 4.0: baseY + 0.9325 + 0.25 * 4 = 9.9325
    const peakHeight = getElevatedStructureHeight(0, 10.0, 4.0, undefined, mockLevel);
    expect(peakHeight).toBeCloseTo(9.9325, 3);
  });

  it('returns null when querying past the peak lip or outside lateral bounds', () => {
    // Past the launch lip (z = 4.5)
    expect(getElevatedStructureHeight(0, 10.0, 4.5, undefined, mockLevel)).toBeNull();

    // Before the entry lip (z = -4.5)
    expect(getElevatedStructureHeight(0, 8.0, -4.5, undefined, mockLevel)).toBeNull();

    // Past lateral half-width (x = 3.5)
    expect(getElevatedStructureHeight(3.5, 9.0, 0, undefined, mockLevel)).toBeNull();
  });

  it('returns null when vehicle is underneath structure', () => {
    // Center deck is at 8.9325. If vehicle is at y = 8.0, y < 8.9325 - 0.45
    expect(getElevatedStructureHeight(0, 8.0, 0, undefined, mockLevel)).toBeNull();
  });

  it('correctly transforms rotated jump ramps', () => {
    const yaw = Math.PI / 2; // 90 deg rotation
    const rotatedLevel: LevelData = {
      ...mockLevel,
      id: 'rotated_level',
      props: [
        {
          id: 'ramp_rot',
          type: 'jump_ramp',
          position: [10, 8.0, 10],
          rotation: [0, yaw, 0],
          scale: [1, 1, 1],
        },
      ],
    };

    // When rotated 90 deg around Y:
    // Local Z+ (+4) maps to World X+ (+4), World Z unchanged
    const peakHeight = getElevatedStructureHeight(14.0, 10.0, 10.0, undefined, rotatedLevel);
    expect(peakHeight).toBeCloseTo(9.9325, 3);

    // Local Z- (-4) maps to World X- (-4)
    const entryHeight = getElevatedStructureHeight(6.0, 8.5, 10.0, undefined, rotatedLevel);
    expect(entryHeight).toBeCloseTo(7.9325, 3);
  });

  it('samples stone bridge deck elevation correctly', () => {
    // Bridge at [50, 4.0, 50], deck at baseY + 1.2 = 5.2
    const deckHeight = getElevatedStructureHeight(50, 5.5, 50, undefined, mockLevel);
    expect(deckHeight).toBeCloseTo(5.2, 3);

    // Outside bridge
    expect(getElevatedStructureHeight(60, 5.5, 50, undefined, mockLevel)).toBeNull();
  });
});
