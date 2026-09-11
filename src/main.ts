import { DEFAULT_EVO } from './core/config.ts';
import { Trainer, type GenReport, type TrainerSnapshot } from './evo/trainer.ts';
import { METRIC_KEYS, type TeamMetrics } from './evo/match.ts';
import { WorkerEvaluator } from './worker/pool.ts';
import { HistoryStore, type StoreJSON } from './ui/store.ts';
import { LineChart } from './ui/charts.ts';
import { Heatmap } from './ui/heatmap.ts';
import { MatchViewer } from './render/viewer.ts';
import { TEAM_CSS } from './render/scene.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const NEUTRAL = '#c3c2b7';

/* ------------------------------------------------------------------ state */

const boot = (() => {
  const u = new URL(location.href);
  return {
    mapSeed: Number(u.searchParams.get('map')) || DEFAULT_EVO.mapSeed,
    pop: Number(u.searchParams.get('pop')) || Number(($('pop') as HTMLSelectElement).value) || DEFAULT_EVO.popSize,
    seed: Number(u.searchParams.get('seed')) || 1,
  };
})();
let trainer = new Trainer({ popSize: boot.pop, mapSeed: boot.mapSeed }, {}, boot.seed);
let evaluator: WorkerEvaluator | null = null;
const store = new HistoryStore();
const viewer = new MatchViewer($('view-canvas'), trainer.sim, trainer.map, trainer.evo.hidden);
let running = false;
let genStartedAt = 0;
let selection: { red: number; blue: number } | null = null; // time-travel selection; null = follow latest
let replaySeed = 1;

/* ------------------------------------------------------------------- HUD */

const hud = {
  redName: $('hud-red-name'), bluePts: $('hud-blue-pts'), redPts: $('hud-red-pts'), blueName: $('hud-blue-name'),
  clock: $('hud-clock'), aliveRed: $('alive-red'), aliveBlue: $('alive-blue'), banner: $('banner'),
};
for (const el of [hud.aliveRed, hud.aliveBlue]) {
  for (let i = 0; i < trainer.sim.teamSize; i++) el.appendChild(document.createElement('i'));
}
let bannerShownFor: World | null = null;
type World = NonNullable<MatchViewer['world']>;

function updateHud(): void {
  const w = viewer.world;
  if (!w) return;
  hud.redName.textContent = viewer.labels.red;
  hud.blueName.textContent = viewer.labels.blue;
  hud.redPts.textContent = w.score[0].toFixed(0);
  hud.bluePts.textContent = w.score[1].toFixed(0);
  hud.clock.textContent = Math.max(0, trainer.sim.matchSeconds - w.t).toFixed(1);
  const pipsR = hud.aliveRed.children;
  const pipsB = hud.aliveBlue.children;
  for (let s = 0; s < trainer.sim.teamSize; s++) {
    pipsR[s].classList.toggle('on', w.agents[s].alive);
    pipsB[s].classList.toggle('on', w.agents[trainer.sim.teamSize + s].alive);
  }
  if (w.done && bannerShownFor !== w) {
    bannerShownFor = w;
    const elim = w.aliveCount[0] === 0 || w.aliveCount[1] === 0;
    const who = w.winner === 0 ? viewer.labels.red : w.winner === 1 ? viewer.labels.blue : null;
    hud.banner.style.color = w.winner === 0 ? TEAM_CSS[0] : w.winner === 1 ? TEAM_CSS[1] : NEUTRAL;
    hud.banner.innerHTML = who
      ? `${who} wins<small>${w.score[0].toFixed(0)} – ${w.score[1].toFixed(0)}${elim ? ' · elimination' : ' · time'}</small>`
      : `draw<small>${w.score[0].toFixed(0)} – ${w.score[1].toFixed(0)}</small>`;
    hud.banner.classList.add('show');
  } else if (!w.done) {
    hud.banner.classList.remove('show');
  }
}

/* ------------------------------------------------------------- spectator */

