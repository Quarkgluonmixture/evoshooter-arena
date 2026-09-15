import { $ } from './dom.ts';

export type TabId = 'evolve' | 'behaviour' | 'evidence' | 'run';

export interface Panel {
  readonly active: TabId;
  readonly open: boolean;
  show(tab: TabId): void;
  toggle(open?: boolean): void;
}

const STORAGE_KEY = 'evo.panel';
const TABS: TabId[] = ['evolve', 'behaviour', 'evidence', 'run'];

/**
 * The side panel is a drill-down, not the stage (VISION §12.3: "the default picture is a proper shooting
 * match; debug / discovery evidence is a layer you open"). One tab at a time, collapsible to give the arena
 * the whole window (`H`), and it remembers both across reloads.
 */
export function createPanel(hooks: { onShow?: (tab: TabId) => void; onToggle?: (open: boolean) => void } = {}): Panel {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#tabs button[data-tab]'));
  const sections = Array.from(document.querySelectorAll<HTMLElement>('#panel .tab[data-tab]'));
  let active: TabId = 'evolve';
  let open = true;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { tab?: string; open?: boolean };
    if (TABS.includes(saved.tab as TabId)) active = saved.tab as TabId;
    if (typeof saved.open === 'boolean') open = saved.open;
  } catch { /* a corrupt value just means defaults */ }

  const persist = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab: active, open })); } catch { /* private mode */ }
  };

  function show(tab: TabId): void {
    active = tab;
    for (const b of buttons) b.classList.toggle('on', b.dataset.tab === tab);
    for (const s of sections) s.hidden = s.dataset.tab !== tab;
    persist();
    hooks.onShow?.(tab);
  }

  function toggle(next = !open): void {
    open = next;
    document.body.classList.toggle('panel-closed', !open);
    persist();
    hooks.onToggle?.(open);
  }

  for (const b of buttons) b.onclick = () => show(b.dataset.tab as TabId);
  $('panel-close').onclick = () => toggle(false);
  $('panel-toggle').onclick = () => toggle(true);
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') toggle();
  });

  // apply the remembered state without firing hooks: the caller wires them after construction and draws once
  for (const b of buttons) b.classList.toggle('on', b.dataset.tab === active);
  for (const s of sections) s.hidden = s.dataset.tab !== active;
  document.body.classList.toggle('panel-closed', !open);

  return {
    get active() { return active; },
    get open() { return open; },
    show,
    toggle,
  };
}
