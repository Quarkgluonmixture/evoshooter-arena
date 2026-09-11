# EvoShooter Arena — 愿景 · 金标准 (VISION / THE GOLD STANDARD)

> 这份文档定义 **EvoShooter 最终想成为什么**。它是用户意图与设计边界的最高层 authority。
> 当前已经 ship 的行为与数字仍以 `README.md` / `src/` 为准；目标底座合同见
> [`SUBSTRATE.md`](SUBSTRATE.md)，施工顺序与验收账本见 [`ROADMAP.md`](ROADMAP.md)。
>
> **发生冲突时：VISION 决定方向；SUBSTRATE 解释正确的机制形状；ROADMAP 决定施工顺序；
> README 只描述当前现实。不要为了保住当前实现而降低 VISION。**

---

## 0. 北极星 (THE NORTH STAR)

EvoShooter 不是“神经网络玩一个简化 FPS”，也不是“给机器人一堆战术按钮”。

目标是：

> **造一个足够真实、信息诚实、动作自由的战术射击底座，让 5 个彼此独立但能协作的玩家，
> 在长期竞争、共进化和共同经历中自己长出像职业 Counter-Strike 一样可辨认、可适应、可对抗的
> 枪法、位置、角色、默契、沟通、开局安排、mid-round 调整和整队风格。**

更短的一句话：

> **真正的进化，就是我们只造完整而诚实的世界、感知和行动自由度，不预设答案，让角色、技巧、
> 战术、默契、语言与风格全部在竞争中自己长出来。**

用户 2026-09-11 进一步明确了“为什么这件事值得看”：

> **进化的观赏性来自可解释性。** 足球里，是看到一个边锋从不会内切，到突然长出向中线带球再射门；
> Shooter 里，是看到一支队伍的耳麦里长出一整套语言，而且真的靠这套语言执行“假打 A、真打 B”。

因此第二条北极星是：

> **最好的进化不是 fitness 数字变大，而是世界不断诞生出以前不存在、我们看得懂、还能用因果证据
> 证明“它为什么有效”的新行为。**

玩家看录像时应该能够说：

- “他们开始会补枪了。”
- “这个人好像天然在做 lurk。”
- “这队很喜欢先给 A 压力再转 B。”
- “这个双人组越来越有默契。”
- “少一个人以后，他们现在明显会换打法。”
- “这支队几乎不说话，但靠站位和动作也能互相读懂。”
- “他们的 token 6 好像已经变成了一个真正的报点词。”
- “这一代第一次出现了上一代完全没有的战术，而且能克当时的主流。”

但源码里不应该存在 `TRADE`, `LURK`, `FAKE_A`, `RUSH_B`, `ENTRY`, `ANCHOR`,
`SAVE`, `CROSSFIRE` 这些 live 决策标签来替他们做决定。

**这些词属于录像分析和人类叙事层，不属于球员脑内的作弊菜单。**

---

## 1. 灵魂：涌现，而不是我们替它打职业赛

### 1.1 底座给“腿、眼睛、耳朵、嘴和记忆”，不教套路

铁律：

- 我们可以提供现实里存在的**自由度**：前后左右移动、转头/瞄准、开火、停火、换弹、姿态、速度/gait、声音、遮挡、无线电、记忆。
- 我们可以提供现实里存在的**代价和约束**：移动影响命中、转身需要时间、视线会被墙挡、远处看不清、移动会产生不同响度的脚步、换弹占时间、枪声传播。
- 我们可以提供**可进化的能力/倾向维度**：视觉质量、反应、枪械控制、风险偏好、通信倾向、个人偏移、team prior 等。
- **我们不能提供战术结果按钮**：`peekLeft()`、`tradeNearest()`、`fakeAThenB()`、`holdCrossfire()`、`saveWhen2v5()` 都是违规。

诊断缺行为时，第一问不是“加哪个 if”。第一问是：

> **现实中的人为什么能发现这个策略？我们的世界是不是缺了让它成立的感知、动作、记忆、
> 通信、物理、目标结构或选择压力？**

缺的是“腿”就补腿；腿齐了仍不选，才是进化自己的选择。

### 1.2 现实术语 = 验收镜子，不是 API

职业 Counter-Strike 提供很好的行为参照，但我们只借它来问：

> 如果世界自由度完整，是否有可能自然长出这些现象？

例如：

