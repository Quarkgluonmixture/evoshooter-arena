import { DEFAULT_EVO } from './core/config.ts';
import { Trainer } from './evo/trainer.ts';
import { Session } from './ui/session.ts';
import { createPanel } from './ui/panel.ts';
import { createHud } from './ui/hud.ts';
import { createSpectator } from './ui/spectator.ts';
import { createEvolvePanel } from './ui/evolution.ts';
import { createBehaviourPanel } from './ui/behaviour.ts';
import { createEvidencePanel } from './ui/evidence.ts';
import { createRunPanel } from './ui/runIO.ts';
import { $ } from './ui/dom.ts';

/* ------------------------------------------------------------------ boot */

const boot = (() => {
  const u = new URL(location.href);
  return {
    mapSeed: Number(u.searchParams.get('map')) || DEFAULT_EVO.mapSeed,
    pop: Number(u.searchParams.get('pop')) || Number(($('pop') as HTMLSelectElement).value) || DEFAULT_EVO.popSize,
    seed: Number(u.searchParams.get('seed')) || 1,
    // the world the headless runs actually train in is not the default one; `?sites=2&mode=capture` lets the
    // spectator show it without flipping the defaults, which is a separate decision (CHECKPOINT)
    sites: u.searchParams.get('sites') === '2' ? (2 as const) : (1 as const),
    capture: u.searchParams.get('mode') === 'capture',
    // the radio rules travel with the run too: a champion trained on 5 held symbols plays a DIFFERENT game on a
    // continuous one, and the genome length is identical, so nothing would complain
    tokens: Number(u.searchParams.get('tokens')) || 0,
    interval: Number(u.searchParams.get('interval')) || 1,
    delay: Number(u.searchParams.get('delay')) || 0,
    // and so does the private die: it changes obsDim, so a die-trained run replayed without `?die=k` is a
    // genome-length error rather than a silently different game (ROADMAP E2b, GOTCHAS #33)
    die: Number(u.searchParams.get('die')) || 0,
  };
})();
const bootSim = {
  siteCount: boot.sites,
  commTokens: boot.tokens,
  commIntervalTicks: boot.interval,
  commDelayTicks: boot.delay,
  privateDieDim: boot.die,
  ...(boot.capture ? { roundMode: 'capture' as const } : {}),
};

const session = new Session(new Trainer({ popSize: boot.pop, mapSeed: boot.mapSeed }, bootSim, boot.seed), $('view-canvas'));

/* ---------------------------------------------------------------- panels */

// the arena is the stage; the panel is a drill-down (VISION §12.3) — one tab at a time, collapsible
const hud = createHud(session);
const spectator = createSpectator(session);
const evolve = createEvolvePanel(session);
const behaviour = createBehaviourPanel(session);
createEvidencePanel();
createRunPanel(session);
const panel = createPanel({
  // canvases inside a hidden tab measure 0×0 and skip drawing: redraw whatever just became visible
  onShow: () => { evolve.redraw(); behaviour.redraw(); },
  onToggle: () => { session.viewer.scene.resize(); evolve.redraw(); behaviour.redraw(); },
});
// the grid changes width when the panel opens or closes; the scene only hears about WINDOW resizes on its own
new ResizeObserver(() => session.viewer.scene.resize()).observe($('view-canvas'));
session.onReset(() => spectator.syncCamUi());

/* ------------------------------------------------------------------ loop */

let last = performance.now();
function raf(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  session.viewer.frame(dt);
  hud.update();
  spectator.update();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

/* ----------------------------------------------------------------- debug */

// debug handle for headless render verification (CLAUDE.md requires a real-browser check for camera/style work)
(window as unknown as { evo: unknown }).evo = {
  get viewer() { return session.viewer; },
  get trainer() { return session.trainer; },
  store: session.store,
  session,
  panel,
  probe: () => {
    const viewer = session.viewer;
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
      panel: { open: panel.open, tab: panel.active },
    };
  },
};

{
  ($('pop') as HTMLSelectElement).value = String(session.trainer.evo.popSize);
  ($('seed') as HTMLInputElement).value = String(boot.seed);
  ($('map-seed') as HTMLInputElement).value = String(session.trainer.evo.mapSeed);
  ($('workers') as HTMLInputElement).value = String(Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1)));
  session.status(session.fmtStatus(null));
  evolve.redraw();
  behaviour.redraw();
}
