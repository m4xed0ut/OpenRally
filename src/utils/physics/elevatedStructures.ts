import type { HeightmapData } from '@/types/terrain';
import type { LevelData, PropData } from '@/types/level';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';

// ─── Module-level cache for drivable elevated props (Zero GC) ───────────────
const _drivablePropsCache = new Map<string, PropData[]>();

/**
 * Clears the internal level prop cache (primarily for unit tests).
 */
export function clearElevatedStructureCache(): void {
  _drivablePropsCache.clear();
}

/**
 * Retrieves or caches elevated drivable props (jump ramps, stone bridges)
 * for the given level, avoiding per-frame array filtering.
 */
function getDrivablePropsForLevel(levelData: LevelData): PropData[] {
  let list = _drivablePropsCache.get(levelData.id);
  if (!list) {
    list = levelData.props.filter(
      (p) => p.type === 'jump_ramp' || p.type === 'stone_bridge',
    );
    _drivablePropsCache.set(levelData.id, list);
  }
  return list;
}

/**
 * Evaluates the elevated deck surface height for drivable structures (jump ramps, bridges).
 * 
 * When a vehicle wheel or chassis is within the planar footprint of a structure and within
 * vertical contact reach (y >= worldDeckY - 0.45m), this returns the exact surface height.
 * Returns null if the position is outside all elevated structures or beneath the structure.
 * 
 * @param x World X coordinate
 * @param y World Y coordinate (used to verify vertical proximity / avoid snapping when underneath)
 * @param z World Z coordinate
 * @param heightmapData Optional terrain heightmap data
 * @param levelData Optional level definition containing props
 * @returns Highest valid elevated deck elevation Y, or null if none
 */
export function getElevatedStructureHeight(
  x: number,
  y: number,
  z: number,
  heightmapData?: HeightmapData,
  levelData?: LevelData,
): number | null {
  if (!levelData || !levelData.props || levelData.props.length === 0) {
    return null;
  }

  const props = getDrivablePropsForLevel(levelData);
  if (props.length === 0) return null;

  let maxDeckY: number | null = null;

  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const px = prop.position[0];
    const pz = prop.position[2];

    const dx = x - px;
    const dz = z - pz;

    const sx = prop.scale?.[0] ?? 1.0;
    const sy = prop.scale?.[1] ?? 1.0;
    const sz = prop.scale?.[2] ?? 1.0;

    const yaw = prop.rotation?.[1] ?? 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Transform world relative coordinate (dx, dz) into prop local space (lx, lz)
    const lx = (dx * cosY - dz * sinY) / sx;
    const lz = (dx * sinY + dz * cosY) / sz;

    if (prop.type === 'jump_ramp') {
      // Jump ramp geometry: width = 5.5m (half = 2.75m), run length = 8.0m (half = 4.0m)
      // Generous edge tolerance (+0.1m) covers steel runner rails and transition lips
      const halfWidth = 2.85;
      const halfLength = 4.05;

      if (Math.abs(lx) <= halfWidth && lz >= -halfLength && lz <= halfLength) {
        // Analytical top deck formula derived from createJumpRampGeometry():
        // centerY = 0.85m, deckThickness = 0.16m, theta = atan2(2.0, 8.0) ~ 14.04 deg
        // y_top(lz) = centerY + (0.08 / cos(theta)) + tan(theta) * lz
        //           = 0.85 + 0.08246 + 0.25 * lz = 0.9325 + 0.25 * lz
        const localDeckY = 0.9325 + 0.25 * lz;

        let baseY = prop.position[1];
        if (baseY === 0 && heightmapData) {
          baseY = getInterpolatedHeight(
            px,
            pz,
            heightmapData.heights,
            heightmapData.rows,
            heightmapData.cols,
            levelData.terrainBase.width,
            levelData.terrainBase.depth,
          );
        }

        const worldDeckY = baseY + localDeckY * sy;

        // Contact proximity: ensure wheel or chassis is on or above the deck,
        // rather than deep below the ramp foundation
        if (y >= worldDeckY - 0.45) {
          if (maxDeckY === null || worldDeckY > maxDeckY) {
            maxDeckY = worldDeckY;
          }
        }
      }
    } else if (prop.type === 'stone_bridge') {
      // Stone bridge geometry: width = 6.8m (half = 3.4m), length = 12.0m (half = 6.0m)
      const halfWidth = 3.5;
      const halfLength = 6.1;

      if (Math.abs(lx) <= halfWidth && Math.abs(lz) <= halfLength) {
        let baseY = prop.position[1];
        if (baseY === 0 && heightmapData) {
          baseY = getInterpolatedHeight(
            px,
            pz,
            heightmapData.heights,
            heightmapData.rows,
            heightmapData.cols,
            levelData.terrainBase.width,
            levelData.terrainBase.depth,
          );
        }

        const worldDeckY = baseY + 1.2 * sy;

        if (y >= worldDeckY - 0.45) {
          if (maxDeckY === null || worldDeckY > maxDeckY) {
            maxDeckY = worldDeckY;
          }
        }
      }
    }
  }

  return maxDeckY;
}
