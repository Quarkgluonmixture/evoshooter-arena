# EvoShooter Arena

A self-evolving 3D team shooter. Two populations of neural-network policies — **red** and **blue** — fight
5v5 rounds in a symmetric arena with cover and a central control zone. Nothing tactical is scripted: each
generation the two sides are scored against each other (and against a hall of fame of past champions),
bred, and mutated. You watch the champions play in 3D while a dashboard shows *whether* they are getting
better (win rate against their own past selves — with the caveat in *Cross-play* below) and *how* they play
(accuracy, cover use, spread, flanking, comm-channel use, time to first shot …).

**▶ Play it in the browser: <https://quarkgluonmixture.github.io/evoshooter-arena/>** — training runs client-side in
web workers, so the page evolves its own population while you watch. Every push to `main` that touches code
re-deploys it after the test suite and the information-leak gate pass.

```
npm install
npm run dev        # open the URL, press "start evolving"
npm test           # vitest: determinism, mirror symmetry, colour fairness, env rewards competence, leak matrix
npm run train -- --gens 40 --pop 16 --seed 1   # headless training in the terminal
npm run leaks      # print what each observation field is allowed to know, and where it cheats today
npm run crossplay -- runs/a.json runs/b.json   # win-rate matrix between saved champions (see below)
```

Node ≥ 22.6 (TypeScript runs directly in Node; the browser build uses Vite).

## How to actually play it (10 minutes)

This is a *watch-and-steer* game, like breeding fighters rather than driving one.

1. `npm run dev`, open the page, leave **population 24** and **workers** at the default, press **start evolving**.
   The 3D view shows the newest red champion vs the newest blue champion; the right panel updates every generation.
2. For the first ~20 generations just watch the arena: agents wander, shoot at nothing, bump into walls. Then watch
   **Seconds until first shot** collapse and **Accuracy** climb in the charts — that is the first thing evolution finds.
3. Around generation 30–60 look for **In cover while threatened** rising and **Teammate spread** changing. Press `D` for the
   auto-director and let it follow the fights; press `V` to sit in a fighter's eyes.
4. Use **Time travel → "gen 0 vs latest"** whenever you want to *feel* the difference instead of reading it.
5. Watch the head **lights**: if the comm channel is still rainbow noise after 100+ generations, nothing has evolved a
   language yet; if lights turn stable and role-like (e.g. the zone-holder glows one colour), signalling emerged.
6. Steering levers (all in the panel, reset to apply): **map seed** changes the arena, **seed** re-rolls the initial
   populations, **population** trades speed for diversity. Export a run before changing anything you might regret.
7. Long runs: leave a tab evolving for an hour (≈ 1–2 s per generation with 8 workers), then come back and compare
   "halfway vs latest". The headless CLI does the same without graphics and prints the win rates.

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
| Tracer + muzzle flash | a round leaving the gun |
| Impact spray + white body flash | a hit landing on that agent; a kill throws a bigger burst |
| Red screen edges (spectator) | the agent you are watching is taking fire |

Right-hand panel:

- **Are they getting better?** Champion win rate vs the generation-0 champion and vs its own 10-generations-older
  self (the past self plays the other colour — any genome can play either side). Champion and population-mean
  fitness. Head-to-head balance between red and blue.
- **How they play** — 12 population-average behaviour metrics per generation. This is where tactics become visible:
  accuracy climbs first, then time-to-first-shot collapses, cover ratio rises, spread and flank rate change as
  the two sides answer each other. Note that *in cover while threatened* counts only threats the agent itself
  knows about (its own sighting, or its own three-second memory), so it is not comparable with runs from before
  contacts became private.
- **Where they go** — occupancy heat-maps per team with a generation scrubber.
- **Time travel** — pit any generation's champion against any other. "gen 0 vs latest" is the fastest way to *feel*
  the change.
- **Save / load** — export the whole run (populations, hall of fame, history) and import it later.

## Spectating (CS:GO-observer style)

| Input | Effect |
|---|---|
| click a player tile · `1`–`5` (red) · `6`–`0` (blue) | follow that agent in third person |
| `Tab` / `Space` (`Shift` reverses) | next living agent |
| `V` | toggle first ↔ third person (first person hides your own body, draws the weapon, and shows a crosshair + HP/ammo/comm HUD) |
| `F` | free orbit camera (drag / wheel) |
| `D` | auto-director: follows whoever is firing, being shot, closest to enemies or holding the zone; cuts after ≥ 2.6 s when someone else is clearly more interesting (never mid-burst), and ~1 s after its subject dies |

