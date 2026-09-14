/**
 * The shape of `scripts/crossplay.ts --out <file>`: the ONE place both the producer (the CLI) and the consumer
 * (the page's cross-play panel) agree on. ⛔ Nothing may recompute a matrix, an edge or a cycle from the raw
 * cells — the CLI computes them once, this file carries them, the page draws them (TODO: "别另写一套算法").
 */
import type { SimConfig } from './config.ts';

export interface CrossplayEntrant {
  /** display name, e.g. `d2-long-s1:R@299` */
  name: string;
  source: string;
  /** which colour this genome was taken from ('R' or 'B'), as the CLI prints it */
  side: 'R' | 'B';
  gen: number;
  fitness: number;
}

export interface CrossplayMap {
  mapSeed: number;
  /** winRed[i][j] = row i's win share as RED against column j */
  winRed: number[][];
  /** balanced[i][j] = row i's win share over both colours; the pair sums to 1 */
  balanced: number[][];
  /** sight[i][j] = mean sighting ticks per match — the denominator; 0 means the cell measures nothing (GOTCHAS #18) */
  sight: number[][];
  shots: number[][];
  /** mirror[i] = red win share when i plays itself: far from 50% means the MAP decides */
  mirror: number[];
  /** cells with |win − 50%| >= margin AND contact, as [row, col] pairs */
  decisiveEdges: [number, number][];
  /** non-transitive triples, already rendered as `a > b > c > a` with entrant indices */
  cycles: string[];
  /** rowMean[i] = entrant i's mean side-balanced win share over the CONTACT-BEARING cells, or null if it met nobody */
  rowMean: (number | null)[];
}

export interface CrossplayFile {
  createdAt: string;
  sources: string[];
  sim: SimConfig;
  hidden: number[];
  n: number;
  baseSeed: number;
  margin: number;
  entrants: CrossplayEntrant[];
  maps: CrossplayMap[];
}
