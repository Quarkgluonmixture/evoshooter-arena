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
7. player DNA 与 team/coach DNA 分层，主要选择压力来自整支 club 的比赛结果；
8. 最终训练生态不是两个永久 red/blue 物种，而是 side-neutral clubs 面对 current peers + diverse styles + history + exploiters；
9. 多支队伍能长出不同、互相反制、甚至非传递循环的打法；
10. evolution throughput 仍足够做长期 co-evolution / league evolution；
11. 所有因果故事有 probe / ablation，而不是看录像脑补；
12. 用户不仅能看到“更强”，还能看到一个新行为/词汇/战术**何时出生、如何稳定、为什么有效**。

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
- **Interpretability gate（声称 emergence 时）**：必须能指出出生/稳定证据，并至少有一个 causal intervention，不能只凭故事；
- **Reconcile**：结果与预注册预测对照；
- **Ship or revert**：不过门则回退实现，不软化 VISION；
- **Docs**：ship 后更新 README / CHECKPOINT / 本账本。

任何 agent 不得同时“换 observation + 换 RNN + 拆五个 genome + 加 A/B map + 换 league scheduler”后再用一个胜率解释一切。

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

**当前状态：CLOSED（2026-09-11 22:15）。** test / bench / census 实测数字见 `LOG.md` 同日 `#measure` 条；census artifact = `runs/a0-census-s{1,2}.txt|json`（gitignored，本机）。⛔ 别把数字抄进本文件。

⚠ 最新 main 的转头/观战修复已经改变 baseline 的 turn/look 数字；A0 冻结**当前 main 的 post-change reality**。旧 runs 只作历史，不把世界退回去。见 CHECKPOINT / GOTCHAS #10。

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

**当前状态：CLOSED（2026-09-11 22:30）。** 仪器 = `src/sim/obsSchema.ts`（每个 obs index 的 provenance + legality）
· `src/probe/leak.ts`（13 条登记在册的 probe）· `tests/leak.test.ts`（断言实测 == 登记的**精确字段集**）·
`npm run leaks`（打印当期 matrix，⛔ 不把表抄进任何文档）。V1/V2/V3/V4 全部被稳定抓住，另外实测出两条新 gap
（V11 far-teammate firing、V12 objective 数不可见敌人），已登记进 `SUBSTRATE.md` §1。机制一行未改。详见 LOG。

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

**当前状态：CLOSED（2026-09-11 22:55）。** 三条 exit 全过（`known[team]` → `contact[player]`；`A1-P2`/`A1-P3` 转绿；
accuracy .22–.32 / 首枪 4.8–19 s / kills 1.3–3.5）。⚠ 预注册的行为预测**大半没测到**，且末代冠军对第 0 代的 ladder
在 3/6 个血统上变弱（基线 4/4 都是 90–100%）——记为 open question，见 LOG 同日条与 `TODO.md`，⛔ 不用单一标量下判决。
⭐ `coverRatio` 的暴跌主要是**指标定义跟着变了**（GOTCHAS #12），⛔ 不可跨 A2 直接比较。

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

### 施工进度（三刀，见 Current Cursor）

- **A3.1 删真值：CLOSED（2026-09-11 23:00）。** `enemy*.hp` / `exposureToMe` / `facingDot` 已删，obsDim 100 → 91；
  `A1-P4`/`A1-P5` 转绿、`A1-P6` 降到 4 个字段。行为侧无可测差异（细节与教训见 LOG 同日条 + GOTCHAS #14/#15）。
- **A3.2a 位置 → 感知 + 连续化：CLOSED（2026-09-11 23:20）。** contact = `c·sin/cos(bearing)` + `c·range` + `quality` + `c` + `staleness`，
  obsDim 91 → 88；`A1-P8` 按 0.05 量级判据翻 clean（实测 0.0000）。⚠ bench +6%（trig 比省下的权重贵）。
- **A3.2b 确定性噪声 + 量化：CLOSED（2026-09-12 00:20）。** hash 抖动 + 量化格（角度绝对格 / 距离与 quality 乘法格），
  `A1-P16` 翻 clean（1/20）；跨进程 determinism 实测；bench +0.3%。⭐ accuracy 6/6 下降但 same-genome 对照证明**不是噪声的机械后果**（见 LOG）。
- **A3.3 front-biased 几何：CLOSED（2026-09-12 01:00）。** 射线改成跟头走、幂律中心密、背后什么都没有，读数同样量化。
  ⚠ **第一版（9 条 ±55°）被自己的硬门否决**（首枪 28.9 s、moveFraction .73 = 走不动），按预注册规则加密加宽成
  **13 条 ±90°**（`geomFovDeg`，几何感知比敌人识别更宽是现实校准）后过门。`A1-P7` 翻 clean，obsDim 93，bench +22%（见 LOG）。

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

必须同时引入**运动→声音发射**的底层关系；如果所有移动永远发同样声，silent movement 还没有策略自由度。

注意：本 phase 先建立“不同运动状态能产生不同响度/频率”的物理接口；什么时候减速不是规则，不写 `if enemyNear -> silent`。

### Probes

- same visual obs + sound on/off；
- distance sweep；
- wall occlusion sweep；
- movement speed/gait → emitted loudness sweep；
- teammate/enemy 声源不携带自动阵营标签。

### Evolution gate

先只问：radio off 时，audio ablation 是否改变 contact/turning behavior；不要急着宣称“听声辨位战术已经出现”。

**当前状态：CLOSED（2026-09-12 01:35）。** 4 扇区 × 2 类，obsDim 93 → 101；五条新 probe（P17–P21）全 clean。
⭐ ablation 实测：**首枪时间没有变慢**（一个 seed 完全相同、一个反而更快）⇒ ⛔ 不许说「听觉让人更快找到对手」；
但聋掉之后开火数与击杀明显下降 ⇒ 只能说**通道携带了策略已经在用的信息**。细节与 seed 3 的互相回避均衡见 LOG / GOTCHAS #18。

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

⚠ 当前 baseline 的交战/扫视 turn-rate 分档是靠 `targetId` 区分，0.45s look low-pass 也假设 action 是 absolute direction vector。
B1/V4 删除 target abstraction 时必须把它们重新推导成**角速度限幅 + 感知/执行误差**，不能把现行 2π / 2.6 / 0.45 常数机械搬过去。

### Probe

- 静止 dummy：不同初始偏角下 acquisition time；
- peripheral target 必须经历 turn 才能精确开火；
- hidden memory contact 不能被自动 aim；
- 新 look parameterization 的 reversal/jitter 与 acquisition trade-off。

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

## Phase B3 — Movement repertoire：速度 / gait / crouch 等一次一个

**Question**：职业 FPS 的信息博弈需要哪些缺失身体自由度？

顺序建议：

1. continuous speed/gait → footstep loudness/frequency（直接与 A4 音频闭环）；
2. acceleration/stop accuracy calibration；
3. crouch；
4. jump/landing only if map geometry gives it real use。

**不要做 `SILENT_WALK` 战术按钮。** 工程上可以有 `walk/gait` 控制量，但它只改变速度、声音和执行代价；“什么时候静步”必须由 evolution 发现。

每个动作必须证明“新增收益面”，不能只因为 CS2 有这个键就复制。

---

# Programme C — 让世界本身支持职业战术，而不是只会抢一个圈

## Phase C1 — Tactical objective topology：从单中央区到双目标世界

**Question**：世界是否存在真正的“去哪边、什么时候转、是否留人、是否骗 rotate”的战略选择？

当前单一 central KOTH zone **结构上无法**产生 A/B fake/rotate/anchor 博弈。

### ⭐⭐ 2026-09-12 实测证据：目标压力现在是 0，这条 phase 的必要性从推理升级成观测

`npm run yardstick` 的第一次读数：v6a 三个 seed 的 **12 个冠军**（含 gen 0）对手写 rusher **11 个 0%、1 个 6%**，
逐场 champion 的 zoneShare 是 **0.000**，比分 0:36.5。机制：`winner` 只看占区分，fitness 里有 0.5×伤害差；
两个 population 都不进区 ⇒ 占区差恒 0 ⇒ 梯度只剩打架，**而且谁都不吃亏，因为对手也不占点**（GOTCHAS #23）。

