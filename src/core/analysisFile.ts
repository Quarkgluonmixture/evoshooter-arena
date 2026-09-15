/**
 * The shape of the G3 analysis exports — the ONE place the producer (`scripts/style.ts --out`,
 * `scripts/lineage.ts --out`) and the consumer (`src/ui/analysisView.ts`) agree on, exactly as
 * `crossplayFile.ts` is for the matrix. ⛔ Nothing downstream may recompute a step, a floor, a takeover or a
 * verdict: the CLI computes them once, this file carries them, the page draws them.
 *
 * ⭐ One thing these carry that the cross-play file does not: `caveats`. Every G3 number earned a warning the
 * hard way — the style trajectory is map-specific, "lineage" is inferred because the trainer records no
 * parentage, a `det` row's ratio is meaningless — and a caveat that lives only in a CLI's stdout does not reach
 * the person looking at the picture. So the warnings travel WITH the data and the view prints them next to it.
 */

export interface StylePoint {
  gen: number;
  pc1: number;
  pc2: number;
  /** distance between this generation's two seed-block estimates — its own re-measurement noise */
  own: number;
  /** distance from the previous sampled generation (NaN on the first) */
  step: number;
  /** step / the larger of the two endpoints' own noise (NaN on the first) */
  ratio: number;
  /** own noise under 0.3: the champion rolls no dice ON THIS MAP, so its neighbours' ratios are inflated */
  det: boolean;
}

export interface StyleFile {
  kind: 'style';
  createdAt: string;
  source: string;
  colour: 'R' | 'B';
  opponent: string;
  mapSeed: number;
  /** false ⇒ every champion here is out of distribution, and the view says so */
  trainingMap: boolean;
  /** matches per estimate, per role assignment */
  n: number;
  keys: string[];
  droppedKeys: string[];
  /** share of total variance on each component */
  pcaVar: [number, number];
  loadings: { pc: 1 | 2; top: { key: string; w: number }[] }[];
  points: StylePoint[];
  /** gaps between sampled generations are equal — steps across unequal gaps are ⛔ not comparable */
  evenSweep: boolean;
  caveats: string[];
}

export interface LineageTrack {
  colour: 'R' | 'B';
  champions: number;
  /** steps where the genome did not change at all — elitism carried the same individual forward */
  retained: number;
  steps: { gen: number; d: number; moved: number }[];
  medianNonZero: number;
  takeoverCut: number;
  /** generations g where the step g -> g+1 cleared the cut */
  takeovers: number[];
  lag: { lag: number; d: number }[];
  /** the CLI's reading of the lag curve, so the page never re-judges it */
  verdict: string;
}

export interface LineageFile {
  kind: 'lineage';
  createdAt: string;
  source: string;
  mutRate: number;
  mutSigma: number;
  /** RMS per-weight change of ONE mutation event — the scale a step should be read against */
  oneMutationRms: number;
  tracks: LineageTrack[];
  caveats: string[];
}

export type AnalysisFile = StyleFile | LineageFile;
