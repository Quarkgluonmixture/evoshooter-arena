import { describe, expect, it } from 'vitest';
import { Trainer, LocalEvaluator, type Evaluator, type MatchJob } from '../src/evo/trainer.ts';
import { genomeLength } from '../src/brain/mlp.ts';

describe('Trainer', () => {
  it('runs generations, grows the hall of fame and reports a ladder once the gap is reached', async () => {
    const t = new Trainer(
      { popSize: 4, pairings: 1, hofMatches: 1, ladderGap: 1, ladderMatches: 2, hidden: [8] },
      { matchSeconds: 6 },
      1,
    );
    const ev = t.localEvaluator();
    const r0 = await t.runGeneration(ev);
    expect(r0.gen).toBe(0);
    expect(r0.ladder).toEqual([null, null]);
    expect(r0.ladder0).toEqual([null, null]);
    // Every ladder win share must arrive with the denominator that makes it readable, or a 50 % between two
    // champions who never met reads exactly like a 50 % between equals (GOTCHAS #20). This asserts the
    // plumbing (a number appears exactly when a win share does); that the counter really counts is
    // guarded positively in world.test.ts.
    expect(r0.ladderSight).toEqual([null, null]);
    expect(r0.ladder0Sight).toEqual([null, null]);
    expect(r0.matches).toBe(4); // pairings only: no hall of fame yet
    const r1 = await t.runGeneration(ev);
    expect(r1.gen).toBe(1);
    expect(r1.matches).toBe(4 + 8 + 4 + 4); // pairings + hof(1 match × both sides) + gap ladder + gen-0 ladder
    expect(r1.ladder[0]).toBeGreaterThanOrEqual(0);
    expect(r1.ladder[0]).toBeLessThanOrEqual(1);
    expect(r1.ladder0[1]).toBeGreaterThanOrEqual(0);
    expect(r1.ladder0[1]).toBeLessThanOrEqual(1);
    for (const t of [0, 1] as const) {
      expect(r1.ladderSight[t] === null).toBe(r1.ladder[t] === null);
      expect(r1.ladder0Sight[t] === null).toBe(r1.ladder0[t] === null);
      expect(r1.ladder0Sight[t]).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r1.ladder0Sight[t])).toBe(true);
    }
    const d = await t.duel(ev, t.hof[0][1].genome, t.hof[0][0].genome, 2);
    expect(d.win).toBeGreaterThanOrEqual(0);
    expect(d.sight).toBeGreaterThanOrEqual(0);

    expect(t.hof[0].length).toBe(2);
    expect(t.hof[1].length).toBe(2);
    expect(t.hof[0][1].genome.length).toBe(genomeLength(t.shape));
    expect(t.pops[0].length).toBe(4);
    expect(r1.heat[0].length).toBe(t.sim.heatCells ** 2);
    expect(r1.teams[0].popMetrics.shots).toBeGreaterThanOrEqual(0);
  });

  it('plays every capture-mode pairing with both role assignments', async () => {
    // Attacking and defending are different jobs, so a schedule that always gives red the attack turns red
    // into a permanent attacker species (VISION §11.2) and makes every fitness number a blend of two jobs in
    // whatever ratio the schedule happened to produce (SUBSTRATE §10.3). Counted rather than assumed.
    const seen: MatchJob[] = [];
    const ev: Evaluator = {
      run(genomes, jobs, wantHeat) {
        seen.push(...jobs);
        return new LocalEvaluator(t.sim, t.shape, t.map).run(genomes, jobs, wantHeat);
      },
    };
    const t = new Trainer(
      { popSize: 4, pairings: 1, hofMatches: 0, ladderMatches: 0, hidden: [8] },
      { matchSeconds: 6, roundMode: 'capture' },
      1,
    );
    await t.runGeneration(ev);
    const pairs = seen.filter((j) => j.kind === 'pair');
    expect(pairs.length).toBe(8); // 4 pairings x 2 role assignments
    expect(pairs.filter((j) => j.attackers === 0).length).toBe(4);
    expect(pairs.filter((j) => j.attackers === 1).length).toBe(4);
    // and each genome gets one of each, so its fitness is not a mix of two jobs in an arbitrary ratio
    for (let i = 0; i < 4; i++) {
      const mine = pairs.filter((j) => j.red === i);
      expect(new Set(mine.map((j) => j.attackers))).toEqual(new Set([0, 1]));
    }
  });

  it('leaves koth pairings alone — symmetric sides need no swap', async () => {
    const seen: MatchJob[] = [];
    const t = new Trainer({ popSize: 4, pairings: 1, hofMatches: 0, ladderMatches: 0, hidden: [8] }, { matchSeconds: 6 }, 1);
    await t.runGeneration({
      run(genomes, jobs, wantHeat) {
        seen.push(...jobs);
        return new LocalEvaluator(t.sim, t.shape, t.map).run(genomes, jobs, wantHeat);
      },
    });
    expect(seen.filter((j) => j.kind === 'pair').length).toBe(4);
    expect(seen.every((j) => j.attackers === undefined)).toBe(true);
  });

  it('is reproducible from the seed', async () => {
    const mk = () => new Trainer({ popSize: 3, pairings: 1, hofMatches: 0, ladderMatches: 0, hidden: [6] }, { matchSeconds: 4 }, 42);
    const a = mk();
    const b = mk();
    const ra = await a.runGeneration(a.localEvaluator());
    const rb = await b.runGeneration(b.localEvaluator());
    expect(ra.teams[0].best).toBe(rb.teams[0].best);
    expect(Array.from(a.pops[1][2])).toEqual(Array.from(b.pops[1][2]));
  });
});
