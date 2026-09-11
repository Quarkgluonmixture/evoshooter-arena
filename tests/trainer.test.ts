import { describe, expect, it } from 'vitest';
import { Trainer } from '../src/evo/trainer.ts';
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
    expect(r0.matches).toBe(4); // pairings only: no hall of fame yet
    const r1 = await t.runGeneration(ev);
    expect(r1.gen).toBe(1);
    expect(r1.matches).toBe(4 + 8 + 4); // pairings + hof(1 match × both sides) + ladder both sides
    expect(r1.ladder[0]).toBeGreaterThanOrEqual(0);
    expect(r1.ladder[0]).toBeLessThanOrEqual(1);
    expect(t.hof[0].length).toBe(2);
    expect(t.hof[1].length).toBe(2);
    expect(t.hof[0][1].genome.length).toBe(genomeLength(t.shape));
    expect(t.pops[0].length).toBe(4);
    expect(r1.heat[0].length).toBe(t.sim.heatCells ** 2);
    expect(r1.teams[0].popMetrics.shots).toBeGreaterThanOrEqual(0);
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
