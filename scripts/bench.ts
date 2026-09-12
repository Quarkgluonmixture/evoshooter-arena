import { DEFAULT_SIM, DEFAULT_EVO } from '../src/core/config.ts';
import { Rng } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { randomGenome } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { runMatch } from '../src/evo/match.ts';
import { obsDim } from '../src/sim/world.ts';

// `--rec N` benches the D1 recurrent brain against the feed-forward baseline; interleave the two runs
// (GOTCHAS #16), the absolute numbers drift with machine load.
const recArg = process.argv.indexOf('--rec');
const cfg = { ...DEFAULT_SIM, recurrentDim: recArg > 0 ? Number(process.argv[recArg + 1]) : DEFAULT_SIM.recurrentDim };
const shape = shapeFor(cfg, DEFAULT_EVO.hidden);
const map = generateMap(DEFAULT_EVO.mapSeed, cfg);
const rng = new Rng(42);
const red = new NeuralPolicy(shape, randomGenome(shape, rng));
const blue = new NeuralPolicy(shape, randomGenome(shape, rng));
console.log(`obsDim=${obsDim(cfg)} rec=${cfg.recurrentDim} inputs=${shape.inputs} genome=${red.mlp.w.length} boxes=${map.boxes.length}`);
const N = 20;
let ticks = 0;
const t0 = performance.now();
for (let i = 0; i < N; i++) ticks += runMatch(red, blue, map, i, cfg).ticks;
const ms = performance.now() - t0;
console.log(`${N} matches: ${ms.toFixed(0)} ms total, ${(ms / N).toFixed(1)} ms/match, ${ticks / N} ticks/match avg`);