⇒ 这正是本 phase target shape 里那条「**elimination 仍是合法胜法，但不能永远支配 objective play**」
在当前世界**已经失守**的直接证据。

两条「顺手能修」的路都被上层 authority 挡住了，记在这里免得后来人再走一遍：

- ⛔ **不能把 scripted bot 放进训练对手池** —— 本 phase 的 Exit 已经写死「reference bot 只验证世界是否允许，
  **不进入 evolving population**」，E6 的四类对手也全是进化实体。reference bot 的正确用法就是 `npm run yardstick`：
  **验收镜子，不是课程**。
- ⚠ **也不该直接去加大占区奖励**。VISION §10 对 shaping 的判据是「只解决搜索冷启动，且**可被结果主导地压过去**」——
  实测答案是**没有被压过去**，所以现在的 0.5×伤害项确实已经不合规；但
  `EVOLUTION-ECOLOGY-CONTRACT.md` §5「counter-payoff surfaces belong in the world」说的是**世界要提供收益面**，
  不是把系数调大。⇒ 正确的修法在本 phase 的 target shape 里（objective 有时间成本、可中断、双目标），
  ⛔ 不是在 `fitnessOf()` 里调一个数。

⇒ **本 phase 的 exit 应当额外要求一条**：改完 objective 拓扑之后，冠军对 `npm run yardstick` 的 rusher
不再是 0%（或者能说清为什么 rusher 在新拓扑下依然是强 baseline）。

### Target shape

设计一个 180°/side-fair 的 tactical round world，至少包含：

- 两个可赢的 strategic sites / objectives；
- 多条带 choke / connector / flank possibility 的路径；
- attackers/defenders 有不同目标压力；
- objective action 有时间成本和可中断性；
- elimination 仍是合法胜法，但不能永远支配 objective play。

最接近职业 CS 的终局是 bomb plant/defuse，但 C1 先研究**最小可证明双目标博弈**，不要一口气抄经济/utility/全武器。

### ⭐⭐ 已量到的设计约束（2026-09-12）：现在的世界用目标的货币给淘汰发工资

`world.step()` 在团灭时把**剩余时间按占区费率直接记成占区分**，一步都不用走进区。实测（跨 run 冠军 40 场）：
团灭只占 **13%** 的比赛，却贡献 **3.13 分/场**，而全部比赛里真正靠**站在区里**赚到的是 **2.22 分/场** ——
**白送的比赚到的多 1.4 倍**；一次团灭 ≈ 24 分 ≈ 十场比赛的占区价值。一场 40 分的目标价值，占区只认领了 **5.5%**。

⇒ 本 phase 那条「elimination 不能永远支配 objective play」**在当前代码里已经失守**，
而且它和坑 #23（冠军对 rusher 0%）、D1 的空结果、mapprobe 的 91–95% 死区是**同一个机制**。

⛔ **不要顺手删掉那段加分**：它是「活下来的人慢慢走过去无人干扰占满剩下时间」的仿真快捷方式，
删了就是团灭一分不值，过度矫正且违反「elimination 仍是合法胜法」。
⇒ 正确形状是本节 target shape 自己那一条：**objective action 要有时间成本和可中断性** ——
一个可以提前投入、且**在投入方死后仍继续计时**的目标。那时杀光对面不再等于拿下目标。
**这是 C1 设计的第一约束，不是可选项。**

### 最小设计（2026-09-12 拟定，逐条对着上面的 target shape 推出来的）

**Round shape**：一方 **attackers**、一方 **defenders**，角色**按比赛分配并成对互换**（同一支队必须两边都打，
side-fairness 仍由镜像赛程保证，`red/blue` 依旧只是 sides —— 不制造永久物种，和 VISION §11.2 一致）。

**目标动作 = 投入 + 倒计时 + 可反悔**，这是整份设计里唯一真正新的机制：

1. attacker 站在一个 site 里累积 **capture meter**（有时间成本；离开会衰减）。
2. meter 满 ⇒ **armed**：一个**独立倒计时**开始，**攻方全灭也继续走**。
3. defender 站在同一个 site 里可以**反向消耗**倒计时（也有时间成本）⇒ 可中断。
4. 判定：倒计时归零 ⇒ attackers 赢；被反向清空或回合时间耗尽且未 armed ⇒ defenders 赢。

⇒ 这一条同时解决三件事：objective action 有**时间成本**（1、3）与**可中断性**（3）；
**elimination 不再支配**（armed 之后杀光攻方不解决问题，必须去 defuse）；
而且**那段白送剩余时间的加分自然消失**——终局由规则判定，不需要再拿占区费率替代「慢慢走过去占满」。

**两个 site** 让「去哪边 / 什么时候转 / 要不要留人 / 骗 rotate」第一次有定义：defenders 人数固定，
两个 site 不可能同时满防，attackers 的信息优势就是「我选，你猜」。

### 施工拆成三刀（⛔ 不要一次做完，无法归因）

- **C1a — 目标机制，先不动地图。** 在现有的单一 zone 上做 attacker/defender 角色 + capture/arm/defuse
  倒计时 + 新的终局判定，删掉团灭白送分。文件面窄，改的是 `config/world/match`，
  用 reference bot + `npm run yardstick` 验收「投入有成本、倒计时可中断、团灭不再等于拿下目标」。
- **C1b — 两个 site 与路网。** 又拆成两半，因为「改地图」和「改 world 的多点位逻辑」是两个关注点：
  - **C1b-1 地图与度量（CLOSED 2026-09-12）**：`siteCount: 2` 把两个 site 放在 `(±siteOffset, 0)`（互为 180° 旋转像），
    四面 screen + 中央隔墙。⭐ 验收线达成：**通路占可走面积 5–9% → 18–20%**；
    A→B 步行 **39.0 m = 全速 6.5 s**（rotation 的几何下限）；同一侧通往 A/B 的通路**只重叠 4–19%**。
    side-fairness 由 `mapprobe --self-test` **机械校验**（红→A 与蓝→B 逐格相同，三个 seed），已在 CI。
  - **C1b-2 world 玩两个点位（CLOSED 2026-09-12）**：每个 site 一条 capture meter，`armedSite` 只能有一个。
    承重测试 = **守方全站 A，攻方照样拿下 B**。
    ⚠ **observation 有意没动** —— 点位位置 / armed / 倒计时都是公开回合状态，**属于 C2**；
    所以 genome 与 obsDim 不变，但 `siteCount: 2` 下 `obj.*` 仍只指向 site 0。
    ⛔ **C2 之前不要在双点位地图上训练并解读结果。**
- **C1c — Exit 证明（CLOSED 2026-09-12）。** `npm run c1exit`，3 张地图 × 8 seed × 两种角色分配：
  **E1** 全压 A 88% / 全压 B 67%（对 3/2 固守）✅；
  **E2** 假打对**反应型**守方 **+31pp**、对**固守型** −21pp ⇒ 正是 phase 要的条件式收益 ✅；
  **E3** 五人守 A 时攻方 50%，同样五人 t=4 早走后 77% ⇒ **早走代价 27pp** ✅；
  **E4** 几何：必经中段切片宽 20–63 格（旧图 12–31）⇒ 不存在**窄的**必经走廊，
  ⚠ 但严格说没有干净证否，⛔ 别读成 PASS。
  ⚠ **前四版 exit 全读 FAIL，四次都是工具不是世界**（bot 走直线撞墙 / 假打把假点位 arm 了 /
  早 rotate 设得太晚 / 基线天花板），细节与教训见 LOG + GOTCHAS #26。
  ⛔ reference bot 不进 evolving population。

⚠ **C1a 之后 evolving agent 暂时看不见 armed / 倒计时**——公开的回合状态是 **C2** 的活。
这不阻塞 C1：本 phase 的 Exit 本来就写的是「scripted/reference agents 能证明**世界允许**」。
⛔ 但也因此：C1a–C1c 期间**不要**拿进化种群的表现去评判这套机制，它们还没被告知比赛规则。

