import { DEFAULT_EVO } from '../core/config.ts';
import { Trainer } from '../evo/trainer.ts';
import { TEAM_CSS } from '../render/scene.ts';
import { LineChart } from './charts.ts';
import type { Session } from './session.ts';
import { $, NEUTRAL } from './dom.ts';
import { setFollowCheckbox } from './spectator.ts';

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const two = (v: number) => v.toFixed(2);

/**
 * The "Evolve" tab: start / pause / reset the run, the in-run rulers, and time travel between champions.
 *
 * ⚠ The rulers here are IN-RUN: a champion against its own past selves and the two colours against each other.
 * VISION §11.4 — one ladder cannot define progress; the ruler that survives a run is cross-play, in Evidence.
 * The page draws what the trainer measured and computes nothing of its own.
 */
export function createEvolvePanel(session: Session): { redraw(): void } {
  /* --- training controls */
  const toggleBtn = $('train-toggle') as HTMLButtonElement;
  const popSel = $('pop') as HTMLSelectElement;
  const workersIn = $('workers') as HTMLInputElement;
  const seedIn = $('seed') as HTMLInputElement;
  const mapIn = $('map-seed') as HTMLInputElement;
  const statusEl = $('status');

  session.onStatus((html) => { statusEl.innerHTML = html; });
  session.onRunning((running) => {
    toggleBtn.textContent = running ? '⏸ pause evolving' : session.store.latest() ? '▶ resume evolving' : '▶ start evolving';
    toggleBtn.classList.toggle('running', running);
  });
  toggleBtn.onclick = () => {
    if (session.running) session.stop();
    else session.start(Number(workersIn.value));
  };
  $('reset').onclick = () => {
    const pop = Number(popSel.value);
    const seed = Number(seedIn.value) || 1;
    const mapSeed = Number(mapIn.value) || DEFAULT_EVO.mapSeed;
    // keep the world the page was opened in (`?sites=2&mode=capture…`): a reset re-rolls the population, not the rules
    session.reset(new Trainer({ popSize: pop, mapSeed }, session.trainer.sim, seed));
    const u = new URL(location.href);
    u.searchParams.set('map', String(mapSeed));
    u.searchParams.set('pop', String(pop));
    u.searchParams.set('seed', String(seed));
    history.replaceState(null, '', u.toString());
  };
  session.onReset((t) => {
    popSel.value = String(t.evo.popSize);
    mapIn.value = String(t.evo.mapSeed);
    toggleBtn.textContent = '▶ start evolving';
    toggleBtn.classList.remove('running');
  });

  /* --- in-run rulers */
  const chartLadder0 = new LineChart($('c-ladder0') as HTMLCanvasElement, { title: 'Champion vs generation-0 champion — win rate', format: pct, yMin: 0, yMax: 1, refLine: 0.5 });
  const chartLadder = new LineChart($('c-ladder') as HTMLCanvasElement, { title: 'Champion vs its own 10-gen-older self — win rate', format: pct, yMin: 0, yMax: 1, refLine: 0.5 });
  const chartBest = new LineChart($('c-best') as HTMLCanvasElement, { title: 'Champion fitness (zone + damage margin)', format: two, refLine: 0 });
  const chartMean = new LineChart($('c-mean') as HTMLCanvasElement, { title: 'Population mean fitness', format: two, refLine: 0 });
  const chartBalance = new LineChart($('c-balance') as HTMLCanvasElement, { title: 'Head-to-head: share of matches red wins', format: pct, yMin: 0, yMax: 1, refLine: 0.5 });

  /* --- time travel */
  const ttRed = $('tt-red') as HTMLSelectElement;
  const ttBlue = $('tt-blue') as HTMLSelectElement;
  function refreshTimeTravel(): void {
    const gens = session.store.gens();
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
    setFollowCheckbox(false);
    ttRed.value = String(red);
    ttBlue.value = String(blue);
    session.watch({ red, blue });
  }
  $('tt-play').onclick = () => watch(Number(ttRed.value), Number(ttBlue.value));
  $('tt-first-last').onclick = () => { const l = session.store.latest(); if (l) watch(0, l.gen); };
  $('tt-last-first').onclick = () => { const l = session.store.latest(); if (l) watch(l.gen, 0); };
  $('tt-half').onclick = () => { const l = session.store.latest(); if (l) watch(Math.floor(l.gen / 2), l.gen); };

  function redraw(): void {
    const store = session.store;
    const xs = store.gens();
    const rb = { name: 'red', color: TEAM_CSS[0] };
    const bb = { name: 'blue', color: TEAM_CSS[1] };
    chartLadder0.setData(xs, [{ ...rb, values: store.ladder0(0) }, { ...bb, values: store.ladder0(1) }]);
    chartLadder.setData(xs, [{ ...rb, values: store.ladder(0) }, { ...bb, values: store.ladder(1) }]);
    chartBest.setData(xs, [{ ...rb, values: store.team(0, (r) => r.teams[0].best) }, { ...bb, values: store.team(1, (r) => r.teams[1].best) }]);
    chartMean.setData(xs, [{ ...rb, values: store.team(0, (r) => r.teams[0].mean) }, { ...bb, values: store.team(1, (r) => r.teams[1].mean) }]);
    chartBalance.setData(xs, [{ name: 'red win share', color: NEUTRAL, values: store.team(0, (r) => r.redWinShare) }]);
    refreshTimeTravel();
  }
  session.store.onChange(redraw);

  return { redraw };
}
