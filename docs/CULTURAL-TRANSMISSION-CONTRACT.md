# EvoShooter — Cultural Transmission Contract

> Status: **future-facing, binding design contract for a later E7 cultural-learning programme**. It defines ontology, anti-cheating boundaries and evidence requirements. It does **not** authorize any current cross-match learned state and does **not** change the ROADMAP current cursor.
>
> Read together with `VISION.md`, `SUBSTRATE.md`, `EVOLUTION-ECOLOGY-CONTRACT.md` and `DISCOVERY-EXPLAINABILITY-CONTRACT.md`.

---

## 0. North star

EvoShooter may eventually contain both inherited adaptation and socially learned adaptation, but they are not the same process.

The clean relationship is:

```text
genetic inheritance + cultural transmission
                  │
                  ▼
          ecological selection
                  │
                  ▼
               evolution
```

**Ecology is a selector, not a third inheritance channel.**

The long-term goal is not to hard-code a `ClubCultureVector` containing tactics. It is to create a world where conventions can be invented by agents, learned by other agents through legal interaction, outlive their original inventor, travel or fail to travel with people, drift in meaning, and be selected by the opponent ecology.

Two binding clarifications:

1. **Cultural independence does not require a culture object detached from all carriers.** A convention may live distributively across player/coach acquired states plus observable history. What matters is an independent causal transmission path, not a special `CultureGenome` data structure.
2. **The strongest persistence test is serial carrier turnover, not magical persistence after instantaneous total replacement.** Culture may require continuity of carriers while still surviving 100% turnover of the original carriers over time.

---

## 1. Four state categories must remain distinct

### 1.1 Genotype — inherited before experience

Examples:

- player policy parameters / compact player block;
- execution / perception traits;
- risk / communication / learning biases;
- team / coach inherited prior parameters.

Transmission mechanism:

```text
reproduction / mutation / recombination
```

A mature convention such as “token 6 means B pressure” should **not** normally be encoded directly as an inherited semantic truth.

### 1.2 Episodic private memory — what D1 is for

Examples:

- last seen / last heard contact;
- current-round belief;
- current-match recurrent hidden state;
- recent teammate actions.

This state exists to solve partial observability.

**It is not culture merely because it is recurrent.**

For the core A–E migration, reset scope must be explicit and conservative. D1 must not silently become a cross-match learning channel.

### 1.3 Acquired individual state — future only

A later player may retain learned mappings across repeated shared experience, for example:

- how this club tends to use a radio symbol;
- how a particular teammate's body cue predicts their next move;
- adaptation to a club's tempo / opening conventions;
- learned trust or response calibration.

This state belongs to the player who learned it. It is not a shared truth bus.

### 1.4 Institutional / cultural continuity — future only

A club may exhibit conventions that persist beyond a single round, match or individual member.

But “club culture” is first an **emergent population-level fact**, not necessarily a single writable simulator variable.

A preferred mature implementation is that compatible learned conventions live across multiple players / coaches and are reproduced socially through interaction. If a future institutional carrier exists — training demonstrations, review, briefing, public symbols — it must act through legal learning experiences, not directly reveal hidden semantics or teammate intent.

A culture can therefore be **distributed**:

```text
P1 acquired state
P2 acquired state
P3 acquired state
P4 acquired state
P5 acquired state
+ lawful shared interaction/history
→ population-level convention
```

There need not be any simulator field called `clubCulture` for the culture to be real.

---

## 2. The hard distinction: learning is not transmission

A player learning something alone does not prove culture.

Examples:

- P3 learns that `token 6` predicts B contact → **individual adaptation**.
- P3 and P4 both independently correlate `token 6` with B contact because the world causes it → possibly common learning, still not necessarily cultural transmission.
- P3 begins using a signal; P4 changes behaviour because of P3; later a newcomer learns the same convention through team interaction → **cultural transmission candidate**.

The key test is not “do several agents know the same thing?” but:

> **Can information / convention move socially from agents who already possess it to agents who did not, without changing the recipient's inherited genotype and without a world-level semantic copy operation?**

This is the independence criterion. Culture does not have to survive with zero carrier continuity; it has to propagate **without genetic reproduction being the propagation mechanism**.

---

## 3. Culture must not become telepathy

Forbidden shortcuts include:

```ts
newPlayer.protocol = club.protocol;
player.knowsTokenMeaning = club.tokenMeaning;
if (chemistry > .8) reveal(teammateIntent);
```

Also forbidden in spirit:

- a hidden `ClubCultureVector` directly appended to every player's observation if it contains learned semantics;
- copying another player's recurrent state;
- instantly teaching a transferred player the new club's code by assignment;
- using analytics labels (`FAKE`, `ROTATE`, `B_CONTACT`) as cultural training targets in the live world.

Culture may improve **inference and expectations**. It never improves information permissions.

A future explicit institutional carrier is allowed only if it behaves like a lawful medium — demonstrations, recordings, shared symbols, coaching interactions — that agents must interpret/learn from. It must not be a semantic oracle.

---

## 4. What genes should encode

The strongest long-term design is:

> **Genes encode capacities and learning biases; culture supplies the locally learned content.**

Plausible inherited dimensions may affect:

- speed / stability of cue→response learning;
- tendency to emit costly signals;
- reliance on radio vs visible body cues;
- willingness to update teammate models;
- forgetting / plasticity trade-offs;
- sensitivity to opening priors;
- mechanical / perceptual ability.

Avoid direct inherited semantics such as:

```text
token6Meaning = B
```

unless a later experiment explicitly studies genetically canalized semantics as a separate phenomenon.

---

## 5. Coach, player, club and culture are not the same object

Mature conceptual ontology:

```text
Club
├─ inherited club/team block
├─ institutional history / lawful cultural carriers   # optional future substrate
├─ Coach
│  ├─ inherited philosophy / learning biases
│  └─ acquired experience
├─ Player 1
│  ├─ genotype
│  └─ acquired state
├─ Player 2 ... Player 5
└─ pair / group shared-history relationships          # derived or learned, never telepathy
```

Important consequences:

- a coach change must not automatically erase all club conventions;
- a coach leaving may carry their own philosophy / acquired habits, but not an omniscient copy of the whole club;
- a player transfer may carry personal learned habits and dialect, but the new club does not instantly understand them;
- a convention that truly belongs to the club may survive its original inventor leaving;
- “chemistry” should describe a learned relationship / measurable coordination effect, not an information privilege.

---

## 6. Minimum evidence ladder for claiming culture

### Level C0 — recurrent memory

An agent remembers something across a short horizon.

Claim allowed: `memory is being used`.

Not culture.

### Level C1 — acquired convention candidate

With genotype frozen, repeated shared experience changes an agent's stable signal/action interpretation.

Claim allowed: `learned adaptation` / `convention candidate`.

### Level C2 — newcomer uptake

A naive newcomer with no prior exposure joins agents already using the convention and, through legal shared experience, learns to participate without genotype change.

Claim allowed: `social transmission candidate`.

### Level C3 — serial carrier turnover persistence

Do **not** stop at “remove the original inventor once”. Repeatedly replace carriers while preserving only lawful social continuity:

```text
original carriers: P1 P2 P3 P4 P5
replace P1 → newcomer N1 learns from P2-P5
replace P2 → newcomer N2 learns from N1/P3-P5
...
replace P5 → none of P1-P5 remain
```

The strong criterion is:

```text
original-carrier turnover = 100%
AND convention remains functionally recognizable
AND transmission occurred without genotype copying or semantic assignment
```

Culture is allowed to require **carrier continuity** during the replacement chain. It does not need to survive an instantaneous wipe where every knowledgeable carrier and every lawful external record disappears at once.

Claim allowed: **persistent cultural lineage / club culture**.

A useful conceptual inequality is:

```text
cultural lineage lifetime > lifetime/membership of every original carrier
```

### Level C4 — mobility / diffusion

A carrier transfers clubs. Measure whether the convention:

- dies with the old club;
- stays in the old club;
- travels with the individual;
- is rejected by the new club;
- diffuses into the new club;
- hybridizes or changes meaning.

Claim allowed: cultural diffusion / assimilation / semantic drift, depending on evidence.

### Level C5 — population cultural ecology

Multiple conventions spread, compete, counter one another, converge independently or go extinct under opponent / roster / coach pressure.

Claim allowed: cultural evolution.

---

## 7. The first real cultural experiment — fixed genome, no excuses

The first E7 experiment should deliberately avoid simultaneous genetic evolution.

### Stage A — freeze inheritance

- freeze all player / team / coach genomes;
- keep the lawful game, sensors, body, radio and learning mechanism active;
- run repeated matches / sessions with the same social group.

Question:

> Can a stable convention appear while genotype is bit-identical?

If no, do not narrate culture.

### Stage B — newcomer test

- replace one member with a naive player whose acquired state is reset;
- do not copy protocol state;
- preserve incumbents' acquired states according to the declared persistence law.

Question:

> Does the newcomer learn the convention through legal interaction?

### Stage C — serial replacement / 100% original-carrier turnover

- identify a stable convention by functional signature;
- replace one knowledgeable carrier at a time with a naive newcomer;
- require each newcomer to acquire the convention only through lawful interaction with current carriers / lawful external cultural media;
- continue until **all original carriers have left**;
- verify the convention remains functionally recognizable and transmissible.

This is stronger and cleaner than a one-shot founder-removal test.

Do **not** require culture to survive an instantaneous total wipe with no knowledgeable carrier and no lawful external record. That tests institutional storage under zero continuity, not cultural independence from genes.

---

## 8. Genetic vs cultural transplant factorial

Once E7 is mature enough, separate inherited predisposition from acquired convention with a factorial such as:

```text
A genotype + A acquired culture
A genotype + acquired-state reset
foreign genotype + exposure to A incumbents/culture
foreign genotype + no A exposure
```

Interpretation examples:

- `A genotype + reset` rapidly re-discovers the convention → strong inherited learning bias / canalization candidate;
- foreign genotype learns after exposure → social transmission evidence;
- transferred A player retains behaviour but nobody else adopts it → individual carryover, not yet club culture;
- club convention survives complete **original-carrier** turnover through lawful serial teaching / institutional carriers → strong cultural continuity evidence.

