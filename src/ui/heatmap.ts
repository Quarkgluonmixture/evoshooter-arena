import type { ArenaMap } from '../sim/map.ts';
import type { SimConfig } from '../core/config.ts';

/**
 * Top-down occupancy heat-map (one team, one hue, light→dark) with cover outlines and the objective rings,
 * plus a second layer for the cells they FIRED from. Both layers share one denominator (see `Trainer`), so a
 * bright fire cell means "a lot of the team's time here was spent shooting", not "this is the busiest cell".
 */
export class Heatmap {
  private readonly ctx: CanvasRenderingContext2D;
  readonly canvas: HTMLCanvasElement;
  readonly cfg: SimConfig;
  readonly map: ArenaMap;
  readonly rgb: [number, number, number];
  constructor(canvas: HTMLCanvasElement, cfg: SimConfig, map: ArenaMap, rgb: [number, number, number]) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.map = map;
    this.rgb = rgb;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  draw(grid: Float32Array | null, title: string, fire: Float32Array | null = null): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const S = c.clientWidth;
    if (S === 0) return;
    if (c.width !== Math.round(S * dpr)) {
      c.width = Math.round(S * dpr);
      c.height = Math.round(S * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, S, S);
    const half = this.cfg.arenaHalf;
    const toPx = (v: number) => ((v + half) / (2 * half)) * S;
    const cells = this.cfg.heatCells;
    const cs = S / cells;
    if (grid) {
      const [r, g, b] = this.rgb;
      for (let z = 0; z < cells; z++) {
        for (let x = 0; x < cells; x++) {
          const v = grid[z * cells + x];
          if (v <= 0) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${0.08 + 0.92 * Math.sqrt(v)})`;
          ctx.fillRect(x * cs, z * cs, cs + 0.5, cs + 0.5);
        }
      }
    }
    // where the shooting happened, on top of where the feet went
    if (fire) {
      for (let z = 0; z < cells; z++) {
        for (let x = 0; x < cells; x++) {
          const v = fire[z * cells + x];
          if (v <= 0) continue;
          ctx.fillStyle = `rgba(255,226,150,${Math.min(0.85, 0.25 + 0.75 * Math.sqrt(v))})`;
          const s2 = cs * 0.52;
          ctx.fillRect(x * cs + (cs - s2) / 2, z * cs + (cs - s2) / 2, s2, s2);
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (const bx of this.map.boxes) {
      ctx.fillStyle = bx.h > 2 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';
      ctx.fillRect(toPx(bx.minX), toPx(bx.minZ), toPx(bx.maxX) - toPx(bx.minX), toPx(bx.maxZ) - toPx(bx.minZ));
    }
    // every objective site, not just `zoneX/zoneZ` (= site 0): a two-site run drew half its world before
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    this.map.sites.forEach((site, i) => {
      ctx.beginPath();
      ctx.arc(toPx(site.x), toPx(site.z), (this.cfg.zoneRadius / (2 * half)) * S, 0, Math.PI * 2);
      ctx.stroke();
      if (this.map.sites.length > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String.fromCharCode(65 + i), toPx(site.x), toPx(site.z));
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
    });
    ctx.fillStyle = '#e8e8e6';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 6, 5);
    ctx.fillStyle = '#9a9c9f';
    ctx.font = '10px system-ui, sans-serif';
    if (fire) {
      ctx.fillStyle = 'rgba(255,226,150,0.9)';
      ctx.fillRect(6, 20, 7, 7);
      ctx.fillStyle = '#9a9c9f';
      ctx.fillText('fired from here', 18, 19);
    }
    ctx.fillText('red spawn ↓', 6, S - 14);
    ctx.textAlign = 'right';
    ctx.fillText('↑ blue spawn', S - 6, 5);
    ctx.textAlign = 'left';
  }
}
