/**
 * Headless training: node scripts/train.ts --gens 30 --pop 16 --seed 1 [--out runs/x.json]
 * Prints one line per generation and finishes with the key evidence: does the final champion beat gen-0?
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Trainer } from '../src/evo/trainer.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '1');
const num = (k: string, d: number) => (args.has(k) ? Number(args.get(k)) : d);

const gens = num('gens', 20);
const trainer = new Trainer(
  {
    popSize: num('pop', 16), pairings: num('pairings', 3), hofMatches: num('hof', 2), ladderGap: num('gap', 10),
    mutSigma: num('sigma', 0.05), mutRate: num('rate', 0.02), resetProb: num('reset', 0.002), elite: num('elite', 2),
  },
  { matchSeconds: num('seconds', 40) },
  num('seed', 1),
);
const ev = trainer.localEvaluator();
const f = (x: number, w = 6) => x.toFixed(3).padStart(w);
const pct = (x: number | null) => (x === null ? '   -  ' : (x * 100).toFixed(0).padStart(5) + '%');

console.log(`obs=${trainer.shape.inputs} genome=${trainer.pops[0][0].length} pop=${trainer.evo.popSize} map=${trainer.map.boxes.length} boxes`);
console.log('gen | bestR  meanR | bestB  meanB | vsG0-R vsG0-B | vs-10R vs-10B | accR  accB | zoneR zoneB | coverR coverB | spreadR spreadB | 1stShot | ms');
const t0 = Date.now();
for (let g = 0; g < gens; g++) {
  const r = await trainer.runGeneration(ev);
  const [R, B] = r.teams;
  console.log(
    `${String(r.gen).padStart(3)} | ${f(R.best)} ${f(R.mean)} | ${f(B.best)} ${f(B.mean)} | ${pct(r.ladder0[0])} ${pct(r.ladder0[1])} | ${pct(r.ladder[0])} ${pct(r.ladder[1])} | ` +
      `${f(R.popMetrics.accuracy, 5)} ${f(B.popMetrics.accuracy, 5)} | ${f(R.popMetrics.zoneShare, 5)} ${f(B.popMetrics.zoneShare, 5)} | ` +
      `${f(R.popMetrics.coverRatio, 6)} ${f(B.popMetrics.coverRatio, 6)} | ${f(R.popMetrics.spread, 7)} ${f(B.popMetrics.spread, 7)} | ` +
      `${f(R.popMetrics.firstContact, 7)} | ${r.elapsedMs}`,
  );
}
const total = (Date.now() - t0) / 1000;

const n = num('duel', 10);
const last = trainer.hof[0].length - 1;
const redNowVsRedG0 = await trainer.duel(ev, trainer.hof[0][last].genome, trainer.hof[0][0].genome, n);
const blueNowVsBlueG0 = await trainer.duel(ev, trainer.hof[1][last].genome, trainer.hof[1][0].genome, n);
const g0VsNowRed = await trainer.duel(ev, trainer.hof[0][0].genome, trainer.hof[0][last].genome, n);
const g0VsNowBlue = await trainer.duel(ev, trainer.hof[1][0].genome, trainer.hof[1][last].genome, n);
console.log(`\n${gens} generations in ${total.toFixed(0)}s (${(total / gens).toFixed(1)} s/gen)`);
console.log(`final red champion vs gen-0 red champion:   ${(redNowVsRedG0 * 100).toFixed(0)}% win (as red), ${((1 - g0VsNowRed) * 100).toFixed(0)}% win (as blue), n=${n} each`);
console.log(`final blue champion vs gen-0 blue champion: ${(blueNowVsBlueG0 * 100).toFixed(0)}% win (as red), ${((1 - g0VsNowBlue) * 100).toFixed(0)}% win (as blue), n=${n} each`);

if (args.has('out')) {
  mkdirSync('runs', { recursive: true });
  const out = {
    evo: trainer.evo,
    sim: trainer.sim,
    gens: trainer.history.map((h) => ({
      gen: h.gen, ladder: h.ladder, ladder0: h.ladder0, redWinShare: h.redWinShare,
      red: { best: h.teams[0].best, mean: h.teams[0].mean, metrics: h.teams[0].popMetrics },
      blue: { best: h.teams[1].best, mean: h.teams[1].mean, metrics: h.teams[1].popMetrics },
    })),
    hof: trainer.hof.map((h) => h.map((e) => ({ gen: e.gen, fitness: e.fitness, genome: Array.from(e.genome) }))),
  };
  writeFileSync(args.get('out')!, JSON.stringify(out));
  console.log(`saved ${args.get('out')}`);
}