The chase camera rises over cover instead of pulling into the subject's back, and both follow cameras track the
*interpolated* pose: the sim runs at 15 Hz while the display runs at refresh rate, so the pose drawn each frame is
interpolated between the last two ticks. Rendering the raw sim pose is what made the agents look like they were
stepping.

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

**Simulation.** 15 Hz, 40 s rounds, no respawn. Agents move at 6 m/s (2.7 m/s in aim mode), flick onto a chosen
target at ≤ 2π rad/s but *sweep* at only 1.6 rad/s when nobody is being engaged — and the look action is low-passed
over ~0.45 s before it can steer the head, so scanning is gradual instead of per-tick jitter. They
carry 10-round magazines (1.6 s reload), and deal 26 damage per hit. Hit probability =
`0.85 × exposure × distance × movement × settle × target-motion`, where exposure is the fraction of three body
heights (head / chest / legs) visible from the shooter's eye — so low cover really hides your legs, and a
freshly acquired target is harder to hit than one you have been tracking for half a second.

**Team frame.** Blue perceives the world rotated 180°, so both populations solve the *same* problem and any genome
can play either colour. That is what makes "champion vs its own past self" and "gen 0 vs latest" fair comparisons.

**Observation (100 inputs).** Own state + slot one-hot, zone vector and own occupancy, 13 geometry rays, 4 teammate
slots (relative position, health, firing *if I can see him*, comm), 3 enemy contact slots, and 4 hearing sectors.
The objective HUD does not count enemies standing on the point — that was a free occupancy radar; the legal way to
learn they are taking it is the score margin moving.

A contact is a *percept*, not a coordinate: bearing relative to where I am looking, a range cue, and a quality —
visible body fraction × distance falloff × eccentricity falloff — with every directional number multiplied by how sure
I am of the contact, so it fades to nothing at the edge of vision instead of being deleted at a cutoff. Bearing, range
and quality are blurred and quantised by an amount that grows as the look gets worse, deterministically, so a movement
finer than my perceptual resolution never reaches the policy.

**Contacts are private**: an enemy only a teammate can see never appears in my slots. I get what I have seen myself,
plus a three-second memory of it — and a glimpse I barely got decays into a memory I barely hold, fading out rather
than being deleted when the window ends. An enemy's health,
his facing, and how exposed *I* am to *him* are his state, not my percept, so they are not in there.

The geometry rays follow the head: densest down the crosshair, thinning towards ±90°, nothing at all behind. Structures
are sensed wider than enemies are recognised, which is both realistic and, measurably, the difference between agents
that can navigate and agents that walk into walls.

**Hearing** is the one sense that works in every direction: four head-relative sectors, footsteps and gunshots kept
apart, fading with distance and muffled by walls. Footsteps get louder the faster you move — moving slowly is quiet
because of physics, not because a rule says to sneak. A sound carries no identity and no team label, so telling a
teammate's steps from an enemy's is an inference the network has to make, not a field it can read.

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

## Evidence that evolution happens (headless, 2026-09-11, current turn rules)

Recompute: `npm run train -- --gens 40 --pop 16 --seed <1|2>` (defaults = the values below; ~3 min per run on an
M-series laptop, and deterministic — two runs of the same seed print identical rows). The final line prints the
last champion's win rate against the generation-0 champion on both colours.

> ⚠ **Read the ladder rows with *Cross-play* below in hand.** A champion-vs-gen-0 win rate can read a confident
> 50 % or 100 % for two champions who never once saw each other — co-evolution sometimes settles on mutual
> avoidance, and then the "win rate" is the scoreboard of a match that never happened. Since 2026-09-12 every
> ladder number carries its own sighting-tick denominator and prints `·` instead of `%` when that denominator is
> zero. The table below predates the marker; treat its numbers as unverified on that axis.

| defaults (σ 0.05, mutation rate 2 %, 5 matches/genome) | seed 1 | seed 2 |
|---|---|---|
| final red champion vs gen-0 red champion (as red / as blue) | 100 % / 100 % | 90 % / 100 % |
| final blue champion vs gen-0 blue champion (as red / as blue) | 100 % / 100 % | 100 % / 100 % |
| in-cover-while-threatened, gen 0 → gen 39 (population mean) | 0.09 → 0.69 (red), 0.04 → 0.70 (blue) | 0.02 → 0.57, 0.03 → 0.59 |
| seconds until first shot, gen 0 → gen 39 | 33 → 6.6 | 37 → 8.8 |
| accuracy, gen 0 → gen 39 | 0.08 → 0.38 (red) | 0.02 → 0.25 (red) |

