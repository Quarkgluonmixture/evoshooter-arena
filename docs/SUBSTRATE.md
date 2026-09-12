# EvoShooter Arena — 底座合同 (SUBSTRATE CONTRACT)

> 这份文档把 [`VISION.md`](VISION.md) 翻译成**工程边界**：哪些信息允许进入 policy、哪些动作属于身体原语、
> 哪些状态必须 private、player/team/coaching 层和进化生态应该长什么样，以及当前实现与目标之间差在哪。
>
> 它不是“最终类图”，而是防止 future agent 走回捷径的 contract。

---

## 0. 总体模型

目标世界是一个 **Dec-POMDP-like tactical shooter + club league ecology**：五个独立执行的玩家只能基于自己的局部观测、记忆、
共同 prior 和有限通信行动；engine truth 只服务物理、裁判、debug 和 metrics；club 的长期能力由面对**对手分布**后的比赛结果筛选。

```text
                         ENGINE TRUTH
          (geometry / all actors / bullets / score / events)
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
      Physics / referee                     Sensor projection
          │                                       │
          │                         ┌───────────────┼───────────────┐
          │                         ↓               ↓               ↓
          │                       vision          audio          legal HUD
          │                         └───────────────┼───────────────┘
          │                                         ↓
          │                               player-local observation
          │                                         ↓
          │                           private recurrent belief/state
          │                                         ↓
          │              shared opening prior + received radio messages
          │                                         ↓
          │                                      POLICY
          │                                         ↓
          └────────── body / aim / trigger / reload / gait / stance / radio

       CLUB = team/coach DNA + five player DNA/state blocks
                              │
                              ↓
                  League opponent distribution
          peers + diverse contemporaries + history + exploiters
                              │
                              ↓
                    results-dominant selection
```

**唯一允许跨玩家共享的东西必须有现实中的传播机制：HUD、视野、声音、radio、公开事件。**

**唯一允许定义长期“强不强”的东西必须经过足够覆盖策略空间的比赛，而不是只克一个熟悉对手。**

---

## 1. 当前实现：哪些地方是 useful baseline，哪些是 target violation

当前版本有值得保留的基础：

- deterministic fixed-step sim；
- red/blue team-frame mirror；
- simultaneous combat resolution；
- LOS / body exposure / low-vs-tall cover；
- movement + turning + ammo + reload + aim settle；
- zero-sum co-evolution + hall of fame；
- replayable events / viewer / metrics；
- shared-network baseline 足以证明 co-evolution 能工作。

但以下是目标底座的承重级 gap：

### V1 — Team omniscience leak

当前：任一 teammate 看见 enemy，`known[team][enemy]` 立即更新 exact `(x,z,t)`，其他所有 teammate 可读。

目标：取消 exact shared memory。队友看到什么，先属于**那个观察者**；只有合法 HUD/radio 才能传播。

### V2 — Enemy truth features

当前可见 enemy slot 包含：

- exact relative x/z；
- exact distance；
- exposure；
- enemy→self exposure；
- “is enemy looking at me”；
- enemy HP。

其中多个是 engine truth，不是 human percept。

目标：用 perception-derived contact features 取代 truth features。

### V3 — Hard view cutoff + 360° lidar

当前：`viewRange` 外直接不存在；8-ray lidar 全向知道墙距。

目标：forward/peripheral structured vision，质量连续退化；背后几何不能无条件读取。

### V4 — Target-slot auto-aim abstraction

当前：policy 选 enemy slot，world 会朝该 enemy 的真值/last-known position 自动转头。

目标：policy 控制 view/aim；是否把枪口带到敌人身上是执行结果。

⚠ **拆这个抽象时连带要重做转头手感**：当前 `turnRate`（交战 2π rad/s）与 `scanTurnRate`（扫视 2.6 rad/s）
两档是**按 `targetId >= 0` 切换**的，look 动作的 0.45 s 低通也建立在“动作是绝对方向向量”这个参数化上
（§5.1 的目标动作是 `lookYawDelta`）。V4 之后没有“是否交战”这个位，这两条会**静默失效**——不报错，
只会退回每 tick 抽搐或变得过钝。正确落点是角速度限幅 + 感知/执行误差，**重新推导，不要照搬常数**。
（来历与实测：LOG 2026-09-11 21:30，`GOTCHAS.md` #10。）