- default / map control
- contact / execute
- fake / re-hit / rotate
- lurk
- entry + trade
- crossfire
- spacing
- information play
- pressure / disengage
- clutch adaptation
- man-advantage / man-disadvantage adaptation
- save / exit denial
- CT anchor / rotator 式分工
- secondary calling / local initiative

这些词**永远不成为 policy action、role enum、隐藏奖励或特殊权限**。

### 1.3 静步的正确本体：速度—声音自由度，不是技能按钮

现实里玩家“静步”成立，是因为**移动速度、步态和声音暴露存在连续的物理/感知代价**。

正确底座应让玩家选择怎样移动，并由运动状态产生脚步响度/频率；进化自己发现“接近危险区域时慢下来”值不值。

因此不要把 `SILENT_WALK` 当战术技能或自动条件分支。即使工程接口最终有 `walk/gait` 控制量，它表达的也只是身体执行方式；
“静步摸点”“跑转静”“声音 bait”都必须从轨迹和声学后果里长出来。

---

## 2. 现实职业 CS 的抽象：三个时间尺度

职业赛最重要的启发，不是某个固定套路，而是战术同时存在于三个时间尺度。

### 2.1 长时间尺度：队伍 DNA / playbook / 默契

一支成熟队伍有长期形成的共同 prior：

- 愿意承担多大风险；
- 偏好快速占空间还是慢慢拿信息；
- 更相信局部个人主动还是强结构；
- 如何分配地图责任；
- 什么样的信号意味着“继续施压 / 收手 / 转点”；
- 谁更常成为第二声音；
- 某两个玩家之间如何互相读动作。

这些都可以演化，但**不能实现成写死战术表**。

### 2.2 回合开始：opening agreement / freeze-time common prior

职业队会在回合开始拥有共同安排。比如人类会说“先给 A 压力，真实目标 B”。

EvoShooter 也应允许队伍在开局形成一个**全队共同知道的粗粒度 prior**。

但正确实现不是：

```text
P1 goto A
P2 smoke X
at 12s rotate B
```

而应是一个能影响每个玩家私人决策的共同 latent / parameterized prior。

它类似“我们大概怎么踢这回合”，不是逐 tick commander。

### 2.3 秒级：distributed mid-round adaptation

真正的职业战术不是 IGL 每 66 ms 给四个人发坐标。

现实中：

- caller 只拥有自己看到/听到的信息；
- 其他人持续贡献局部观察和想法；
- 某些区域由局部玩家 micro-manage；
- secondary caller 可以接手一部分 mid-round；
- 新信息出现后，原 opening plan 可以被推翻。

因此 EvoShooter 的目标是：

> **共享 prior + 五个局部脑 + 有限通信 + 外显动作 + 不断更新的私人 belief**

共同产生 mid-round，而不是 central omniscient brain。

---

## 3. 信息权限：内部、外显、推断严格分开

这是整个项目的承重墙。

### 3.1 每个人拥有三个不同 authority

**Private internal state（只有自己知道）**

- 自己的 memory / recurrent state；
- 自己当前想做什么；
- 自己对敌人和队友意图的 belief；
- 自己的风险判断和下一动作倾向。

**Externally observable state（别人可能观察到）**

- 位置；
- 移动方向、速度、加速度；
- 身体/枪口朝向；
- 是否开枪；
- 换弹动作；
- 姿态；
- 受到伤害后的外显结果；
- 死亡；
- 产生的脚步/枪声；
- 主动发出的 radio message。

**Observer-local belief（每个观察者自己推断）**

- “他可能准备 peek”；
- “这个枪声大概来自左后”；
- “队友可能在吸引”；
- “这个敌人可能还在刚才的位置”；
- “对方可能正在 rotate”。

**禁止把一个人的 private state 直接复制给另一个人。默契不是 telepathy。**

### 3.2 队友之间先靠身体，再靠无线电

离得近且在视野里：

- 我能看见队友怎么走、朝哪里看、什么时候停、是否开枪、是否换弹；
- 我可以据此提前配合；
- 长期共同经历可以让同样 cue 被更快、更稳定地理解。

离得远：

- 我看不到他的身体动作；
- 我只拥有 HUD 允许的信息 + 他通过 radio 主动广播的有限消息；
- 如果他不说，我不能凭空知道他看见了什么。

这给“默契”“报点”“第二声音”“沉默队伍”等风格真正的生存空间。

