# EvoShooter — Evolution Ecology Contract

> Status: future-facing contract for E5–E6 and any claim about population diversity, progress, exploitability or meta. It operationalizes `VISION.md` / `SUBSTRATE.md`; it does **not** change the current ROADMAP cursor.

---

## 0. North star

**Opponent distribution is the curriculum. World mechanics determine whether useful counters can exist.**

A league can expose weaknesses, but it cannot manufacture a counter-strategy if the substrate gives the dominant strategy no physical/informational/economic cost.

Therefore:

> **League discovers counters; the world makes counters possible.**

Do not treat scheduler sophistication as a substitute for a rich payoff surface.

---

## 1. Progress is not “beats yesterday”

A club is not truly better merely because it beats its most familiar recent opponent.

Progress claims must distinguish:

- **current-meta fitness** — performance against nearby contemporary peers;
- **historical retention** — does it still beat / handle previously important opponents?
- **held-out generalization** — does it work against opponents outside its training mix?
- **exploitability** — can a challenger discover a cheap counter?
- **ecological value** — does the strategy occupy a stable niche, or only win because everyone else currently ignores it?

A single Elo/rating must never hide obvious non-transitivity.

---

## 2. Opponent ecology — four pressure families

The target league should eventually expose clubs to several pressure families, added one at a time and measured.

### 2.1 Current peers

Strength-near contemporaries provide the main natural curriculum.

### 2.2 Style-diverse contemporaries

Behaviourally distant current clubs reduce overfitting to the dominant mirror matchup.

Selection of “different style” must use read-only behavioural representations; do not reward style novelty directly.

### 2.3 Historical archive

Past champions / important ancestors prevent strategy forgetting and enable era-vs-era evaluation.

### 2.4 Exploiters / challengers

Special training roles search for weaknesses of strong clubs. They are evaluation/training pressure, not in-world player roles or privileged tactical APIs.

The purpose is to answer:

> “What is the cheapest reliable way to break this club?”

not merely:

> “Can another current champion beat it?”

Do not hard-code a permanent sampling ratio. Each added arm must prove that it reduces forgetting/exploitability or improves opponent coverage enough to justify its cost.

---

## 3. Non-transitive cycles are content, not the main diversity gate

`A > B > C > A` is valuable evidence that the world contains matchup structure, but **cycle count alone is not a robust ecological success criterion**.

Cross-era matrices can confound:

- broad historical arms-race progress;
- actual style matchup;
- changing map/objective/substrate eras;
- founder/random-seed effects.

Use cycles as a visualization and diagnostic, not the sole close gate for “diversity achieved”.

---

## 4. Primary ecology yardstick: frequency dependence

The stronger test for self-sustaining diversity is whether a strategy/style loses marginal value as it becomes common.

Conceptually examine:

```text
∂ payoff(style) / ∂ frequency(style)
```

Healthy competitive ecology often permits **negative frequency dependence**:

> as a style spreads, opponents encounter it more, counters become worthwhile, and its payoff falls.

Hard warning signs:

- a style gets **more** profitable as it becomes common;
- one axis becomes a runaway must-buy / must-play dimension;
- style diversity exists only because the trainer pays an explicit novelty/diversity bonus;
- a dominant style has no real opportunity cost in map, information, mechanics, economy or time.

The target is not to force every axis negative at all times. The target is to show that diversity can be maintained by real counter-payoff structure rather than hidden balancing rewards.

---

## 5. Counter-payoff surfaces belong in the world

If one strategy dominates, first ask what cost reality would impose on its strengths.

Examples of natural Shooter trade-offs:

### Fast pressure / rush

Benefits:
- timing;
- local numbers;
- surprise before setup.

Possible natural costs:
- footstep/audio exposure;
- reduced information gathering;
- vulnerability to area denial / utility;
- reduced map coverage;
- worse adaptation after early contact.

### Slow default / information play

Benefits:
- map information;
- opponent reaction sampling;
- flexible regrouping.

Natural costs:
- clock pressure;
- risk of isolated picks;
- defender proactive information plays;
- delayed objective commitment.

### Tight grouping

Benefits:
- trade density;
- combined firepower.

Natural costs:
- map control loss;
- utility efficiency for the opponent;
- flank/lurk space;
- duplicated information coverage.

### Wide split

Benefits:
- coverage;
- multi-front pressure;
- information acquisition.

Natural costs:
- weaker local trades;
- slower regroup;
- communication burden.

