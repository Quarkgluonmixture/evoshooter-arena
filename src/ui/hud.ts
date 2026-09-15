import type { World } from '../sim/world.ts';
import { TEAM_CSS } from '../render/scene.ts';
import type { Session } from './session.ts';
import { $, NEUTRAL } from './dom.ts';

const KILL_ROWS = 5;
const KILL_HOLD_MS = 5000;

/**
 * The public game state a real player is allowed to see (VISION §4.3): score, clock, who is alive, who killed
 * whom, and the round banner — plus the director's cut fade. Everything here is read for the SPECTATOR;
 * `world.events` in particular is the observer channel and ⛔ no policy may ever be wired to it.
 */
export function createHud(session: Session): { update(): void } {
  const { viewer } = session;
  const el = {
    redName: $('hud-red-name'), bluePts: $('hud-blue-pts'), redPts: $('hud-red-pts'), blueName: $('hud-blue-name'),
    clock: $('hud-clock'), aliveRed: $('alive-red'), aliveBlue: $('alive-blue'), banner: $('banner'),
  };
  for (const pips of [el.aliveRed, el.aliveBlue]) {
    for (let i = 0; i < session.trainer.sim.teamSize; i++) pips.appendChild(document.createElement('i'));
  }
  let bannerShownFor: World | null = null;

  // kill feed: one row per kill, newest at the bottom, cleared when a new match loads
  const killFeed = $('killfeed');
  viewer.onNewMatch = () => killFeed.replaceChildren();
  viewer.onKill = (killer, victim) => {
    const T = session.trainer.sim.teamSize;
    const name = (id: number) => `${id < T ? 'R' : 'B'}${(id % T) + 1}`;
    const cls = (id: number) => (id < T ? 'red' : 'blue');
    const row = document.createElement('div');
    row.className = 'kf-row';
    row.innerHTML = `<span class="${cls(killer)}">${name(killer)}</span><i>✕</i><span class="${cls(victim)}">${name(victim)}</span>`;
    killFeed.appendChild(row);
    while (killFeed.childElementCount > KILL_ROWS) killFeed.firstElementChild?.remove();
    setTimeout(() => {
      row.classList.add('out');
      setTimeout(() => row.remove(), 400);
    }, KILL_HOLD_MS);
  };

  // director cuts flash to black for a beat, so a jump between players reads as a cut
  const cutFade = $('cut-fade');
  let lastCutSeq = 0;

  function update(): void {
    const w = viewer.world;
    const sim = session.trainer.sim;
    if (w) {
      el.redName.textContent = viewer.labels.red;
      el.blueName.textContent = viewer.labels.blue;
      el.redPts.textContent = w.score[0].toFixed(0);
      el.bluePts.textContent = w.score[1].toFixed(0);
      el.clock.textContent = Math.max(0, sim.matchSeconds - w.t).toFixed(1);
      const pipsR = el.aliveRed.children;
      const pipsB = el.aliveBlue.children;
      for (let s = 0; s < sim.teamSize; s++) {
        pipsR[s].classList.toggle('on', w.agents[s].alive);
        pipsB[s].classList.toggle('on', w.agents[sim.teamSize + s].alive);
      }
      if (w.done && bannerShownFor !== w) {
        bannerShownFor = w;
        const elim = w.aliveCount[0] === 0 || w.aliveCount[1] === 0;
        const who = w.winner === 0 ? viewer.labels.red : w.winner === 1 ? viewer.labels.blue : null;
        el.banner.style.color = w.winner === 0 ? TEAM_CSS[0] : w.winner === 1 ? TEAM_CSS[1] : NEUTRAL;
        el.banner.innerHTML = who
          ? `${who} wins<small>${w.score[0].toFixed(0)} – ${w.score[1].toFixed(0)}${elim ? ' · elimination' : ' · time'}</small>`
          : `draw<small>${w.score[0].toFixed(0)} – ${w.score[1].toFixed(0)}</small>`;
        el.banner.classList.add('show');
      } else if (!w.done) {
        el.banner.classList.remove('show');
      }
    }
    if (viewer.rig.cutSeq !== lastCutSeq) {
      lastCutSeq = viewer.rig.cutSeq;
      cutFade.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => cutFade.classList.remove('on')));
    }
  }

  return { update };
}