---

## 4. 感知必须诚实：像人，不像 world-state API

### 4.1 Vision

玩家不是在 30 m 内获得真值、30.01 m 后什么都不存在。

正确目标：

- 视野有 FOV；
- 墙、掩体、烟雾（未来）会遮挡；
- 中央视野更精确，周边更粗；
- 距离越远，角度/距离/动作细节越难判断；
- 暴露面积越小越难看清；
- 看见一个人 ≠ 知道精确坐标/HP/其内部 target；
- 视觉误差必须 deterministic/replayable，不能破坏仿真复现。

参考 tactical-shooter bot 工作的正确可迁移点是：**pixel-free 不等于 truth-state**。
可以使用 ray / structured sensor，但它必须表现为“这个玩家真的可能感知到的东西”。

### 4.2 Hearing

声音是独立感官，不是装饰。

底座至少应允许：

- footsteps / landing；
- gunshots；
- reload（是否加入由后续现实审决定）；
- objective / utility（进入相应 phase 后）。

声音给：

- 大致方向；
- 粗距离/强度；
- 时间；
- 受距离、遮挡、声学环境影响。

声音**不直接带 enemy ID / exact XYZ / 战术语义**。

这才能让 silent movement、sound bait、假信息和听声判断成为可能。

### 4.3 HUD / public game state

现实玩家可以合法知道的信息，可以通过 HUD 精确提供，例如：

- 自己 HP / ammo；
- round time；
- 队伍存活人数；
- kill feed（谁杀了谁；不凭空附送死亡坐标）；
- 已确定的 objective 状态。

队友位置/radar 的最终规则要明确区分：

1. HUD 直接合法提供的 teammate state；
2. 自己眼睛看到的队友 body state；
3. radio 传播的信息；
4. 自己的记忆和推断。

### 4.4 永久禁止的 observation 泄漏

除非未来 VISION 明确修改，policy 不得直接读取：

- 墙后敌人的当前精确位置；
- 敌人真实 HP；
- 敌人的 private intention / target；
- “敌人是否正在看我”这种从真值 yaw 算出的结论；
- hidden enemy exposure；
- 任何 teammate 刚看到后立即复制给全队的 exact enemy state；
- 为方便 metric 计算而存在的 engine truth。

metrics/debug 可以看 truth；live brain 不可以。

---

## 5. 身体自由度：控制身体，不选择战术结果

### 5.1 动作空间的北极星

像 EvoFootball 的“控制那一脚，而不是选择‘直塞’标签”，Shooter 应控制身体和枪：

- movement intent / acceleration / gait；
- view / aim rotation；
- trigger；
- reload；
- stance / crouch / jump（在对应现实审 phase 引入）；
- weapon/utility physical controls（未来）；
- radio emission。

结果由物理和对手共同产生。

### 5.2 不该是动作的东西

以下都应由轨迹事后识别：

- jiggle peek；
- shoulder peek；
- wide swing；
- pre-aim；
- silent approach；
- entry；
- trade；
- crossfire；
- bait；
- lurk；
- rotate；
- fake；
- clutch style。

如果一个行为只能靠新增同名 action 才出现，优先判为**底座仍不完整**。

### 5.3 看见 ≠ 看清 ≠ 枪口对上 ≠ 命中

射击链应拆开：

1. 目标是否产生 visual contact；
2. 玩家对方位的 percept 是否足够好；
3. 玩家是否把视线/枪口转过去；
4. 身体运动、枪械后坐/散布、瞄准稳定度如何；
5. 对手是否移动/遮挡；
6. 子弹最终是否命中。

不能因为选择了 `enemySlot=2` 就自动朝真值坐标转枪。

---

## 6. 个体、队伍、教练与“角色”

### 6.1 五个人最终必须真的是五个人

当前 shared team MLP + slot one-hot 是有用的第一版，但不是终局。

最终模型应允许：

> **Team / coach DNA × player-specific DNA / state**

团队层表达共同 prior、风险/结构/communication 倾向；个体层表达能力、私人 policy/memory 和个人偏移。

这样才能存在真正的：

- 某人更擅长 first contact；
- 某人更会活命和拿信息；
- 某人更常成为 secondary voice；
- 某个 pair 特别会互相补枪；
- 同一队换个人后打法变化。

### 6.2 Role 只能被发现