type CamMode = MatchViewer['rig']['mode'];
const camButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#cam-modes button[data-cam]'));
const directorBtn = $('cam-director') as HTMLButtonElement;
function setCam(mode: CamMode): void {
  if (mode !== 'free' && viewer.rig.subject < 0) viewer.rig.cycle(viewer.world);
  viewer.rig.setMode(mode);
  syncCamUi();
}
function syncCamUi(): void {
  for (const b of camButtons) b.classList.toggle('on', b.dataset.cam === viewer.rig.mode);
  directorBtn.classList.toggle('on', viewer.rig.director);
  $('crosshair').classList.toggle('show', viewer.rig.mode === 'first');
  $('pov').classList.toggle('show', viewer.rig.mode !== 'free');
}
for (const b of camButtons) b.onclick = () => setCam(b.dataset.cam as CamMode);
directorBtn.onclick = () => { viewer.rig.setDirector(!viewer.rig.director, viewer.world); syncCamUi(); };

const specTiles: HTMLDivElement[] = [];
{
  const T = trainer.sim.teamSize;
  for (let id = 0; id < T * 2; id++) {
    const team = id < T ? 0 : 1;
    const tile = document.createElement('div');
    tile.className = `spec-tile ${team === 0 ? 'red' : 'blue'}`;
    tile.innerHTML = `<div class="n"><span>${team === 0 ? 'R' : 'B'}${(id % T) + 1}</span><small></small></div><div class="hp"><i></i></div>`;
    tile.onclick = () => { viewer.rig.select(id, viewer.world); syncCamUi(); };
    (team === 0 ? $('spec-red') : $('spec-blue')).appendChild(tile);
    specTiles.push(tile);
  }
}
function updateSpectator(): void {
  const w = viewer.world;
  if (!w) return;
  for (let id = 0; id < specTiles.length; id++) {
    const a = w.agents[id];
    const t = specTiles[id];
    t.classList.toggle('dead', !a.alive);
    t.classList.toggle('firing', a.alive && a.firing);
    t.classList.toggle('sel', viewer.rig.mode !== 'free' && viewer.rig.subject === id);
    (t.querySelector('.hp i') as HTMLElement).style.width = `${Math.max(0, (a.hp / trainer.sim.hp) * 100)}%`;
    (t.querySelector('small') as HTMLElement).textContent = a.kills ? `${a.kills}k` : '';
  }
  const dmgEl = $('dmg');
  if (viewer.rig.mode !== 'free' && viewer.rig.subject >= 0) {
    const a = w.agents[viewer.rig.subject];
    // screen-space blood vignette: you should FEEL the round that hit you, not watch a ripple
    dmgEl.style.opacity = String(a.alive ? Math.min(0.9, a.dmgRecent / 45) : 0.35);
    $('pov-name').textContent = `${a.team === 0 ? 'RED' : 'BLUE'} #${a.slot + 1}`;
    $('pov-name').style.color = TEAM_CSS[a.team];
    $('pov-state').textContent = !a.alive ? 'dead' : a.reloadT > 0 ? 'reloading' : a.firing ? 'firing' : a.aim ? 'aiming' : Math.hypot(a.vx, a.vz) > 0.5 ? 'moving' : 'holding';
    ($('pov-hp') as HTMLElement).style.width = `${Math.max(0, (a.hp / trainer.sim.hp) * 100)}%`;
    ($('pov-hp') as HTMLElement).style.background = `hsl(${120 * (a.hp / trainer.sim.hp)} 70% 55%)`;
    $('pov-ammo').textContent = `${'▮'.repeat(a.ammo)}${'▯'.repeat(trainer.sim.magSize - a.ammo)}`;
    const mag = Math.min(1, Math.hypot(a.comm[0], a.comm[1]));
    const hue = ((Math.atan2(a.comm[1], a.comm[0]) / (2 * Math.PI) + 1) % 1) * 360;
    ($('pov-comm') as HTMLElement).style.background = `hsl(${hue} 90% ${20 + 45 * mag}%)`;
  } else {
    dmgEl.style.opacity = '0';
  }
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const T = trainer.sim.teamSize;
  const k = e.key;
  if (k >= '1' && k <= '9' || k === '0') {
    const d = k === '0' ? 10 : Number(k);
    const id = d <= 5 ? d - 1 : T + (d - 6);
    if (id < T * 2) { viewer.rig.select(id, viewer.world); syncCamUi(); }
    e.preventDefault();
  } else if (k === 'Tab' || k === ' ') {
    viewer.rig.cycle(viewer.world, e.shiftKey ? -1 : 1);
    syncCamUi();
    e.preventDefault();
  } else if (k === 'v' || k === 'V') {
    if (viewer.rig.subject < 0) viewer.rig.cycle(viewer.world);
    viewer.rig.toggleView();
    syncCamUi();
  } else if (k === 'f' || k === 'F') {
    setCam('free');
  } else if (k === 'd' || k === 'D') {
    viewer.rig.setDirector(!viewer.rig.director, viewer.world);
    syncCamUi();
  }
});