⚠ **所有既有 baseline 在 C1a 之后失效**（胜负条件变了）：`runs/*.json` 的冠军仍可加载，但
`npm run crossplay` 的胜率、README Evidence 表、坑 #23 的 0% 读数都是**旧规则下的数**，⛔ 不可跨 C1 比较（坑 #12）。

### Probe before map build

**已做（2026-09-12）：`npm run mapprobe`，旧地图基线在下面；`--self-test` 已接进 CI。**
几何类指标可以在单目标地图上定义并已量到（seeds 7/11/23，红蓝逐项相同）：

| seed | 最短距离 | 最宽切片的通路数 | choke（格） | **通路占可走面积** | 出生点视线被挡 |
|---|---|---|---|---|---|
| 7 | 27.0 m | 2 | 14 | **5%** | 4/5 |
| 11 | 31.0 m | 5 | 12 | **9%** | 5/5 |
| 23 | 28.0 m | 2 | 16 | **6%** | 4/5 |

⭐⭐ **91–95% 的可走面积不在任何一条通往目标的可行路线上** —— 新拓扑要打败的就是这个数。
⚠ 第一版把一张 180° 对称的地图读成红蓝不对称，原因在网格离散化不对称（GOTCHAS #25）；
⇒ 新拓扑的 side-fair 断言必须先过 `--self-test`。

其余六项（site commitment time / first pressure side / rotate frequency / defender rotation latency /
split width / post-objective retake paths）**在单目标地图上没有定义**，探针印 n/a 不印 0 —— 它们是本 phase 要造出来的。

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

### 进度（2026-09-13）

- ✅ **死亡坐标已关闭**：死掉的队友只报 `alive = 0`，位置三个字段清零（探针 `A1-P24`，实测有鉴别力）。
- ✅ **公开目标状态已进观测**：每个 site 一块（相对向量 / 距离 / 我在不在 / 我方几人在）
  + **仅 capture 模式**才有的 **armed** 与全局 **倒计时 / defuse 进度**。
  ⇒ obsDim：**koth 100（不变）** · capture 单点位 103 · capture 双点位 109；koth 的 genome 仍是 5324。
  探针 `A1-P25` = 本 phase 的 Probe 原文。
  ⭐ **未完成的 capture 进度刻意不公开** —— plant 会播报，看表填满得人在现场。
  ⭐ **回合状态字段按模式发放而不是恒 0**：第一版无条件发，koth 下那三个字段永远是 0，
  两个 seed 上 kills 从 ~3 掉到 0.35 / 1.65、首枪拖到 34 s；改成按模式发放后三个 seed 回到基线
  （2.87 / 2.95 / 2.87）。⚠ 归因到「死输入」还是「初始种群重抽」**那个实验分不开**（GOTCHAS #27），
  但修法本身独立成立：不可能变化的字段不是信息。
  `World` 构造时断言 `map.sites.length === cfg.siteCount`（观测布局从 cfg 推出，不一致会静默错位）。
- ⭐ **顺带量到的噪声上界**：两臂共享同一批初始种群、只把 100 个同内容字段**重排顺序**，
  就能在 2 个 seed 上造出和「真效应」同量级的差 ⇒ ⛔ 2-seed 的行为侧 A/B 只读方向，不读效应量。
- ✅ **「死亡玩家不得继续给活人 radio truth」已规则化并上探针**：`A1-P26` 同时动**三条**通道
  （comm 总线、脚步音频、队友开火 cue）再断言**一个字段都不动**；正向护栏确认同样的改动在**活着**的队友身上
  会动 `mate0.hp / firing / comm0 / comm1 / audio0.footstep` ⇒ 尸体的沉默是真的不是空过。
  （实现层本来就对：`hear()` 的配对循环跳过死人，所以尸体不出声；comm/hp 在 V11 已清零；位置在 `A1-P24` 关闭。）
- ✅ **kill feed 的边界已钉死**：`world.events` 标注为 **SPECTATOR CHANNEL**（带精确坐标与身份，
  只给观战器和 `hear()` 的枪声物理用），⛔ **任何 policy 都不得读它**。
  **玩家真正拿到的 kill feed 就是人数通道**（`self.aliveMine` / `self.aliveEnemy` / `mate*.alive`）
  加上他听见的东西 —— 全都不含「在哪」。
- ⬜ **剩下的**：explicit round lifecycle 目前已由 `t` / `timeLeft` / `done` / `winner` / armed 状态隐式表达，
  真正缺的是 **freeze-time / opening prior**，而那是 **E2** 的活，⛔ 不在 C2 里做。
  观战器那个滚动 kill feed UI 仍在 `TODO.md`（可视化，不是世界规则）。

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

### 当前状态：**实现完成、exit 未过（2026-09-12）**

两步都 ship 了，开关都在，默认**都关着**：`recurrentDim`（默认 0，上一 tick 第一隐层激活接回输入，状态在 World 上）
与 `memorySeconds: 0`（世界不再替玩家记）。泄漏侧 exit **过了**（`A1-P23` clean，`npm run leaks --mem 0`）。

**行为侧 exit「确认 RNN 真能利用 history」＝ 没过。** 三臂 A/B（基线 / 无记忆 / 无记忆+recurrent，40 代 × 2 seed）：
拿掉世界记忆确实很痛（首枪 5.8→9.8 与 5.3→14.8，kills 腰斩），recurrent 臂**在训练指标上补回 50–80%**——
但 `npm run recprobe` 的消融证明**补回来的不是记忆**：把**另一场比赛**抓来的常数状态喂进去（`var` = 0.000），
表现和逐 tick 更新的 live 状态**打平**。⇒ 40 维 Elman state 被用成了**学出来的常数偏置**，
arm C 的进步是**容量**不是**记忆**（证据与四档对照见 LOG 2026-09-12 23:05，教训进 GOTCHAS #24）。

⛔ **默认值不翻**：mem0 有真实能力代价而没有等价补偿。

### ⭐⭐ 2026-09-13 重开结果：reframe **没有被证实**

C1+C2 之后在 capture + 双点位世界里重跑三臂（预测冻在 `runs/d1-reopen-predictions.txt`），**两个预测都错**：

- **world 的 3 秒记忆在这个世界里本来就不承重**：A(`mem3`) vs B(`mem0`) 初始种群相同，
  拿掉它几乎没代价，且 `objectiveProgress` 两个 seed 都**略升**（.231→.284、.336→.355）。
  ⇒ 公开目标状态**替代**了记忆的用途。（对照旧 KOTH：同一改动把首枪拖到 9.8 / 14.8 s、kills 腰斩。）
- **recurrent state 仍然是学出来的常数**：`recprobe` 的 **alien** 档（另一场比赛抓来的常数，`var` = 0.000）
  与 live（`var` 0.57–1.45）打平且多数格子更好。

⇒ **在这个世界里，「关于看不见的敌人的时序信念」在两个可能显现的位置上都不值钱。**
D1 的前提（private temporal belief 承重）**本世界不支持**。

⚠ 「不值钱」≠「搜不到」：per-weight 高斯突变对跨时间信用分配没有梯度压力，而上面的实验分不开这两者。
⇒ 做了那个**不需要训练**的实验（`npm run memdemand`，2026-09-13）：攻方固定去拿点，扫**守方**的记忆档，
3 图 × 8 seed × 两种角色分配、每格 48 场。**答案是：付一点，而且远不如站对位置。**

| 守方记忆 | 0 s | 0.5 s | 1 s | **2 s** | 3 s | 10 s | **不追、只守点位** |
|---|---|---|---|---|---|---|---|
| 守方胜率 | 13% | 15% | 17% | **24%** | 21% | 19% | **38%** |

⇒ ① 记忆有价值但**又小又饱和**（~2 s 达峰，⚠ n=48 ⇒ 峰在显著性边缘，只读方向）；
② ⭐⭐ **完全不追的守方 38%，高于任何记忆档** —— 在这个世界里**追击本身就是错的**，
而追击所需的记忆价值自然更低。
⇒ **这是需求侧的限制，不（主要）是搜索侧的。** 进化把 recurrent 通道当常数用，与「本来没多少可赢」一致。