`entry / lurker / anchor / rotator / IGL` 可以作为 analytics 的数据驱动标签。

禁止：

- 给 `ENTRY` 特殊速度/伤害 bonus；
- 给 `LURKER` 隐身信息；
- 给 `IGL` 全图真值；
- 给 `ANCHOR` 写死“不得离开 B”。

真实职责是长期策略和位置分布的结果，不是 class selection。

### 6.3 Player DNA 与 Team/Coach DNA 分开，但主要选择单位是整支 Club

最终一个 club 的遗传结构应能区分：

```text
Club genotype
├─ team / coach DNA      # 共同 prior、战略权重、沟通文化
├─ player 1 DNA/state
├─ player 2 DNA/state
├─ player 3 DNA/state
├─ player 4 DNA/state
└─ player 5 DNA/state
```

两层都能独立 mutation / inheritance；但**主要 fitness 来自整队比赛结果**，不是个人 K/D。

原因：一个 player 的价值必须通过“放进这支队以后是否更会赢”体现。否则进化会奖励抢人头、卖队友之类局部统计优化。

个人统计可以做诊断和 identity discovery；除非有明确 cold-start 必要，不直接决定谁繁殖。

Team/coach 也不是第六个全知玩家：它提供共同 prior / philosophy，不获得额外 engine truth，不逐 tick 指挥坐标。

后期如果加入 player swap / transfer，它应成为第二条组合搜索通道，用来观察“强个人换队是否仍强、pair chemistry 是否可迁移”，而不是角色商城。

---

## 7. Communication：让语言自己长出来

### 7.1 Radio 是能力，不是 callout API

底座可以提供有限带宽 broadcast / directed channel，但不预定义：

```text
ENEMY_B
ROTATE_A
FAKE
SAVE
```

正确的是：

- 有明确更新频率；
- 有传输延迟；
- 有有限容量/量化；
- message 本身无预设语义；
- 队友通过共同训练学会解释；
- 可以测 message 与事件/状态的 mutual information / predictiveness。

### 7.2 为什么必须有限

无限连续 float、每 tick 发送，会把无线电退化成另一条 exact-state bus。

有限通信迫使进化回答真正的问题：

> 什么信息值得说？什么时候说？谁说？队友是否已经通过身体看懂，不需要说？

### 7.3 语言与默契不是一回事

- **radio**：主动发送的显式信号；
- **body language**：移动/朝向/枪火等自然外显 cue；
- **chemistry**：从共同经历形成的、更可靠的 cue→intent 推断；
- **opening agreement**：回合开始共同 prior。

四者必须分开，才能产生不同队伍风格。

### 7.4 “长出语言”是强 claim，必须能解释和干预

看到 `token 6` 经常伴随 B 点见敌，只能说“相关”。要说它已经形成语言，至少要能观察到：

1. token 与发送者合法感知/事件有稳定关系；
2. receiver 收到后行为系统性变化；
3. radio-off / message-shuffle / token permutation 会破坏对应协调；
4. 不同 team 的同编号 token 可以有不同语义；
5. 语义随代际形成、稳定、漂移或分叉的历史能被追踪。

最终最有价值的画面不是“comm entropy 上升”，而是：**我们看到一套从噪声里长出来的共享符号系统，并证明它真的参与了战术。**

---

## 8. Memory / belief 是底座，不是奢侈品

Shooter 是 POMDP，不是单帧分类。

玩家必须能够形成：

- last seen / last heard；
- uncertainty 随时间增长；
- 敌人可能移动到哪里；
- 队友刚才做过什么；
- 这个 teammate 的某个动作过去常意味着什么；
- opening plan 是否仍可信。

因此最终 brain 需要 private recurrent state / memory。

注意：

- memory 保存的是**自己的历史感知和内部状态**；
- 不是引擎替他维护真实敌人坐标；
- recurrent architecture 是否 GRU/LSTM/其他属于工程选择，VISION 不指定。

---

## 9. 战术如何“长出来”——几个验收故事

这些不是脚本需求，而是判断底座是否有腿的 counterfactual tests。

### 9.1 Trade

前人冲出 → 后人通过**亲眼看见前人的身体动作/枪火** + radio/history 推断接触即将发生 →
调整自己的角度与 timing → 前人死亡后快速击杀同一敌人。

如果必须写 `if teammateDiedNearEnemy -> shootEnemy`，失败。

### 9.2 Fake A → B