### V5 — No real hearing

当前枪声主要是 viewer event，不是 agent observation；脚步也不是感知通道。

目标：directional audio channel。

### V6 — No private temporal belief

当前 brain 是 feed-forward MLP；3 秒 enemy memory 由 world 代管且 team-shared。

目标：memory belongs to the player brain / local percept stack。

### V7 — One brain wearing five bodies

当前每队 shared MLP + slot one-hot。

目标终局：team prior / coach DNA 与 player-specific parameters/state 分层，让五个人有真正个体身份。

### V8 — Unlimited-like continuous comm

当前每 tick 2 个 float broadcast，足以潜在编码高精度 state bus。

目标：有限频率、有限容量、可量化、可延迟的 emergent radio。

### V9 — Red / Blue are currently populations, not just match sides

当前训练器维护两个永久 population：red 与 blue 各自繁殖，只和对面当前/历史 population 竞争。

目标终局：red/blue 退化为**比赛 sides**；遗传与选择单位变成 club，club 在 league opponent ecology 里跨风格、跨历史、跨 sides 竞争。

当前双 population 是 bootstrap，不是最终世界本体。

### V10 — Emergence is measured, but not yet discoverable/explainable as a first-class product

当前有行为 metrics、heat、ladder，但还不能系统回答：

- 一个新行为何时出生？
- 它是不是稳定传播？
- 人类给它的解释是否有因果证据？
- 一个 radio token 到底只是相关，还是实际改变了队友决策？

目标：analytics 层建立 discovery → interpretation → intervention 的证据链，而且永不回流 live policy。

### V11 — Far-teammate body-action truth

（A1 probe 实测新增，2026-09-11）当前 teammate slot 的 `firing` 位**不做任何 visibility 判定**：队友在 30 m 外、
隔着墙开火，我的 observation 一样会亮。§6.2 规定不在视野内时不得继续获得 teammate body-action truth ⇒
`mate*.firing` 必须降级成「只在合法视觉里可见的 cue」，或改由 radio / 声音承载。
探针：`A1-P10`（`src/probe/leak.ts`）+ `A1-P22`（正向护栏：眼前的队友开火仍要看得见）。
**已关闭（2026-09-12）**：`firing` 只在合法视觉里给。

### V12 — Objective HUD counts invisible bodies

（A1 probe 实测新增，2026-09-11）`obj.enemyInZone` 直接数**站在区里的敌人个数**，与谁看见过无关：
一个全程没人看见的敌人走进控制区，我的 obs 立刻变化，等于一条免费的 occupancy radar。
目标：objective HUD 只能给合法的比分 / 占领**状态**，不能给未被观测的敌方人数。
探针：`A1-P11`。
**已关闭（2026-09-12）**：字段删除；合法替代 = `self.scoreDiff`（延迟聚合的比分，不是实时敌情）。

---

## 2. World / physics contract

World 可以知道一切，但 **policy 不可以**。

### 2.1 World truth 可包含

- all actor positions/velocities/yaw/body state；
- HP/ammo；
- geometry and LOS；
- bullet/shot resolution；
- objective / round timer；
- world events；
- full truth required by metrics/replay。

### 2.2 World truth 的合法消费者

允许：

- physics；
- referee/scoring；
- sensor projector；
- deterministic replay；
- debug tools；
- offline metrics / style detection / discovery analytics。

禁止：

- policy 直接读取；
- teammate-shared cache 直接读取；
- “为了训练方便”把 truth 塞回 obs。

---

## 3. Player-local perception contract

Observation 必须按 channel 组织，而不是继续堆一个没人能解释的 flat feature soup。

工程上最终仍可 flatten 给 network，但定义层面必须保持 provenance。

建议逻辑结构：

```ts
interface PlayerObservation {
  self: SelfHud;
  objective: ObjectiveHud;
  vision: VisionFrame;
  audio: AudioFrame;
  publicEvents: PublicEventFrame;
  teammateHud: TeammateHud[];
  radio: RadioInbox;
}
```

