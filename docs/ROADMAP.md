# EvoShooter Arena — Roadmap / Phase Ledger

> 施工 authority。先读 [`VISION.md`](VISION.md) → [`SUBSTRATE.md`](SUBSTRATE.md) → 本文件。
>
> 原则：**一次一根承重杠杆；probe-first；预测先冻结；A/B；不 work 就 revert/reframe。**
> `README.md` 只描述已经 ship 的世界，不提前写未来。

---

## 0. 任务终点

这条 roadmap 不是“把 feature checklist 做完”。最终验收是：

1. 每个玩家只基于自己合法可得的信息行动；
2. 玩家控制身体/枪，而不是选择战术结果；
3. 五个玩家拥有 private memory / belief 和可分化个体身份；
4. 队内可以通过身体 cue + 有限 radio + opening prior 协作；
5. 世界本身支持像职业 CS 那样的信息争夺、双目标转点、人数变化后的再规划；
6. trade / crossfire / lurk / fake / rotate / anchor / secondary calling 等只从录像/metrics 中**事后发现**；
7. 多支队伍能长出不同、互相反制的打法；
8. evolution throughput 仍足够做长期 co-evolution；
9. 所有因果故事有 probe / ablation，而不是看录像脑补。

---

## 1. Phase discipline

每个 phase 必须有：

- **Question**：本 phase 只回答一个承重问题；
- **Baseline**：冻结 old tag/commit + bench + short evolution census；
- **Probe**：在写机制前先有能区分成败的仪器；
- **Intervention**：只改一个机制家族；
- **Hard gates**：determinism / mirror / leak / unit tests；
- **Evolution gate**：至少 short A/B；影响 optimizer/genome 时再 long-run；
- **Watchability gate**：录像/POV 不得更像机器人乱走；
- **Reconcile**：结果与预注册预测对照；
- **Ship or revert**：不过门则回退实现，不软化 VISION；
- **Docs**：ship 后更新 README / CHECKPOINT / 本账本。

任何 agent 不得同时“换 observation + 换 RNN + 拆五个 genome + 加 A/B map”后再用一个胜率解释一切。

---

# Programme A — 先把“谁能知道什么”立住

## Phase A0 — Authority + baseline freeze

**Question**：future agents 是否有唯一、无歧义的方向和当前基线？

### Scope

- `docs/VISION.md`
- `docs/SUBSTRATE.md`
- `docs/ROADMAP.md`
- `CLAUDE.md` / `CHECKPOINT.md` authority pointers
- baseline benchmark / current obs schema snapshot

### Exit

- 所有 agent 入口明确区分：VISION（想要什么）/ SUBSTRATE（正确机制形状）/ ROADMAP（施工）/ README（当前事实）；
- `npm test` baseline 绿；
- `npm run bench` 数字落 LOG；
- 记录 current obs dimension / genome size / default throughput。

**当前状态：docs 已起草；authority 接线与 baseline census 尚待完成。**

---

## Phase A1 — Information provenance + leak probes

**Question**：在不改变 gameplay 的情况下，我们能否证明每一个 obs feature 从哪里来，并抓住 privileged leak？

### Build

先不重写 sensor；新增 observation provenance / debug decomposition：

- self/HUD
- geometry/lidar
- teammate
- enemy
- team-shared memory
- comm

新增 counterfactual tests：

1. 墙后 enemy 移动但 observer 合法感官不变 → obs 应不变（预期当前 FAIL，作为红灯）；
2. teammate private target/intention 改变且外显不变 → observer obs 不变；
3. 背后 geometry 改变 → 当前 360° lidar 会暴露，预期 FAIL；
4. enemy HP 改变但外形不变 → 当前 visible feature 会变，预期 FAIL。

### Exit

- leak matrix 完整；
- 测试能稳定抓住已知 V1–V4；
- 没有修机制，只把病量出来。

---

## Phase A2 — Player-local knowledge：砍掉 team omniscience

**Question**：敌情能否真正属于“看到它的人”，而不是队伍共享数据库？

### Intervention

- `known[team][enemy]` → 暂时过渡为 `known[player][enemy]`；
- 只允许 player 自己 direct vision 更新；
- teammate 不自动继承；
- comm 仍按旧接口保留，先不要同时重做 radio；
- enemy slot 只能来自 own vision / own local memory。

### Probe

- 同 seed 对比：一个 flank scout 看到敌人后，远端 teammate 在未收到合法 signal 时 obs 不变化；
- direct observer 自己仍能在 memory window 内保持 stale contact；
- red/blue mirror 等价。

### Evolution prediction

短期 performance 可能下降；这是允许的。预期：