一部分玩家在 A 制造真实可感知压力；另一部分保留 B 方向空间；防守方根据感知和经验做 rotate；
进攻方通过自己看到/听到/队友 radio 得到的信息判断 A 的收益下降或 B 的机会提高，于是重新汇合。

如果代码里有 `FAKE_A_THEN_B` 状态机，失败。

更强的终局验收不是只看到轨迹像 fake，而是能追到它的因果链：例如某个 opening prior 让 A 侧形成压力，
某组 radio symbol 在 defender rotate 后触发全队 disengage/re-group；打乱这些 message 后，fake 的完成率显著下降。

### 9.3 Man-disadvantage adaptation

队友死亡通过 kill feed / radio / 视野成为公共事件；每人更新 belief 与风险价值；整队可能收缩、抱团、
加速、继续 default 或 save。

不同队伍应能给出不同答案。不能写死 `if aliveCount<=3`。

### 9.4 Crossfire

两名玩家因为地图几何、各自风险/视角价值和对彼此位置的理解，自发选择两个互补角度；
敌人进入时，两人可以连续/同时形成威胁。

不存在 `crossfireSpotA/B`。

### 9.5 Lurk / information play

玩家在与大部队分离时仍能通过有限 radio 贡献信息/牵制；是否值得这样做由地图、对手、team prior、
个人倾向和历史收益共同决定。

不存在 `role=LURKER`。

---

## 10. 适应度：赢为主，不奖励我们喜欢的战术

最终选择压力应以真正比赛结果为主。

允许暂时存在的 shaping 只有一个理由：**让早期搜索听得见环境**，而不是奖励设计者偏好的风格。

任何 shaping 都要问：

- 它是否给 `fake / flank / cover / aggressive` 这种人类标签偷偷发糖？
- 它是否让本来应该由对抗结果决定的取舍被设计者提前裁决？
- 它是否只解决搜索冷启动，并且可被结果主导地压过去？

长期目标不是“cover ratio 越高越好”，而是：

> **能赢的不同打法彼此竞争并长期存在。**

---

## 11. 涌现多样性与对手生态

项目成功不仅是 champion 胜率上升。

还需要：

- 不同 team 出现可辨别打法；
- 同队内部出现不同个体身份；
- 战术随对手发生反制和循环，而不是单调收敛；
- 通信使用程度、风险、空间分布、tempo 等形成不同簇；
- role/style 标签从数据聚类和事件轨迹中发现，不预设枚举。

如果所有 champion 最终都变成同一个“最强模板”，进化世界仍然很薄。

未来需要考虑 budget / trade-off，使“什么都拉满”不可行，但具体预算设计必须经过 probe，不能拍脑袋。

### 11.1 对手不是老师；**对手分布才是老师**

新队伍不是从某个旧冠军那里 imitation learning。它经历的是选择：某个变异放进一组对手里，若更能赢，就更可能留下。

因此 curriculum 的本体是**它被拿去跟谁打**。

只让 A、B 两队无限互练，会有严重 co-adaptation 风险：

- A 学会专打 B 的一个洞，但对其他风格毫无用处；
- B 又只针对 A 反制；
- 双方形成循环或封闭 meta；
- 两边甚至可能共同掉进“都躲着不犯错”的垃圾 equilibrium；
- “打赢昨天的对手”不等于对整个策略空间真的进步。

所以最终进化必须面对一个**生态**，而不是一名固定老师。

### 11.2 Red / Blue 最终只是比赛 sides，不是两个永久物种

当前 red population vs blue population 是很好的 bootstrap：简单、对称、能快速验证 co-evolution。

但终局应迁成一个 club league：

```text
EvoShooter League
├─ Club A = team DNA + five player DNAs
├─ Club B
├─ Club C
└─ ...
```

一场比赛给两支 club 临时分配 sides，并通过交换攻守/镜像赛程消除 side identity。

同一 club 应能证明自己无论被放在哪一侧都保持“这支队伍是谁”。

### 11.3 League 的训练压力至少来自四类对手

最终 opponent ecology 应包含：

- **current peers**：同代、能力接近的主流对手，提供自然 curriculum；
- **current diverse styles**：同代但行为风格不同的队，防止所有人只适应主流镜像；
- **historical archive / hall of fame**：防止为了克今天而忘掉昨天仍然有效的技能；
- **exploiters / challengers**：专门寻找强队当前最脆弱的策略漏洞，防“看起来无敌、其实一戳就破”。