⚠ **窄结论**：测的是**追击式**记忆 + 一个 bot 原型。没测「记住敌人承诺了哪个点位 / 队友死在哪侧 / 他在换弹」。
⇒ **本 phase 要真的重要，需要世界先提供一种「记忆回报 > 站位回报」的局面**（更长视线、只短暂可得的信息、
或奖励拦截 rotation 的目标结构）。**这是一条对世界的设计要求，登记在此**；⛔ 不是再调一次 brain。
⇒ D1 维持「实现 ship、默认不翻、exit 未过」，并且**不再被描述成本世界背着的债**。

**（历史）Reframe（方向没被否，这版实现被否）**：VISION §8「记忆属于玩家」不变。真正的疑点是
**这个世界现在不奖励信息博弈** —— 目标被无视（GOTCHAS #23）、交战是近距离乱战，
「记住一个看不见的人」不付钱。⇒ ⛔ 不要立刻换 GRU / 加宽状态；**先做 Phase C1**，
在一个信息与目标真的付钱的世界里重开 D1。

### Evolution gate

必须跑 optimizer sensitivity：genome size / mutation sigma / inheritance stability。CHECKPOINT 已有突变尺度塌缩前科，不能默认旧 σ 仍合适。

**这一条已经预先做完（2026-09-12，`npm run inherit`，证据在 LOG 同日 22:00 条）**，结论可以直接用：

- **genome 变大本身不需要改 σ**：genome 从 3028 涨到 32780（10.8×），layer-1 的相对扰动 D 没动（0.210–0.236）。
  决定 D 的是**那一层的 fan-in 与权重 std**，不是参数总量。
- **本 phase 唯一要看的就是 layer-1 的 fan-in**：拼一个 H 维 recurrent state 进 observation ⇒
  D **H=24 +11% · H=40 +18% · H=64 +27%**（init 尺度）。
- **真要压回去，动 `resetProb` 不动 σ**（GOTCHAS #22：reset 项是 sigma 项的 11 倍）。H=40 时 `0.002 → 0.0014` 即可。
- ⛔ **但先别改**：+18% 在可测分辨率下是小量（σ 翻 7.5 倍也才 +18%）。按「一次一根杠杆」先原样上 D1，
  新架构上复跑 `npm run inherit`，再决定要不要动 `resetProb`。

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
- message-shuffle / token-permutation ablation；
- team-crossplay：把 A 队 speaker 配 B 队 listener，看语言是否 team-specific；
- long-run 是否出现稳定 token usage；
- token usage 的 birth / stabilization / drift timeline。

### 进度（2026-09-13）

- ✅ **D2a 通道改造**：`commTokens`（量化成 `2n+1` 符号，0 = 静默，靠死区自己选）·
  `commIntervalTicks`（多久才能重新决定一条消息）· `commDelayTicks`（听者落后多少 tick）。默认全关。
  ⭐ 量化在**发出来的东西**上，不在动作空间上 ⇒ ACT_DIM 不变、genome 不作废。
  「说的」`commSaid` 与「听到的」`heardComm()` 现在是两个对象。
- ✅ **D2b 分析**：`npm run radio` = 符号熵 / 静默率 / 与候选指称的 MI + 三种消融
  （`off` / `shuffled` / `alien`，后两种是坑 #24 要的 in-distribution 对照）。
- ❌ **两种电台下都测不到任何意义**：连续电台与有限电台的冠军，符号熵都 ≈2.07–2.08 / 2.32 bits、
  MI 都只有 **0–1%**、静默率 20–23%（≈均匀）。有限电台下 `off` 的 objective 甚至**高于** `normal`。
- ⭐⭐ **但世界确实为通信付大钱**（`npm run memdemand` 的 telepathy 档）：
  共享视野把守方胜率从 **13% 拉到 42%**（+29pp），telepathy + 记忆 **47%** 是唯一打得过「不追」参照（38%）的配置，
  并把 armed 率从 76–88% 压到 **58%**。
  ⚠ telepathy 共享**精确坐标**，是个宽松上界 ⇒ 正确说法是「共享接触信息最多值 29pp，有限电台能拿到多少未知」。

⇒ **D2 的前提被世界支持**（与 D1 相反：D1 是需求侧没钱）。所以「电台没被用起来」更可能是
**搜索 / 架构**问题，而候选是具体的：**V7「一个脑子穿五个身体」** —— 一队共享一个网络，
同一批权重既要学编码又要学解码，且没有个体身份可分化。
⇒ ⛔ **不要再调电台参数或加训练预算去救 D2。下一根承重杠杆是 E1（player identity split）**，
它同时解锁 D2 还缺的 team-crossplay 分析（speaker 和 listener 现在是同一个对象）。

⚠⚠ **2026-09-13 14:57 更正（E1 probe 之后）：上面这段的两条理由都不成立。**
① 共享大脑**已经有**可测的个体身份（见 Phase E1 进度）；
② 说与听在 MLP 里本来就是不同权重（输出层 comm 行 vs 第一层 `mate*.comm*` 列），而 team-crossplay **现在就能做**：
`Policy.act` 逐 agent 调用，按 slot 分发的包装器即可，不需要拆 genome。
⇒ 架构假说削弱，剩 **search** 与 **channel** 两个候选。下一刀先问世界**一条合法的有限电台值多少**（见 §4 Current Cursor）。

- ✅ **D2c 世界侧答案（2026-09-13）：一条合法的有限电台几乎拿到全部共享接触的价值。** `npm run radiodemand`：
  手写的一符号报点（「我看见的敌人离我方左 / 右点位更近」）只走真实的量化 / 间隔 / 延迟链路，
  守方胜率 13% → **40%**（telepathy 42%）= 拿回 **93%** 的增益；**D2 训练用的 5 符号 / 5 tick / 3 tick 延迟 91%**；
  1 s 一次、0.53 s 延迟的 3 符号 49%。静音对照与「私有视野 0s」144/144 场逐场相同。
  ⇒ ⭐ **channel 不是瓶颈，D2 的零结果是 search / selection 问题。** ⛔ 不重新设计电台。
  ⚠ 只证明了一个协议点：够用的电台存在，不说明进化能找到的那个协议长什么样。
- ⚠ **D2 search 侧 · 台阶探针（2026-09-13）：随机突变看不到台阶，但尺子分辨率不够，没下结论。** `npm run commstep`：
  只突变「听」/「说」权重 vs 同尺寸对照，差 6pp / 2pp；「假如说话者已经有信息」的上下文里 listener 与对照只差 1pp。
  但六类读数在同一个冠军内同起同落（坑 #26 ④）⇒ 它主要在量「冠军离局部最优多远」，⛔ 不能据此判「listener 侧学不会」。
  ⇒ 改用进化本身当仪器：listener uptake 训练实验（见 §4）。
- ❌ **listener uptake（2026-09-13）：说话者完美，40 代也没学会听。** `npm run uptake`：训练中两队听到的都是有信息的一符号报点，
  读数 normal vs flipped（左右对调）：Δcontent **0/4 为正**、合计 −0.077；关掉它只在 1/4 个冠军里变差。对照冠军在同样编辑下摆动 ±0.45 ⇒ 读数能动，是它们没在听。
  ⇒ ⭐ **堵点在 listener 侧**（可学性 / 容量 / 预算），不是 speaker 侧的鸡生蛋。⚠ s2 那对胜率 98% / 2% 贴天花板。
- ⚠ **120 代（2026-09-13）：一条血统学会了听，另一条没有。** 读数改为同臂所有对手：Δcontent 合计 +0.353、3/4 为正、静音 4/4 变差 ——
  但几乎全靠 s1 蓝方（翻转报点胜率 **67% → 2%**，静音 30%）；seed 2 两个冠军都没学会。40 代基线在新读数下 +0.049（零结果成立），对照 −0.022。
  ⇒ **听学得会，但慢且看血统**（完美说话者、3× 预算、1/2 血统）。真实 D2 要说和听同时从零长出来，更难。
