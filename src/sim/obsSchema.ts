/**
 * Provenance map for the observation vector.
 *
 * `world.observe()` writes the flat vector; this file names every index and says where the value is
 * ALLOWED to come from. The two must agree — `obsSchema()` throws if the widths drift, and
 * `tests/leak.test.ts` binds names to behaviour by mutating one world quantity at a time and checking
 * that exactly the declared fields move. Nothing here is read by the simulation or by a policy.
 *
 * Legality classes (see docs/SUBSTRATE.md §3):
 *   legal       a human player gets this through a sanctioned channel (proprioception / HUD / vision / radio);
 *   truth-form  the information is legitimately perceivable, but it is delivered as an exact engine value
 *               instead of a degraded percept — A3 must reshape it, not delete it;
 *   hidden      the observer cannot legally know it at all — A2/A3 must remove the channel.
 */
import type { SimConfig } from '../core/config.ts';
import { SELF_BASE, MATE_FEATS_BASE, ENEMY_FEATS, obsDim } from './world.ts';

export type Channel = 'self' | 'objective' | 'geometry' | 'teammate' | 'comm' | 'enemy';
export type Legality = 'legal' | 'truth-form' | 'hidden';

export interface ObsField {
  index: number;
  name: string;
  channel: Channel;
  legality: Legality;
  /** SUBSTRATE §1 gap this field belongs to, when it is not legal as it stands. */
  gap?: string;
  note?: string;
}

export function obsSchema(cfg: SimConfig): ObsField[] {
  const f: ObsField[] = [];
  const push = (name: string, channel: Channel, legality: Legality, gap?: string, note?: string) =>
    f.push({ index: f.length, name, channel, legality, gap, note });

  // --- self: proprioception + own HUD (SUBSTRATE §3.1)
  push('self.posX', 'self', 'legal');
  push('self.posZ', 'self', 'legal');
  push('self.yawCos', 'self', 'legal');
  push('self.yawSin', 'self', 'legal');
  push('self.velX', 'self', 'legal');
  push('self.velZ', 'self', 'legal');
  push('self.hp', 'self', 'legal');
  push('self.ammo', 'self', 'legal');
  push('self.reloading', 'self', 'legal');
  push('self.inZone', 'objective', 'legal');
  push('self.aiming', 'self', 'legal');
  push('self.timeLeft', 'objective', 'legal');
  push('self.scoreDiff', 'objective', 'legal');
  push('self.dmgRecent', 'self', 'legal');
  push('self.hitDirX', 'self', 'legal', undefined, 'damage-direction indicator, a standard HUD affordance');
  push('self.hitDirZ', 'self', 'legal');
  push('self.canFire', 'self', 'legal');
  push('self.aliveMine', 'self', 'legal');
  push('self.aliveEnemy', 'self', 'legal', undefined, 'scoreboard / kill feed');
  push('self.speed', 'self', 'legal');
  for (let s = 0; s < cfg.teamSize; s++) push(`self.slot${s}`, 'self', 'legal', undefined, 'own identity one-hot');

  // --- objective HUD (SUBSTRATE §3.1)
  push('obj.dx', 'objective', 'legal');
  push('obj.dz', 'objective', 'legal');
  push('obj.dist', 'objective', 'legal');
  push('obj.mineInZone', 'objective', 'legal', undefined, 'derived from the teammate position HUD');
  push('obj.enemyInZone', 'objective', 'hidden', 'V12',
    'counts enemies standing in the zone whether or not anyone has ever seen them');

  // --- geometry sensing
  for (let k = 0; k < cfg.lidarRays; k++) {
    push(`geom.lidar${k}`, 'geometry', 'hidden', 'V3',
      '360° wall distance: rays behind the head report geometry the player cannot see');
  }

  // --- teammates: HUD + body cue, with no visibility test at all
  for (let s = 0; s < cfg.mateSlots; s++) {
    push(`mate${s}.dx`, 'teammate', 'legal', undefined, 'exact teammate position HUD (a chosen ruleset, §3.2)');
    push(`mate${s}.dz`, 'teammate', 'legal');
    push(`mate${s}.dist`, 'teammate', 'legal');
    push(`mate${s}.alive`, 'teammate', 'legal');
    push(`mate${s}.hp`, 'teammate', 'legal', undefined, 'teammate HP HUD (§3.2)');
    push(`mate${s}.firing`, 'teammate', 'hidden', 'V11',
      'body-action truth delivered at any range through any wall (§6.2 allows it only in vision)');
    for (let c = 0; c < cfg.commDim; c++) {
      push(`mate${s}.comm${c}`, 'comm', 'legal', 'V8', 'radio is a legal channel; V8 is its unbounded bandwidth');
    }
  }

  // --- enemies: contact slots
  for (let s = 0; s < cfg.enemySlots; s++) {
    push(`enemy${s}.present`, 'enemy', 'truth-form', 'V6',
      'my own contact since A2, but the world does the remembering for me');
    push(`enemy${s}.dx`, 'enemy', 'truth-form', 'V2', 'exact relative position, not a bearing/range cue');
    push(`enemy${s}.dz`, 'enemy', 'truth-form', 'V2');
    push(`enemy${s}.dist`, 'enemy', 'truth-form', 'V2');
    push(`enemy${s}.exposure`, 'enemy', 'truth-form', 'V2', 'engine body-point exposure fraction, not a degraded percept');
    push(`enemy${s}.staleness`, 'enemy', 'truth-form', 'V6', 'age of the world-managed memory entry');
    push(`enemy${s}.visible`, 'enemy', 'legal', undefined, 'flag: is this contact my own current vision');
  }

  const expected = obsDim(cfg);
  if (f.length !== expected) {
    throw new Error(`obsSchema drift: schema has ${f.length} fields, world.obsDim is ${expected}`);
  }
  if (SELF_BASE !== 20 || MATE_FEATS_BASE !== 6 || ENEMY_FEATS !== 7) {
    throw new Error('obsSchema drift: world.ts feature-group widths changed, re-derive the field names');
  }
  return f;
}

export function fieldNames(cfg: SimConfig, indices: number[]): string[] {
  const s = obsSchema(cfg);
  return indices.map((i) => s[i].name);
}