具体配比不在 VISION 写死，由 ROADMAP 用 cross-play / exploitability / forgetting probes 校准。

原则上先靠生态位产生多样性，**不先给“风格不同”本身发 diversity bonus**。如果多样性仍塌，再诊断资源预算、搜索压力和环境收益面。

### 11.4 非传递性不是 bug，而是这个世界的内容

可能长期存在：A 克 B，B 克 C，C 又克 A。

因此单一 Elo / champion ladder 不能定义“全部进步”。需要 cross-play matrix、历史对局和 style lineage 来看一个时代的真实结构。

---

## 12. 观赏性：进化必须被看懂，而且能被证明

像 EvoFootball 一样，**能涌现但看不出来，也不够。**

这里的“可解释”不是要求把神经网络每个权重翻成人话，而是要求**行为进化留下可读的化石**：

> 这个东西什么时候第一次出现？怎样逐代稳定/扩散？它大概在做什么？把关键机制拿掉以后，它还在吗？

### 12.1 每个重大 emergence claim 有三层证据

**① 发生了什么（Detection）**

- 新轨迹/通信/协同模式第一次出现；
- 频率、稳定性、成功率如何随 generation 改变；
- 能回放到具体 match / player / lineage。

**② 它是什么意思（Interpretation）**

- token / movement pattern 与哪些合法 percept、事件和后续动作相关；
- 人类可给 candidate interpretation，例如 “trade-like”“pressure→switch”“可能是 B contact call”；
- 解释必须标明 confidence，不把相关当语义真值。

**③ 它真的有因果作用吗（Intervention）**

- radio off；
- message shuffle / permutation；
- cue masking；
- counterfactual replay；
- same-seed behaviour ablation。

如果干预后现象仍完全一样，就不能讲“因为这个 token 所以 rotate”。

### 12.2 已知 detector + 开放式发现，两条腿都要有

已知 detector 用职业 CS 做尺子：trade、crossfire、lurk-like、pressure→switch、rotate 等。

但如果我们只检测这些词，就只能“发现我们事先知道的东西”。还需要开放式 novelty/discovery：

- 找到代际间突然出现的稳定行为结构；
- 找到新的 message→action dependency；
- 找到新的 pair/team coordination motif；
- 先告诉人“这里有新东西”，再通过录像和 intervention 给它命名。

**最有价值的发现可能根本没有现成 CS 术语。**

### 12.3 最终观战应有 Evolution Discovery Feed

理想体验不是图表角落里一个 fitness 1.83→1.91，而是类似：

```text
Gen 217 — Communication structure emerged
Token 6 与 speaker 在 B 侧形成 visual contact 高度相关；
receiver 收到后 3 秒内改变空间分布；message shuffle 后效应消失。
Candidate meaning: B-side contact / pressure cue.
```

或：

```text
Gen 391 — New team pattern
A-side pressure → defender rotation → synchronized disengage → B commitment
过去 50 场出现 17 次；radio ablation 后完成率显著下降。
Candidate tactic: fake A → B.
```

默认画面仍首先是一场像样的射击比赛；debug / discovery 证据是可下钻层。

### 12.4 观战需要逐步支持

- POV 与 director 能看到真实信息流；
- kill feed；
- 回放；
- 可选 debug overlay：这个玩家此刻看见/听见了什么，而不是全知世界；
- team radio 可视化；
- generation-to-generation 行为差异；
- data-driven style / role / pair-chemistry 标签；
- 历史 champion / club cross-play 与非传递关系；
- communication vocabulary evolution；
- discovery→录像→ablation 的证据链。

---

## 13. 现实对齐：CS2/职业赛是参照，不是复制常数

参考现实的原则：

- **机制形状可以参考；常数需要本项目自己校准。**
- CS2 官方强调远距离 gameplay readability、directional impacts、HUD game-state communication，以及反映环境、可区分并表达 game state 的音频；这些支持“视觉/声音是决策底座”，不意味着照抄其内部常数。
- 职业采访显示：开局 call、mid-round、secondary voice、局部 micro-management、个人主动性可以并存；这支持 distributed team cognition，而不是全知 central controller。
- tactical-shooter agent 研究表明：compute-efficient structured/raycast perception 可以做到 human-like，而无需给 policy world truth 或依赖像素输入。
- multi-agent partial-observability 研究表明：recurrent memory、population training、limited communication 是复杂协作出现的重要机制族。
- competitive self-play / league-style training 的先例说明：只对当前单一对手优化容易过拟合或遗忘，历史对手与多策略 opponent pool 是承重的训练结构。

