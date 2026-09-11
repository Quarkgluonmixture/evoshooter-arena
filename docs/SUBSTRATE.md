# EvoShooter Arena — 底座合同 (SUBSTRATE CONTRACT)

> 这份文档把 [`VISION.md`](VISION.md) 翻译成**工程边界**：哪些信息允许进入 policy、哪些动作属于身体原语、
> 哪些状态必须 private、team/coaching 层应该长什么样，以及当前实现与目标之间差在哪。
>
> 它不是“最终类图”，而是防止 future agent 走回捷径的 contract。

---

## 0. 总体模型

目标世界是一个 **Dec-POMDP-like tactical shooter**：五个独立执行的玩家只能基于自己的局部观测、记忆、
共同 prior 和有限通信行动；engine truth 只服务物理、裁判、debug 和 metrics。

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
          └────────── body / aim / trigger / reload / stance / radio
```

**唯一允许跨玩家共享的东西必须有现实中的传播机制：HUD、视野、声音、radio、公开事件。**

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
两档是**按 `targetId >= 0` 切换**的，look 动作的 0.45 s 低通也建立在"动作是绝对方向向量"这个参数化上
（§5.1 的目标动作是 `lookYawDelta`）。V4 之后没有"是否交战"这个位，这两条会**静默失效**——不报错，
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
- offline metrics / style detection。

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
- reload/cooldown/stance state；
- own velocity / body orientation（proprioception）；
- round time；
- team/enemy alive count；
- score/objective legal state。

### 3.2 Teammate HUD

先采用可校准的 CS-like 简化：

- teammate alive/dead；
- teammate coarse/exact map position（是否 exact 由对应 phase A/B 决定，但必须是明确 HUD affordance）；
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
  bearing: number;       // noisy / quantized where appropriate
  elevation?: number;
  rangeCue: number;      // perceptual estimate, not exact truth
  quality: number;       // how reliable this percept is
  motionCue?: number;
  bodyVisibility?: number; // perceptual cue; never expose hidden reciprocal exposure
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

不必立即做像素输入。Riot/modl.ai prior work 证明 structured raycast sensor 是现实可行的中间层；
本项目重点是**信息诚实**而非 pixel realism。

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
  lookYawDelta: number;   // or desired angular velocity
  lookPitchDelta?: number;
  trigger: number;
  reload: number;
  stance?: number;
  walk?: number;
  radio: RadioSymbol;
}
```

注意：`targetEnemyId` 不属于理想 action。

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

### 5.3 Movement repertoire

现实动作自由度是否加入，必须逐项证明它提供新的收益面：

- walk / silent movement；
- crouch；
- jump/landing；
- acceleration/deceleration；
- counter-strafe-like stop accuracy；
- weapon weight differences（future）。

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
- pair/team specificity：同 token 在不同 team 是否有不同语义。

**先证明通信被使用，再讲“语言”。**

---

## 8. Opening prior / coach layer contract

这是“假打 A 真打 B”等整队策略能出现的关键，但最容易被实现成脚本。

### 8.1 What it is

每回合开始，全队共享一个 coarse latent/context：

```ts
openingPrior: Float32Array | discrete latent
```

它影响所有玩家 private policy，但不会直接输出坐标任务。

### 8.2 What it is NOT

禁止：

- waypoint list；
- timed script；
- role assignment table；
- `strategyId = FAKE_A`；
- `after 8 sec rotate B`。

### 8.3 Team / coach DNA

长期可以让 team genome 决定：

- opening prior generator；
- shared strategic weighting；
- communication code bias；
- team-level risk / tempo / information preference。

个人 genome/state 决定：

- mechanics；
- attention/perception quality；
- individual risk and movement bias；
- communication propensity；
- deviation from team prior。

目标关系：

```text
team style = shared team DNA × five player-specific tendencies × opponent pressure
```

---

## 9. Role / tactic analytics contract

战术词只出现在 offline/read-only analytics。

### 9.1 Event detectors may identify

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

### 9.2 Detector must not feed policy

analytics/narrative layer **read-only**。

一旦 detector 结果作为 live feature 回喂，极易把“我们给行为起的名字”重新偷渡成战术 API。

---

## 10. Evolution contract

### 10.1 Preserve competition

保留：

- red/blue co-evolution；
- hall of fame；
- champion-vs-past ladder；
- colour symmetry tests。

### 10.2 Shared-brain → individual-brain migration

不要一步把 genome size ×5 再加 RNN 再换 sensors。

迁移顺序见 ROADMAP。核心原则：

1. 先修 information boundary；
2. 再修 action truth leak；
3. 再引入 private memory；
4. 再拆个体身份；
5. 最后叠 team/coach/opening layer。

否则任何训练崩溃都无法归因。

### 10.3 Fitness

默认坚持 results-dominant / zero-sum。

任何新 shaping 都必须：

- 有 cold-start necessity；
- 对称；
- 不奖励命名战术；
- 可通过 ablation 证明不是在替 policy 做选择。

---

## 11. Required hard tests

以下测试进入长期 suite：

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

### T7 — Mirror fairness

red/blue team-frame transformation 后，同等世界产生等价 observation/action semantics。

### T8 — Analytics firewall

style/role/tactic detector 不在 sim/policy dependency graph 内。

---

## 12. Performance budget

底座再真实也不能把 evolution 跑不动。

每次 observation/brain 扩张前后必须跑 `npm run bench`。

记录：

- ms/match；
- obs dimension；
- genome parameter count；
- evaluations/gen；
- browser worker throughput；
- headless throughput。

任何 sensor 精度提升都应问：

> 它增加的是**决策所需信息质量**，还是只增加对人类不可见的计算细节？

优先 structured perception，不追求无必要的 pixel fidelity。

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