What did **not** work, and why the defaults are what they are:

- σ = 0.15 / rate 4 % (the first attempt): champion fitness swung between 0.5 and 1.4 every generation and the population
  mean never left ≈ 0 — with ~213 weights perturbed per child at a σ larger than the first layer's typical weight (0.1),
  children barely inherit their parents' behaviour. Both populations eventually slid into "everyone hides" (zone share
  0, first shot after 30 s, final champion draws 50/50 against gen 0). σ = 0.08 still collapsed one of two seeds.
- Sequential combat resolution gave red a permanent first-shot edge (red dominated every seed) — fixed by resolving all
  shots of a tick simultaneously; the mirror-match fairness test guards it.
- An open sight-line from the spawn rows to the zone made "camp at spawn" beat "hold the zone" — the mid walls fix that.
- Scan turn rate 1.6 rad/s (the first attempt at "sweep, don't snap"): visually identical to 2.6 rad/s on the jitter
  metrics (>20°/tick in 0.6 % of ticks, direction reversals in 3.7 % — measured over 35 k agent-ticks of random
  genomes), but it starves the learning signal: seed 2's red champion fell to 45 % / 50 % against gen 0 and first
  contact stalled at 15 s. 2.6 rad/s costs nothing visually and restores the ladder. The jitter itself is killed by
  the 0.45 s low-pass on the look action (reversals 14.5 % → 4.3 %), *not* by the cap; the cap only limits jump size.

## What the agents are allowed to know

`src/sim/obsSchema.ts` names every observation index and tags each one **legal** (a human could get it from
proprioception, the HUD, vision or radio), **truth-form** (legitimately perceivable, but handed over as an exact
engine value) or **hidden** (the observer cannot legally know it at all). `npm run leaks` runs a probe matrix that
changes one thing the observer cannot perceive — an enemy only a teammate can see, an enemy's HP, a wall that appears
behind the head, a 5 cm shift at 25 m — and prints which fields moved. Probes are registered with the status we
currently expect, and `tests/leak.test.ts` asserts measured == registered on the exact field set, so a fix, a
regression and a half-fix all turn the suite red. Run the command for the current list: the ones still reporting a
leak are the debts this baseline has not paid yet, and they are meant to be visible rather than quietly edited away.
The gaps themselves are `V1`–`V12` in `docs/SUBSTRATE.md`.

## Cross-play: the ruler that survives mutual avoidance

```
npm run crossplay -- runs/v6a-s1.json runs/v6a-s3.json --gens first,last --n 6 --maps 7,11,23 --out runs/xp.json
```

Takes the hall-of-fame champions out of one or more saved runs and plays them all against each other. What it
does that a single ladder number cannot:

- **Both colours, same seeds.** Every pair plays each side over the identical seed set, and the reported win
  share is `(wins as red + 1 − opponent's wins as red) / 2`, so a pair always sums to 100 % and no result can be
  a colour artefact. The diagonal is a self-match: it reads the *map's* colour bias, not the genome's.
- **Every cell carries its denominator.** A second table prints mean sighting ticks and shots per match. A cell
  where the two never saw each other prints `··` — that is a non-measurement, not a draw. Thin cells (under a
  quarter of the matrix median) print `~`: the result came from the objective clock, not from a fight.
- **Fails closed on config drift.** Champions trained under different `SimConfig` values are refused
  (`--allow-sim-drift` to override), because comparing them measures the rule change, not the lineages.
- **Counts non-transitive cycles** (A beats B beats C beats A) over edges decisive by `--margin`, and can rerun
  the whole matrix on other map seeds with `--maps`.

What it found on the first run (2026-09-12, six champions from three seeds, 216 matches per map): one lineage's
champion-vs-gen-0 ladder had been reading 50 % for five straight generations while measuring **zero contact**;
training fitness does **not** transfer across runs (the second-best-trained champion placed fifth in real
matches, the worst-trained placed third); and the current meta is fully transitive — 9–10 decisive edges per
map, **zero** cycles. Details in `LOG.md`, traps in `GOTCHAS.md` #20 and #21.

## Headless runs

`npm run train -- --gens 40 --pop 16 --seed 1 --sigma 0.05 --rate 0.02 --pairings 3 --hof 2 --out runs/x.json`
prints one line per generation and ends with the final champion's win rate against the generation-0 champion on
both colours. `runs/` is git-ignored.