/* -------------------------------------------------------------- watching */

function label(t: 0 | 1, gen: number): string {
  return `${t === 0 ? 'RED' : 'BLUE'} gen ${gen}`;
}

function playSelection(): boolean {
  const latest = store.latest();
  if (!latest) return false;
  const follow = ($('follow') as HTMLInputElement).checked;
  const sel = follow || !selection ? { red: latest.gen, blue: latest.gen } : selection;
  const red = store.champion(0, sel.red);
  const blue = store.champion(1, sel.blue);
  if (!red || !blue || red.length === 0 || blue.length === 0) return false;
  replaySeed++;
  viewer.load(red, blue, replaySeed, { red: label(0, sel.red), blue: label(1, sel.blue) });
  return true;
}
viewer.onFinished = () => { playSelection(); };

let last = performance.now();
function raf(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  viewer.frame(dt);
  updateHud();
  updateSpectator();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

/* -------------------------------------------------------------- training */

function status(html: string): void {
  $('status').innerHTML = html;
}

function fmtStatus(r: GenReport | null): string {
  if (!r) return `idle — ${trainer.evo.popSize} genomes per team · ${trainer.pops[0][0].length} weights each · map ${trainer.evo.mapSeed}`;
  const [R, B] = r.teams;
  const secs = (r.elapsedMs / 1000).toFixed(1);
  const workers = evaluator ? evaluator.size : 0;
  const lad = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(0)}%`);
  return (
    `<b>generation ${r.gen}</b> · ${r.matches} matches · ${secs} s/gen · ${workers} workers\n` +
    `red  best <b>${R.best.toFixed(2)}</b> mean ${R.mean.toFixed(2)} · vs gen 0 <b>${lad(r.ladder0[0])}</b> · vs −10 <b>${lad(r.ladder[0])}</b>\n` +
    `blue best <b>${B.best.toFixed(2)}</b> mean ${B.mean.toFixed(2)} · vs gen 0 <b>${lad(r.ladder0[1])}</b> · vs −10 <b>${lad(r.ladder[1])}</b>\n` +
    `head-to-head balance: red wins ${(r.redWinShare * 100).toFixed(0)}%`
  );
}

async function trainLoop(): Promise<void> {
  while (running) {
    if (!evaluator) break;
    genStartedAt = performance.now();
    const r = await trainer.runGeneration(evaluator);
    store.push(r);
    status(fmtStatus(r));
    if (!viewer.busy) playSelection();
  }
}

function ensureEvaluator(): void {
  const n = Math.max(1, Math.min(32, Number(($('workers') as HTMLInputElement).value) || 1));
  if (evaluator && evaluator.size === n && evaluator.mapSeed === trainer.evo.mapSeed) return;
  evaluator?.dispose();
  evaluator = new WorkerEvaluator(trainer.sim, trainer.evo.hidden, trainer.evo.mapSeed, n);
}

const toggleBtn = $('train-toggle') as HTMLButtonElement;
toggleBtn.onclick = () => {
  running = !running;
  toggleBtn.textContent = running ? '⏸ pause evolving' : '▶ resume evolving';
  toggleBtn.classList.toggle('running', running);
  if (running) {
    ensureEvaluator();
    void trainLoop();
  }
};

function resetTrainer(t: Trainer): void {
  running = false;
  toggleBtn.textContent = '▶ start evolving';
  toggleBtn.classList.remove('running');
  trainer = t;
  store.clear();
  selection = null;
  evaluator?.dispose();
  evaluator = null;
  status(fmtStatus(null));
  viewer.world = null;
  ($('pop') as HTMLSelectElement).value = String(t.evo.popSize);
  ($('map-seed') as HTMLInputElement).value = String(t.evo.mapSeed);
}

$('reset').onclick = () => {
  const pop = Number(($('pop') as HTMLSelectElement).value);
  const seed = Number(($('seed') as HTMLInputElement).value) || 1;
  const mapSeed = Number(($('map-seed') as HTMLInputElement).value) || DEFAULT_EVO.mapSeed;
  if (mapSeed !== trainer.evo.mapSeed) {
    // the 3D scene is built for one map; the simplest correct path is a reload with the new map in the URL
    const u = new URL(location.href);
    u.searchParams.set('map', String(mapSeed));
    u.searchParams.set('pop', String(pop));
    u.searchParams.set('seed', String(seed));
    location.href = u.toString();
    return;
  }
  resetTrainer(new Trainer({ popSize: pop, mapSeed }, {}, seed));
};

/* ------------------------------------------------------------- view bar */

const speed = $('speed') as HTMLInputElement;
speed.oninput = () => {
  viewer.speed = Number(speed.value);
  $('speed-v').textContent = `${viewer.speed}×`;
};
const bindToggle = (id: string, key: keyof MatchViewer['scene']['toggles']) => {
  const el = $(id) as HTMLInputElement;
  el.onchange = () => { viewer.scene.toggles[key] = el.checked; };
};
bindToggle('tg-fov', 'fov');
bindToggle('tg-trails', 'trails');
bindToggle('tg-comm', 'comm');
bindToggle('tg-tracers', 'tracers');
const pauseView = $('pause-view') as HTMLButtonElement;
pauseView.onclick = () => {
  viewer.paused = !viewer.paused;
  pauseView.textContent = viewer.paused ? 'resume' : 'pause';
};
$('replay').onclick = () => { playSelection(); };
($('follow') as HTMLInputElement).onchange = (e) => {
  if ((e.target as HTMLInputElement).checked) { selection = null; playSelection(); }
};

/* ----------------------------------------------------------- time travel */

const ttRed = $('tt-red') as HTMLSelectElement;
const ttBlue = $('tt-blue') as HTMLSelectElement;
function refreshTimeTravel(): void {
  const gens = store.gens();
  for (const sel of [ttRed, ttBlue]) {
    const cur = sel.value;
    sel.innerHTML = '';
    for (const g of gens) {
      const o = document.createElement('option');
      o.value = String(g);
      o.textContent = `gen ${g}`;
      sel.appendChild(o);
    }
    if (gens.some((g) => String(g) === cur)) sel.value = cur;
    else sel.value = String(gens[gens.length - 1] ?? '');
  }
}
function watch(red: number, blue: number): void {
  ($('follow') as HTMLInputElement).checked = false;
  selection = { red, blue };
  ttRed.value = String(red);
  ttBlue.value = String(blue);
  playSelection();
}
$('tt-play').onclick = () => watch(Number(ttRed.value), Number(ttBlue.value));
$('tt-first-last').onclick = () => { const l = store.latest(); if (l) watch(0, l.gen); };
$('tt-last-first').onclick = () => { const l = store.latest(); if (l) watch(l.gen, 0); };
$('tt-half').onclick = () => { const l = store.latest(); if (l) watch(Math.floor(l.gen / 2), l.gen); };

/* ---------------------------------------------------------------- charts */

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const two = (v: number) => v.toFixed(2);
const one = (v: number) => v.toFixed(1);
const chartLadder0 = new LineChart($('c-ladder0') as HTMLCanvasElement, { title: 'Champion vs generation-0 champion — win rate', format: pct, yMin: 0, yMax: 1, refLine: 0.5 });
const chartLadder = new LineChart($('c-ladder') as HTMLCanvasElement, { title: 'Champion vs its own 10-gen-older self — win rate', format: pct, yMin: 0, yMax: 1, refLine: 0.5 });
const chartBest = new LineChart($('c-best') as HTMLCanvasElement, { title: 'Champion fitness (zone + damage margin)', format: two, refLine: 0 });
const chartMean = new LineChart($('c-mean') as HTMLCanvasElement, { title: 'Population mean fitness', format: two, refLine: 0 });
const chartBalance = new LineChart($('c-balance') as HTMLCanvasElement, { title: 'Head-to-head: share of matches red wins', format: pct, yMin: 0, yMax: 1, refLine: 0.5 });

const METRIC_LABELS: Record<keyof TeamMetrics, { title: string; format: (v: number) => string; min?: number; max?: number }> = {
  accuracy: { title: 'Accuracy (hits / shots)', format: pct, min: 0 },
  zoneShare: { title: 'Time in the zone (share of alive ticks)', format: pct, min: 0 },
  coverRatio: { title: 'In cover while threatened', format: pct, min: 0, max: 1 },
  spread: { title: 'Teammate spread (mean pairwise distance, m)', format: one, min: 0 },
  engageDist: { title: 'Engagement distance (m)', format: one, min: 0 },
  flankRate: { title: 'Flank hits (target facing away)', format: pct, min: 0, max: 1 },
  firstContact: { title: 'Seconds until first shot', format: one, min: 0 },
  commActivity: { title: 'Comm channel activity (std-dev)', format: two, min: 0 },
  aimUsage: { title: 'Aim mode usage', format: pct, min: 0, max: 1 },
  moveFraction: { title: 'Time moving', format: pct, min: 0, max: 1 },
  kills: { title: 'Kills per match', format: one, min: 0 },
  survivors: { title: 'Survivors at the end', format: one, min: 0, max: 5 },
  shots: { title: 'Shots per match', format: one, min: 0 },
  reloads: { title: 'Reloads per match', format: one, min: 0 },
  deaths: { title: 'Deaths per match', format: one, min: 0 },
  damageDealt: { title: 'Damage dealt', format: one, min: 0 },
  damageTaken: { title: 'Damage taken', format: one, min: 0 },
  zoneScore: { title: 'Zone points', format: one, min: 0 },
};
const SHOWN: (keyof TeamMetrics)[] = [
  'accuracy', 'zoneShare', 'coverRatio', 'spread', 'engageDist', 'flankRate', 'firstContact', 'commActivity', 'aimUsage', 'moveFraction', 'kills', 'survivors',
];
const metricCharts: { key: keyof TeamMetrics; chart: LineChart }[] = [];
{
  const host = $('metric-charts');
  for (const key of SHOWN) {
    const wrap = document.createElement('div');
    wrap.className = 'chart';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.appendChild(wrap);
    const m = METRIC_LABELS[key];
    metricCharts.push({ key, chart: new LineChart(canvas, { title: m.title, format: m.format, yMin: m.min, yMax: m.max }) });
  }
}
void METRIC_KEYS;

const heatRed = new Heatmap($('heat-red') as HTMLCanvasElement, trainer.sim, trainer.map, [230, 103, 103]);
const heatBlue = new Heatmap($('heat-blue') as HTMLCanvasElement, trainer.sim, trainer.map, [57, 135, 229]);
const heatGen = $('heat-gen') as HTMLInputElement;
let heatFollow = true;
heatGen.oninput = () => { heatFollow = false; drawHeat(); };
function drawHeat(): void {
  const gens = store.gens();
  heatGen.max = String(Math.max(0, gens.length - 1));
  if (heatFollow) heatGen.value = heatGen.max;
  const idx = Number(heatGen.value);
  const r = store.reports[idx];
  $('heat-gen-v').textContent = r ? `gen ${r.gen}` : '–';
  heatRed.draw(r ? r.heat[0] : null, r ? `red · gen ${r.gen}` : 'red');
  heatBlue.draw(r ? r.heat[1] : null, r ? `blue · gen ${r.gen}` : 'blue');
}

function redraw(): void {
  const xs = store.gens();
  const rb = { name: 'red', color: TEAM_CSS[0] };
  const bb = { name: 'blue', color: TEAM_CSS[1] };
  chartLadder0.setData(xs, [{ ...rb, values: store.ladder0(0) }, { ...bb, values: store.ladder0(1) }]);
  chartLadder.setData(xs, [{ ...rb, values: store.ladder(0) }, { ...bb, values: store.ladder(1) }]);
  chartBest.setData(xs, [{ ...rb, values: store.team(0, (r) => r.teams[0].best) }, { ...bb, values: store.team(1, (r) => r.teams[1].best) }]);
  chartMean.setData(xs, [{ ...rb, values: store.team(0, (r) => r.teams[0].mean) }, { ...bb, values: store.team(1, (r) => r.teams[1].mean) }]);
  chartBalance.setData(xs, [{ name: 'red win share', color: NEUTRAL, values: store.team(0, (r) => r.redWinShare) }]);
  for (const { key, chart } of metricCharts) {
    chart.setData(xs, [{ ...rb, values: store.metric(0, key) }, { ...bb, values: store.metric(1, key) }]);
  }
  refreshTimeTravel();
  drawHeat();
}
store.onChange(redraw);
window.addEventListener('resize', redraw);

/* ------------------------------------------------------------- save/load */

$('export').onclick = () => {
  const payload = { version: 1, trainer: trainer.snapshot(), history: store.toJSON() };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `evoshooter-run-gen${trainer.gen}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
($('import') as HTMLInputElement).onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()) as { version: number; trainer: TrainerSnapshot; history: StoreJSON };
    if (data.trainer.evo.mapSeed !== trainer.evo.mapSeed) {
      alert(`This run uses map ${data.trainer.evo.mapSeed}; reload with ?map=${data.trainer.evo.mapSeed} first.`);
      return;
    }
    const t = Trainer.restore(data.trainer);
    resetTrainer(t);
    store.loadJSON(data.history, t.hof, t.sim.heatCells);
    status(fmtStatus(store.latest()) + `\nimported ${file.name}`);
    playSelection();
  } catch (err) {
    alert(`import failed: ${(err as Error).message}`);
  }
};

