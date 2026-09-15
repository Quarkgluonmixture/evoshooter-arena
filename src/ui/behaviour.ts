import type { TeamMetrics } from '../evo/match.ts';
import { TEAM_CSS } from '../render/scene.ts';
import { LineChart } from './charts.ts';
import { Heatmap } from './heatmap.ts';
import type { Session } from './session.ts';
import { $ } from './dom.ts';

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const two = (v: number) => v.toFixed(2);
const one = (v: number) => v.toFixed(1);

const METRIC_LABELS: Record<keyof TeamMetrics, { title: string; format: (v: number) => string; min?: number; max?: number }> = {
  accuracy: { title: 'Accuracy (hits / shots)', format: pct, min: 0 },
  zoneShare: { title: 'Time in the zone (share of alive ticks)', format: pct, min: 0 },
  coverRatio: { title: 'In cover while threatened', format: pct, min: 0, max: 1 },
  spread: { title: 'Teammate spread (mean pairwise distance, m)', format: one, min: 0 },
  engageDist: { title: 'Engagement distance (m)', format: one, min: 0 },
  flankRate: { title: 'Flank hits (target facing away)', format: pct, min: 0, max: 1 },
  firstContact: { title: 'Seconds until first shot', format: one, min: 0 },
  sightTicks: { title: 'Enemy-sighting ticks (0 = the teams never met)', format: one, min: 0 },
  objectiveProgress: { title: 'Objective progress', format: pct, min: 0, max: 1 },
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
  // role-specific: only defined in the matches where this team had that job (NaN otherwise)
  attackProgress: { title: 'Attack progress (attacking matches)', format: two, min: 0, max: 1 },
  defendProgress: { title: 'Defuse progress (defending matches)', format: two, min: 0, max: 1 },
};
const SHOWN: (keyof TeamMetrics)[] = [
  'accuracy', 'zoneShare', 'coverRatio', 'spread', 'engageDist', 'flankRate', 'firstContact', 'commActivity', 'aimUsage', 'moveFraction', 'kills', 'survivors',
  'attackProgress', 'defendProgress',
];

const HEAT_RGB: [[number, number, number], [number, number, number]] = [[230, 103, 103], [57, 135, 229]];

/**
 * The "Behaviour" tab: how the two populations play, generation by generation, and where they go. This is the
 * DETECTION rung of VISION §12.1 for the live run — shapes and frequencies, never intent. Every number is a
 * population average per generation (a lucky match cannot pose as a trend), and the page computes none of them.
 */
export function createBehaviourPanel(session: Session): { redraw(): void } {
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

  const heatCanvas: [HTMLCanvasElement, HTMLCanvasElement] = [$('heat-red') as HTMLCanvasElement, $('heat-blue') as HTMLCanvasElement];
  const buildHeat = (): [Heatmap, Heatmap] => [
    new Heatmap(heatCanvas[0], session.trainer.sim, session.trainer.map, HEAT_RGB[0]),
    new Heatmap(heatCanvas[1], session.trainer.sim, session.trainer.map, HEAT_RGB[1]),
  ];
  let heat = buildHeat();
  // the heat-map draws the arena's cover and sites, so a run from another world needs a map of its own
  session.onReset((_t, worldChanged) => { if (worldChanged) heat = buildHeat(); });

  const heatGen = $('heat-gen') as HTMLInputElement;
  let heatFollow = true;
  heatGen.oninput = () => { heatFollow = false; drawHeat(); };
  session.onReset(() => { heatFollow = true; });
  function drawHeat(): void {
    const store = session.store;
    const gens = store.gens();
    heatGen.max = String(Math.max(0, gens.length - 1));
    if (heatFollow) heatGen.value = heatGen.max;
    const idx = Number(heatGen.value);
    const r = store.reports[idx];
    $('heat-gen-v').textContent = r ? `gen ${r.gen}` : '–';
    heat[0].draw(r ? r.heat[0] : null, r ? `red · gen ${r.gen}` : 'red', r ? r.heatFire[0] : null);
    heat[1].draw(r ? r.heat[1] : null, r ? `blue · gen ${r.gen}` : 'blue', r ? r.heatFire[1] : null);
  }

  function redraw(): void {
    const store = session.store;
    const xs = store.gens();
    const rb = { name: 'red', color: TEAM_CSS[0] };
    const bb = { name: 'blue', color: TEAM_CSS[1] };
    for (const { key, chart } of metricCharts) {
      chart.setData(xs, [{ ...rb, values: store.metric(0, key) }, { ...bb, values: store.metric(1, key) }]);
    }
    drawHeat();
  }
  session.store.onChange(redraw);

  return { redraw };
}