### 3.1 Self / HUD

可精确：

- own hp；
- own ammo；
- reload/cooldown/stance/gait state；
- own velocity / body orientation（proprioception）；
- round time；
- team/enemy alive count；
- score/objective legal state。

### 3.2 Teammate HUD

先采用可校准的 CS-like 简化：

- teammate alive/dead；
- teammate coarse/exact map position（是否 exact 由对应 phase 决定，但必须是明确 HUD affordance）；
- teammate HP if legal by chosen ruleset。

**HUD teammate info 与“亲眼看见 teammate body”分开。**

只有 vision 才能给：

- teammate facing；
- movement/firing/reload/stance 外显 cue。

### 3.3 Vision frame

视觉 contact 不应返回 enemy object truth，而应返回 observer-relative percept。

候选 contact schema：

```ts
interface VisualContact {
  class: 'enemy' | 'teammate' | 'geometry' | 'objective';
  bearing: number;
  elevation?: number;
  rangeCue: number;
  quality: number;
  motionCue?: number;
  bodyVisibility?: number;
}
```

关键要求：

- quality 由 eccentricity × distance × visible fraction × environment 产生；
- far/peripheral contact 可以存在但更粗；
- noise 必须 deterministic；
- hidden truth change 不得改变 observation；
- enemy HP 不属于 visual contact。

### 3.4 Geometry perception

短期建议从现有 lidar 迁成 front-biased rays / sectors：

- crosshair 周围密；
- peripheral 稀；
- 不提供背后 360° 墙距；
- ray class 可以识别 geometry / teammate / enemy，但只在合法 FOV/LOS 内。

不必立即做像素输入。structured raycast sensor 是现实可行的中间层；本项目重点是**信息诚实**而非 pixel realism。

### 3.5 Audio frame

逻辑形态：

```ts
type SoundClass = 'footstep' | 'gunshot' | 'landing' | 'reload' | 'objective' | 'utility';

interface AudioSector {
  direction: number;
  loudness: Partial<Record<SoundClass, number>>;
  recency: Partial<Record<SoundClass, number>>;
}
```

第一期最小集：`footstep + gunshot`。

要求：

- 方向 coarse；
- 距离以 loudness/range cue 表现；
- occlusion/attenuation；
- 不附 enemy id；
- teammate 自己产生的声音也遵循同一物理，policy 需结合其他信息推断敌我。

### 3.6 Public events

例如 kill feed：

```ts
{ type: 'kill', killerSlot, victimSlot, timestamp }
```

不要附死亡位置，除非观察者通过别的 channel 合法知道。

---

## 4. Private belief / memory contract

### 4.1 归属

`belief_i(t)` 属于 player i，不属于 team/world。

它只能由：

- player i 的历史 observation；
- received radio；
- opening prior；
- player i 自己历史 action/internal state

更新。

### 4.2 不允许 world 代替推理

禁止恢复类似：

```ts
known[team][enemy] = exactEnemyPosition
```

如果工程过渡期需要 explicit local memory，也必须是：

```ts
known[player][contact] = perceptualEstimate + uncertainty + age
```

且来源只能是这个 player 合法接收到的 channel。

### 4.3 最终 brain

目标接口：

```text
obs_t + memory_{t-1} + openingPrior + radioInbox
                  ↓
             player policy
                  ↓
action_t + radioOut + memory_t
```

具体采用 GRU/LSTM/other recurrent module 由 roadmap 实验决定。

---

## 5. Body / action contract

### 5.1 Minimal continuous primitives

目标最小动作族：

```ts
interface PlayerAction {
  moveX: number;
  moveZ: number;
  moveGait?: number;      // physical speed/gait intent, not a tactic label
  lookYawDelta: number;   // or desired angular velocity
  lookPitchDelta?: number;
  trigger: number;
  reload: number;
  stance?: number;
  radio: RadioSymbol;
}
```

注意：`targetEnemyId` 不属于理想 action；`SILENT_WALK` 也不属于战术 action enum。