/* ------------------------------------------------------------------ boot */

// debug handle for headless render verification (CLAUDE.md requires a real-browser check for camera/style work)
(window as unknown as { evo: unknown }).evo = {
  viewer,
  get trainer() { return trainer; },
  store,
  probe: () => {
    const w = viewer.world;
    const rig = viewer.rig;
    if (!w) return null;
    const a = w.agents[rig.subject] ?? null;
    return {
      mode: rig.mode, director: rig.director, subject: rig.subject, lastCut: rig.lastCutReason,
      firstPersonId: viewer.scene.firstPersonId,
      cam: viewer.scene.camera.position.toArray().map((v) => +v.toFixed(2)),
      subjectPose: a ? { x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2), alive: a.alive, hp: a.hp } : null,
      render: viewer.scene.pose(rig.subject),
      fx: viewer.scene.fxStats(),
      t: +w.t.toFixed(2),
    };
  },
};

{
  ($('pop') as HTMLSelectElement).value = String(trainer.evo.popSize);
  ($('seed') as HTMLInputElement).value = String(boot.seed);
  ($('map-seed') as HTMLInputElement).value = String(trainer.evo.mapSeed);
  ($('workers') as HTMLInputElement).value = String(Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1)));
  status(fmtStatus(null));
  redraw();
  void genStartedAt;
}