- spreading 的“免费全队信息收益”下降；
- comm 使用可能上升；
- coordination 暂时变差。

### Exit

- privileged team cache 完全消失；
- leak test 转绿；
- short-run 仍能产生接敌和基本射击，不陷入完全无信息 paralysis。

---

## Phase A3 — Vision v2：从 truth slots 变成诚实 percept

**Question**：能否保持 compute-efficient，又让视觉更像“看见”，而不是读取敌人对象？

### Intervention

- 移除 visible enemy 的 HP、reciprocal exposure、“enemy looking at me”等 truth；
- exact enemy x/z → bearing/range cue + quality；
- hard `viewRange` cliff → 连续 quality 衰减（仍可有物理最大可感知距离，但不可是突兀真值门）；
- 360° lidar → front-biased structured rays/sectors；
- central density > peripheral density；
- deterministic perception noise / quantization。

### Reality anchor

参考 Justesen et al. 的 crosshair-dense / peripheral-sparse raycast 结构，但不照抄 15×15 常数。

### Hard gates

- hidden-state leak green；
- no-back-of-head geometry green；
- deterministic replay green；
- mirror fairness green。

### Evolution gate

- short A/B：first-contact、accuracy、navigation 不得完全崩；
- 远/近 engagement 行为应有可测差异；
- POV debug overlay 能显示“这个 player 实际看到了什么”。

---

## Phase A4 — Hearing v1：footstep + gunshot

**Question**：没有视线时，玩家能否通过真实声音获得模糊但有用的信息？

### Intervention

- directional sectors；
- `footstep`, `gunshot` 两类；
- distance attenuation；
- wall/cover occlusion or low-pass attenuation；
- short recency；
- 不给 identity / exact coordinate。

必须同时引入产生脚步的 movement condition；如果所有移动永远发同样声，silent movement 还没有策略自由度。

### Probes

- same visual obs + sound on/off；
- distance sweep；
- wall occlusion sweep；
- teammate/enemy 声源不携带自动阵营标签。

### Evolution gate

先只问：radio off 时，audio ablation 是否改变 contact/turning behavior；不要急着宣称“听声辨位战术已经出现”。

---

# Programme B — 把身体从“target selector”还原成 FPS 身体

## Phase B1 — Aim control v1：取消 target-slot auto-turn

**Question**：agent 能否靠自己的 look control 把枪口带到可见目标，而不是 world 替它瞄？

### Intervention

- target logits 不再驱动 world 自动朝 enemy/known coordinate 转身；
- look action 直接控制 yaw angular velocity / desired delta；
- trigger 只表示扣扳机；
- shot 只在当前枪口方向与目标几何关系满足时可能命中。

可以临时保留 target slots 仅作 debug/attention readout，但**不能影响物理**；最终删除。

### Probe

- 静止 dummy：不同初始偏角下 acquisition time；
- peripheral target 必须经历 turn 才能精确开火；
- hidden memory contact 不能被自动 aim。

### Risk

这是第一个可能显著提高 search difficulty 的 phase。若 evolution 完全学不会瞄准，优先调整动作参数化/训练 curriculum，不恢复 truth auto-aim。

---

## Phase B2 — Gun execution：把“远距离难打”从魔法概率搬到执行链

**Question**：看不清/移动/转枪/连续射击的代价，是否通过身体与枪械链产生，而不是一条 distance multiplier？

### Intervention（逐切片，不一次全做）

B2a. movement/settle 与 aim error 对接；

B2b. recoil/spread temporal state；

B2c. target angular size / percept quality 影响 aim estimate，而非直接知道真值后降 hit prob；

B2d. 评估是否需要 projectile，若概率模型已能诚实表达则不为“更真实”盲目加成本。

### Exit

- close/far accuracy 曲线由可解释链产生；
- moving vs stopped shooting 有明显差异；
- no hidden target truth used in aim execution。

---

## Phase B3 — Movement repertoire：silent walk / crouch 等一次一个

**Question**：职业 FPS 的信息博弈需要哪些缺失身体自由度？

顺序建议：

1. walk / silent movement（直接与 A4 音频闭环）；
2. acceleration/stop accuracy calibration；
3. crouch；
4. jump/landing only if map geometry gives it real use。

每个动作必须证明“新增收益面”，不能只因为 CS2 有这个键就复制。

---

# Programme C — 让世界本身支持职业战术，而不是只会抢一个圈

## Phase C1 — Tactical objective topology：从单中央区到双目标世界

**Question**：世界是否存在真正的“去哪边、什么时候转、是否留人、是否骗 rotate”的战略选择？

当前单一 central KOTH zone **结构上无法**产生 A/B fake/rotate/anchor 博弈。