### Prior-work anchors

- Valve, *Counter-Strike 2* — gameplay visuals / UI / accurate audio: https://www.counter-strike.net/cs2/
- Justesen et al., *Human-like Bots for Tactical Shooters Using Compute-Efficient Sensors* (modl.ai + Riot Games), arXiv:2501.00078: https://arxiv.org/abs/2501.00078
- Jaderberg et al., *Human-level performance in 3D multiplayer games with population-based reinforcement learning* / DeepMind CTF overview: https://deepmind.google/blog/capture-the-flag-the-emergence-of-complex-cooperative-agents/
- OpenAI, *Competitive Self-Play* and OpenAI Five — population/history opponents as anti-overfitting / anti-forgetting pressure: https://openai.com/index/competitive-self-play/ ; https://cdn.openai.com/dota-2.pdf
- Vinyals et al. / DeepMind, *AlphaStar* — league + main agents / exploiters as strategy-space pressure: https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/
- Wang, Everett & How, *R-MADDPG for Partially Observable Environments and Limited Communication*: https://arxiv.org/abs/2002.06684
- HLTV interviews/articles on distributed calling and secondary voices (karrigan/Twistzz/FaZe and other pro teams); use these as qualitative reality anchors, not implementation specs.

---

## 14. 工作纪律 (HOW WE WORK)

### 14.1 一次一根承重杠杆

每个 phase：

1. 写清当前缺陷到底是“底座缺腿”还是“进化没选”；
2. probe-first；
3. 冻结预测；
4. 改一个机制家族；
5. deterministic / symmetry / leak tests；
6. short evolution A/B；
7. 必要时 long-run；
8. ship-or-revert；
9. 更新 authority / evidence。

### 14.2 回退实现，不回退现实中的现象

一次“trade 实验”失败，不代表 trade 不该存在。

失败实现可以回退；以后只能以**新的通用底座表示**重新进入，不能把旧 `trade bonus` 换个名字复活。

### 14.3 有故事就要有探针

“他们因为听到脚步所以 rotate”“token 6 就是 B 点有人”“这队学会了 fake”都是因果故事，不是肉眼看录像就能宣称的事实。

需要：

- counterfactual replay；
- 关闭某条信息通道；
- message ablation / permutation；
- same-seed A/B；
- 事件时间序列。

没有证据就标 hypothesis。

### 14.4 Information-leak test 是长期硬门

构造两个世界：对某玩家来说所有合法观测完全相同，只移动一个不可见的墙后敌人或修改其 private state。

**该玩家当前 observation 必须 bit-identical（允许明确建模的 deterministic sensor noise 例外，但 noise seed 不得依赖隐藏真值）。**

以后每新增 sensor / HUD / team feature，都要过这类 counterfactual test。

### 14.5 进化系统本身也必须防“假进步”

“这一代只会打赢它唯一的老对手”不是进步。任何 league/opponent-sampling 改动都要看：

- cross-play；
- historical forgetting；
- exploitability；
- side fairness；
- population/team diversity；
- 非传递循环是否被单一分数掩盖。

---

## 15. 怎么使用这份 VISION

任何 future agent 在改核心仿真前先问：

1. 这个改动补的是现实中的**感知 / 身体 / 物理 / 记忆 / 通信 / 选择压力自由度**，还是偷偷加入战术结果？
2. 它让玩家知道了现实中不可能知道的 truth 吗？
3. 它给所有队规定了同一种“正确打法”吗？
4. 这个行为能否换成轨迹/事件事后识别，而不是 live label？
5. 有什么 probe 能证明机制真的产生了我们讲的因果？
6. 它是否仍能维持 determinism、side fairness 和可计算的进化速度？
7. 它是否提高了**对手分布的覆盖与抗过拟合能力**，而不只是打赢一个熟悉对手？
8. 如果我们宣称“学会了 X”，能否展示 X 的**出生→稳定→因果验证**证据，而不只是一个漂亮故事？

如果新需求与这份文档冲突，**先改 VISION 并记录为什么**，不要静悄悄绕过去。