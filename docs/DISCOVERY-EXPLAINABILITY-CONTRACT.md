# EvoShooter — Evolution Discovery / Explainability Contract

> Status: future-facing contract. It operationalizes `VISION.md` and `SUBSTRATE.md` for G2–G4 and for any strong claim that a role, language, tactic, chemistry pattern or new behaviour has "emerged". It does **not** change the current ROADMAP cursor and does not authorize live-policy features.
>
> Core rule: **open-world discovery, closed-world evidence**. The space of things worth discovering stays open; the evidence standard for claiming a discovery stays strict.

---

## 0. Why this exists

EvoShooter's watchability comes from being able to say not merely that fitness rose, but that **something that did not previously exist appeared, stabilized, mattered, and can be explained without smuggling the answer into the policy**.

The analytics layer must therefore behave like a behavioural-science instrument, not a tactic classifier.

Three distinctions are binding:

1. **surface form ≠ causal function** — two trajectories that look alike can do different things; two very different trajectories can serve the same strategic function.
2. **effect ≠ intent** — an action can create space or transmit information without having been selected *in order to* create that effect.
3. **mechanism ≠ evolved mechanism** — a causal mechanism is not an evolutionary result until its birth, retention, inheritance/adaptation and ecological use are demonstrated.

Examples:

- `A pressure → disengage → B hit` may be a planned deception, an information-driven abort, or merely survivors rotating away from a lost fight. Trajectory alone cannot tell.
- A gunshot can incidentally reveal a player's location, become an intentionally produced signal, or later become a stable team convention. Those are different claims.

---

## 1. The object of discovery

A useful discovery is not a label. Represent a candidate mechanism as a bundle:

```text
D = (C, F, I, R, Δ, L, E)
```

- **C — context**: round state, legal observations, time, player states, opponent situation.
- **F — form**: the multi-player temporal pattern — movement, gaze/aim, firing, gait, utility, radio, geometry.
- **I — information flow**: what each actor could legally know; sender percepts; body/audio/radio/public-event pathways.
- **R — response**: how teammates and opponents change behaviour after the pattern or signal.
- **Δ — causal function**: what changes under controlled intervention or same-state fork.
- **L — lineage**: first appearance, stabilization, inheritance/adaptation, drift, split, extinction.
- **E — ecology**: which opponents/contexts it helps against, which counter it, whether value is frequency-dependent.

A tactic-like human name comes **after** this bundle exists.

---

## 2. Claim ladder — never jump levels

Do not collapse emergence into one novelty score. A candidate should move through explicit evidence states.

### Level 0 — anomaly

Something differs from the candidate's own past / population baseline.

Allowed wording: `novel/anomalous structure candidate`.

### Level 1 — recurring motif

A multi-timescale pattern repeats across distinct rounds / seeds / contexts, not just one highlight.

Allowed wording: `recurring motif`.

### Level 2 — conditional pattern

The motif is selectively expressed under identifiable **legal information states** or contexts. It is not merely random choreography.

Allowed wording: `context-sensitive pattern`.

### Level 3 — socially used structure

Other agents systematically respond to it after controlling for common causes where feasible.

Allowed wording: `coordination/signalling candidate`.

### Level 4 — causal mechanism

A mechanism-relevant intervention changes the predicted downstream behaviour or world state.

Allowed wording: `validated causal mechanism`.

### Level 5 — evolution-selected mechanism

Fresh evolution retains or rediscovers it in some ecologies at a real opportunity cost; it is not just a frozen-policy curiosity.

Allowed wording: `evolution-selected mechanism`.

### Level 6 — evolved convention / tactic-like structure

The mechanism has a lineage, multi-agent stability, context-dependent payoff and opponent/counter relationship. If it is social, its use is shared rather than a single actor's idiosyncrasy.

Only here may product copy say things like `validated emergent convention`, `tactic-like structure`, or a human analogy such as `fake-like` — still as an analogy unless the evidence directly supports the stronger wording.

---

## 3. Discovery must use two spaces

### 3.1 Form space

Learn / mine representations of **what behaviour looks like** across several timescales:

- sub-second: stop, turn, burst, first-shot timing, micro-peek;
- 1–5 s: pair synchronization, local contact, disengage, trade window;
- 5–20 s: pressure, regroup, split, rotate-like movement;
- whole round: opening → contact → adaptation → objective/endgame.

The representation should be relational and side-normalized where appropriate, not keyed to raw slot IDs or tactical labels.

### 3.2 Function space

Separately characterize **what the behaviour changes**.

Human-readable effect dimensions may include:

- teammate convergence / spacing;
- opponent displacement / rotation;
- site access / route control;
- information propagation;
- survival / trade opportunities;
- objective probability;
- future action distribution.

But do not assume this hand-written list is exhaustive. Also retain a learned future-state / causal-effect embedding so two different surface forms can be discovered as functionally similar, and similar-looking forms can be split when their effects differ.

**Rule:** clustering in form space is candidate generation, never a tactical verdict.

---

## 4. Event graph — make latent discovery readable

Every latent motif promoted beyond Level 1 should be projectable back into primitive, auditable events, for example:

```text
P1 obtains A-side visual contact
→ P1/P2 fire
→ D3/D4 move toward A
→ P1 emits symbol 6
→ P1/P2 disengage
→ P3/P4/P5 converge toward B
→ objective begins at B
```

Primitive events may include positions, visibility, audio, actions, message send/receive, public events, memory age/confidence and objective transitions.

Do not place `FAKE`, `LURK`, `TRADE` or role names inside the event vocabulary. Those are candidate interpretations layered on top.

---

## 5. Forkable Epistemic Replay — the causal authority

The deterministic simulator should eventually expose an **offline-only** fork authority for science/analytics.

At a frozen tick, clone:

- world/physics state;
- RNG state;
- each player's legal observation history / private recurrent state as required by the experiment;
- genomes / club context;
- round/public state.

Then change **one declared factor** and replay paired branches.

Example for a suspected information-manipulation tactic:

```text
Actual:     A footsteps + shots + token 4 → CT rotates → attackers regroup B
Fork A:     token 4 removed
Fork B:     A gunshot audio masked to selected receivers
Fork C:     visible teammate cue masked
Fork D:     one player's history/memory reset
Fork E:     same attackers, different defending club
```

Measure a downstream effect vector rather than only win/loss:

```text
Δ = [defender displacement,
     teammate convergence,
     time-to-commit,
     site occupancy,
     casualties,
     objective probability,
     future-action distribution, ...]
```

### Epistemic rule

Counterfactual tools may inspect omniscient truth **offline**, but any claim about what a player used must respect that player's legal information path. A branch that gives the live policy extra truth is invalid evidence.

### Product rule

The replay UI should eventually support `actual vs counterfactual` with separate overlays for:

- omniscient spectator truth;
- player-local legal observation;
- player-local memory/belief (debug/science only).

This is stronger than saliency: it asks whether history changes when the purported cause is changed.

---

## 6. Communication is a phenomenon, not a radio channel

Use a continuum:

```text
incidental cue
→ informative signal
→ intentionally produced signal
→ shared convention
→ protocol
→ compositional language (if ever demonstrated)
```

Possible media include radio tokens **and physical actions**: footsteps, gunshots, movement rhythm, peeks, reload/body cues, utility use.

A dedicated radio token can be meaningless noise; a physical gunshot can become a conventional symbol.

### 6.1 Minimum evidence for a causally used signal

For candidate signal `S`:

1. sender's legal/private information predicts production of `S`;
2. receiver behaviour changes after receiving/perceiving `S`, beyond obvious common-cause baselines;
3. masking / shuffling / permutation / timing interventions alter the response;
4. the effect persists across multiple episodes, not one clip.

### 6.2 Intent is a stronger claim

Do not infer "the sender meant to communicate" merely because `S` carries information.

Stronger intent evidence includes behavioural sensitivity such as:

- sender produces `S` less when teammates already possess the relevant information;
- sender produces `S` less when no receiver can perceive it;
- sender pays a cost to produce `S` more often when a receiver lacks useful information;
- counterfactual receiver availability changes sender signalling propensity while the underlying world fact stays fixed.

Until such evidence exists, say `informative/causally used signal`, not `intentional message`.

### 6.3 Dialect vs grounded convention

Later, measure both:

- **team specificity**: A-speaker → B-listener cross-play can fail, showing a private dialect;
- **zero-shot mutual intelligibility**: independently evolved populations can partially understand one another, suggesting signals are grounded in shared perceptual structure rather than purely pair-specific co-adaptation.

Do not make universal intelligibility a requirement; a private dynasty dialect is itself valid evolutionary content.

---

## 7. Lineage is part of the explanation

For every Level-5/6 claim, record a timeline where possible:

```text
Gen 260  absent
Gen 272  sender pattern appears sporadically
Gen 284  production becomes context-linked
Gen 301  receiver adaptation appears
Gen 327  convention stabilizes
Gen 344  convention integrates into a larger team mechanism
Gen 401  opponent counter reduces payoff
Gen 427  semantic/function drift
Gen 512  replacement/extinction
```

Track **functional signatures**, not token IDs or geometric templates alone. The same token can drift in meaning; different surface motifs can converge on the same function.

Interesting lineage events include:

- independent convergent discovery;
- inheritance from a player mutation vs team/coach mutation;
- pair-specific synergy;
- transfer breaking or carrying part of a convention;
- counter-strategy emergence;
- semantic drift / fission / extinction.

---

## 8. Genetic evolution, cultural adaptation and ecology are different axes

The current ROADMAP correctly starts from genotype + opponent ecology. Do **not** silently mix a third mechanism into it.

Long-term distinguish:

- **genetic / inherited structure** — player and team/coach parameters passed through reproduction;
- **cultural / learned structure** — conventions, chemistry or protocol adaptation accumulated through shared experience across matches;
- **ecological selection** — the opponent distribution that determines which inherited/learned structures remain useful.

A future culture/chemistry layer must explicitly define persistence/reset semantics. If recurrent state resets every round/match, do not narrate it as years of shared cultural learning.

Likewise coach philosophy, club culture and five players need not remain one ontological block forever. A coach can leave without magically carrying every club convention; a player can transfer with habits while failing to understand the new club's protocol.

This is a **future research branch**, not permission to bypass E1–E6.

---

## 9. Analytics firewall and Goodhart guard

Discovery is **read-only**.

Do not feed any of these into reproduction or live policy by default:

- novelty score;
- motif ID;
- candidate tactic label;
- discovery confidence;
- style embedding;
- causal-effect embedding.

The discovery system may decide **what humans should inspect**, not **who deserves to reproduce**.

If a future experiment proposes novelty/quality-diversity as a selection pressure, it is a separate explicit research question with its own failure modes and must not be smuggled in as analytics plumbing.

---

## 10. Product surface — Evolution Discovery Feed

The feed should display **evolution events**, not generated stories.

Example lifecycle:

```text
Gen 284 — Signal M17 appears
P3 emits an unusual two-shot acoustic pattern mainly after private B-side contact.

Gen 301 — Receiver adaptation
P5 changes path after perceiving M17; matched common-cause controls do not explain the full effect.

Gen 327 — Convention established
Masking the acoustic pattern removes the receiver response.

Gen 344 — Tactical integration
M17 becomes coupled to A-pressure → regroup-B behaviour.

Gen 401 — Counter-strategy appears
Club 9 stops over-rotating; M17-linked payoff falls against that opponent family.

Gen 427 — Function drift
M17's sender-context / receiver-response signature broadens from B-contact to abort-current-plan.
```

Each card must drill down to:

- replay clips;
- primitive event graph;
- matched statistics / uncertainty;
- interventions and branch outcomes;
- lineage / ecology.

An LLM may summarize the evidence bundle in plain language **after** the bundle exists. It is a narrator, not the detector or causal judge.

---

## 11. Minimal implementation order when G4 eventually opens

Do not start this while ROADMAP is still in A0/A1.

When authorized:

1. shared pure-observational trace schema;
2. multi-timescale candidate segmentation / recurrence mining;
3. readable primitive-event projection;
4. context and response characterization;
5. deterministic offline fork authority;
6. intervention library;
7. lineage / functional-signature tracking;
8. discovery feed + replay drill-down;
9. only then candidate human/LLM naming.

Known CS detectors (trade-like, rotate-like, pressure→switch, etc.) remain useful **yardsticks**, but never define the open discovery space.