### 5.2 Shooting physics

至少拆成：

- gun orientation；
- aim error / weapon spread；
- shooter movement penalty；
- settle / recoil state；
- target angular size / exposure；
- target motion；
- physical line-of-fire；
- deterministic RNG hit outcome（直到未来真的做 projectile）。

感知质量影响的是**玩家能否把枪正确带过去**，而不是物理层凭空“远处降低 hit chance”来代替看不清。

为了工程稳定，可分阶段：先保留概率 hit model，再逐步把误差从“hit probability magic”搬到 aim/percept execution。

### 5.3 Movement / sound repertoire

现实动作自由度是否加入，必须逐项证明它提供新的收益面：

- continuous movement speed / gait；
- footstep loudness/frequency generated from motion；
- crouch；
- jump/landing；
- acceleration/deceleration；
- counter-strafe-like stop accuracy；
- weapon weight differences（future）。

**静步的 contract 是“慢下来会改变声音暴露”**，不是 `if danger -> silent`。

可接受的第一期工程实现可以有 `walk` 控制量，但它必须只改变物理速度/声音/执行代价；何时使用由 policy 学。

不要因为“CS 有”就一口气复制；按 roadmap 一次一根杠杆。

---

## 6. Team interaction contract

### 6.1 Near teammate: body language

如果 teammate 在合法视觉里，observer 可以看到：

- coarse/exact visible position；
- facing/gun orientation cue；
- velocity / acceleration cue；
- fire/reload/stance cue。

这为自然同步提供 substrate。

### 6.2 Far teammate: HUD + radio only

不在视野内时，不得继续获得 teammate body-action truth。

### 6.3 Chemistry

“默契”未来可以体现为：

- player-specific recurrent learning/state；
- pair history / co-evolution；
- team genotype 对 cue interpretation 的共同结构。

但绝不能实现成：

```ts
if chemistry > .8 then reveal teammateIntent
```

默契提高推断，不提高权限。

---

## 7. Radio contract

### 7.1 第一版目标

从 continuous 2-float/tick 迁成：

- lower update rate；
- finite vocabulary or quantized latent；
- broadcast first（directed communication later only if justified）；
- deterministic fixed delay；
- no sender-side semantic labels。

例如工程形状可以是：

```ts
radioToken: integer // 0..K-1, 0 may mean silence
```

或者低比特 quantized latent。

### 7.2 必须有的 probes

- token frequency / entropy；
- mutual information with visible enemy / own firing / objective / teammate death 等状态；
- ablation：radio off 后 win/coordination 是否变化；
- permutation test：打乱 message timing 是否破坏行为；
- pair/team specificity：同 token 在不同 team 是否有不同语义；
- lineage：token usage 是何时出现、稳定、漂移、分叉的。

**先证明通信被使用，再讲“语言”；先证明 receiver 受它影响，再给 token 猜语义。**

---

## 8. Club / Team / Coach contract

这是“假打 A 真打 B”等整队策略能出现的关键，但最容易被实现成脚本。

### 8.1 Club 是长期遗传容器

目标逻辑形态：

```ts
interface ClubGenome {
  team: TeamGenome;
  players: [PlayerGenome, PlayerGenome, PlayerGenome, PlayerGenome, PlayerGenome];
}
```

这不要求第一版就五张完整大网；ROADMAP 会从 compact player-specific blocks 逐步迁移。

### 8.2 Team / coach DNA 是 shared prior，不是 commander

每回合开始，全队共享一个 coarse latent/context：

```ts
openingPrior: Float32Array | discrete latent
```

team genome 可以决定/影响：

- opening prior generator；
- shared strategic weighting；
- communication code bias；
- team-level risk / tempo / information preference。

它**不能**输出：

- waypoint list；
- timed script；
- `strategyId = FAKE_A`；
- `P2 peek now`；
- engine-truth enemy state。

### 8.3 Player DNA / state 是“这个人是谁”

个人 block 决定/承载：

- private policy/memory parameters；
- mechanics / execution traits；
- attention/perception traits；
- individual risk and movement bias；
- communication propensity；
- response/deviation from team prior。