Do not collapse these into one “culture score”.

---

## 9. Communication-specific cultural tests

A mature radio / physical-signal convention should be examined through:

- sender private-state → signal relation;
- signal → receiver causal response;
- message shuffle / mute / substitution;
- novice vs incumbent comprehension;
- team-crossplay / zero-shot comprehension;
- transfer adaptation time;
- functional-semantic drift over time.

A token ID is not a meaning. Track semantic lineage by **functional signature**:

```text
sender contexts
+ receiver causal responses
+ downstream world effects
```

not merely by `token == 6`.

A club-specific dialect and a league-wide grounded convention are both valid outcomes. Cross-club intelligibility is a measurement, not a required optimization target.

---

## 10. Physical actions may become cultural signals

The cultural channel is not restricted to radio.

A physical action can be co-opted into a socially learned signal:

- deliberate gunshot rhythm;
- movement rhythm;
- visible stop / peek pattern;
- stance / orientation sequence;
- utility use, once utility exists.

Evidence must separate:

1. incidental cue — action naturally leaks information;
2. informative signal — signal correlates with sender state;
3. receiver use — receiver behaviour changes causally;
4. conventionalized signal — repeated group-specific use / learning;
5. intentional signalling candidate — sender produces it more when an uninformed receiver can benefit and less when communication is unnecessary / impossible.

Do not infer intent from effect alone.

---

## 11. Persistence scopes must be explicit

Every learned state introduced under E7 must declare its reset/persistence scope:

```text
tick
round
match
session
season / generation
player lifetime
club membership
```

And answer:

- who owns it?
- who can read it?
- how is it updated?
- when is it reset?
- what travels on transfer?
- what remains with the club?
- can descendants inherit it genetically? default: NO unless explicitly studying that question.

No implicit persistence through save files, static module state or trainer convenience.

---

## 12. Relationship to D1 and E1–E6

### D1 private recurrent memory

D1 solves POMDP history. It must **not** silently satisfy this contract.

Default rule until E7 explicitly opens:

> **D1 learned/recurrent state is scoped only to the declared round/match horizon and is reset according to that phase's contract. No cross-match cultural persistence is implied.**

### E1–E4 identities / club genotype

These build inherited individuals and clubs. Stable behavioural difference may be genetic; do not call it learned culture without fixed-genome evidence.

### E5–E6 league / opponent ecology

These establish selection pressure. They may select inherited styles, but **cultural transmission remains dormant** until E7.

This separation is intentional: first make genotype and ecology measurable, then add a second inheritance channel.

---

## 13. Reserved future ROADMAP shape — E7

When E6 is stable and explicitly closed, E7 may be instantiated as separate slices:

### E7a — Acquired-state seam

Add the smallest cross-match player-owned learned state with explicit persistence/reset rules. No social claim yet.

### E7b — Fixed-genome convention formation

Freeze genomes and test whether repeated shared experience creates stable learned coordination.

### E7c — Newcomer + serial-replacement transmission

Run the culture proof from §7 through **100% original-carrier turnover**.

### E7d — Transfer / coach separation

Introduce controlled mobility experiments to distinguish player carryover, coach philosophy and club persistence.

### E7e — Cultural lineage + ecology

Track convention birth, diffusion, drift, counter-adaptation and extinction under the league ecology.

Each slice remains one lever at a time. Do not combine E7a with transfer, coach mobility and new communication mechanics in one experiment.

---

## 14. Product / discovery surface

If cultural evolution eventually exists, the spectator should be able to watch a history such as:

```text
Gen 120 — Signal C17 first appears in Club A
Gen 134 — newcomer P5 begins responding to C17
Gen 146 — original carrier leaves; C17 persists
Gen 171 — second-generation newcomer teaches a later newcomer
Gen 190 — all original carriers are gone; C17 lineage persists
Gen 205 — P3-descendant carrier transfers to Club B; B initially ignores C17
Gen 224 — B adopts a modified C17b meaning
Gen 241 — defenders adapt; C17 payoff falls
Gen 263 — C22 replaces C17 in Club A
```

Every event must drill down to legal observation, causal interventions, acquired-state provenance and lineage evidence.

The interesting object is not only “a tactic was learned”, but **how a convention was born, taught, carried, transformed, selected and forgotten**.

---

## 15. Current implementation ruling

As of the creation of this contract:

- **nothing in the current A–E migration is authorized to implement cultural persistence unless E7 is explicitly opened**;
- no current recurrent hidden state should be re-described as culture;
- E1–E6 remain the prerequisite architecture/ecology path;
- cultural independence means an independent **social causal transmission path**, not a mandatory `ClubCultureVector`;
- future cultural proof should target **serial social transmission through 100% original-carrier turnover**, not an unrealistic instantaneous wipe test;
- this file reserves the design boundary now so future implementation does not accidentally conflate genotype, memory, culture and ecology.

**Now: define the door. Later: walk through it.**