### Target shape

设计一个 180°/side-fair 的 tactical round world，至少包含：

- 两个可赢的 strategic sites / objectives；
- 多条带 choke / connector / flank possibility 的路径；
- attackers/defenders 有不同目标压力；
- objective action 有时间成本和可中断性；
- elimination 仍是合法胜法，但不能永远支配 objective play。

最接近职业 CS 的终局是 bomb plant/defuse，但 C1 先研究**最小可证明双目标博弈**，不要一口气抄经济/utility/全武器。

### Probe before map build

先定义指标：

- site commitment time；
- first pressure side；
- side-switch / rotate frequency；
- defender rotation latency；
- split width；
- post-objective retake paths；
- spawn→site visibility；
- route dominance / choke entropy。

### Exit

scripted/reference agents 能证明：

- 直接打 A、直接打 B 都可行；
- 给 A 压力后去 B 在某些 defender response 下有收益；
- defender 过早 rotate 会留下可利用空间；
- map 不存在单一路径支配所有策略。

**注意：reference bot 只验证世界是否允许，不进入 evolving population。**

---

## Phase C2 — Round state / kill feed / objective public info

**Question**：人数变化、目标状态和时间压力能否成为所有玩家合法公共信息并推动再规划？

### Build

- explicit round lifecycle；
- kill feed without death coordinate；
- objective planted/active/defused public state；
- timer / alive count；
- dead-player behavior/spectator 不得继续给活人 radio truth（规则需明确）。

### Probe

人数/时间/目标状态变化时，只有 legal HUD fields 改变；enemy hidden truth 不泄漏。

---

# Programme D — 给每个人自己的脑和有限语言

## Phase D1 — Private recurrent memory

**Question**：player 能否自己记住过去，而不是 world 替他记 exact contact？

### Migration

- explicit local stale-contact cache 先保留作为 baseline；
- 引入 small recurrent state（GRU/LSTM candidate）；
- same observation sequence → deterministic hidden state；
- 逐步移除 hand-maintained contact memory，确认 RNN 真能利用 history。

### Probes

- delayed-contact task；
- occlusion reappearance prediction；
- audio→turn delay task；
- reset hidden state ablation。

### Evolution gate

必须跑 optimizer sensitivity：genome size / mutation sigma / inheritance stability。CHECKPOINT 已有突变尺度塌缩前科，不能默认旧 σ 仍合适。

---

## Phase D2 — Radio v2：有限、可涌现的语言

**Question**：队友是否真的会选择“什么值得说”？

### Intervention

- comm update rate 降低；
- finite/quantized token capacity；
- fixed transmission delay；
- silence is a choice；
- no semantics hard-coded。

### Required analyses

- entropy；
- MI with percept/events；
- radio-off ablation；
- message-shuffle ablation；
- team-crossplay：把 A 队 speaker 配 B 队 listener，看语言是否 team-specific；
- long-run 是否出现稳定 token usage。

### Non-claim

“token 3 常在见敌时出现”不等于已经证明 token 3 = enemy。需要 intervention/ablation。

---

## Phase D3 — Visible teammate body language

**Question**：近距离协作能否不经过 radio，仅靠队友动作 cue 出现？

### Build

vision channel 对 teammate 提供合法外显 cue：

- facing / gun direction；
- velocity / accel；
- firing；
- reload；
- stance。

### Probe

- teammate cue masked vs unmasked；
- same radio but different body motion；
- pair timing / trade-window / synchronized peek-like event changes。

这一步不写任何 `trade` logic。

---

# Programme E — 五个真正不同的人 + 一支真正的队

## Phase E1 — Player identity split

**Question**：当前 shared network 的 slot 分化，和真正 individual parameters 有什么区别？

### Minimal migration

不要立刻五套完整大网。

候选：

- shared backbone + player-specific low-rank/head parameters；
- shared team genome + per-player compact bias vector；
- per-player sensory/mechanical traits。

先用最小 parameter budget 证明：

- stable individual behavior differences 可遗传；
- swap player identities 会改变局部打法；
- team performance 仍可共同选择。

### Exit

analytics 能从行为识别同一队不同 player，而不是只靠 slot id。

---

## Phase E2 — Team DNA / opening prior

**Question**：队伍能否在回合开始拥有共同战略 prior，但仍由每个玩家临场执行？

### Build

- team-level genotype / context generator；
- round-start `openingPrior`；
- every player receives same prior + own state；
- prior 不能包含 waypoint/timed action script。

### Probe

- 固定 player genomes，仅改变 team prior/genome → 全队 opening shape/tempo 应系统变化；
- mid-round 信息足够强时，player 可以偏离 opening prior；
- prior ablation 后 coordination/style 可测变化。

