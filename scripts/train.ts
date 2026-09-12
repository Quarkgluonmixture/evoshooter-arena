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
// A ladder cell with zero sighting ticks is a match that never happened: the champions evolved past each
// other and the win share is pure scoreboard. Mark it rather than let it read as a clean 50 % (GOTCHAS #20).
const pct = (x: number | null, sight?: number | null) =>
  x === null ? '   -  ' : (x * 100).toFixed(0).padStart(5) + (sight === 0 ? '·' : '%');

console.log(`obs=${trainer.shape.inputs} genome=${trainer.pops[0][0].length} pop=${trainer.evo.popSize} map=${trainer.map.boxes.length} boxes`);
console.log('ladder cells marked · are matches where the two champions never saw each other — the win share there measures nothing');
console.log('gen | bestR  meanR | bestB  meanB | vsG0-R vsG0-B | vs-10R vs-10B | accR  accB | zoneR zoneB | coverR coverB | spreadR spreadB | 1stShot | ms');
const t0 = Date.now();
for (let g = 0; g < gens; g++) {
  const r = await trainer.runGeneration(ev);
  const [R, B] = r.teams;
  console.log(
    `${String(r.gen).padStart(3)} | ${f(R.best)} ${f(R.mean)} | ${f(B.best)} ${f(B.mean)} | ${pct(r.ladder0[0], r.ladder0Sight[0])} ${pct(r.ladder0[1], r.ladder0Sight[1])} | ${pct(r.ladder[0], r.ladderSight[0])} ${pct(r.ladder[1], r.ladderSight[1])} | ` +
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
const duelLine = (label: string, asRed: { win: number; sight: number }, asBlue: { win: number; sight: number }) => {
  const sight = (asRed.sight + asBlue.sight) / 2;
  const note = sight === 0
    ? '  ⚠ they never saw each other — this is not a contest, it is the scoreboard of a match that never happened'
    : `  (${sight.toFixed(0)} sighting ticks/match)`;
  console.log(`${label} ${(asRed.win * 100).toFixed(0)}% win (as red), ${((1 - asBlue.win) * 100).toFixed(0)}% win (as blue), n=${n} each${note}`);
};
duelLine('final red champion vs gen-0 red champion:  ', redNowVsRedG0, g0VsNowRed);
duelLine('final blue champion vs gen-0 blue champion:', blueNowVsBlueG0, g0VsNowBlue);
console.log('For a ruler that survives mutual avoidance, run: npm run crossplay -- <run.json> --gens first,last');

if (args.has('out')) {
  mkdirSync('runs', { recursive: true });
  const out = {
    evo: trainer.evo,
    sim: trainer.sim,
    gens: trainer.history.map((h) => ({
      gen: h.gen, ladder: h.ladder, ladder0: h.ladder0,
      ladderSight: h.ladderSight, ladder0Sight: h.ladder0Sight, redWinShare: h.redWinShare,
      red: { best: h.teams[0].best, mean: h.teams[0].mean, metrics: h.teams[0].popMetrics },
      blue: { best: h.teams[1].best, mean: h.teams[1].mean, metrics: h.teams[1].popMetrics },
    })),
    hof: trainer.hof.map((h) => h.map((e) => ({ gen: e.gen, fitness: e.fitness, genome: Array.from(e.genome) }))),
  };
  writeFileSync(args.get('out')!, JSON.stringify(out));
  console.log(`saved ${args.get('out')}`);
}
