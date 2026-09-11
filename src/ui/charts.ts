/**
 * Minimal canvas line chart: 2px lines, recessive hairline grid, legend for ≥2 series, end-dot with surface ring,
 * end-value direct label, crosshair + tooltip on hover. One y-axis per chart, always.
 */
export interface Series {
  name: string;
  color: string;
  values: number[];
}

export interface LineChartOptions {
  title: string;
  format?: (v: number) => string;
  yMin?: number;
  yMax?: number;
  /** draw a faint reference line (e.g. 0.5 for win-rate) */
  refLine?: number;
}

const SURFACE = '#15171c';
const GRID = '#262a33';
const TEXT = '#e8e8e6';
const TEXT2 = '#9a9c9f';

export class LineChart {
  private readonly ctx: CanvasRenderingContext2D;
  private xs: number[] = [];
  private series: Series[] = [];
  private hoverX: number | null = null;
  private readonly tip: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly opts: LineChartOptions;

  constructor(canvas: HTMLCanvasElement, opts: LineChartOptions) {
    this.canvas = canvas;
    this.opts = opts;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip';
    this.tip.style.display = 'none';
    canvas.parentElement?.appendChild(this.tip);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.hoverX = e.clientX - r.left;
      this.draw();
    });
    canvas.addEventListener('pointerleave', () => {
      this.hoverX = null;
      this.tip.style.display = 'none';
      this.draw();
    });
  }

  setData(xs: number[], series: Series[]): void {
    this.xs = xs;
    this.series = series;
    this.draw();
  }

  private fmt(v: number): string {
    return this.opts.format ? this.opts.format(v) : v.toFixed(2);
  }

  draw(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (W === 0 || H === 0) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = SURFACE;
    ctx.fillRect(0, 0, W, H);

    const top = 26;
    const padL = 40;
    const padR = 44;
    const padB = 18;
    const x0 = padL;
    const x1 = W - padR;
    const y0 = top;
    const y1 = H - padB;

    // title + legend
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT;
    ctx.fillText(this.opts.title, 8, 12);
    if (this.series.length >= 2) {
      let lx = W - 8;
      ctx.textAlign = 'right';
      for (let i = this.series.length - 1; i >= 0; i--) {
        const s = this.series[i];
        ctx.fillStyle = TEXT2;
        ctx.fillText(s.name, lx, 12);
        lx -= ctx.measureText(s.name).width + 6;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx - 12, 12);
        ctx.lineTo(lx, 12);
        ctx.stroke();
        lx -= 20;
      }
      ctx.textAlign = 'left';
    }

    const n = this.xs.length;
    if (n === 0) {
      ctx.fillStyle = TEXT2;
      ctx.fillText('waiting for data…', x0, (y0 + y1) / 2);
      return;
    }

    let lo = this.opts.yMin ?? Infinity;
    let hi = this.opts.yMax ?? -Infinity;
    if (this.opts.yMin === undefined || this.opts.yMax === undefined) {
      for (const s of this.series) for (const v of s.values) if (Number.isFinite(v)) {
        if (this.opts.yMin === undefined) lo = Math.min(lo, v);
        if (this.opts.yMax === undefined) hi = Math.max(hi, v);
      }
      if (!Number.isFinite(lo)) lo = 0;
      if (!Number.isFinite(hi)) hi = 1;
      if (hi - lo < 1e-9) { hi = lo + 1; lo = lo - 1; }
      const pad = (hi - lo) * 0.08;
      if (this.opts.yMin === undefined) lo -= pad;
      if (this.opts.yMax === undefined) hi += pad;
    }
    const xmin = this.xs[0];
    const xmax = this.xs[n - 1];
    const sx = (x: number) => (n === 1 ? (x0 + x1) / 2 : x0 + ((x - xmin) / (xmax - xmin)) * (x1 - x0));
    const sy = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);

    // grid: 4 hairlines
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.fillStyle = TEXT2;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      const y = Math.round(sy(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.fillText(this.fmt(v), x0 - 6, y);
    }
    if (this.opts.refLine !== undefined && this.opts.refLine > lo && this.opts.refLine < hi) {
      ctx.strokeStyle = '#3a3f4a';
      const y = Math.round(sy(this.opts.refLine)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillText(`gen ${xmin}`, x0, H - 8);
    if (n > 1) ctx.fillText(`gen ${xmax}`, x1, H - 8);

    // lines
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const s of this.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (!Number.isFinite(v)) { started = false; continue; }
        const x = sx(this.xs[i]);
        const y = sy(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // end dots + end labels
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const usedY: number[] = [];
    for (const s of this.series) {
      let li = n - 1;
      while (li >= 0 && !Number.isFinite(s.values[li])) li--;
      if (li < 0) continue;
      const x = sx(this.xs[li]);
      const y = sy(s.values[li]);
      ctx.fillStyle = SURFACE;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      let ly = y;
      for (const u of usedY) if (Math.abs(u - ly) < 11) ly = u + 11;
      usedY.push(ly);
      ctx.fillStyle = TEXT;
      ctx.fillText(this.fmt(s.values[li]), x1 + 8, ly);
    }

    // hover
    if (this.hoverX !== null && this.hoverX >= x0 && this.hoverX <= x1) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(sx(this.xs[i]) - this.hoverX);
        if (d < bd) { bd = d; best = i; }
      }
      const hx = Math.round(sx(this.xs[best])) + 0.5;
      ctx.strokeStyle = '#4a5060';
      ctx.beginPath();
      ctx.moveTo(hx, y0);
      ctx.lineTo(hx, y1);
      ctx.stroke();
      for (const s of this.series) {
        const v = s.values[best];
        if (!Number.isFinite(v)) continue;
        ctx.fillStyle = SURFACE;
        ctx.beginPath();
        ctx.arc(hx, sy(v), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(hx, sy(v), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const rows = this.series
        .filter((s) => Number.isFinite(s.values[best]))
        .map((s) => `<span class="sw" style="background:${s.color}"></span>${s.name} <b>${this.fmt(s.values[best])}</b>`);
      this.tip.innerHTML = `<div class="tip-h">gen ${this.xs[best]}</div>${rows.join('<br>')}`;
      this.tip.style.display = 'block';
      const left = hx + 12 + this.tip.offsetWidth > W ? hx - 12 - this.tip.offsetWidth : hx + 12;
      this.tip.style.left = `${left}px`;
      this.tip.style.top = `${y0}px`;
    } else {
      this.tip.style.display = 'none';
    }
  }
}
