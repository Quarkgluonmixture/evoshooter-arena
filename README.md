# EvoShooter Arena

A self-evolving 3D team shooter. Two populations of neural-network policies — **red** and **blue** — fight
5v5 rounds in a symmetric arena with cover and a central control zone. Nothing tactical is scripted: each
generation the two sides are scored against each other (and against a hall of fame of past champions),
bred, and mutated. You watch the champions play in 3D while a dashboard shows *whether* they are getting
better (win rate against their own past selves) and *how* they play (accuracy, cover use, spread,
flanking, comm-channel use, time to first shot …).

```
npm install
npm run dev        # open the URL, press "start evolving"
npm test           # 32 vitest tests (determinism, mirror symmetry, colour fairness, env rewards competence)
npm run train -- --gens 40 --pop 16 --seed 1   # headless training in the terminal
```

Node ≥ 22.6 (TypeScript runs directly in Node; the browser build uses Vite).

## What you are looking at

| Visual | Meaning |
|---|---|
| Capsule + dark visor | agent and its facing |
| Translucent cone | 110° field of view (what the network can "see"); brighter while firing |
| Bar above head | health (4 hits to die) |
| Ring on the ground | aim mode: half speed, no movement accuracy penalty |
| Light on the head | the 2-value **comm channel** the agent broadcasts to teammates — hue = direction, brightness = magnitude. Random noise at gen 0; if it settles into stable, role-like colours, signalling has evolved |
| Zone ring | 1 point/s for the side with more living agents inside. Wiping the enemy banks the remaining time |
| Tall walls | block sight and movement |
| Low walls | block movement and hide legs/torso — the head stays exposed |
| Tracers / sparks | shots; a spark means a hit |

Right-hand panel:

- **Are they getting better?** Champion win rate vs the generation-0 champion and vs its own 10-generations-older
  self (the past self plays the other colour — any genome can play either side). Champion and population-mean
  fitness. Head-to-head balance between red and blue.
- **How they play** — 12 population-average behaviour metrics per generation. This is where tactics become visible:
  accuracy climbs first, then time-to-first-shot collapses, cover ratio rises, spread and flank rate change as
  the two sides answer each other.
- **Where they go** — occupancy heat-maps per team with a generation scrubber.
- **Time travel** — pit any generation's champion against any other. "gen 0 vs latest" is the fastest way to *feel*
  the change.
- **Save / load** — export the whole run (populations, hall of fame, history) and import it later.

## Spectating (CS:GO-observer style)

| Input | Effect |
|---|---|
| click a player tile · `1`–`5` (red) · `6`–`0` (blue) | follow that agent in third person |
| `Tab` / `Space` (`Shift` reverses) | next living agent |
| `V` | toggle first ↔ third person (first person hides your own body, shows a crosshair and a HP/ammo/comm HUD) |
| `F` | free orbit camera (drag / wheel) |
| `D` | auto-director: follows whoever is firing, being shot, closest to enemies or holding the zone; cuts after ≥ 3 s when someone else is clearly more interesting, and 1 s after its subject dies |

## How it works

```
src/core     rng (mulberry32), SimConfig / EvoConfig
src/sim      geom (segment-vs-box LOS, 2D lidar, circle-box collision), map (180°-symmetric procedural arena),
             world (observation → action → combat → scoring, behaviour metrics, heat grids)
src/brain    mlp (flat Float32Array genome, tanh MLP), policy (shared network per team), scripted (test bots only)
src/evo      genetic (mutation, neuron-wise crossover, tournament), match (fitness, metrics), trainer (co-evolution)
src/worker   web-worker evaluator: a generation's matches fan out over N workers
src/render   Three.js scene + real-time match viewer
src/ui       canvas line charts, heat-map, history store
scripts      train.ts (headless CLI), bench.ts
```

**Simulation.** 15 Hz, 40 s rounds, no respawn. Agents move at 6 m/s (2.7 m/s in aim mode), turn at ≤ 3π rad/s,
carry 10-round magazines (1.6 s reload), and deal 26 damage per hit. Hit probability =
`0.85 × exposure × distance × movement × settle × target-motion`, where exposure is the fraction of three body
heights (head / chest / legs) visible from the shooter's eye — so low cover really hides your legs, and a
freshly acquired target is harder to hit than one you have been tracking for half a second.