目标关系：

```text
team style = shared team DNA × five player-specific tendencies × opponent pressure
```

### 8.4 主要选择单位是整支 club

默认 fitness 由 club 在多场比赛、多个 opponents、双方 sides 上的**整队结果**决定。

个人 K/D、damage、信息 centrality、role detector 等默认只做 diagnostics / identity discovery，不直接决定 reproduction。

原因：如果个人局部统计直接主导选择，会奖励抢人头、卖队友、无视团队目标等代理指标。

可以让 mutation/recombination 分别作用于 team block 或某个 player block；但要通过 club-level results 判断这次变化值不值。

### 8.5 Transfer / player swap 是后期可选的第二组合通道

未来可测试：

- 同一 player 换 club 后是否仍保持 identity；
- communication code / chemistry 是否可迁移；
- 某 pair 是否具有高于单人之和的组合价值。

这属于 world/evolution 加厚，不阻塞核心底座。

---

## 9. Role / tactic / discovery analytics contract

战术词只出现在 offline/read-only analytics。

### 9.1 Known-event detectors may identify

- trade window；
- spacing；
- crossfire geometry；
- route split / regroup；
- pressure on one side then opposite-side hit；
- isolated player/lurk-like behavior；
- rotate latency；
- man-advantage tempo change；
- communication density；
- pair coordination。

### 9.2 Open-ended discovery must not be limited to known CS words

analytics 还应能寻找：

- generation-to-generation novel trajectory motifs；
- novel message→action dependencies；
- new pair/team coordination motifs；
- sudden stable shifts in spatial/tempo/communication structure。

先发现“这里出现了新结构”，再由人类/分析器给 candidate interpretation。

### 9.3 Three-step evidence contract

任何重大 emergence claim 尽量形成：

```text
Detection      -> 何时出现/多常见/成功率
Interpretation -> 与哪些 percept/event/action 相关
Intervention   -> ablation/counterfactual 后是否真的消失或改变
```

相关性不足以证明语义或因果。

### 9.4 Analytics firewall

analytics/narrative layer **read-only**。

一旦 detector / discovery 结果作为 live feature 回喂，就把“我们给行为起的名字”重新偷渡成战术 API。

---

## 10. Evolution ecology contract

### 10.1 当前双 population 是 bootstrap，不是终局 ontology

当前实现的优点要保留到迁移完成：

- red/blue current-pop co-evolution；
- hall of fame；
- champion-vs-past ladder；
- colour symmetry tests。

但 target 不是两个永恒物种互相驯化。

最终：**club 是遗传/选择单位；red/blue（或 T/CT）只是一次 match 的临时 sides。**

### 10.2 对手分布是 curriculum

一个 club 的“学习对象”不是某个老师，而是它被评估/选择时面对的 opponent distribution。

目标 opponent pool 至少有四类：

1. **current peers** — 同代、能力接近，提供自然难度；
2. **current diverse opponents** — 行为风格不同，防 mirror-meta 过拟合；
3. **historical archive / hall of fame** — 防 strategy forgetting；
4. **exploiters / challengers** — 有意寻找主力 club 当前最容易被利用的洞。

比例、调度和 exploiter 生命周期不写死在 contract；由 ROADMAP 的 cross-play / exploitability probes 决定。

### 10.3 Side assignment / fairness

每个 club 必须能被放在双方 sides：

- paired side-swapped matches，或等价的镜像公平赛程；
- 不能形成“red genome”和“blue genome”永久身份；
- rating/fitness 聚合必须 side-balanced。

### 10.4 防两队 co-adaptation

严禁把长期 progress 只定义成“这一代打赢昨天那个固定对手”。

需要测：

- cross-play matrix；
- historical forgetting；
- exploitability；
- opponent-style generalization；
- side robustness；
- non-transitive cycles。

工具入口（哪几项已经有命令、哪几项还没有）以 `README.md` 为准，本文件不复述实现状态。

A 克 B、B 克 C、C 克 A 可以是真实 meta；不要让单一 Elo/ladder 把它压扁成假线性进步。

### 10.5 Diversity 默认靠生态位，不先靠风格奖励

