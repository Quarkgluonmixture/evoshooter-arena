import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM, type SimConfig } from '../src/core/config.ts';
import { generateMap } from '../src/sim/map.ts';
import { meanMetrics, runMatch, type TeamMetrics } from '../src/evo/match.ts';
import { RusherPolicy, SiteAttackerPolicy, SiteDefenderPolicy } from '../src/brain/scripted.ts';
import { HistoryStore } from '../src/ui/store.ts';

/**
 * `objectiveProgress` is one number for two different jobs: capture progress when you attacked, defuse progress
 * when you defended. Roles swap within a generation, so the aggregate moves when the ROLE MIX moves. These pin
 * the split that carries its own denominator.
 */
const capture: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2 };
const map = generateMap(7, capture);

describe('role-specific objective metrics', () => {
  it('defines attack progress only for the attackers, and defuse progress only for the defenders', () => {
    for (const attackers of [0, 1] as const) {
      const r = runMatch(new SiteAttackerPolicy(0), new SiteDefenderPolicy([0, 0, 0, 1, 1]), map, 5, capture, { attackers });
      const atk = r.metrics[attackers];
      const def = r.metrics[attackers === 0 ? 1 : 0];
      expect(Number.isFinite(atk.attackProgress)).toBe(true);
      expect(Number.isNaN(atk.defendProgress)).toBe(true);
      expect(Number.isFinite(def.defendProgress)).toBe(true);
      expect(Number.isNaN(def.attackProgress)).toBe(true);
    }
  });

  it('leaves both undefined in koth, which has no attacker', () => {
    const koth: SimConfig = { ...DEFAULT_SIM, roundMode: 'koth' };
    const r = runMatch(new RusherPolicy(), new RusherPolicy(), generateMap(7, koth), 5, koth);
    for (const m of r.metrics) {
      expect(Number.isNaN(m.attackProgress)).toBe(true);
      expect(Number.isNaN(m.defendProgress)).toBe(true);
    }
  });

  it('averages a role metric over the matches where it is defined, not over all matches', () => {
    const one = (attack: number, defend: number) => ({ attackProgress: attack, defendProgress: defend, kills: 2 } as TeamMetrics);
    const mean = meanMetrics([one(0.8, NaN), one(NaN, 0.2), one(NaN, 0.4)]);
    expect(mean.attackProgress).toBeCloseTo(0.8, 6); // ⛔ not 0.8/3 — the two defending matches are not zeroes
    expect(mean.defendProgress).toBeCloseTo(0.3, 6);
    expect(mean.kills).toBeCloseTo(2, 6);
  });

  it('survives the JSON round trip that turns NaN into null', () => {
    const store = new HistoryStore();
    const team = { best: 1, mean: 0, worst: -1, championMetrics: { attackProgress: NaN } as TeamMetrics, popMetrics: { attackProgress: 0.5 } as TeamMetrics };
    const json = JSON.parse(JSON.stringify({
      reports: [{
        gen: 0, elapsedMs: 1, matches: 1, ladder: [null, null], ladder0: [null, null],
        ladderSight: [null, null], ladder0Sight: [null, null], redWinShare: 0.5, teams: [team, team],
      }],
    }));
    expect(json.reports[0].teams[0].championMetrics.attackProgress).toBe(null); // this is what JSON does to NaN
    store.loadJSON(json, [[], []], 2);
    expect(Number.isNaN(store.reports[0].teams[0].championMetrics.attackProgress)).toBe(true);
    expect(store.reports[0].teams[0].popMetrics.attackProgress).toBeCloseTo(0.5, 6);
  });

  it('reports NaN, not 0, for a metric no match defined', () => {
    const mean = meanMetrics([{ attackProgress: NaN, defendProgress: NaN } as TeamMetrics]);
    expect(Number.isNaN(mean.attackProgress)).toBe(true);
  });
});