### Emergence target

录像中可能出现类似：

- default-heavy；
- fast pressure；
- split；
- fake/re-hit；
- passive information denial。

这些只由 detector/人类命名。

---

## Phase E3 — Secondary calling / local initiative as emergent structure

**Question**：是否会出现某个 player 的 radio/action 对队伍后续动作具有更高 causal influence？

**不新增 caller role。**

只做 analytics：

- message→teammate action lead-lag；
- information centrality；
- conditional influence；
- who speaks before team-wide direction changes。

如果长期出现稳定“第二声音”，把它作为进化结果展示。

---

# Programme F — 职业 CS 的更厚世界（后续，不阻塞核心底座）

只有 A–E 稳定后再做。每项单独 phase。

## F1 — Utility substrate

smoke / flash / incendiary-like mechanics 的价值是改变：

- visibility；
- space access；
- timing；
- sound/information；
- angle advantage。

不要写“execute utility combo”；给物理工具，让 combo 自己长。

## F2 — Weapon diversity

不同武器提供 accuracy / mobility / range / fire-rate / ammo / economy trade-off。

必须有 budget，避免所有人永远拿单一 dominant weapon。

## F3 — Multi-round economy

职业 CS 的 save/force/buy 风格只有跨回合资源约束下才有意义。

引入前先有：

- round-series lifecycle；
- persistent credits/resources；
- purchase opportunity cost；
- long-horizon team fitness。

**绝不能直接加 `SAVE` action。**

## F4 — Dead-player / coaching rules

明确死亡后：

- 是否完全失去对活人的通信；
- spectator 信息不得回流；
- coach 若存在，只在现实允许的节拍点输出 prior/advice，不逐 tick commander。

---

# Programme G — 让进化“看得见”

## G1 — Information-flow debug

POV overlay：

- actual vision contacts；
- heard sectors；
- radio inbox/outbox；
- memory confidence（debug only）；
- 与 omniscient spectator truth 可切换对照。

## G2 — Read-only tactic detectors

逐个建立 detector + precision sanity check：

- trade-like event；
- crossfire geometry；
- pressure→switch；
- rotate；
- isolated/lurk-like path；
- clutch/man-disadvantage tempo；
- pair coordination。

detector 结果禁止进入 live sim。

## G3 — Style space / lineage

展示：

- generation style embedding；
- team clusters；
- player identity cards；
- pair chemistry；
- champion-vs-history matrix；
- communication vocabulary evolution；
- tactic frequency over generations。

目标是用户能够**肉眼看见“这队学会了什么”**。

---

# 2. Cross-cutting gates

任何 phase ship 前默认跑：

```text
npm test
npm run bench
short headless evolution A/B (same seeds)
```

影响 genome / optimizer / recurrent state：

- 至少 2 seeds；
- inheritance / mutation sensitivity；
- champion-vs-gen0 / past-self；
- population mean 不得只靠单个 lucky champion。

影响 rendering：

- 按 CHECKPOINT 的真实页面验证流程；
- first-person + director 至少各看一次；
- debug overlay 不能污染默认画面。

影响 information boundary：

- counterfactual leak suite 必须全绿。

影响 map/objective：

- colour/side fairness；
- route accessibility；
- spawn sightline；
- scripted competence reference probes。

---

# 3. Future-agent operating instructions

拿到 repo 后：

1. 读 `CHECKPOINT.md`；
2. 读 `docs/VISION.md`；
3. 读 `docs/SUBSTRATE.md`；
4. 来本文件找 **Current Cursor**；
5. 只细拆当前 phase；
6. 先写 probe / prediction，再改机制；
7. 满足 exit 后更新 cursor；
8. 已关闭 phase 默认冻结，新证据只 reopen 受影响的依赖链。

如果某个 phase 发现底层假设错误：

- 在 LOG 记 evidence；
- 更新 SUBSTRATE/ROADMAP 的受影响部分；
- 不为了已经写的代码降低 exit。

---

# 4. Current Cursor

**当前：A0 — Authority + baseline freeze。**

A0 下一最小可关闭单元：

1. 把 `CLAUDE.md` / `CHECKPOINT.md` 指向 VISION → SUBSTRATE → ROADMAP；
2. baseline `npm test`；
3. baseline `npm run bench`；
4. 记录当前 `obsDim`、network parameter count、ms/match；
5. LOG 一条 `#decision #measure`；
6. A0 close 后进入 **A1 — Information provenance + leak probes**。

不要直接跳 A2 改 observation；A1 的红灯 leak probes 是后续每刀的验收尺。