第一选择是：通过不同对手、资源 trade-off、地图/目标收益面，让不同策略有生存空间。

不要先写：

```text
fitness += styleNoveltyBonus
```

如果最终仍塌成单一模板，先诊断 opponent coverage / budget / environment dominance / mutation-selection dynamics，再决定是否需要 explicit diversity mechanism。

### 10.6 Shared-brain → club migration 顺序

不要一步把 genome size ×5、加 RNN、换 sensors、换 league scheduler。

主顺序：

1. 先修 information boundary；
2. 再修 action truth leak；
3. 再引入 private memory；
4. 再拆 player identity；
5. 再叠 team/coach/opening layer；
6. 再把 red/blue populations 迁成 side-neutral clubs；
7. 再加 history/diverse/exploiter opponent ecology。

否则训练崩溃无法归因。

### 10.7 Fitness

默认坚持 results-dominant / zero-sum 或 side-balanced match-result pressure。

任何新 shaping 都必须：

- 有 cold-start necessity；
- 对称；
- 不奖励命名战术；
- 可通过 ablation 证明不是在替 policy 做选择。

---

## 11. Required hard tests / evaluation contracts

### T1 — Hidden-state counterfactual leak

保持 player i 所有合法 sensor inputs 相同，只移动其不可见 enemy / 修改 enemy private state。

`obs_i` 必须不变。

### T2 — Teammate private-state leak

保持 teammate 的外显身体状态、HUD、radio 相同，只改 teammate private intention/memory。

observer 的 obs 必须不变。

### T3 — No back-of-head geometry

背后 geometry 改变，在玩家不转头且不产生合法声音时，当前 vision obs 不变。

### T4 — Audio causality

同一 visible frame 下，合法声源开/关只改变 audio channel；隔墙/距离变化按预期衰减。

### T5 — Radio causality

radio message 改变只能通过 inbox 进入 teammate；不能顺带更新 enemy truth cache。

### T6 — Determinism

相同 seed + genotype + actions = identical trajectory/events/obs。

### T7 — Mirror / side fairness

side/team-frame transformation 后，同等世界产生等价 observation/action semantics；同一 club 换 side 不改变 policy 的语义身份。

### T8 — Analytics firewall

style/role/tactic/discovery detector 不在 sim/policy dependency graph 内。

### T9 — Club component swap provenance

固定 team DNA，只 swap 一个 player block，应只有通过合法 club composition 产生的行为变化；不能有 slot/side 隐式 truth 绑定。

### T10 — Opponent ecology generalization

任何声称“更强”的 league 版本至少要在 held-out/current-diverse/history 中不出现系统性倒退；若存在非传递关系，必须以 cross-play matrix 报告而不是硬压成单一 scalar claim。

### T11 — Emergence claim causality

任何声称“语言/战术 X 已经出现”的强 claim，要有至少一个针对关键 channel/mechanism 的 intervention；否则只能标为 candidate/hypothesis。

---

## 12. Performance budget

底座再真实也不能把 evolution 跑不动。

每次 observation/brain/club scheduler 扩张前后必须跑 `npm run bench` 或对应 population-throughput benchmark。

记录：

- ms/match；
- obs dimension；
- genome parameter count；
- evaluations/gen；
- matches/club selection cycle；
- browser worker throughput；
- headless throughput。

任何 sensor 精度提升都应问：

> 它增加的是**决策所需信息质量**，还是只增加对人类不可见的计算细节？

任何 league 扩张都应问：

> 它增加的是**策略空间覆盖**，还是只把评估场次无意义乘大？

优先 structured perception + informative opponent sampling，不追求无必要的 pixel fidelity / brute-force round robin。

---

## 13. Migration rule

当前 `README.md` 描述的是已 ship baseline，不要一次删光重写。

每个 roadmap phase：

- 旧实现保持可回退；
- 新 contract 先有 probe；
- A/B 证明最小能力成立；
- 再删除被取代的 privileged shortcut；
- README 在 ship 后才更新为新现实。

**VISION/SUBSTRATE 可以领先于代码；README 不可以假装未来已经实现。**