- ❌ **选项 1（用户 2026-09-13 选定：真实电台只加预算）：300 代 × 2 seed，电台用法时有时无、不累积。**
  `runs/d2-long-s{1,2}`。读数 `npm run radiouse`（只动被测队）在 d2-radio 对照组上改了三版，**对照门槛 P3'' 没过** ⇒ 逐冠军报告。
  强依赖真实电台的冠军出现过三次（s1 红 g39 胜率 78% → 换同说话者别的时刻 11%；s2 蓝 g149 74% vs 替换全在 44% 以下；s1 蓝 g299 94% vs 80/54/47%），
  **没有一次在同一血统里留到下一个读数点**；合计 Δspeaker g39 +0.28 → g149 +0.12 → g299 **+0.01**。
  发送端按冠军拆开 + 按比赛阶段条件化后 g299 最大 MI ≤ 2.6% of H（s1 蓝的 8.8% 是比赛时钟，坑 #30）。
  ⇒ P1、P2 成立、无趋势 ⇒ 按认可顺序开 **Phase D2s**。
  ⚠ 那三次「强依赖」是用 Δspeaker 读的，D2s Probe 0b 证明 Δspeaker 会把节奏 / 同步 / 时钟读成内容（坑 #31）⇒ 用 `replay` 重读的描述见 D2s 进度。
- ⛔ **下面这条「更正」已撤回（D2s Probe 0b，2026-09-13）**：「打乱→5%」是逐通道抽样伪影，「只有真实时机才行」换成另一场的真实电台也是 49%
  ⇒ 对照冠军要的是电台的**形状**（节奏 / 同步 / 时钟），不是本场内容。D2b「接收端没有内容」重新成立；「电台是承重输入」也成立。
- ~~⭐ **更正 D2b 的接收端结论（2026-09-13）**~~（已撤回，见上）：「off 与 shuffled 伤害一样 ⇒ 满音量噪声」只对了发送端。
  d2-radio 第 39 代的冠军**确实**依赖自己的电台，而且各不相同：s2 红方依赖说话者层面的结构（打乱 → 胜率 5%，同说话者换时刻 → 52%）；
  s2 蓝方只有真实时机的电台才行（其他四种 16–24% vs 49%）；s1 蓝方换成常数码反而更好（28% → 51%）。
  D2b 两队一起消融、固定步长取池，看不见单队依赖。**发送端 MI 0–1% 是两个冠军合并的数**：拆开后单冠军最高 4%（仍只对 5 个候选指称，坑 #30）。

### Strong-claim gate

“token 3 常在见敌时出现”不等于已经证明 token 3 = enemy。

只有当 sender-state relation + receiver response + intervention 三层证据齐，才能把“语言系统已形成”当成 discovery 展示。

---

## Phase D2s — Radio search efficiency（D2 的选项 3，2026-09-13 开）

**Question**：真实电台上，进化是**找不到**依赖内容的用法，还是**找到了留不住**？

**为什么开**：世界付钱（D2c：合法电台拿回共享接触价值的 91%）；架构不是借口（E1 identity）；听学得会但慢（uptake 120 代 1/2 血统）；
只加预算 300 代，依赖电台的冠军出现三次、一次也没留住（D2 选项 1）。用户认可的顺序是「只加预算 → 为空再开搜索效率」。

**VISION 边界**：只动搜索 / 选择本身（种群规模、每个 genome 的评估场次、精英、变异分配），⛔ 不给消息预设语义（§7.1）、
⛔ 不发通信奖励（§10）、⛔ 不用手写报点当脚手架（选项 2，除非用户先改 VISION）。
⚠ 「只加大 comm 通路的变异」会让设计者决定探索往哪个通道倾斜 —— 排在最后，动之前单独过一遍 VISION §1.1。

**Baseline**：d2-long 的配置（capture、2 sites、5 符号 / 5t / 3t、popSize 16、pairings 3 + hofMatches 2 = 每个 genome 5 场、elite 2）。

**Probe 0（先修尺子，不动杠杆）**：radiouse 的 comm0 / comm1 联合抽样（TODO）+ 一个**确定不用电台**的对照 ——
电台静音训练出来的冠军，各种替换下 Δ 必须 ≈ 0。d2-radio 对照组本身可能真在用电台（s2 蓝），当不了零点。门槛冻结在 probe 的预测里。

**Probe 1（找到 vs 留住）**：
- 留住：对 d2-long 里出现过强依赖的三个冠军，沿血统读后续 hof 代（+1 / +5 / +10 代）的 Δspeaker —— 什么时候、怎么丢的；
- 选择噪声：同一代的种群，5 场 vs 大量场次重评，排名相关性多高、依赖电台的个体在 5 场评估下被淘汰的概率多大。
⇒ 丢得快且噪声大 ⇒ 第一根杠杆是**评估场次**；很少出现 ⇒ **种群规模**；两者都不像 ⇒ 回到这里重写问题。

**进度**
- ✅ **Probe 0（2026-09-13）：尺子修完。** radiouse v4 通道成对抽 + 同一替换换种子重跑的噪声底：n=24 噪声底 ≤ 0.20、n=96 均值 0.038 ⇒ 尺子分辨得了 0.25，
  P3'' 没过不是噪声。成对抽样修掉一个大伪影（s2 红 shuffled 5% → 49%）。
- ✅ **Probe 0b（2026-09-13）：`speaker` 替换把结构读成内容。** 冻结分支要「训练零点」，对照 DISCOVERY 合同 §5 / §6.1 改做 `replay`
  （另一场同一 tick 的整队电台：只拿掉与本场局面的对齐）。两个 Δspeaker 大的对照冠军在 replay 下几乎归零（s2 蓝 +0.56 → +0.02，胜率 49% → 49%）。
  ⇒ **`replay`（带噪声底，|Δ| > 2 × 自己的回放噪声底才算）是 D2s 的内容读数**；d2-long 用它重读只作描述。坑 #31。
- ✅ **Probe 1a（2026-09-13）：只加预算的进化找到过一次内容用法。** d2-long 用 replay 重读（描述）：12 个读数里 2 个正向候选；
  n=96 复现规则（> 2 × 噪声底且 > +0.10）下 **s2 蓝 g149 复现**（+0.170，胜率 69% / replay 61%），s1 蓝 g299 没复现（+0.068）。
  Δspeaker 报的三个「强依赖」在 replay 下 ≈ 0（形状，坑 #31）。发送端 max MI 2.0% ⇒ 内容不在 5 个候选指称里；⛔ 不叫语言。
- ✅ **Probe 1b（2026-09-13）：那次内容用法只在 g149 一代冠军身上**，g148 / g150 都没有（Δreplay −0.091 / +0.019）。过滤自检逐位相同。
- ⚠ **Probe 1c-A（2026-09-13）：判据本身错了。** 换世界种子重跑同一冠军：+0.170 / −0.021 / +0.117，而当次「噪声底」自己在 .043–.146 之间跳
  ⇒ 「|Δ| > 2 × 一次空抽」不是显著性检验（坑 #32）。改用逐场配对估计（只换估计量，不换干预）。
- ✅ **Probe 1d（2026-09-13）：那次内容用法是真的，但只值 +0.07。** 4 个种子 × n=96 = 1536 场配对：Δreplay **+0.072 ± 0.032 SE**（2.27 SE），
  空对照 −0.011 ± 0.032 ✓。⇒ 300 代里最好的候选也只有这么大，而训练里每个个体只打 5 场 ⇒ **选不出来**。
- ❌ **杠杆 1 = 种群规模（等算力，2026-09-13）：16 → 48 买不到内容用法。** 16 × 300 代 vs 48 × 100 代（= 4800 个体代），
  每组 6 个等算力点位 × 2 run × 2 色 = 24 个冠军读数：A 合计 Δreplay +0.005 ± 0.021、B +0.041 ± 0.021、**B − A +0.036 ± 0.030（1.22 SE）**，
  两组空对照都 ✓。⇒ 按冻结分支，下一根 = **评估场次**（每个体 5 → 15 场，代数 1/3，等算力）。