**Team frame.** Blue perceives the world rotated 180°, so both populations solve the *same* problem and any genome
can play either colour. That is what makes "champion vs its own past self" and "gen 0 vs latest" fair comparisons.

**Observation (100 inputs).** Own state + slot one-hot, zone vector and occupancy, 8 lidar rays, 4 teammate slots
(relative position, health, firing, comm), 3 enemy slots (relative position, my exposure to them and theirs to me,
whether they face me, health, staleness of the team's last sighting). Enemies seen by any teammate are shared with the
whole team, so spreading out has an information payoff.

**Action (12 outputs).** Move vector, look vector, fire, 3 target-slot logits, reload, aim mode, 2 comm values.

**Fitness (zero-sum).** `zone margin + 0.5 × damage margin + 0.2 × zone-presence margin ± 0.3 for a wipe`. The
shaping terms exist so generation 0 has a gradient and so "everybody hides" scores below "at least contest the zone".

**Co-evolution.** Each genome plays several random opponents from the other population plus opponents sampled from
the other side's hall of fame (recent champions). Tournament selection, 2 elites, neuron-wise crossover, Gaussian
mutation. Every generation the champions are also played against their generation-0 and 10-generations-older
selves to produce the "are they getting better" curves.

## Design notes

- **Colour fairness is enforced, not assumed.** Combat is resolved simultaneously each tick (an earlier version
  processed red first and gave red a permanent first-shot edge). A test plays identical bots against each other and
  requires the red win share to stay inside 33–67 %.
- **The zone is hidden from the spawn rows.** With open sight-lines, "camp at spawn" beats "hold the zone" and both
  sides learn to hide; the mid walls (with a narrow central door) make holding the zone the dominant passive
  strategy, which forces the other side to attack it.
- **Every number in the dashboard is a population average per generation** (not the champion's), so a lucky single
  match cannot masquerade as a trend.
- Reference bots in `src/brain/scripted.ts` exist only to test that the environment rewards competence (rusher beats
  idle, shooter beats pacifist). Evolving agents never see them.

## Evidence that evolution happens (headless, 2026-09-11)

Recompute: `npm run train -- --gens 40 --pop 16 --seed <1|2>` (defaults = the values below; ~2.5 min per run on an
M-series laptop). The final line prints the last champion's win rate against the generation-0 champion on both colours.

| defaults (σ 0.05, mutation rate 2 %, 5 matches/genome) | seed 1 | seed 2 |
|---|---|---|
| final red champion vs gen-0 red champion (as red / as blue) | 100 % / 100 % | 100 % / 100 % |
| final blue champion vs gen-0 blue champion (as red / as blue) | 50 % / 50 % (draws) | 100 % / 100 % |
| in-cover-while-threatened, gen 0 → gen 39 (population mean) | 0.10 → 0.67 (red), 0.04 → 0.52 (blue) | 0.02 → 0.54, 0.02 → 0.47 |
| seconds until first shot, gen 0 → gen 39 | 33 → 7.6 | 38 → 5.0 |
| accuracy, gen 0 → gen 39 | 0.08 → 0.36 (red) | 0.03 → 0.31 (red) |

What did **not** work, and why the defaults are what they are:

- σ = 0.15 / rate 4 % (the first attempt): champion fitness swung between 0.5 and 1.4 every generation and the population
  mean never left ≈ 0 — with ~213 weights perturbed per child at a σ larger than the first layer's typical weight (0.1),
  children barely inherit their parents' behaviour. Both populations eventually slid into "everyone hides" (zone share
  0, first shot after 30 s, final champion draws 50/50 against gen 0). σ = 0.08 still collapsed one of two seeds.
- Sequential combat resolution gave red a permanent first-shot edge (red dominated every seed) — fixed by resolving all
  shots of a tick simultaneously; the mirror-match fairness test guards it.
- An open sight-line from the spawn rows to the zone made "camp at spawn" beat "hold the zone" — the mid walls fix that.

## Headless runs

`npm run train -- --gens 40 --pop 16 --seed 1 --sigma 0.05 --rate 0.02 --pairings 3 --hof 2 --out runs/x.json`
prints one line per generation and ends with the final champion's win rate against the generation-0 champion on
both colours. `runs/` is git-ignored.