Do **not** implement these as `rushPenalty`, `lurkBonus`, etc. The costs should fall out of honest sound, geometry, time, objective rules, utility, economy and body mechanics.

When a dominant meta appears, the default diagnosis order is:

1. is the apparent dominance measurement real?
2. is search/mutation scale causing collapse?
3. is a required counter affordance missing?
4. is the counter affordance present but its cost/payoff surface non-binding?
5. only after those, consider scheduler/search changes.

---

## 6. Genetic inheritance, cultural transmission and ecological selection must not be conflated

The long-term architecture may contain **two inheritance / transmission channels under one ecological selector**:

```text
genetic inheritance + cultural transmission
                  │
                  ▼
          ecological selection
                  │
                  ▼
               evolution
```

### 6.1 Genetic inheritance

Player and team/coach parameters passed through reproduction / mutation / recombination.

This is what E1–E6 are allowed to build first.

### 6.2 Cultural transmission — future E7 only

Conventions, protocol meanings, pair chemistry or club habits may later be acquired through repeated shared experience and transmitted socially without changing the recipient genotype.

This is governed by [`CULTURAL-TRANSMISSION-CONTRACT.md`](CULTURAL-TRANSMISSION-CONTRACT.md).

### 6.3 Ecological selection

The opponent distribution determines which inherited and culturally acquired behaviours remain valuable.

**Ecology is not itself a transmission channel.** It is the pressure that filters both channels.

These timescales must be visible and separately testable.

Current D1 / E1–E6 must **not** silently add cultural persistence. If hidden/recurrent state resets each round/match, documentation must not narrate stable cross-season learning as culture.

A future cultural layer must explicitly define:

- what state persists across rounds/matches/seasons;
- whether it belongs to a player, pair, coach or club;
- how another agent can learn it through legal interaction;
- how transfer / coach change affects it;
- how it is reset/relearned;
- how its contribution is separated from inherited genotype.

Possible mature ontology:

```text
Club
├─ inherited team / club block
├─ club culture / conventions             # emergent, not automatically a shared vector
├─ Coach: inherited philosophy + acquired experience
├─ Player 1..5: genotype + acquired state
└─ pair/shared-history chemistry
```

This is a research destination, not a current implementation requirement.

---

## 7. Transfer / mobility becomes an experiment in identity

If player transfer is later added, use it as a causal probe, not just world decoration.

Questions include:

- does a player's mechanical/behavioural identity survive a club switch?
- does the player initially fail to understand the new club's communication protocol?
- does a convention travel with one player, require a pair, or stay with the club?
- does a coach carry strategic priors while club-specific language remains behind?
- can independent clubs converge on functionally similar conventions?

This lets the world distinguish **person**, **pair**, **coach**, **club culture** and **environment**.

---

## 8. Scaffold Retirement Programme

A successful evolving system accumulates temporary scaffolds. As more general substrate capabilities become competent, old scaffolds must be re-tested and removed if no longer load-bearing.

Candidates may eventually include:

- explicit contact caches after private recurrent memory matures;
- overly informative teammate HUD fields after body/radio coordination matures;
- overly strong opening priors after distributed mid-round competence matures;
- shared-backbone conveniences after individual identities mature;
- temporary shaping rewards after result-driven selection becomes audible.

Method:

```text
FULL
− one scaffold
→ same-seed / multi-seed mechanism + match + ecology comparison
```

A scaffold that can be removed without harming the intended capability should be retired.

**Reason:** yesterday's necessary bootstrap can become tomorrow's hidden tactic script.

---

## 9. Ecology evidence bundle

A mature E6 evaluation should include, where relevant:

- side-balanced current cross-play matrix;
- held-out opponent set;
- current-vs-history matrix;
- challenger/exploiter success and discovered weaknesses;
- opponent-style coverage;
- style/behaviour embedding spread;
- frequency → payoff relationships;
- runaway-axis scan;
- forgetting measures;
- non-transitive cycles as descriptive content;
- lineage showing meta rise, counter emergence and decline.

Avoid one scalar “LeagueScore”.

---

## 10. Product view — meta should have history

The spectator should eventually be able to see:

```text
Era 4: fast grouped pressure becomes dominant
↓
Era 5: sound-aware anchors + early denial punish it
↓
Era 6: pressure teams begin silent/slow approaches
↓
Era 7: defenders stop over-rotating; information-heavy defaults rise
```

A strategy's fall is as interesting as its birth.

The league is successful when it produces **adaptation, counter-adaptation, niches and recoverable history**, not when every generation merely has a higher rating.
