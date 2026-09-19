import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GOTCHAS #41. This project's claim ladder is built on frozen pre-registrations, and every one of them used
 * to be written into `runs/` — which is gitignored. A fresh clone therefore has the conclusions and none of
 * the predictions they were judged against, and nothing errors when that happens: the docs keep citing files
 * that cannot exist. Pre-registrations now live in `predictions/`, and this test keeps every citation of that
 * directory honest. ⛔ It cannot resurrect the `runs/*-predictions.txt` citations written before 2026-09-19;
 * those are gone, and the entry says so.
 */
const ROOTS = ['docs', 'scripts', 'src', 'tests', 'predictions'];
const TEXT = /\.(ts|md|txt|json|html)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.test(name)) out.push(p);
  }
  return out;
}

describe('pre-registrations', () => {
  const files = [...ROOTS.filter(existsSync).flatMap((d) => walk(d)), ...readdirSync('.').filter((f) => TEXT.test(f))];

  it('cites only prediction files that are actually in the repo', () => {
    const missing: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/predictions\/[A-Za-z0-9._-]+\.txt/g)) {
        if (!existsSync(m[0])) missing.push(`${f} → ${m[0]}`);
      }
    }
    expect(missing, 'a cited pre-registration that is not in the repo is a claim with no frozen prediction behind it').toEqual([]);
  });

  it('keeps the predictions directory out of the ignore list', () => {
    const ignore = readFileSync('.gitignore', 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(ignore).not.toContain('predictions/');
    expect(ignore).toContain('runs/');   // the run artefacts themselves stay out; only the predictions come in
  });
});
