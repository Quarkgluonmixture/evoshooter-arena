import type { CamMode } from '../render/camera.ts';
import type { MatchViewer } from '../render/viewer.ts';
import { commLight, TEAM_CSS } from '../render/scene.ts';
import type { Session } from './session.ts';
import { $ } from './dom.ts';

/**
 * The observer's controls (VISION §12.4): camera modes, the auto-director, the player tiles, the POV chip when
 * the camera sits on one player, the view bar (speed, overlays, pause, replay, follow) and the keyboard.
 * Overlays here show what the SPECTATOR may see; what the player himself knows is the percept panel's job.
 */
export function createSpectator(session: Session): { update(): void; syncCamUi(): void } {
  const rig = () => session.viewer.rig; // the rig is replaced when the viewer is rebuilt for another world
  const world = () => session.viewer.world;

  /* --- camera modes */
  const camButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#cam-modes button[data-cam]'));
  const directorBtn = $('cam-director') as HTMLButtonElement;
  function syncCamUi(): void {
    const r = rig();
    for (const b of camButtons) b.classList.toggle('on', b.dataset.cam === r.mode);
    directorBtn.classList.toggle('on', r.director);
    $('crosshair').classList.toggle('show', r.mode === 'first');
    $('pov').classList.toggle('show', r.mode !== 'free');
  }
  function setCam(mode: CamMode): void {
    if (mode !== 'free' && rig().subject < 0) rig().cycle(world());
    rig().setMode(mode);
    syncCamUi();
  }
  for (const b of camButtons) b.onclick = () => setCam(b.dataset.cam as CamMode);
  directorBtn.onclick = () => { rig().setDirector(!rig().director, world()); syncCamUi(); };

  /* --- player tiles */
  const T = session.trainer.sim.teamSize;
  const tiles: HTMLDivElement[] = [];
  for (let id = 0; id < T * 2; id++) {
    const team = id < T ? 0 : 1;
    const tile = document.createElement('div');
    tile.className = `spec-tile ${team === 0 ? 'red' : 'blue'}`;
    tile.innerHTML = `<div class="n"><span>${team === 0 ? 'R' : 'B'}${(id % T) + 1}</span><i class="cdot" title="radio symbol"></i><small></small></div><div class="hp"><i></i></div>`;
    tile.onclick = () => { rig().select(id, world()); syncCamUi(); };
    (team === 0 ? $('spec-red') : $('spec-blue')).appendChild(tile);
    tiles.push(tile);
  }

  /* --- POV chip + damage vignette */
  const dmgEl = $('dmg');
  const pov = { name: $('pov-name'), state: $('pov-state'), hp: $('pov-hp'), ammo: $('pov-ammo'), comm: $('pov-comm') };

  function update(): void {
    const w = world();
    if (!w) return;
    const sim = session.trainer.sim;
    const r = rig();
    for (let id = 0; id < tiles.length; id++) {
      const a = w.agents[id];
      const t = tiles[id];
      t.classList.toggle('dead', !a.alive);
      t.classList.toggle('firing', a.alive && a.firing);
      t.classList.toggle('sel', r.mode !== 'free' && r.subject === id);
      (t.querySelector('.hp i') as HTMLElement).style.width = `${Math.max(0, (a.hp / sim.hp) * 100)}%`;
      (t.querySelector('small') as HTMLElement).textContent = a.kills ? `${a.kills}k` : '';
      // same mapping as the in-world light and the POV chip: the symbol that LEFT the radio, dark when silent
      const [hue, light] = commLight(sim, a.commSaid);
      (t.querySelector('.cdot') as HTMLElement).style.background = a.alive ? `hsl(${hue * 360} 90% ${light * 100}%)` : 'transparent';
    }
    if (r.mode !== 'free' && r.subject >= 0) {
      const a = w.agents[r.subject];
      // screen-space blood vignette: you should FEEL the round that hit you, not watch a ripple
      dmgEl.style.opacity = String(a.alive ? Math.min(0.9, a.dmgRecent / 45) : 0.35);
      pov.name.textContent = `${a.team === 0 ? 'RED' : 'BLUE'} #${a.slot + 1}`;
      pov.name.style.color = TEAM_CSS[a.team];
      pov.state.textContent = !a.alive ? 'dead' : a.reloadT > 0 ? 'reloading' : a.firing ? 'firing' : a.aim ? 'aiming' : Math.hypot(a.vx, a.vz) > 0.5 ? 'moving' : 'holding';
      pov.hp.style.width = `${Math.max(0, (a.hp / sim.hp) * 100)}%`;
      pov.hp.style.background = `hsl(${120 * (a.hp / sim.hp)} 70% 55%)`;
      pov.ammo.textContent = `${'▮'.repeat(a.ammo)}${'▯'.repeat(Math.max(0, sim.magSize - a.ammo))}`;
      const [hue, light] = commLight(sim, a.commSaid);
      pov.comm.style.background = `hsl(${hue * 360} 90% ${light * 100}%)`;
    } else {
      dmgEl.style.opacity = '0';
    }
  }

  /* --- keyboard */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key;
    if ((k >= '1' && k <= '9') || k === '0') {
      const d = k === '0' ? 10 : Number(k);
      const id = d <= 5 ? d - 1 : T + (d - 6);
      if (id < T * 2) { rig().select(id, world()); syncCamUi(); }
      e.preventDefault();
    } else if (k === 'Tab' || k === ' ') {
      rig().cycle(world(), e.shiftKey ? -1 : 1);
      syncCamUi();
      e.preventDefault();
    } else if (k === 'v' || k === 'V') {
      if (rig().subject < 0) rig().cycle(world());
      rig().toggleView();
      syncCamUi();
    } else if (k === 'f' || k === 'F') {
      setCam('free');
    } else if (k === 'd' || k === 'D') {
      rig().setDirector(!rig().director, world());
      syncCamUi();
    }
  });

  /* --- view bar */
  const speed = $('speed') as HTMLInputElement;
  speed.oninput = () => {
    session.viewer.speed = Number(speed.value);
    $('speed-v').textContent = `${session.viewer.speed}×`;
  };
  const bindToggle = (id: string, key: keyof MatchViewer['scene']['toggles']) => {
    const el = $(id) as HTMLInputElement;
    el.onchange = () => { session.viewer.scene.toggles[key] = el.checked; };
  };
  bindToggle('tg-fov', 'fov');
  bindToggle('tg-trails', 'trails');
  bindToggle('tg-comm', 'comm');
  bindToggle('tg-tracers', 'tracers');
  const pauseView = $('pause-view') as HTMLButtonElement;
  pauseView.onclick = () => {
    session.viewer.paused = !session.viewer.paused;
    pauseView.textContent = session.viewer.paused ? 'resume' : 'pause';
  };
  $('replay').onclick = () => { session.playSelection(); };
  const follow = $('follow') as HTMLInputElement;
  follow.onchange = () => { if (follow.checked) session.followLatest(); };
  session.onReset(() => {
    follow.checked = true;
    // a rebuilt viewer carries a fresh rig and a fresh set of overlay toggles: mirror them, do not assume
    for (const [id, key] of [['tg-fov', 'fov'], ['tg-trails', 'trails'], ['tg-comm', 'comm'], ['tg-tracers', 'tracers']] as const) {
      session.viewer.scene.toggles[key] = ($(id) as HTMLInputElement).checked;
    }
    session.viewer.speed = Number(speed.value);
    syncCamUi();
  });
  ($('kill-replay') as HTMLButtonElement).onclick = () => {
    // deterministic sim ⇒ the same seed replays the same match; nothing is recorded per tick
    if (!session.viewer.replayLastKill()) session.status('no kill in this match yet');
  };

  return { update, syncCamUi };
}

/** Called by the time-travel controls: they own the selection, the view bar only mirrors the follow state. */
export function setFollowCheckbox(on: boolean): void {
  ($('follow') as HTMLInputElement).checked = on;
}