- ❌ **杠杆 2 = 评估场次（等算力，2026-09-14）：每体 5 → 15 场也买不到。** C = pop 16 × 100 代 × 每体 15 场：Δreplay −0.004 ± 0.022，
  **C − A −0.009 ± 0.031（0.28 SE）**，空对照 ✓。
- ⛔ **两根便宜杠杆用尽 ⇒ 停在人工闸门**（按 `runs/d2s-lever2-predictions.txt` 冻结的分支）：不自开第三根杠杆、不加大算力承诺、
  不碰选项 2（脚手架要先改 VISION §7.1）。决定所需的四个数在 LOG 2026-09-14 那条。

**Intervention**：一次一根，按 Probe 1 的答案选；每根杠杆带自己的预测文件和算力上限。

**Exit**：某一根搜索杠杆下，真实电台 run 的依赖内容用法（修好的 radiouse，Δspeaker）在同一血统里**跨读数点保持**，且至少 3/4 冠军成立；
具体阈值随那根杠杆的预测一起冻结。任何根都做不到 ⇒ 记录「这些搜索杠杆救不了」，回到用户做下一个决定。

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

# Programme E — 五个真正不同的人 + 一支真正的队 + 一个真正的对手生态

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

### Fitness rule

个人 K/D / damage 默认**不是 reproduction fitness**。先按整队比赛结果选择，个人统计只做 identity / diagnosis。

### Exit

~~analytics 能从行为识别同一队不同 player，而不是只靠 slot id。~~
⚠ **2026-09-13 实测：现在的共享大脑就能过这一条**（见下方进度）⇒ 它分不出「共享大脑」和「个体参数」，不是门。
按 §3 收紧（⛔ 不降低）：

- 候选架构必须在**同一把尺子**（`npm run identity`：one-hot 旋转拉丁方 + 随机标签对照）上**超过共享大脑 + slot one-hot 的基线**，
  而不是只超过 1/teamSize 的偶然水平；
- 并说清超过的是哪一项：**表达**（身份信号更强，或出现在一条第一层 bias 表达不了的行为上）
  还是**遗传**（player block 单独继承；换身体 / 换队后 signature 跟着 block 走，SUBSTRATE T9）。

### 进度（2026-09-13）：probe-first 推翻了施工前提

`npm run identity` 把「出生位置」和「one-hot 身份」拆成两个平衡的标签（16 格 × 16 种子，chance 20%）：
carrier 身份 **36–66%**，去掉电台特征后 **31–55%**，16/16 格高于偶然；出生位置 47–64%，随机标签对照 6–25%。
⇒ ⭐ **slot one-hot × 第一层权重 = 每人一条 40 维 bias，就是上面候选第二条「shared team genome + per-player compact bias vector」——
它已经 ship，而且被进化用上了。** 预测 P2（「五个身体不是五个人」）错了。
⇒ ⛔ 不按原计划直接造 player block。E1 保留，但问题从「有没有个体」改成「一条第一层 bias 的个体**不够**在哪」——
动工前要先有一个「不够」的证据。数字与限制在 LOG 2026-09-13 14:57。

### 进度（2026-09-14）：先问世界「形态级个体」值多少 —— 反而更差

`npm run roledemand`（同 memdemand / radiodemand 的问法：手写守方，只换个体差异的形态）：五个相同 **13%** ·
每人一个常数（谁守哪点）**38%** · 五个不同角色 19% / 24% · 完美分配上界 43%。
对照逐格复现 radiodemand 的 `private 0s` 与 `site-holder ref` ✓。
⇒ **形态级角色比一个常数还低 13pp**，E1 仍然**没有**「一条 bias 不够」的证据 ⇒ ⛔ 不造 player block、⛔ 不降低 exit；
这只排除了**这一组**手写角色（角色空间里的一个点）。⇒ E 线转 **E2**（团队 prior 的 demand 先问世界）。
⚠ 上界只有 43% 且**对假打只有 27%**：跟着当前位置走的分配会被假打整队拽走 ⇒ 缺的是信息，不是分工。

---

## Phase E2 — Team DNA / opening prior

**Question**：队伍能否在回合开始拥有共同战略 prior，但仍由每个玩家临场执行？

### Build

- team-level genotype / context generator；
- round-start `openingPrior`；
- every player receives same prior + own state；
- prior 不能包含 waypoint/timed action script；
- team/coach layer 不获得额外 engine truth。

### Probe

- 固定 player genomes，仅改变 team prior/genome → 全队 opening shape/tempo 应系统变化；
- mid-round 信息足够强时，player 可以偏离 opening prior；
- prior ablation 后 coordination/style 可测变化。

### 进度（2026-09-14）：先问世界「回合开始的共识」值多少 —— 共识不值钱，**混合**值钱

`npm run roledemand`（同一把尺子，新增三行）：每人一个常数 3/2 **38%** · 各自掷硬币（同边际、无共识）**42%** ·
全队掷一次（有共识、计划会变）39% · 全队压一个点 **48%**（最好的合法行，甚至高过「完美分配」上界 43%）。
⇒ **共识 − 无共识 = −4pp**，⛔ 不建团队基因型。
把这张表当零和博弈解（只做算术）：守方均衡 **41.5%**（压点 68% + 换计划 32%），攻方均衡 = 直攻 63% + 假打 37%，
而任何单一合法打法的最坏情况最高 **27%** ⇒ **混合比固定打法多 14.5pp**。
⇒ ⭐ **世界付钱的不是「全队说好」，是「可变且对手猜不到」** —— 而它只有对**会适应的**对手才兑现。
⇒ E2 的建造问题因此改写成「可变的 prior 值不值」，而且必须在**对手生态**里问 ⇒ 下一条开的线是 E4–E6，先做探针。
⚠ 三个手写攻方只是三个点。数字与冻结预测在 LOG 2026-09-14 与 `runs/e2-*-predictions.txt`。

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

## Phase E4 — Club genotype：把 player + team DNA 变成一个可遗传的俱乐部

**Question**：我们能否让“这个人是谁”和“这支队怎么踢”分别遗传/突变，同时仍用整队胜负筛选？

### Target representation

```text
ClubGenome
├─ Team/Coach block
├─ Player 1 block
├─ Player 2 block
├─ Player 3 block
├─ Player 4 block
└─ Player 5 block
```

不要求 player block 等大；先用 E1/E2 已验证的最小结构。

### Mutation / reproduction

一次 child club 可以：

- 主要继承 parent club；
- mutation 命中 team block 或某个 player block；
- crossover 若保留，必须有清楚的 block provenance，不能把五个人随机搅成不可解释噪声。

### Selection

- primary fitness = side-balanced club match results；
- individual stats = diagnostics only；
- 保留 lineage：哪次跃迁来自 team mutation / player mutation 要能追。

### Probes

- fixed team block, mutate one player → 能形成局部可遗传差异；
- fixed players, mutate team block → opening/team-level behavior 系统变化；
- swap one player between otherwise identical clubs → performance / coordination 可测改变。

### Exit

club identity 不再等于“一张共享网 + slot one-hot”，且参数规模/突变率经过重新 sensitivity calibration。

---

## Phase E5 — Side-neutral League：红蓝从物种退化成比赛 sides

**Question**：是否可以不再靠两个永久 population 定义进化，而让多支 club 在同一个 league 里竞争？

### Migration

- 建 `ClubPopulation / League`；
- match 临时分配 sides；
- fitness 使用 side-swapped / mirrored evaluation；
- 同一 club 可以在两侧出赛；
- red/blue population identity 从 genetics 移除，但 mirror/fairness tests 保留。

### Baseline bridge

迁移前先用当前 red/blue genomes 包成“legacy clubs”，证明新 scheduler 在等价对局集上不改变旧结果；然后才让 club reproduction 接管。

### Probes

- same clubs side swap：相对实力不应因颜色系统性翻转；
- league round-robin 小样本能复现 pairwise duel；
- club identity / style 在换 side 后仍可识别。

### Exit

“Red champion / Blue champion”不再是最终进化本体；UI 可以继续用红蓝显示一场比赛，但遗传对象是 club。

---

## Phase E6 — Opponent ecology：对手分布才是老师

**Question**：club 面对哪些对手，才能避免两队 co-adaptation、遗忘和假强？

### Opponent pool arms（逐个加入，不一次全开）

E6a. **current peers**：rating/strength 邻近，对抗难度自然递进；

E6b. **historical archive**：跨时代抽样，防 forgetting；

E6c. **style-diverse contemporaries**：从 read-only style embedding / behavioural distance 抽样，防只会打主流镜像；

E6d. **exploiters / challengers**：专门寻找强 club 当前最容易被击穿的策略。它们是训练角色，不是游戏内职业。

### 进度（2026-09-14）：仪器先做好了，但「冠军很脆」这个前提**这个预算下没测到**

`npm run exploit`（SUBSTRATE §10.4 五把尺子的最后一把）：冻住 d2-long@299 的冠军，挑战者种群**只**打它 40 代。
四个目标：打穿 1 个（83% vs 同辈 48%）· 打平 1 个（50% vs 同辈 4%）· **被反杀 1 个**（0% vs 同辈 52%）· 1 个被 P3 判空（零接触）。
⇒ P1、P2 都不成立 ⇒ ⛔ 不凭「内部指标高估冠军」这个直觉开 E4–E6；⚠ 40 代对 300 代是便宜的 best response，失败只约束这个预算。
⇒ 仪器留下，将来 E6 的任何 exit 都用它。
⭐ 另一条相关读数（描述，2026-09-14）：`crossplay --gens every:25` 把**一条血统自己的历史**做成矩阵，d2-long-s1 红方
末代（g299）均值 **65%**，而 g225 是 **69%**、g275 是 67% ⇒ **末代不是它血统里最强的**（g0 只有 14%，进步本身是真的）。
ladder 只比两个点，看不见这个；E6 的 forgetting 那一臂将来要用这把尺子量。

### 不写死比例

不要直接拍 `50/20/20/10`。先用 probe 回答：加哪一臂真正减少 exploitability / forgetting，成本多少，再定采样权重。

### Required evaluation

- current cross-play matrix；
- held-out opponents；
- history-vs-current matrix；
- exploitability/challenger win share；
- opponent-style coverage；
- non-transitive cycle detection；
- population/team style diversity。

### Strong rule

**不要把“打赢唯一熟悉对手”称为 progress。**

若 A 克 B、B 克 C、C 克 A，允许它作为真实 meta 内容存在；用矩阵/谱系展示，不硬压成单一 Elo 神话。

### Diversity policy

先靠生态位 + 资源/能力 trade-off 维持多样性；不先加 `styleNoveltyBonus`。只有证据显示生态仍塌缩，才 reopen explicit diversity mechanism。

---

# Programme F — 职业 CS 的更厚世界（后续，不阻塞核心底座）

只有 A–E 核心腿稳定后再做。每项单独 phase。

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

# Programme G — 让进化“看得见、看得懂、证得出”

## G1 — Information-flow debug

POV overlay：

- actual vision contacts；
- heard sectors；
- radio inbox/outbox；
- memory confidence（debug only）；
- 与 omniscient spectator truth 可切换对照。

目标：能回答“这个 player 当时合法知道什么”。

---

## G2 — Read-only known tactic detectors

逐个建立 detector + precision sanity check：

- trade-like event；
- crossfire geometry；
- pressure→switch；
- rotate；
- isolated/lurk-like path；
- clutch/man-disadvantage tempo；
- pair coordination。

detector 结果禁止进入 live sim。

这些 detector 的作用是拿职业 CS 当尺子，不是限制 discovery 只能发现这些词。

### 进度（2026-09-14）

- ✅ **trade detector 建成并关闭**（`npm run detect`，正文 `src/probe/detect.ts`，在 T8 防火墙后面）。
  定义：队友死后 3 秒 / 12 米内，另一名队友打死凶手。precision 先跑（手写同路 31% / 和平主义 0%）✓。
  第一步用「时间打乱」的零假设读到 3–10.5 倍（s1 蓝 55%）；第二步换成**条件化**零假设（只看队友确实在窗口内打死了人，问打中的是不是凶手）
  后 lift = **0.78–0.82**（≈ 随机，甚至略低）⇒ 那个倍数是**击杀成簇**造成的。
  ⇒ 在这个定义下**没有超出偶然的证据**；⛔ 不等于「不会补枪」，只约束这个定义与窗口。数字与两份冻结预测见 LOG 2026-09-14。
  ⭐ 方法教训：detector 的零假设必须保住**真实的时间结构**，否则任何在打架时成簇的事件都会读出高倍数。
- ⏳ 下一个：crossfire 几何（同样 probe-first：先 precision，再读冠军）。

---

## G3 — Style space / lineage

展示：

- generation / era style embedding；
- club/team clusters；
- player identity cards；
- pair chemistry；
- club-vs-history / cross-play matrix；
- communication vocabulary evolution；
- tactic frequency over generations；
- team/player mutation lineage。

目标是用户能够**肉眼看见“这队学会了什么、谁改变了这支队、这个时代为什么克上一个时代”**。

---

## G4 — Evolution Discovery Feed：发现“以前不存在的东西”

**Question**：系统能否主动把进化中真正值得看的新行为浮出来，而不是只给 fitness 曲线？

### G4a — Novel structure detection

在不预设战术名字的 feature space 里找：

- 代际突然出现并稳定的 trajectory motif；
- 新的 message→action dependency；
- 新 pair/team coordination motif；
- 新 spatial/tempo/communication cluster；
- tactic detector frequency 的结构突变。

输出只说“这里出现了新结构”，不急着命名。

### G4b — Candidate interpretation

把 discovery 对齐到：

- sender 合法 percept / public events；
- receiver 后续动作；
- opponent response；
- match outcome；
- lineage / first appearance。

可以给人类可读 candidate label + confidence，例如：

- `trade-like`
- `possible B-contact radio symbol`
- `pressure → switch pattern`

### G4c — Causal validation

重大 discovery 至少自动/半自动生成一个判别实验：

- radio-off；
- message shuffle / token permutation；
- cue mask；
- history reset；
- same-seed counterfactual replay；
- player/team block swap。

只有 intervention 支持，才从 `candidate` 升为 `validated emergence`。

### G4d — Product surface

理想卡片：

```text
Gen 217 — Communication structure emerged
Token 6 与 speaker 的 B-side visual contact 强相关；
receiver 收到后 3 秒内显著改变空间分布；
message shuffle 后效应消失。
Candidate meaning: B-side contact / pressure cue.
```

或：

```text
Gen 391 — New team pattern
A pressure → defender rotation → disengage → B commitment
过去 50 场稳定出现；radio ablation 后完成率下降。
Candidate tactic: fake A → B.
```

**这不是叙事生成器。每张卡必须能下钻到录像、统计和干预证据。**

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
- champion-vs-gen0 / past-self（在 club league 上线前）；
- population mean 不得只靠单个 lucky champion。

影响 rendering：

- 按 CHECKPOINT 的真实页面验证流程；
- first-person + director 至少各看一次；
- debug overlay 不能污染默认画面。

影响 information boundary：

- counterfactual leak suite 必须全绿。

影响 map/objective：

- side fairness；
- route accessibility；
- spawn sightline；
- scripted competence reference probes。

影响 club/league evolution：

- side-swapped evaluation；
- cross-play matrix；
- history held-out check；
- optimizer/genome scale sensitivity；
- 不能用一个 scalar rating 掩盖明显非传递循环。

声称“新语言 / 新战术 / 新角色已涌现”：

- detector / discovery evidence；
- lineage / first-appearance evidence；
- 至少一个 mechanism-relevant intervention；
- analytics firewall 仍绿。

---

# 3. Future-agent operating instructions

拿到 repo 后：

1. 读 `CHECKPOINT.md` + `GOTCHAS.md`；
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

⚠ E4–E6 / G4 是本轮新增的 future target；**不得绕过当前 A0/A1 直接开工**。它们解决“最终进化生态和可解释观赏性”，不是当前 cursor。

---

# 4. Current Cursor

**当前（2026-09-14）：Programme E —— E1 无证据不动工，E 线在 E2（团队 prior），先问世界 demand。**

- 用户在 D2s 的闸门上选了「回主线 Programme E，电台押后」（2026-09-14）。D2 / D2s 的结论与尺子封存，生态立起来后可直接回头量。
- E1：`npm run roledemand` 读出「形态级角色比每人一个常数还低 13pp」⇒ ⛔ 不造 player block、⛔ 不降低 exit（见 E1 进度）。
- E2 demand 已读完（见 E2 进度）：**共识不值钱（−4pp），混合值钱（均衡 41.5% vs 单一打法最坏 27%）** ⇒ ⛔ 不建团队基因型。
- ✅ 对手生态线的第一个探针做完：`npm run exploit` 入库，但**四个目标里只打穿一个、还被反杀一个** ⇒ ⛔ 不开 E4–E6（见 E6 进度）。
- ⛔ **停在人工闸门**：E1（无证据）· E2（共识不值钱，混合只在会适应的对手下值钱）· E6 前提（这个预算下没测到）都不支持继续动工，
  下一步要用户定。

<details><summary>D2s 停在人工闸门时的记录（2026-09-14）</summary>

**当时：Phase D2s 停在人工闸门 —— 两根便宜搜索杠杆（种群 3×、评估场次 3×）都买不到电台内容。**

- 进度与四个决定用的数见 Phase D2s 进度 + LOG 2026-09-14。⛔ 在用户定之前：不开第三根杠杆、不加大算力承诺、不碰选项 2（要先改 VISION §7.1）。
- 尺子已经可信：内容读数 = `radiouse` 的 `replay`，逐场配对 mean ± SE，空对照同形（坑 #31、#32）。
- 若要继续 D2s，现成的下一批候选（都需要用户先拍板算力或方向）：更大数量级的预算 · 改变选择结构（多样性 / 生态 / exploiter，属 E6 地界） ·
  让电台的回报更陡（改世界，要先过 VISION §10 的 shaping 三问）。
- ⚠ 本机会以内存不足杀长任务：训练带 `--snap-every`，同命令重跑即续上。

</details>

<details><summary>D2 选项 1 的当时记录（2026-09-13 21:04）</summary>

**当时：D2 选项 1（用户 2026-09-13 选定）—— 真实电台只加预算，300 代 × 2 seed 在跑。**
运行 `runs/d2-long-s{1,2}`，预测 `runs/d2-long-predictions.txt`（含两段 addendum）+ `runs/d2-long-phase-predictions.txt`（时钟混淆检查）。
对照门槛 P3'' 没过 ⇒ 逐冠军报告。结果见 Phase D2 进度与 LOG。

</details>

<details><summary>D2c 的当时记录（2026-09-13 14:57）</summary>

**当时：D2c —— 问世界「一条合法的有限电台值多少」。**

E1 的 probe-first 推翻了施工前提（共享大脑已有个体身份，见 Phase E1 进度），D2 的架构假说随之削弱；
telepathy 只给了**精确坐标**的上界，有限电台能拿到多少没人量过。
⇒ 用 memdemand 同法：手写 reference bot **只通过**真实的 `commSaid → commWire → heardComm` 通道说和听，扫符号数 / 间隔 / 延迟。
值钱 ⇒ 进化找不到是 **search** 问题；不值 ⇒ **通道本身太窄**，先改 D2 设计。

</details>

<details><summary>C2 的当时记录（2026-09-13 上午；C2 的世界规则部分之后已关闭）</summary>

**当时：Phase C2 —— round state / kill feed / objective public info。**

⭐ **C1 已 CLOSED**（C1a 机制 · C1b 双点位与路网 · C1c reference-bot exit 3/3）。
⇒ 现在挡路的是**进化 agent 看不见回合状态**：点位在哪、哪个 armed、倒计时剩多少，全是 C2 的公开信息。
⛔ **在 C2 之前不要在双点位地图上训练并解读结果** —— 它们还没被告知比赛规则。
⚠ C2 之后要做的第一件事是**重跑 baseline**：胜负条件和地图都换了，`README` Evidence 表、坑 #23 的 0%、
所有 `runs/*.json` 的 cross-play 胜率都是**旧规则下的数**（坑 #12）。

</details>

<details><summary>C1 的当时记录（2026-09-12）</summary>

D1 已经走完并给出判决：实现 ship、开关保留、**默认不翻**、行为侧 exit 未过，而且失败的原因**指向世界而不是脑子**
（见 Phase D1 的「当前状态」）。同一晚 `npm run yardstick` 独立测到目标压力已经归零（12 个冠军对 rusher 全 0%）。
两条独立证据指向同一个根：**这个世界现在既不奖励占点，也不奖励信息博弈。** ⇒ 下一根承重杠杆是 C1。

⛔ 不要在 C1 之前回头换 GRU、加宽 recurrent state、或调 fitness 系数——那是在一个不付钱的世界里调参。

</details>

已 CLOSED（2026-09-11 ~ 09-12）：A0 · A1 · A2 · A3.1 · A3.2a · A3.2b(+镜像修复) · A3.3 · A4 · V11+V12 · **V6a**。
**信息层全部关闭**（V1/V2/V3/V5/V11/V12）；observation 100 维、97 legal / 3 truth-form / **0 hidden**。

剩下的账与它们的探针：
- **V4** target-slot 自动瞄准 —— `A1-P12`（look 全 0 头仍转 24°）· `A1-P14`（转向的是我的记忆而非他真身）。
  ⚠ 动它必须**连带重做转头手感**（`turnRate`/`scanTurnRate` 按 `targetId` 切换、look 低通建立在「动作=绝对方向」上），
  见 SUBSTRATE V4 的前瞻警告 + GOTCHAS #10：⛔ 不要照搬常数。
- **V6b** 记忆归属 —— `A1-P23`（1.8 秒后回忆的方位逐位不变 ⇒ world 存了完美记录）。
  ✅ **前置的 mutation/inheritance sensitivity 已经做完**（2026-09-12，见 Phase D1 的 Evolution gate）：
  结论是 genome 变大本身不需要改 σ，先原样上、新架构上复测。⇒ **V6b 现在没有未清的前置。**
- V7/V8/V9/V10 仍在 Programme D–G。

### 尺子已经换掉（2026-09-12，CLOSED）

`npm run crossplay`：任意几个 run 的 hof 冠军互打，每对**两个颜色都打**、共用同一批 seed、胜率按 side 平衡，
**每个格子自带分母**（sighting ticks / shots），零接触印 `··`。入口与用法见 `README.md`「Cross-play」一节。

它立刻推翻了三件之前被当成事实的事（完整证据在 LOG 2026-09-12 03:35）：

1. ⭐⭐ **champion-vs-gen0 在红方血统上量的是一场没发生的比赛。** `v6a-fade-s1` 的红方 `ladder0` 连续五代读 50%，
   实测是两个冠军 **16 场 0 个 sighting tick**。加上标记后重跑，36 个 ladder 格里 **5 个（14%）零接触，其中 4 个印 100%**。
   ⇒ ladder 现在带 `ladderSight`/`ladder0Sight` 分母，零接触印 `·`（GOTCHAS #20）。
   ⛔ V4 / V6b 的 A/B **不许**再用 champion-vs-gen0 的单一数字下行为结论。
2. **「seed 3 反复失联」的说法是错的。** 三张地图 × 六个冠军：低接触是**成对**性质（两条策略走位不相交），
   不是血统性质也不是 map seed 7 的性质；换图**没有**让这些对接触起来，有两对反而掉到 0。
3. **训练 fitness 跨 run 会倒挂**（GOTCHAS #21）：训练排第 2 的冠军实战排第 5，训练垫底的实战排第 3。
   ⇒ 这是本仓第一份「对手分布才是老师」的实测证据，也是 E4–E6 的动机从推理变成观测的那一刻。

⭐ 顺带一个 E5/E6 的现状读数：15pp margin 下三张图各 9 / 10 / 9 条 decisive edge，**非传递三环 0 个** ——
当前 meta 是传递的，还没有 A 克 B 克 C 克 A 的内容。这是事实，不是失败。
