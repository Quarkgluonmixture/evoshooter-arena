# LOG — append-only（发生了什么 + 为什么）

**LIVE FILE, 2026-09-11 22:15 起**（A0 之后）。更早的条目在 `LOG-archive/LOG-2026-09-11-1730-to-2130.md`。

- 接手只需 `tail -n 120 LOG.md`。
- 标签：`#decision` `#measure` `#deadend` `#incident` `#ship`。
- 查目录 / 按标签检索（**glob 同时覆盖 live 与全部归档**）：
  `grep -n '^## ' LOG.md LOG-archive/*.md` · `grep -n -A4 '#measure' LOG.md LOG-archive/*.md`

## [2026-09-11 22:15] A0 baseline census：冻住当前 main 的现实  #measure #decision
按 `docs/ROADMAP.md` A0 exit 逐条做完，**冻的是转头/观战五修之后的 main**（GOTCHAS #10 的裁决，不重议）。

- `npm test`：6 文件 **33 测试全绿**，1.4 s（含 fairness 镜像对打 0.51 s）。
- `npm run bench`（20 场随机基因组，同一台机、连跑三次）：**43.9 / 45.4 / 44.7 ms/match**，600 ticks/match（40 s × 15 Hz，随机基因组一场都没打完就是打满时间）。
- **Baseline census（这是 A1/A2 的出发点）**：`obsDim = 100` · genome = **5324** 权重（`shapeFor` = 100→40→24→12，含 bias）· map 32 boxes · `DEFAULT_EVO` hidden `[40,24]`。
  obs 结构（100 = 20 self + 5 slot one-hot + 5 zone + 8 lidar + 4 mate × 8 + 3 enemy × 10）。
- **Evolution census**：`--gens 40 --pop 16`，seed 1 / seed 2 各一次 → `runs/a0-census-s{1,2}.txt|json`。
  4.6 / 4.8 s/gen（≈180–195 s 全程）；末代冠军对第 0 代冠军：seed 1 红 100%/100%、蓝 100%/100%，seed 2 红 90%/100%、蓝 100%/100%。
  gen 39 行为指标：accuracy 0.25–0.38 · **zoneShare 0.006–0.044（占区依旧极低，胜负仍靠淘汰）** · coverRatio 0.57–0.70 · spread 8–13 · 首枪 6.6–8.8 s。
- ⭐ **顺手测到一条 T6 证据**：a0-census-s1/s2 与 19:0x 跑的 scan26-s1/s2 **40 代所有指标列逐字节相同**（只有 ms 列与总耗时不同）⇒ 跨进程、跨时间的 determinism 在 40 代尺度上成立，不只是单场 replay。
- A0 close。下一步 A1（information provenance + leak probes）。⛔ 不跳 A2。

## [2026-09-11 22:30] A1：把「谁能知道什么」变成可执行的仪器  #measure #decision
ROADMAP A1 要的是**先量病不治病**。做出来的是三件套 + 一条命令，机制一行未改（`git diff` 里 `src/sim/world.ts` 为空）。

- `src/sim/obsSchema.ts`：100 个 obs index 逐个命名 + 标 channel（self / objective / geometry / teammate / comm / enemy）
  + 标 legality。**实测分布：60 legal · 15 truth-form · 25 hidden**。
  legality 三档的意义：`legal` = 人类能从本体感觉/HUD/视觉/无线电合法拿到；`truth-form` = 信息本身合法可感知，
  但**递过来的形式**是引擎真值（A3 该重塑而不是删）；`hidden` = 观察者根本无权知道（A2/A3 要删通道）。
- `src/probe/leak.ts`：13 条 probe，四种形态——counterfactual（改一个观察者感知不到的量，看 obs 动不动）、
  truth-identity（obs 值与引擎表达式**逐位相等**⇒ 证明是真值不是感知）、discontinuity（越过 viewRange 的断崖）、
  action（V4 的自动转头）。每条都**登记当前预期状态**。
- `tests/leak.test.ts`（+23 测试，全套 33 → 56）：断言**实测 == 登记**，且对 leak 类断言**精确字段集**——
  修好了会红、退化了也会红、部分修也会红。另有 provenance binding 测试（改一个世界量 ⇒ 只有声明的字段动），
  这是防 schema 与 `observe()` 漂移的闸；再加 T8 analytics firewall 的静态检查（sim/brain/evo/worker/render/ui 不许 import probe）。
- `npm run leaks` 打印当期 matrix。⛔ **表不进任何文档**（唯一真相源 = 命令 + 登记表）。

**结果（当期 13 条：11 leak / 2 clean）**
- V1 team omniscience：`A1-P2` 队友看见的敌人一动，我的 slot 跟着动（我从没看见过他）；
  `A1-P3` ⭐ 对照与实验**只差队友的朝向**（朝向根本不在任何 obs 里），队友看了一眼再死掉，我**仍然握着 1 秒前的精确接触**。
- V2 enemy truth：`A1-P4` 血量直通；`A1-P5` 「他有没有在看我」是精确点积；
  `A1-P6` ⭐ **6/6 contact 字段与引擎表达式逐位相等**——没有 bearing 变换、没有噪声、没有量化。
- V3：`A1-P7` 背后凭空出现一堵墙，lidar 5/6/7 立刻报数（我没转头）；`A1-P8` 敌人横跨 viewRange 线**移动 20 cm ⇒ 8 个字段翻转**，接触不是衰减而是被删除。
- V4：`A1-P12` look 动作全 0，头仍然**一 tick 转 24.0°**（扫视上限只有 9.9°）对准 slot；`A1-P13` 更糟——转向的是**只有队友看得见**的墙后敌人。
- clean 的两条是**回归护栏**：`A1-P1`（没人看见的敌人移动 ⇒ obs 一动不动）、`A1-P9`（队友的 targetId/aim/弹药/换弹**不外泄**）。
- ⭐⭐ **两条新 gap 是探针自己找出来的，不在原 V1–V10 里**，已写进 `SUBSTRATE.md` §1：
  **V11** = `mate*.firing` 不做任何可见性判定（队友 30 m 外隔墙开火我也知道，违反 §6.2）；
  **V12** = `obj.enemyInZone` 直接数站在区里的敌人（全程没人看见也算）⇒ 一条免费的 occupancy radar。
- ⭐ **仪器做过 mutation test**：临时把 enemy HP 通道置 0，3 条 probe（P4/P6/P8）立刻变红，改回即绿 ⇒ 不是空过的白名单。
- 坑 #11 入档：counterfactual 的 control/treatment **只能差一个不可感知量**；第一版 P3 挪了队友位置，
  队友 HUD 字段混进 diff 把敌情泄漏盖住了。
- bench 复测 43.6 ms/match（A0 是 43.9/45.4/44.7）⇒ 仪器不在仿真路径上，throughput 未动。
- A1 close。下一步 **A2**：`known[team][enemy]` → `known[player][enemy]`。⛔ 一次一根杠杆，不顺手修 V2/V3。

## [2026-09-11 22:40] A2 预注册：砍 team omniscience 之前先冻预测  #decision
⚠ 这条写在**跑之前**，改完不许回头改这里（改了就等于没预测）。对照 = `runs/a0-census-s{1,2}`，同 `--gens 40 --pop 16`。

**先量出来的噪声底**（`node scripts/compare.ts runs/a0-census-s1.json runs/a0-census-s2.json`，末 5 代均值）：
仅仅换一个 seed，accuracy 就在 0.224–0.361、spread 7.59–12.35、aimUsage **0.017–0.959** 之间跳。
⇒ **2 seed 的 A/B 只能判大效应**；小于 seed 间差的变化一律不下结论（同 [[project-grader-lever-noise]] 的教训）。

**预测（末 5 代均值，4 个 cell = 2 seed × 红蓝）**
1. firstContact **上升**（≥3/4 cell）——白捡的接触没了。基线 6.31 / 6.78 / 8.33 / 7.17 s。
2. accuracy **下降**（≥3/4 cell）。基线 .361 / .347 / .224 / .355。
3. spread **不系统性上升**（4 cell 均值 ≤ 基线的 11.0）——分散换情报的红利消失。
4. commActivity **上升**（≥2/4 cell）。⚠ 低置信：comm 无带宽约束、全靠突变漂，容易被噪声淹。
5. **不许瘫痪**（A2 exit 硬门）：每个 cell accuracy > 0.10 且 firstContact < 20 s；末代冠军对第 0 代 ≥50% 的 cell ≥ 3/4。
6. 仪器面：`A1-P2`/`A1-P3` 必须翻 clean（同一 commit 改登记）；`A1-P1`/`A1-P9` 保持 clean；
   `A1-P4..P8`/`A1-P10`/`A1-P11`/`A1-P12` 仍报 leak；`A1-P13`（队友的接触喂给自动瞄准）会**因为 V1 消失而失去场景**，
   预期翻 clean ⇒ 届时补一条只用**自己的陈旧记忆**做自动瞄准的新 probe，保住 V4 的覆盖。

## [2026-09-11 22:55] A2：敌情变成私有的，以及预测大半落空  #measure #ship
`known[team][enemy]` → `contact[player][enemy]`，只有**我自己看见**才更新我的记忆；队友的视野不再自动进我的
observation。改动只在 `src/sim/world.ts`（6 处），comm 接口一行没动。

**仪器面（与预注册完全一致）**
- `A1-P2` / `A1-P3` 翻 clean（登记同 commit 改掉）；`A1-P1`/`A1-P9` 仍 clean；V2/V3/V11/V12 的 probe 仍报 leak。
- `A1-P13`（队友的接触喂给自动瞄准）如预测**失去场景**翻 clean ⇒ 按预注册补了 `A1-P14`：
  我**自己**看过一眼、人躲进墙后 1 秒，look 动作全 0，头仍然**一 tick 转 24.0°** 朝我的**记忆**（而不是他真身所在的方向）。V4 覆盖保住。
- 顺带修正 schema：`enemy*.present` / `enemy*.staleness` 的 gap 从 V1 改成 **V6**（现在是我自己的接触，
  但**记忆仍由 world 代管**）。补 `A1-P15`：同一时刻读，只差「上次看见是多久以前」——
  2.9 s 记得住、3.1 s 整条接触被一次性删除，5 个字段跳变 ⇒ 完美阶跃的记忆是 world 服务，不是学出来的 belief。
- `npm test` 58 绿；bench 43.8 / 44.2 / 43.7 ms（基线 43.6–45.4）⇒ throughput 未动。

**Evolution A/B**（`--gens 40 --pop 16`，seed 1/2 与 `runs/a0-census-s{1,2}` 配对；另跑 seed 3 作补充，无配对基线）
逐条对预注册（4 个 cell = seed 1,2 × 红蓝，末 5 代均值）：
1. firstContact 上升 ≥3/4 → ❌ **只有 2/4**（seed 1 涨到 15.4 / 19.0 s，seed 2 反而**降到** 4.8 s）。
2. accuracy 下降 ≥3/4 → ✅ 3/4（−.086 / −.131 / +.039 / −.031），幅度小。
3. spread 不系统性上升 → ❌ 字面失败（均值 11.31 vs 11.00），但差值只有 seed 间波动的 ~7%，⇒ **测不到效应**。
4. commActivity 上升 ≥2/4 → ✅ 字面成立（2/4），实为掷硬币，⇒ 无信号。
5. 不瘫痪 → ✅ 接敌与射击都健康（accuracy .22–.32、首枪 4.8–19 s、kills 1.3–3.5）。
6. 仪器预测 → ✅ 全中。
⇒ **我预测的行为方向大半没测到**。真正测得出来的只有两条：accuracy 略降，以及下面这条。

⚠ **ladder 变弱（本轮最该记的观察）**：末代冠军对第 0 代冠军，基线 2 seed × 红蓝 **4/4 全部 90–100%**；
A2 三个 seed 里 **3/6 个血统打不赢自己的第 0 代**（s1 红 55/50、s1 蓝 50/50 = 平手，**s3 红 5/5 = 明显退化**）。
⛔ 不下「A2 让进化变差」的结论：① n 太小；② champion-vs-gen0 是 SUBSTRATE §10.2 明确警告过的**单一对手标量**，
s3 红方是 zoneShare **0.000** + kills 3.48 的纯淘汰流，输给一个风格完全不同的老对手完全可能是非传递性而非退步。
⇒ 记成 open question：A3 继续盯；若再现，先加预算或提前上 cross-play matrix，**别用一个标量下判决**。

⭐ **coverRatio 掉的那一大截主要是尺子变了，不是行为变了**（差点当成「学会不躲了」报出去）：
指标的「已知威胁」定义跟着 A2 一起变了。同一批 12 条轨迹上并排算两种定义：
团队共享口径 **11374** 个被威胁 agent-tick / coverRatio **0.580**，自己接触口径 **7581** / **0.450**
⇒ 光换定义就吃掉 0.13，分母掉 33%。跨 A2 比较这条指标 = 拿两把尺量。已进 GOTCHAS #12，README 也标了。

**判决：SHIP。** A2 exit 三条全过（privileged cache 消失 · leak 测试转绿 · 不瘫痪）；VISION 不因为 ladder 变弱而降。
下一步 **A3 — Vision v2**（truth slots → 诚实 percept）。

## [2026-09-11 22:55] A3.1 预注册：删掉三个 enemy truth 字段之前先冻预测  #decision
A3 拆三刀的第一刀（见 ROADMAP Current Cursor）。⚠ 本条写在**改代码之前**。

**要删的三个字段**（每个 enemy slot）：`enemy*.hp`（血量不是视觉可感知）· `enemy*.exposureToMe`（我在**他眼里**的暴露度，
是他的视角不是我的）· `enemy*.facingDot`（「他有没有在看我」的精确点积）。
留下 `exposure`（我能看见他身体的比例 = §3.3 的 `bodyVisibility`，是合法 percept，形式问题留给 A3.2）。
⇒ `ENEMY_FEATS` 10 → 7，**obsDim 100 → 91**，genome 5324 → **4964**。

**基线 = `runs/a2-local-s{1,2,3}`**（末 5 代均值，6 个 cell）：kills 2.29/1.35/2.15/3.10/3.48/2.07 ·
accuracy .275/.216/.263/.324/.250/.226 · firstContact 15.4/19.0/4.8/4.8/5.6/5.9 s。

**⭐ 先说清楚这一刀的性质**：这是**正确性改动**，不是性能杠杆。A2 已经实测过——在 pop 16 × 40 代 × 3 seed 的预算下，
seed 间波动（accuracy ±.07、spread 7.6–13.1、firstContact 4.8–19 s）**吞掉大多数真实效应**。
所以主门是「不塌」，不是「变好」；我预期大部分行为指标的 Δ 落在噪声里，**那不算预测失败，算预算不足**。

**预测**
1. **probe 面（高置信）**：`A1-P4`（血量）与 `A1-P5`（转身）翻 clean；`A1-P6` 从 6/6 降到 **4/6**（剩 dx/dz/dist/exposure）；
   `A1-P8` 的变化字段表缩短（去掉 hp / exposureToMe / facingDot）；其余 probe 状态不变。
2. **kills 下降**（≥4/6 cell）：没有血量就没法专打残血。⚠ 中等置信——当前 targeting 是 slot logits，
   本来就未必学会了聚火。
3. accuracy、firstContact、spread、commActivity 的 Δ **落在 seed 噪声内**（不作方向预测）。
4. **不塌**（硬门）：每个 cell accuracy > 0.10、firstContact < 25 s、kills > 0.5。
5. bench：genome 缩 7%，ms/match 持平或略快（≤ 基线 43.6–45.4 的下沿）。
6. determinism / mirror fairness / map 测试保持绿。

## [2026-09-11 23:00] A3.1 reconcile：三个 enemy truth 字段删掉了，行为看不出差别  #measure #ship
`ENEMY_FEATS` 10 → 7，**obsDim 100 → 91、genome 5324 → 4964**。删的是 `enemy*.hp` / `exposureToMe` / `facingDot`；
留下 `exposure`（= §3.3 的 `bodyVisibility`，形式问题归 A3.2）。

逐条对 22:55 的预注册：
1. **probe 面 ✅ 全中**：`A1-P4`（血量）、`A1-P5`（转身）翻 clean；`A1-P6` 只剩 **4 个**字段与引擎表达式逐位相等
   （dx/dz/dist/exposure）；`A1-P8` 的翻转字段从 8 个缩到 5 个；其余状态不变。`npm test` 58 绿。
   ⭐ 顺手把 P6 改成**跳过已被删除的字段**而不是抛错——「这一期删掉的通道」和「悄悄修好的泄漏」不是一回事，探针要能活过 schema 变更。
2. **kills 下降 ≥4/6 → ❌ 3/6**。但更重要的是：**这条预测本身设计错了**。kills 在一场对抗里是准零和的
   （我方 kills = 对方 deaths），红蓝两个 cell 不可能独立同向下降，除非总杀伤率下降。按**总杀伤**（红+蓝）重算：
   3.63→4.57 ↑ · 5.25→6.29 ↑ · 5.55→4.67 ↓ ⇒ 依然没有效应。教训进 GOTCHAS #14。
3. accuracy / firstContact / spread / comm 的 Δ 落在 seed 噪声内 → ✅。
   （seed 1 的 firstContact 15.4/19.0 → 9.9/8.7 是**回到了另外两个 seed 的 4.8–5.9 s 那一档**，不是新效应。）
4. 不塌（硬门）→ ✅ accuracy .252–.326 · firstContact 4.9–9.9 s · kills 1.59–3.77。
5. bench → ✅ **41.1 / 41.5 / 42.6 / 42.0 ms/match**（A2 是 43.8/44.2/43.7）⇒ 网络小了 7%，快了约 4%。
   ⚠ 第一次量到的是 **58–59 ms**，纯粹是隔壁 session 的 xcodebuild 把机器压到 load 32（swift helper 930% CPU）。
   差点把「删了三个输入反而慢 33%」当结论报出去。教训进 GOTCHAS #15。
6. determinism / mirror / map 测试保持绿 → ✅。

**ladder 追踪**（末代冠军对第 0 代，两个方向都 ≥50% 才算这条血统有进步）：baseline **4/4** → A2 **3/6** → A3.1 **3/6**。
⇒ 连续两刀停在同一水平 ⇒ 更像是**预算/尺子**的问题，而不是某一刀砍坏了什么。TODO 里那条「换 cross-play 矩阵」优先级上调。

**判决：SHIP A3.1。** 下一刀 **A3.2**：exact `dx/dz/dist` → bearing + range cue + quality，并把 `viewRange` 硬断崖连续化
（`A1-P6` 应全 clean、`A1-P8` 应翻 clean）。

## [2026-09-11 23:05] A3.2a 预注册：contact 从坐标变成感知（先不加噪声）  #decision
⚠ 写在改代码之前。A3.2 本身还能再拆一层，**这次只做编码 + 连续化，噪声/量化留给 A3.2b**——
否则「编码换了」和「加了噪声」两件事的后果混在一个 A/B 里没法归因。

**新的 contact 编码**（每个 enemy slot 6 个字段，取代现在的 present/dx/dz/dist/exposure/staleness/visible 七个）：
`c·sin(bearing)` · `c·cos(bearing)` · `c·rangeCue` · `quality`（当前视觉，看不见时 0）· `c`（confidence，含记忆）· `staleness`。
- bearing 是**相对我自己朝向**的角度（不再是队伍帧坐标）⇒ 镜像对称自动成立；
- `quality = 体暴露比例 × distFactor × eccFactor`，`distFactor = (1-(d/R)²)²`、`eccFactor = (1-(|b|/halfFov)²)²`
  ⇒ **视距断崖和视野边缘都变成平滑衰减**（0 不是突然出现的）；
- 记忆 contact 的 `c = 看见那一刻的 quality × recency`，⇒ 远处勉强瞥见的东西，记忆也是弱的；
- ⭐ **所有方向/距离字段都乘 c**：接触变弱时整条通道一起趋零，不会留下一个满幅的坐标。
- `ENEMY_FEATS` 7 → 6，**obsDim 91 → 88**，genome 4964 → 4844。

**预测**
1. `A1-P8`（跨视距线走 20 cm）**判据改成量级**：max |Δ| > **0.05** 才算断崖（现在是「有任何字段变化就算」）。
   ⚠ 阈值**现在**定死，不看结果再调。预期翻 **clean**（平滑衰减下 20 cm 只该带来 ~0.01 量级变化）。
2. `A1-P6`（逐位等于引擎真值）预期翻 **clean**，但**我不认为这就等于诚实**——2a 只是做了可逆的确定性变换。
   ⇒ 同刀补一条 `A1-P16`：敌人在 25 m 外移动 **5 cm**（远低于人的感知分辨率），percept 不应变化。
   2a 预期 **leak**（连续变换会忠实反映 5 cm），A3.2b 加量化后才该翻 clean。这条是 2a/2b 的归因分界。
3. 其余 probe 状态不变：P1/P2/P3/P4/P5/P9/P13 clean；P7/P10/P11/P12/P14/P15 leak。
4. 行为面（对照 `runs/a31-notruth-s{1,2,3}`）：**只设不塌硬门**——每 cell accuracy > 0.10、firstContact < 25 s、
   合计 kills > 1。⛔ 不写方向预测：前三刀实测证明这个预算下行为效应测不出来（且 GOTCHAS #14 的零和陷阱）。
   真正想看的是**远近行为分化**（engageDist 分布），但那需要 A3.2b 之后再量。
5. bench：obsDim 再降 3 ⇒ 持平或略快；⭐ 跑前先 `uptime`（GOTCHAS #15）。
6. determinism / mirror fairness 必须保持绿——bearing 改成自我相对后**镜像对称只会更强**，若反而红了说明编码写错。

## [2026-09-11 23:20] A3.2a reconcile：contact 变成「按把握缩放的感知」  #measure #ship
每个 enemy slot 现在是 `c·sin(bearing)` / `c·cos(bearing)` / `c·range` / `quality` / `c` / `staleness`；
bearing 相对**我自己的朝向**；quality = 体暴露 × 距离衰减² × 偏心衰减²，两个衰减在物理极限处平滑归零。
`ENEMY_FEATS` 7 → 6，**obsDim 91 → 88**、genome 4964 → **4844**。

逐条对 23:05 的预注册：
1. `A1-P8` 按**预先定死的 0.05 量级判据** → ✅ 翻 clean，实测 max |Δ| = **0.0000**：跨过视距线走 20 cm，观测一动不动
   （因为到那里 quality 已经衰减到 0，而**所有方向/距离字段都乘了 c**）。
2. `A1-P6` → ✅ clean，但我在代码里把它标成 **RETIRED** 并写清楚原因：它检查的四个坐标字段已经不存在了，
   「clean」在这里是**空过**不是修好。V2 的活探针改成新加的 `A1-P16`（25 m 外挪 5 cm）→ ✅ 如预期 **leak**，
   max |Δ| 1.87e-4 —— 连续无噪的变换会忠实反映人眼根本分辨不出的位移。这就是 A3.2b 要治的。
3. 其余 probe 状态 → ✅ 全中。⭐ **一条没想到的**：`A1-P15` 仍报 leak 且 max |Δ| = **0.967**，
   因为 `staleness` 是**唯一没被 c 缩放**的字段 —— 3 秒记忆窗口依旧是断崖。这是 V6（记忆归 world 管）的活，
   ⛔ A3.2 不顺手改；记在这里给 A5/D 段。
4. 不塌硬门 → ✅ accuracy .274–.345 · firstContact 5.0–8.7 s · 合计 kills 4.2–4.9。
5. bench → ❌ **预测错了**：不是持平或略快，而是 **+6%**（配对交错实测 45.3 vs 42.7 ms）。
   obsDim 少了 3，但每个 contact 多了 `atan2`+`sin`+`cos`，trig 比省下的权重贵。⭐ 这次读数一度漂到 91 ms，
   是隔壁 build 在一波波压机器（`uptime` 1 分钟值显示很闲、5 分钟值 70）⇒ 性能结论必须**配对交错**量，写进 GOTCHAS #16。
6. determinism / mirror → ✅ 绿（bearing 改成自我相对后镜像对称只会更强）。

**观察（不是结论）**：accuracy 6 个 cell 里 4 升 1 降 1 平（均值 .286 → .314）；engageDist 4 升 2 降，没有干净信号
（想看的「远近行为分化」需要分布而不是均值，等 A3.2b 之后再量）。
`coverRatio` 这次**可以跨刀比**：contact 的登记条件（exposure>0 且在 FOV 和视距内）与 A3.1 等价，只差测度为零的边界。
ladder 两个方向都 ≥50% 的血统数：baseline 4/4 → A2 3/6 → A3.1 3/6 → **A3.2a 5/6**，是迁移以来最好的一次，
⚠ 但 n=3，⛔ 不当成「感知编码让进化更好」的结论。

**判决：SHIP A3.2a。** 下一刀 **A3.2b**：确定性噪声 + 量化（`A1-P16` 应翻 clean），之后才是 A3.3 几何。

## [2026-09-11 23:25] A3.2b 预注册：给感知加确定性噪声 + 量化  #decision
⚠ 写在改代码之前。这一刀只动「数值有多精确」。

**做法**
- 纯整数 hash 抖动（⛔ 不用 `Math.random`，⛔ 也不从 `world.rng` 取——那条流被战斗掷骰共用，会污染回放对照）；
  key = `(observer, target, floor(t / perceptBucketSeconds))` ⇒ 同一时间桶内读数稳定，跨进程可复现。
- bearing 和 range 先加抖动再**量化**，幅度随 quality 变差而变粗：`err(q) = maxErr × (0.15 + 0.85 × (1-quality))`，
  量化步长取同一尺度。新增 3 个 config 旋钮：`perceptBearingError`（最差档的角误差，rad）、
  `perceptRangeError`（最差档的相对距离误差）、`perceptBucketSeconds`。
- 记忆 contact 存**我感知到的位置**（带误差），不再是真值坐标。
- ⛔ 自动瞄准（V4）这一刀仍用真值——那是 `A1-P12`/`A1-P14` 登记的账，不在这刀里混改。

**⚠ 探针判据变更（现在定，不看结果再改）**：`A1-P16` 从「单一场景挪 5 cm」改成**扫 20 个起点**各挪 5 cm，
统计有多少比例的 percept 发生变化。理由是**量化天然有边界**：单场景只有约 3% 概率恰好跨在台阶上，
这种探针 97% 的时候会「碰巧通过」——是弱仪器，不是好结果。**判据：≤10%（20 个里 ≤2 个）变化算 clean。**

**预测**
1. `A1-P16`（新判据）→ **clean**。
2. `A1-P8` 保持 clean；`A1-P12`/`A1-P14` 仍 leak；其余状态不变。
3. determinism 测试保持绿（这是最容易被噪声写法搞红的一条；若红了，先查是不是取了 `world.rng`）。
4. 行为面（对照 `runs/a32a-percept-s{1,2,3}`）：只设不塌硬门（accuracy > 0.10、firstContact < 25 s、合计 kills > 1）。
   ⚠ 这刀**有可能**真的伤到行为：远距离接触的方向信息被量化后可能不够用。若 accuracy 跌破 0.10 或首枪 > 25 s，
   按 revert/reframe 处理（降 maxErr 而不是放弃噪声）。
5. bench：hash + 量化是几次整数运算，预期 **≤ +3%**（配对交错量，GOTCHAS #16）。

## [2026-09-12 00:20] A3.2b reconcile：感知噪声 + 量化上线；accuracy 下降的真因不是噪声本身  #measure #ship
纯整数 hash 抖动（不碰 `world.rng`），bearing 走绝对角度格、range 走**乘法格**、quality 走固定 15% 乘法格。
新 config 旋钮：`perceptBearingError` 0.12 rad · `perceptRangeError` 0.25 · `perceptBucketSeconds` 0.4。

逐条对 23:25 预注册：
1. `A1-P16`（新扫描判据，20 个起点各挪 5 cm，≤10% 变化算 clean）→ ✅ **1/20**，翻 clean。
2. `A1-P8` 保持 clean；`A1-P12`/`A1-P14` 仍 leak；其余不变 → ✅。
3. determinism → ✅ vitest 绿 **且**跨进程实测：同 seed 跑两次，6 代全部指标逐字节相同。
4. 不塌硬门 → ✅（accuracy .164–.321、首枪 4.2–8.9 s、合计 kills 1.55–5.28）。⚠ seed 1 是迁移以来最弱的一次（合计 kills 4.21 → 1.55）。
5. bench ≤+3% → ✅ **+0.3%**（配对交错：44.0/43.6 vs 43.9/43.2）。

⭐⭐ **本轮最值钱的一条：accuracy 在 6/6 个 cell 全部下降（均值 .314 → .247，−21%），但这不是噪声的机械后果。**
做了 same-genome 对照（拿 A3.2a 的冠军基因组，在两版代码下各跑同样 12 场）：
- 命中率 0.249（A3.2a）vs **0.271**（A3.2b）——不降反升；
- 逐因子拆解几乎不动：expo .864→.879 · distF .462→.472 · moveF .938→.943 · settleF .889→.871 · tgtF .979→.980；
- 目标切换率确实上升（engaged tick 的 4.10% → 5.49%，slot-0 身份变更 2.21% → 3.46%），
  但它只经 settle 因子吃掉 **1.4%** 的命中率，⛔ **不足以解释 21%**（我原本的假设，被自己的测量否掉）。
⇒ 正确说法是：**同一个策略在噪声下打得一样好；是「在噪声下 40 代能进化出什么」变差了**。
⚠ 而且 6 个 cell 不独立（每 seed 一对红蓝、且红蓝互为对手），按 seed 算只有 3/3 ⇒ **suggestive，不是结论**。
要坐实得加预算或换 cross-play 尺子（TODO 那条）。

**判决：SHIP A3.2b。** V2（enemy truth）到此关闭：不再有任何 contact 字段是引擎真值的可逆函数。
下一刀 **A3.3**：360° lidar → front-biased 几何感知，验收 = `A1-P7` 翻绿。

## [2026-09-12 00:25] A3.3 预注册：360° lidar → 前向密的几何感知  #decision
⚠ 写在改代码之前。A3 的最后一刀，只动几何通道。

**现状问题**：8 条射线均匀铺满 360°，而且是**队伍帧**方向（跟头朝哪看无关）——等于一个不受朝向影响的全向墙距雷达，
背后的几何无条件可读（`A1-P7` 一直报 leak）。

**做法**
- 射线改成**相对自己朝向**，只覆盖 ±halfFov（110° 视野的一半 = 55°），按幂律分布：
  `offset_k = halfFov × (k/m)^1.6`，中心密、边缘疏（参考 crosshair-dense 结构，⛔ 不照抄常数）。
- `lidarRays` 8 → **9**（奇数，留一条正中）⇒ obsDim 88 → **89**。
- 射线读数同样过**乘法量化格 + hash 抖动**（新 knob `geomRangeError` = 0.08），⛔ 不再留一条精确可逆的通道。

**预测**
1. `A1-P7`（背后凭空出现一堵墙）→ **clean**；`A1-P8`/`A1-P16` 保持 clean；V4 的 P12/P14、V6 的 P15、V11/V12 不变。
2. schema binding 测试（前方加墙 ⇒ 只有 `geom.lidar*` 变化）保持绿——它现在顺便守住「前向还看得见」。
3. 不塌硬门：每 cell accuracy > 0.10、firstContact < 25 s、合计 kills > 1。
   ⚠ 这刀最可能真伤行为（导航输入直接变了）。**revert 条件**：若破门，先**加射线数 / 放宽角度跨度**再试，
   ⛔ 不是放弃 front-bias（VISION 不因为行为难看而降）。
4. bench：射线 8 → 9，预期 **≤ +8%**（配对交错量）。
5. determinism / mirror 保持绿（射线改成自我相对后镜像对称只会更强）。

## [2026-09-12 00:35] A3.2b 的镜像对称 bug：A3.3 第一刀就把它照出来了  #incident #decision
做 A3.3 时 `World > mirrored teams identical observations at kickoff` 突然红了。追下去发现**问题不在 A3.3，在 10 分钟前
刚推上 main 的 A3.2b**：

- 抖动 key 用了**绝对 agent id**（`viewer*31+target`）⇒ 红方 slot s 和它的镜像蓝方 slot s 抽到**不同**的误差；
- bearing 的量化格建在**世界绝对角**上 ⇒ 镜像相差 π，而 π/bErr 不是整数 ⇒ 镜像的一对**落进不同的格子**。
⇒ 红蓝不再解同一个问题，而「冠军对自己的过去」之所以公平**正是建立在这条对称性上**（T7 / GOTCHAS #2）。

⭐⭐ **为什么没被抓住**：唯一的对称性测试只测**开局**，而开局谁也看不见谁 —— observation 里整个 enemy-contact 半边是零。
那半边的对称性**从来没有被测过**，A3.2b 的 A/B 全绿地跑完并推上了 main。是 A3.3 改了 lidar（每 tick 都有读数）
才让同一个 bug 撞上断言。

**修法**：抖动 key 改成 `(viewer.slot, target.slot)`（镜像不变），bearing 量化改在**观察者自己的帧**里做（同样镜像不变）。
新增 `keeps the mirror symmetry once contacts exist` 回归测试：把红蓝放进**同一处境的镜像**、带同龄记忆，逐特征对比。
修完 60 测试全绿，leak matrix 不变（`A1-P16` 仍 1/20）。教训进 GOTCHAS #17。

⚠ **连带影响**：`runs/a32b-noise-s{1,2,3}` 是在**有 bug 的构建**上跑的 ⇒ 不能当 A3.3 的对照。
已用修好的构建重跑 `runs/a32b-fixed-s{1,2,3}` 作为新基线；A3.2b 的结论（P16 翻绿、不塌、accuracy 下降是「进化出什么」
而非「打不准」）仍成立——same-genome 对照本身不依赖镜像性——但**数字以 fixed 版为准**。

## [2026-09-12 00:50] A3.3 第一版被自己的门否决：前向 9 条射线不够导航  #deadend #measure
±55°（视野半角）、9 条幂律射线、量化读数。**probe 面全中**（`A1-P7` 翻 clean，其余不变，60 测试绿），
但行为 A/B 破了预注册的硬门：

- seed 2：首枪 12.5 → **28.9 s**（红）、9.4 → **29.4 s**（蓝），**超过 25 s 的门**；蓝方 kills 2.625 → **0.068**。
- seed 3：首枪 5.7 → 21.5、4.5 → 23.8；**moveFraction .989 → .728 / .995 → .793** —— 人开始走不动（撞墙）。
- seed 1 基本没事（kills 1.32→2.44、accuracy .284→.266/.330、首枪 6.3→6.8）。

**诊断**：丢掉的不是「看敌人」，是**导航**。移动向量与朝向无关（可以横着/倒着走），旧的 360° 射线等于给了一圈
避障信息；砍到 ±55° 后，侧后方向的移动变成盲走 ⇒ 贴墙、原地磨。moveFraction 那条正是这个症状。

**按预注册的 revert 规则处理**（⛔ 不放弃 front-bias）：射线 9 → **13**，跨度 ±55° → **±90°**，仍然幂律中心密、
仍然**背后什么都没有**。理由不是「为了通过测试」而是**现实校准**：110° 的 `fovDeg` 是**辨认敌人**的锥角，
而人对**大结构**（墙）的周边视觉接近 ±90°+。⇒ 敌人识别仍用 fovDeg，几何感知单独一个 `geomFovDeg`。
`A1-P7` 的箱子在正后方 180°，±90° 依然看不到，验收不受影响。

## [2026-09-12 01:00] A3.3 第二版（13 条 ±90°）过门，A3 收官  #measure #ship
对照 = `runs/a32b-fixed-s{1,2,3}`（镜像 bug 修好后重跑的基线）。

- **硬门全过**：首枪 3.45 / 3.59 / 10.3 / 10.6 / **22.9 / 23.9** s（门 <25）；accuracy ≥ .185；每场合计 kills ≥ 2.9。
  ⭐ v1 的**走不动**症状消失（moveFraction .94–.996，v1 曾掉到 .73）。
- 三个 seed 分化：**seed 1/2 更好**（seed 1 首枪 6.3→3.6、kills 1.32→2.38；seed 2 红 kills 0.56→2.01、accuracy .204→.334），
  **seed 3 更差**（首枪 5.7→22.9、kills 2.47→1.59、coverRatio .341→.176）。⛔ n=3，不下「变好/变坏」的结论。
- probe 面：`A1-P7` clean（±90° 仍然看不到正后方 180° 的箱子），`A1-P8`/`A1-P16` 保持 clean，V4/V6/V11/V12 不变；60 测试绿。
- ⭐ **V3 关闭**。observation 现在 **93 维：76 legal / 12 truth-form / 5 hidden**（A1 刚建矩阵时是 100 维 60/15/25）。
  ⚠ 订正：本条初稿写的 72 legal 是 A3.3 第一版（89 维）的数——**手抄计算值必漂**，以 `npm run leaks` 为准。
- bench → ❌ **预测 ≤+8%，实测 +22%**（交错配对两轮：54.0 / 54.3 vs 44.3 / 44.2 ms）。
  原因是射线 8 → 13，而每条射线要扫 32 个箱子，lidar 本来就是 `observe()` 的大头。
  ⚠ 这次 load average 到 85，但**两轮交错比值稳定**（+22% / +23%）⇒ 结论不是负载噪声。
  按 SUBSTRATE §12 的问法：这笔开销买的是**决策所需信息**（9 条射线版实测导航直接崩），不是人类看不见的计算细节 ⇒ 接受，
  并把「ray-box 求交加空间索引」记进 TODO。

**判决：SHIP A3.3 v2。Programme A 的视觉/几何部分（V1/V2/V3）全部关闭。**
下一段 = ROADMAP **A4（听觉 v1：脚步 + 枪声）**；⚠ 那是新增感知通道，⛔ 不要顺手改 V4 的自动瞄准。

## [2026-09-12 01:10] 上线：仓库转 public + GitHub Pages  #ship
- **公开前审计**：tracked 文件、git 全历史扫过凭据/公司引用/个人标识 —— 干净；`runs/` 本来就 gitignore；
  提交身份是个人 noreply。补了 `LICENSE`（MIT，package.json 一直这么声明）。
  ⚠ 一度顺手删了 `package.json` 的 `"private": true`，随即改回——**仓库可见性和 npm 的 private 是两件事**，
  那个字段是防误发 npm 的闸，删掉只增加风险。
- **账号**：gh 的活跃账号是公司号，⛔ 按规矩不 `gh auth switch`（全局共享态、会影响并发 session），
  改用 `GH_TOKEN=$(gh auth token --user Quarkgluonmixture)` 单次注入。
- **Pages**：`build_type=workflow`，工作流 `npm ci → npm test → npm run leaks → npm run build → deploy dist/`；
  `docs/**` 与 `**.md` 走 paths-ignore 不触发部署。CI 跑 **macOS**（姊妹仓实测过 float 轨迹的跨平台 libm 漂移，
  本仓的 leak 阈值和镜像公平带也都是在 macOS/arm64 上标定的）。
- ⭐⭐ **接 CI 前先问这个闸失败时返回什么**：`scripts/leaks.ts` 原本打印「N probe(s) disagree」然后 **exit 0** ——
  照原样接进 CI 就是一个**永远开着的闸**。改成 `process.exitCode = 1` 并**实测验证**：篡改一条登记状态 → exit 1，
  还原 → exit 0。（同 [[project-redteam-under-test]] 那次 fail-open 的教训。）
- **外部读回确认**（⛔ 不拿自己写的文档当证据）：run 34659365530 success，日志里 **60 tests passed**、
  leak matrix 93 字段、build 1.39 s；`curl` 站点 **http 200 / 6195 B**，title 正确，bundle **639 KB / 200**。
  站点：<https://quarkgluonmixture.github.io/evoshooter-arena/>

## [2026-09-12 01:15] A4 预注册：听觉 v1（脚步 + 枪声）  #decision
⚠ 写在改代码之前。新增**感知通道**，按 cursor 的要求先定 provenance + probe 再写机制。

**通道形状**：`audioSectors=4` 个**相对自己朝向**的扇区 × 2 类（footstep / gunshot）= **8 个新字段**，obsDim 93 → **101**。
听觉是 360°（和视觉不同），但**不给身份、不给坐标、不给阵营标签**——队友的脚步走同一条通道。

**机制**
- 发声：脚步响度 = `((speed-0.5)/(maxSpeed-0.5))^1.5`（连续从 0 起，⛔ 不设阈值断崖）；枪声 = 开火那一 tick 的固定增益。
  ⭐ 这条建立的是「**慢走更安静**」这个物理自由度，⛔ 不写「见敌人就静步」那种规则。
- 传播：`att = (1-(d/R)²)²` 到 `audioRange` 平滑归零；隔墙乘 `audioOcclusion`（低通的廉价代理）。
- 方向：按 `cos²` 权重摊到相邻扇区（⛔ 不让扇区边界变成断崖）；能量归一。
- 记忆：世界维护一个**按 tick 衰减**的听觉缓冲（`audioDecaySeconds=0.35`），recency 隐含在衰减里。
- 量化/抖动只在**写进 obs 时**做（⛔ 不能抖动累积缓冲，误差会复利），key 用 **slot**、格子建在自我相对量上（GOTCHAS #17）。

**新增 probe（5 条，判据现在定死）**
- `A1-P17` T4 因果：墙后敌人开火 ⇒ **只有 audio 字段变化**（且至少有一个变）。⛔ 「什么都没变」也算失败（空过）。
- `A1-P18` 衰减：同一枪声 8 m / 16 m / 24 m ⇒ 响度**严格递减**；超出 `audioRange` ⇒ 0。
- `A1-P19` 遮挡：同距离、有墙 vs 无墙 ⇒ 有墙更小且 > 0。
- `A1-P20` 运动→声音：慢走 vs 全速 ⇒ 全速更响。
- `A1-P21` 无阵营标签：敌 / 友在**镜像位置**发同样的声 ⇒ 听到的值相同。

**预测**
1. P17–P21 全部 clean；现有 16 条 probe 状态**全部不变**。
2. determinism 绿；**中局镜像测试必须覆盖 audio 通道**（新通道不加断言 = 又一次「半条通道没测过」，GOTCHAS #17）。
3. 不塌硬门：每 cell accuracy > 0.10、firstContact < 25 s、合计 kills > 1。
4. bench ≤ **+15%**（听觉要按对做 LOS，先用距离预筛；交错配对量）。
5. **ablation（本 phase 的核心问句）**：拿进化出来的冠军，把 audio 通道**置零**重放同样的比赛，
   预期首枪时间变慢（≥4/6 cell）。⚠ 这只说明「通道携带了决策相关信息」，
   ⛔ **不等于「听声辨位战术已经出现」**——那是 strong claim，要按 DISCOVERY 合同走。

## [2026-09-12 01:35] A4 reconcile：听觉上线；ablation 否掉了我的预测  #measure #ship
4 个头相对扇区 × 2 类（脚步/枪声）= 8 个字段，**obsDim 93 → 101**、genome 5364。
脚步响度随速度连续变化、枪声固定增益、`(1-(d/R)²)²` 衰减、隔墙 ×0.45、`cos²` 摊到相邻扇区、0.35 s 衰减记忆；
量化/抖动只在写 obs 时做，key 用 slot（GOTCHAS #17）。

逐条对 01:15 预注册：
1. 五条新 probe **全部 clean**：`A1-P17`（墙后开火 ⇒ **只有** audio 变、且**至少变一个**）·
   `A1-P18` 衰减 0.497 → 0.247 → 0.040 → 0（超出射程）· `A1-P19` 隔墙 0.247 → 0.123 ·
   `A1-P20` 慢走 0.020 vs 全速 0.247 · `A1-P21` 敌友同样的脚步声完全相同。现有 16 条状态不变。
2. determinism 绿；⭐ **中局镜像测试同笔加了速度**，否则 audio 半边全是 0 ＝ 又一次「没测过」（这次主动补上）。65 测试绿。
3. 不塌硬门 → ✅（accuracy .238–.317、首枪 5.1–12.8 s、合计 kills 3.2–6.1）。
   ⭐ seed 3 的首枪从 A3.3 的 22.9/23.9 s 降到 **10.2/10.4 s**，但 seed 1 反而从 3.5 升到 5.1 ⇒ 无干净方向。
4. bench ≤+15% → ✅ **+14%**（62.1/62.3 vs 54.5/54.5，交错配对）。⭐ 第一版是 **+22%**，
   把「每个(听者,声源)各做一次 LOS」改成**每对只做一次**（遮挡是对称的）就降下来了。
5. ⭐⭐ **ablation 预测被否**：拿进化出的冠军把 audio 通道**置零**重放 16 场 —— 首枪时间
   seed 1 **一模一样**（6.53 vs 6.53）、seed 2 **反而更快**（10.93 → 9.07）。⛔ 「听觉让人更快找到对手」在这个预算下**不成立**。
   但通道**确实被用了**：seed 1 红方开火数 38.2 → **25.4**、击杀 3.00 → 1.88（聋了之后打得少、打得差）。
   ⇒ 能说的只有：**通道物理上是对的，且现有策略对它有反应**；⛔ **不能说「学会了听声辨位」**——那是 strong claim，
   按 DISCOVERY 合同要 detector + lineage + intervention。
   ⚠ seed 3 **量不了**：它的红蓝冠军**互相完全不接触**（8 场 0 个 visible-pair-tick，两边都在满速跑），
   交叉配对却有几百发 ⇒ 是共演化出的**互相回避均衡**，不是 harness 问题。入 GOTCHAS #18。

**判决：SHIP A4。** V5（无听觉）关闭。下一段按 ROADMAP 是 **A5 / Programme B**，⛔ 本刀不碰 V4/V6/V11/V12。

## [2026-09-12 01:45] V11 + V12 预注册：把探针自己找出来的两条 HUD 泄漏关掉  #decision
⚠ 写在改代码之前。这两条是 A1 的探针发现、被登记进 SUBSTRATE §1 的新 gap，都只动一两个字段。

**V11 —— `mate*.firing` 不判可见性**：队友在 30 m 外隔着墙开火，我的 observation 一样会亮（§6.2 只允许在**视觉里**拿到队友的外显动作）。
- 改法：`firing` 只在**我确实看得见他**时给（同敌人视觉一样的 LOS + FOV + 视距）。
- ⭐ 顺手合并一次几何计算：新增**每对只算一次**的 `losPair`，听觉的遮挡判定和队友可见性**共用**它
  （听觉现在自己做一遍 LOS，合并后总开销应该基本持平，⛔ 不接受为了修一个字段让 bench 再涨）。
- 验收：`A1-P10` 翻 clean；⭐ **同时新增 `A1-P22`「队友在眼前开火」必须仍然看得见**——
  否则把字段改成恒 0 也能让 P10 变绿，那是空过（同 `A1-P17` 的双向判据）。

**V12 —— `obj.enemyInZone` 数不可见的敌人**：一条免费的 occupancy radar。
- 改法：**直接删掉这个字段**（obsDim 101 → 100）。合法的替代通道已经在 obs 里了：`self.scoreDiff` 会随对方占区变化——
  那是**延迟的、聚合的**比分信息，不是实时点名。⛔ 不新造「contested」位（那仍然是实时敌情）。
- 验收：`A1-P11` 翻 clean。

**预测**
1. `A1-P10` / `A1-P11` 翻 clean，新增 `A1-P22` clean；其余 19 条状态不变。
2. 不塌硬门（accuracy > 0.10、firstContact < 25 s、合计 kills > 1）。
3. bench 变化 **|Δ| ≤ 5%**（删一个字段 + 合并 LOS 计算，两边抵消；交错配对量）。
4. determinism / 中局镜像保持绿。
5. ⚠ **归因边界**：两条一起做一次 A/B（各自有独立 probe，行为侧预期都测不出）。
   若行为真的破门，**先 bisect 再下结论**，⛔ 不把锅扣给其中一条。

## [2026-09-12 01:15] V11 + V12 关闭：探针自己找出来的两条 HUD 泄漏  #measure #ship
- **V11**：`mate*.firing` 现在只在**我确实看得见他**时才给（LOS + FOV + 视距）。顺手把几何计算并成**每对一次**的
  `losPair`，听觉遮挡与队友可见性共用它。
- **V12**：`obj.enemyInZone` **直接删掉**。合法替代已经在 obs 里：`self.scoreDiff` 会随对方占区变化——延迟的、聚合的比分，
  ⛔ 不是实时点名。obsDim 101 → **100**（巧合：和 A0 基线的 100 维 / genome 5324 一模一样，但内容完全不同了）。

逐条对 01:45 预注册：
1. `A1-P10` / `A1-P11` 翻 clean ✅；新增 `A1-P22`「队友在眼前开火**仍然**看得见、且**只**动这一个字段」clean ✅。
   ⭐ P22 是 V11 修法的护栏：把字段改成恒 0 也能让 P10 变绿，那是空过。现有 19 条状态不变，66 测试绿。
2. 不塌硬门 ✅（accuracy .177–.307 · 首枪 3.3–11.4 s · 合计 kills 4.5–5.8）。
3. bench |Δ| ≤ 5% → ✅，实测**快了约 2%**（3 轮交错配对 84.9/88.1/86.7 vs 88.9/88.4/90.1；⚠ 绝对值被隔壁
   Xcode 压到 load 100 时虚高，只看同轮比值）。第一版 **慢了 8%**，把 `losPair` 的 LOS 计算收窄成
   「耳朵范围内的所有人 + 视距内的队友」才转正。
4. determinism / 中局镜像 ✅ 绿。
5. 归因边界照预注册说明：两条一起做一次 A/B，各有独立 probe，行为侧如预期测不出方向（seed 间照旧互相矛盾）。

**判决：SHIP。V11 / V12 关闭。** 还开着的账：**V4**（自动瞄准）· **V6**（记忆归 world 管 + 3 秒断崖）· V7/V8/V9/V10。
下一刀按 ROADMAP cursor 的顺序 = **V6**，最后才是 V4（V4 要连带重做转头手感，见 SUBSTRATE V4 前瞻警告 + GOTCHAS #10）。

## [2026-09-12 02:00] 标注漂移订正：V2 关了，schema 标签忘了跟  #incident
`npm run leaks` 报「0 hidden」时顺手复核，发现 `enemy*.bearingSin/Cos/range` 还挂着 `truth-form / V2`，
注释甚至写着「still exact geometry, with no perceptual noise or quantisation (A3.2b)」——**A3.2b 已经加了噪声和量化**，
这三个字段早就不是引擎真值的可逆函数了（`A1-P16` 就是这么翻绿的）。
⇒ 改成 `legal`。当期分布变成 **97 legal / 3 truth-form / 0 hidden**（剩下 3 个是 `staleness`，属 V6）。

⭐ 教训：**probe 翻绿不会自动更新 provenance 标签**——一个是行为，一个是声明，两份都要在同一刀里改。
探针没抓住这条是因为探针问的是「值会不会动」，标签问的是「我们说它是什么」。
⇒ 以后关一条 gap 时，除了看 probe 翻绿，还要 `grep` 一遍 schema 里挂着那个 gap 编号的字段。

## [2026-09-12 02:10] V6a 预注册：记忆窗口从断崖变成衰减  #decision
⚠ 写在改代码之前。只动「记忆窗口的形状」，⛔ 不动 brain（那是 V6b）。

**现状**：confidence 里的记忆分量已经是线性衰减，但 `staleness` 是**唯一没被 confidence 缩放**的 contact 字段，
所以 3 秒一到整条接触被删除时它从 0.967 直接掉到 0（`A1-P15` 实测 max |Δ| **0.967**）。

**改法**
- `staleness`（越老越大）换成 **`recency`**（越新越大）：当前看得见 = 1，记忆 = `fade`，过期/空槽 = 0。
- `fade = (1 - age/memorySeconds)²`（原来是线性）——和距离/偏心衰减同一形状：**早期掉得慢、末端掉得快**，
  于是窗口边界上的跳变自然趋零。confidence 的记忆分量 `q_acq × fade` 一起用这个 fade。
- ⭐ 这样仍然能区分「刚看到但看得很烂」（conf 低、recency 1）和「两秒前看得很清楚」（conf 中、recency 低）。

**⚠ 探针判据变更（现在定死）**：`A1-P15` 从「有任何字段变化就算 leak」改成**量级判据 max |Δ| > 0.05**，
与 `A1-P8` 同一阈值、同一理由（连续衰减下 200 ms 只该带来极小变化）。

**新增 `A1-P23`（V6 剩下的那半账）**：在窗口内，我回忆出来的位置**与当初感知到的一模一样、不漂移**
⇒ world 替我保存了一份完美记录，只是**权重**在衰减。预期 **leak**，一直挂到 V6b（记忆搬进 recurrent brain）才该翻绿。
⛔ 没有这条的话，P15 一变绿会让 V6 看起来已经关了。

**预测**
1. `A1-P15` 按新判据翻 **clean**（预期 max |Δ| 在 0.001–0.01 量级）；`A1-P23` **leak**；其余 20 条不变。
2. determinism / 中局镜像绿。
3. 不塌硬门（accuracy > 0.10、firstContact < 25 s、合计 kills > 1）。
4. bench |Δ| ≤ 3%（就多一次乘法）。
5. 行为侧不写方向预测——前十刀反复证明这个预算测不出来。

## [2026-09-12 02:25] V6a reconcile：记忆窗口不再是断崖；顺手被三刀前的探针抓了一次回归  #measure #ship
`staleness` 换成 **`recency`**、记忆权重改成 `(1-age/memory)²`。

逐条对 02:10 预注册：
1. `A1-P15` 按**预先定死的 0.05 量级判据**翻 clean ✅，实测 max |Δ| = **1.19e-4**（原来是 0.967）。
   新增 `A1-P23` **leak** ✅：1.8 秒后回忆出来的方位**逐位不变**（测到的 1.01e-8 rad 是 float32 舍入，不是漂移）
   ⇒ world 替我存了一份**完美记录**、只是权重在衰减。V6 剩下的那半账有探针盯着了。
2. determinism / 中局镜像 ✅；67 测试全绿。
3. 不塌硬门 ✅（accuracy .153–.331 · 首枪 5.0–22.3 s · 合计 kills 2.4–6.6）。
4. bench |Δ| ≤ 3% → ✅ 快约 2%（61.2/61.4 vs 63.2/62.0，机器已空，load 10）。

⭐⭐ **本轮最值钱的一条：第一版改动引入了一个我没预测到的新断崖，被三刀前写的 `A1-P8` 抓住。**
`recency` 初版在「看得见」时恒为 **1**，于是敌人跨过视距线时它从 1 掉到 0 —— 视距边界上又出现一个满幅跳变。
修法就是 A3.2a 立下的那条规矩：**这个槽里的每个字段都必须乘 confidence**（我当初写了这条，却漏了 staleness）。
⇒ 这就是登记式探针矩阵的价值：**它不只守当期这一刀，它守着前面每一刀的结论**。

⚠ **一处判据在看到结果之后调过，说清楚**：`A1-P23` 初版用 `drift > 1e-9` 判「有漂移」，
结果被 float32 舍入骗成 clean（obs 是 Float32Array，conf 在比值里没完全约掉，制造 ~1e-5 rad 的假漂移）。
改成 `> 1e-3 rad`（≈0.06°）——远高于数值噪声、远低于任何真实感知漂移。
**意图是预注册的（「记忆不该毫无漂移」），改的是测量假象**，⛔ 不是看到结果去凑判据。

⚠ **观察（不是结论）**：seed 3 又一次滑向「互相找不到」（首枪 6.7 → 22.3 s），和 A3.3 第一版、
A4 的「两个冠军 0 次相遇」是同一类现象，三次都出在 seed 3 上。可能是 map seed 7 + 这条血统的相互作用。
⇒ 如果 cross-play 矩阵做出来了，第一件事就是看这个。

**判决：SHIP V6a。** 信息层（V1/V2/V3/V5/V11/V12）全部关闭；剩下 **V4**（自动瞄准，2 条 probe）与 **V6b**（记忆归属，1 条 probe）。

## [2026-09-12 02:03] session 收尾：GOTCHAS 重整，并发现它的闸对本仓一直是哑的  #incident #decision
这一晚从 A0 一路关到 V6a 共十一刀（逐条经过在上面），另把仓库转 public + 上线 Pages。收尾时做了三件事：

- **GOTCHAS 按「时刻」分节 + 加挑读索引**：19 条挤在一节（checkpoint skill 的阈值是每节 ~15 条），
  改成「改 observation 之前 / 写预测之前 / 写探测脚本之前 / 下性能结论之前 / 动 UI 之前 / 硬规则」六节，
  外加一节**元规律**把散点归成三个可命名的失败族（A 只在 t=0 测 · B 分母是空的或换了 · C 机器状态污染读数）。
  编号一个没动。坑 **2 / 3** 退休成墓碑（fairness 测试与 map 测试已完全守住），正文留在 LOG。
- ⭐⭐ **实测发现 kit 的 `gotchas-contract` hook 对本仓一直解析出 0 条条目 = 静默失守**。
  两个原因叠加：① 条目头写成 `19. (2026-09-12) **标题**`，而它的 `HEAD_LIST` 要求数字后 12 个字符内出现粗体，
  日期占 13 个字符且含数字（`[^\w*\n]` 不匹配数字）；② `闸:` 我一直写在段落中间，而 `FIELD` 要求它**独占一行**。
  ⇒ 我这一晚加的 9 条坑，**没有一条被闸检查过**。改成 `N. **标题**（日期）` + `闸:` 独占一行后，
  `--audit` 解析出 **17 条：3 条真闸 + 14 条写明「机器判不了」的理由**。
  ⚠ 顺带踩了一次自己造的：小节标题写成 `## 3. xxx` 会被当成**条目头**（它支持 `### 12. title` 这种形式），
  于是「解析出 8 条、全都没有闸」。小节标题一律不带编号，这条已写进 GOTCHAS 文件头。
  ⇒ **教训与今晚 `npm run leaks` 那次同形**：**闸自己也会 fail-open，而且是沉默的**。
  接一个闸时要问的不是「它检查什么」，是「它在这个仓库里**真的解析到东西了吗**」——`--audit` 一跑就知道。
- **TODO 剪枝**：Pages 那条已完成删除；ladder 疑云改写成「先做 cross-play 换尺子」并标成 V4/V6b 的前置；
  新增 seed 3 反复失联的观察。
- **LOG 轮转**（同一次收尾里做掉，不留「下次记得」）：建仓那一晚（17:30–21:30，12 条）移进
  `LOG-archive/LOG-2026-09-11-1730-to-2130.md`，live 文件从 22:15 的 A0 起，标题写明起点。
  定位靠 **档名区间 + 一条 glob**：`grep -n '^## ' LOG.md LOG-archive/*.md`（同时命中 live 与归档，实测 23 + 12 条）。
  ⛔ 没有建第二个索引文件，也没把阈值抄进文件头。

## [2026-09-12 03:35] 换尺子：cross-play 矩阵，以及「冠军 vs gen-0」到底在量什么  #measure #decision #incident

CHECKPOINT / TODO 都把这件事标成 V4·V6b 的前置：champion-vs-gen0 这把单一标量已经三次给出自相矛盾
或退化的信号。做出来之后发现问题比预想的更硬 —— **那把尺子在红方血统上连续 5 代量的是一场没发生的比赛。**

### 做了什么

1. **先补分母**（`sightTicks`）：`TeamStats` 新增一个计数器，每 tick 累加「我方的眼睛看见敌人」的 (viewer, enemy) 对数，
   经 `TeamMetrics` 流进 run JSON / 图表 / ladder。它就是 GOTCHAS #18 说的 visible-pair-ticks，从一次性脚本变成常驻仪器。
   正向护栏在 `tests/world.test.ts`：镜像摆位下红蓝各 20 次（25 对里的 20 对），把蓝方转过去背对红方 ⇒ 红 20 / 蓝 **0**。
   一次断言同时抓住「根本没加」「记错队伍」「一次看见算两边」三种写法。
2. **`npm run crossplay`**（`scripts/crossplay.ts`）：任意几个 run 的 hof 冠军互打，每对**两个颜色都打**、所有格子**共用同一批 seed**，
   胜率按 side 平衡（`(赢作红 + 1 − 对方赢作红) / 2`，成对恒等于 100%）。每个格子自带分母（sighting ticks / shots），
   零接触印 `··`、低于矩阵中位数 1/4 印 `~`。另有对角线自打（地图颜色偏置）、非传递三环检测、跨地图重跑（`--maps`）。
   ⭐ 跨 run 的 `SimConfig` 差异**直接报错**（`--allow-sim-drift` 才放行）——不同规则下训出来的冠军放一起比，量的是规则改动不是血统（GOTCHAS #12）。
3. **把分母接回 trainer**：`GenReport.ladderSight` / `ladder0Sight`、`Trainer.duel()` 改返回 `{win, sight}`，
   `train.ts` 的 ladder 列零接触印 `·`（不是 `%`），末尾 duel 行直接写「⚠ they never saw each other」。UI 状态行同步。

### 预注册（`runs/xp-predictions.txt`，写在全量跑之前；⚠ 一次 4 entrant / n=2 的烟雾测试在预测之前就跑过，已在文件里写明）

| 预测 | 结果 |
|---|---|
| P1a 地图假说：换 map seed 后低接触的对，接触量涨 ≥2× | ❌ **证伪** |
| P1b 血统假说：同样的对在三张图上都贴地 | ⚠ 方向对，但**主语错了**（见下） |
| P2a 每个 gen-39 冠军侧平衡胜自己的 gen-0 ≥65% | ❌ **证伪**，且不是因为输 |
| P2b cross-play 排名不跟随训练 fitness | ✅ **成立，而且是倒挂** |
| Q3 mirror（自打）红胜率落在 35–65% | ✅ 均值成立（53/43/57%），单格不成立见下 |

### 结果

**① 红方那条 ladder 是空的。** `runs/v6a-fade-s1` 自己印的是 *final red champion vs gen-0 red champion: 50% / 50%*，
gen 35–39 的 `ladder0[red]` 也是连续五个 0.5。cross-play 一查：**这两个冠军 16 场 0 个 sighting tick**。
同一次 run 的四个冠军里，R@0 / R@39 / B@0 三者**两两之间全是 0 接触**，只有 B@39 会去找人（491–1699 ticks/场）。
⇒ 那五个 50% 不是「势均力敌」，是**比赛没发生**，双方各自空转到时间结束判平。

**② 这不罕见。** 加了标记之后重跑一个玩具训练（`--gens 12 --pop 8 --gap 5 --seconds 20`）：
36 个有数字的 ladder 格里 **5 个（14%）零接触，其中 4 个印的是 100%**。
⇒ 之前每一次拿 ladder 下的行为结论，都有 1/7 的格子在讲测量而不是讲行为（族 B）。

**③ 不是 seed 3，也不是 map seed 7。** 三张地图（7 / 11 / 23）× 三个 seed 的六个末代冠军，216 场/图：
entrant 0（s1:R）跟 1 / 2 / 3 有 400–1150 sighting ticks，跟 4（s3:R）只有 11 / 55 / 32，跟 5（s3:B）是 73 / **0** / **0**。
换地图**没有**让这些对接触起来，有两对反而掉到 0。
⇒ 低接触是**这一对**的性质（两条策略的走位根本不相交），不是某条血统的性质，也不是某张图的性质。
CHECKPOINT 里「seed 3 反复滑向互相找不到」的说法要改写：seed 3 只是在**同 run 内**撞上了这种配对。

**④ 训练 fitness 是 run 内货币，跨 run 会倒挂。** 训练 fitness 排 2 的 `s1:B@39`（0.817）cross-play 均值 25%（排 5）；
训练 fitness **垫底**的 `s3:B@39`（−0.023）cross-play 均值 57%（排 3）。两边都排第 1 的只有 `s2:R@39`（0.858 / 81%）。
⇒ fitness 是「相对于我这一次 run 里的对手」的分数。s3:B 分低是因为它对面的 s3:R 强，不是因为它弱。
这正是 VISION 那句「对手分布才是老师」的第一份本仓实测。

**⑤ 当前 meta 是传递的。** 15pp margin 下三张图各 9 / 10 / 9 条 decisive edge，**非传递三环 0 个**。
⇒ 现在还没有 A 克 B 克 C 克 A 的内容；E5/E6 的生态问题目前是空的，这是事实不是失败。

**⑥ 颜色偏置：均值干净，单格不可读。** mirror 均值 53 / 43 / 57%；但单个 entrant 会读到 17–83%——
entrant 4 在图 7 是 83%、图 11 是 17%，**方向在图之间翻转** ⇒ 那是 n=6 的噪声，不是偏置。
⛔ 不要拿单个 mirror 格下结论；`tests/world.test.ts` 的 fairness 测试仍是颜色公平的权威。

### 工程注记

- `npm test` 68 绿；`npm run leaks` 仍 23 probe / 3 leak，矩阵与登记表一致（exit 0）。
- ⚠ **bench 不下结论**：读到 63.4 ms/match，但 `uptime` 的 1 分钟负载是 **85**（隔壁在压机器），
  按 GOTCHAS #15/#16 这个数不可比，也**没有**做交错配对 A/B。改动本身是在一个已经执行的分支里加一次 `++`。
- 矩阵输出留在 `runs/xp-ladder-s1.txt|json`、`runs/xp-maps.txt|json`（gitignore）。

**判决：ship 这把尺子。** V4 / V6b 的前置条件解除，但它们的 A/B 从现在起必须读 cross-play，
⛔ 不能再拿 champion-vs-gen0 的单一数字下行为结论。新坑 **#20 / #21**。

## [2026-09-12 22:00] V6b 前置：把「改 genome 尺度要不要重调突变」从手艺变成公式  #measure #decision

ROADMAP D1 的 evolution gate 写死了「必须跑 optimizer sensitivity：genome size / mutation sigma /
inheritance stability」，GOTCHAS #6 是同一条。⭐ 先做这个，**一行 recurrent 代码都还没写** ——
因为答案会决定 V6b 要不要连带改超参，而那是两根杠杆。

### 工具

`npm run inherit`（`scripts/inherit.ts`）：拿一个进化过的冠军当 parent，用真实比赛里的 observation 行做输入批，
量一次 `mutate()` 把每层 **pre-activation 推开了多远（相对它自己）**。闭式解和 `mutate()` 放在一起
（`src/evo/genetic.ts` 的 `mutationVariance`，**只有一份**）：

```
v = resetProb * (RESET_SCALE² + s²) + mutRate * sigma²     # 每个权重被加上的方差
D = sqrt(v) / s                                             # s = 该层权重的实测 std
```

reset 是**替换**不是微调（`out[i] = gauss*0.5`），所以它贡献 `0.25 + s²`，不是 `sigma²`。
`tests/brain.test.ts` 断言实测方差 / 公式 ∈ [0.93, 1.07]（实测 **1.014**）——
把 RESET_SCALE 改成 0.4 会读到 1.365、把 reset 改成加性会读到 1.143，两个都红。

### 预注册（`runs/inherit-predictions.txt`，写在跑之前）

| 预测 | 结果 |
|---|---|
| P1 实测 D 与公式在**每一层**都差 <15% | ❌ **证伪**：第 1 层 0.94 ✅，第 2/3 层 **1.40 / 1.53** |
| P2 默认设置下 reset 项比 sigma 项大约 10× | ✅ **实测 11.0×**（5.5e-4 vs 5.0e-5） |
| P3 D 取决于 fan-in，不取决于 genome 总大小 | ✅ **确认**（见下，最干净的一格） |
| P4 V6b 把 layer-1 fan-in 100→140 ⇒ D +17% | ✅ 算出来 **+18%**（⚠ 这是公式的算术推论，不是独立测量） |

### P1 为什么错，以及为什么这反而让结论更硬

公式描述的是**一层自己的权重扰动**；实测的 Δ(pre-activation) 还包含**上游层被改动后传下来的那部分**。
所以测量天然 ≥ 公式，且**随深度累积**：champion 上是 0.94 / 1.40 / 1.53，随机网上窄层更夸张（[24,16] 的第 3 层到 **7.09**）。
⇒ **只有第 1 层能用来校验公式**（它没有上游）——四个架构上实测 0.236 / 0.210 / 0.234 / 0.227，公式一律 ≈0.235。
⭐ 而 V6b 改的恰好就是第 1 层的 fan-in（recurrent state 拼进 observation），**公式被验证的那一层正是要用它的那一层**。

### P3 的证据（这是本次最干净的一格）

genome 从 **3028 → 32780（10.8×）**，layer-1 的实测 D 在 **0.210–0.236** 之间没动。
⇒ ⛔ 「genome 变大了所以要调 σ」是错的直觉；决定 D 的是**那一层的 fan-in 与权重 std**，不是参数总量。

### P2 的证据（sweep，量的是 layer-1）

- σ 从 **0.02 → 0.15（7.5×）**：实测 D1 只从 0.179 → **0.211**（+18%）。
- resetProb 从 **0 → 0.02**：实测 D1 从 **0.039 → 0.432（11×）**，action 变化 0.056 → 0.542。
- ⭐ **resetProb = 0 时突变几乎是行为惰性的**（D1 0.039）。
⇒ 当前默认下**真正的继承保真度旋钮是 `resetProb`，不是 `mutSigma`**（新坑 #22）。
⚠ 这**不推翻** GOTCHAS #1：σ=0.15 + rate=0.04 时 sigma 项变成 9e-4、反超 reset 项，总 v 约为默认的 2.4 倍（D ≈1.55×）。
那是 sigma 真的在主导的区间。⚠ 另一条不确定性说清楚：我量到的 s=0.16 来自一个**在 σ=0.05 下进化出来的**冠军，
σ=0.15 的历史种群权重尺度不同 ⇒ ⛔ 不能拿今天的 s 回算当年的塌缩，只能说机制方向一致。

### 行为层（有分母）

对第三方标尺 `v6a-fade-s2:B@39`（618 sighting ticks/match，真的在打）：parent **50%**，16 个孩子 **54% 均值 / sd 13pp / 范围 25–88%**。
⇒ 默认设置下突变**行为上近似中性**。
⚠ 第一版把孩子和**它自己的 parent** 对打，读到干净的 50% —— **0 个 sighting tick**。
冠军和它的近亲拷贝继承了同一个互相回避均衡，根本不见面（#18/#20 第三次以新形态出现）。
改成「父子各打同一个第三方」才有分母。⭐ 这条现在写进脚本注释里了。

### 给 V6b 的结论（可直接用）

1. **genome 变大本身不需要改 σ。** 需要看的只有 layer-1 的 fan-in：
   拼一个 H 维 recurrent state ⇒ D **H=24 +11% · H=40 +18% · H=64 +27%**。
2. 如果想把 D 压回原值，**动 `resetProb` 而不是 σ**：init 尺度下 H=40 时 `resetProb 0.002 → 0.0014` 即可（D² ∝ fan-in · v）。
3. ⛔ 但**先别改**——+18% 在 sweep 的分辨率下是小量（σ 翻 7.5 倍才 +18%），按「一次一根杠杆」先原样上 V6b，
   用同一个 `npm run inherit` 在新架构上复测，再决定要不要动 resetProb。

原始输出：`runs/inherit-s1R.txt`（gitignore）。

## [2026-09-12 22:15] 固定标尺：40 代共演化出来的冠军，被 12 行的脚本 bot 打 0%  #measure #incident #decision

做 D1 的 A/B 时撞到一个方法学死角：**rec-on 和 rec-off 的冠军没法互打**（genome 一个 100 输入一个 140 输入，
crossplay 直接报错，而且它本来就该报错）。凡是改「动作/输入含义」的 phase 都有这个问题 —— V4 也一样。

### 解法：不吃 genome 的对手

`npm run yardstick`（`scripts/yardstick.ts`）：拿 `src/brain/scripted.ts` 里的手写 bot 当固定标尺。
它们**没有 genome、不读 observation 向量**，只读 world 写 action ⇒ **在任何规则集下都是同一个对手**，
所以对它的胜率**可以跨 phase 边界比**。这是 crossplay 做不到的那一格。
⚠ 前提是**世界没变**：`recurrentDim` 允许不同（只加宽 brain 的输入），其余任何 SimConfig 差异一律硬报错。
这个 allowlist（`BRAIN_ONLY_FIELDS`）是承重声明，所以 `tests/world.test.ts` **机械校验**它：
把表里任何一个字段改掉，scripted-bot 的比赛哈希必须逐位不变。

顺带修一个会静默的洞：旧 run JSON 没有 `recurrentDim` 字段，`obsDim(cfg) + undefined = NaN`。
`normalizeSim()` 现在补齐缺字段**并打印补了哪些**（三个脚本都接了），⛔ 不假装旧 run 当初就是这么配的。

### ⭐⭐ 结果：全灭

12 个冠军（3 个 seed × 红蓝 × gen 0 与 gen 39），每格 16 场、双色平衡：

- **对 rusher：11 个读 0%，1 个读 6%。** 大多数格子有真接触（138–1213 sighting ticks/场），不是没打。
- **gen 0 和 gen 39 没有区别**（都是 0%）⇒ **40 代共演化在真实胜负条件上没有任何进展**。
- 对 idle（什么都不做的 bot）有一半冠军只打成 **50% 平局** —— 自己也不进区，两边都 0 分。

逐场拆开看（s2:B@39 vs rusher，三场）：**champion zoneShare = 0.000**，rusher 0.50–0.63，
比分 **0.0 : 36.5**；而且不只是不占区，**团灭 0–5 / 4–5 / 2–5**，被打穿之后 rusher 把剩余时间全部计成分。

### 为什么会这样（机制，不是猜）

`winner` **只看占区分**（团灭则把剩余时间折算成分）；而 fitness = 占区差 + **0.5×伤害差** + 0.2×在区时间差 + 团灭奖惩。
两个 population 互相都不进区 ⇒ 占区差恒 ≈ 0 ⇒ **梯度全部来自伤害项**，于是双方一起进化成「只打架不占点」，
而且谁也不会因此吃亏——**因为对手也不占点**。这是共演化滑进**共同盲区**的教科书形态：
内部指标（best/mean fitness、redWinShare、ladder）全部正常，对外部对手 0%。

⚠ 一句公平话：rusher 不是「弱」baseline —— 它把 target-slot 自动瞄准（V4 那笔账）用到了满，
而且直取胜负条件。说它「12 行」是说行数，不是说它好打。

### 这不是 D1 造成的，也不该由我顺手修

gen-0 就已经 0%，所以这是**整个训练设置**的性质，和 D1 正交。⛔ 我没有改 fitness、没有把 bot 塞进训练对手池 ——
两条都是 VISION 级别的方向选择（「战术只能涌现」vs「课程里要不要放人写的对手」），**留给用户定**。
新坑 **#23**。

原始输出：`runs/yardstick-v6a.txt`（gitignore）。

## [2026-09-12 23:05] D1 判决：recurrent state 在用，但**不是当记忆用**  #measure #decision #deadend

三臂各 40 代 pop 16 两 seed（A = 基线 rec0/mem3，复用 v6a-fade-s1/s2，前向路径已验证逐列不变；
B = rec0/**mem0**；C = rec40/**mem0**）。预测冻结在 `runs/d1-predictions.txt`。

### 预测对账

| 预测 | 结果 |
|---|---|
| P1 拿掉世界记忆会**变差** | ✅ 首枪 5.82→**9.84**（s1）、5.29→**14.81**（s2）；kills 2.98→0.97、3.29→1.80；accuracy .302→.190、.306→.214 |
| P2 arm C 补回**一部分** | ✅ 训练指标上补回 **50–80%**（s1 kills 2.05 = 补回 53%；s2 首枪 6.90 = 补回 83%；s2 accuracy .310 已超基线） |
| P3 yardstick 对 rusher 仍是 ~0% | ✅ **12 个冠军全是 0%**（一个 8%），三臂无差别 |
| P4 mem0 下 A1-P23 clean | ✅（构造上成立，`npm run leaks --mem 0`） |

### ⭐⭐ 但 P2 的「补回」不是记忆补回来的

`npm run recprobe` 四种模式跑同一批 seed，**只消融被观察那一队**（对手是本 run 的蓝方冠军时它也有脑子，
两边一起废掉会把「都变弱」读成 null）：

| 模式 | 喂进去的是什么 | 实测 `var` |
|---|---|---|
| live | 正常逐 tick 更新 | 0.24–0.75 |
| wiped | 每 tick 清零 | 0.000 |
| frozen | 本场第 10 tick 的快照，之后不变 | ~0.01 |
| **alien** | **另一场比赛**抓来的状态，恒定不变 | **0.000** |

**alien 和 live 打平。** 两个 seed × 三个对手、每一项指标都是：
s2 own-B kills live 2.58 / alien 2.17、shots 50.7 / 43.3、首枪 5.0 / 5.3、sight 1353 / 1211；
s2 camper kills **3.00 / 3.00**、shots 46.0 / **56.2**；s1 own-B kills live 2.17 / alien **3.58**、win 25% / **46%**。
而 wiped 明显更差（s2 own-B kills 2.58→**0.42**、shots 50.7→19.6）。

⇒ 这条通道**承重，但承的不是历史**：拿一个**跟本场毫无关系**的常数喂进去，效果和逐 tick 更新的状态一样好。
⇒ 40 维 Elman 状态被进化用成了一个**学出来的常数偏置**，arm C 相对 arm B 的进步是**容量**，不是**记忆**。

⭐⭐ **只跑 wiped 会得到相反的结论。** wiped 一口气抹掉 140 个输入里的 40 个，任何训练过的网络都会变差 ——
「消融有效」证明的是「这块输入有用」，不是「它存的是历史」。是 frozen / alien 这两个
**in-distribution 对照**把结论翻过来的（新坑 **#24**；也是 DISCOVERY 合同「mechanism ≠ evolved mechanism」的实例）。

### 判决与去向

- **ROADMAP D1 的 exit「确认 RNN 真能利用 history」＝ 没过。** 泄漏侧 exit（A1-P23 clean）过了。
- ⛔ **默认值不动**（`recurrentDim: 0` / `memorySeconds: 3`）：mem0 有真实能力代价而没有等价补偿，
  现在翻默认就是纯退步。代码与开关全部保留，`--rec` / `--mem` 可随时复现三臂。
- **reframe（方向没被否，这版实现被否）**：VISION §8 说记忆属于玩家，这一条没变。真正的疑点是
  **这个世界现在根本不奖励信息博弈** —— 目标被无视（坑 #23）、交战是近距离乱战，
  「记住一个看不见的人」根本不付钱。⇒ **D1 的空结果很可能是世界问题不是脑子问题，和 #23 同一个根。**
  ⇒ 下一根杠杆应该是 **Phase C1（objective 拓扑）**，不是换 GRU。

⚠ 顺带一条口径警告：mem0 两臂的 `coverRatio` 全是 **0.000**，这是**定义变了**不是行为变了
（威胁判定退化成「此刻看得见」，而看得见通常互相看得见 ⇒ coverTicks 结构性为 0）。⛔ 不可跨 mem 值比较（坑 #12）。

原始输出：`runs/d1-*.txt|json`、`runs/recprobe-s{1,2}.txt`、`runs/yardstick-d1.txt`（gitignore）。

## [2026-09-12 23:20] C1 起步：先量旧地图，量之前先证明尺子是对称的  #measure

ROADMAP C1 写的是「**probe before map build**」，所以这一刀只做探针，不动地图。
`npm run mapprobe`：在 0.5 m 网格上从目标区和出生排各做一次 BFS，把
`ds + dt <= 最短 × (1 + slack)` 的格子定义成**可行通路**（默认 15% 绕路余量，
所以合理的绕路算数、走进死角不算），再按深度切片数连通分量 = **真正不同的走法**，最窄的一片 = **choke**。

### ⚠ 第一版读出来的红蓝不对称是假的

边对齐网格 `floor((x + half) / cell)` 让 x = 8 落进中心 8.25 的格子、x = −8 落进中心 −7.75 的格子，
于是一张 **180° 旋转对称**的地图被读成：距离 27.0 vs 28.0 m、通路 2 vs 3 条、choke 17 vs 14。
改成**奇数格数 + 格心关于 0 对称**后，三个 seed 上红蓝**逐项相同**。
⇒ 那个偏差从头到尾只存在于测量里。新坑 **#25**，并且给脚本加了 `--self-test`
（断言 `idx(x,z) + idx(-x,-z) == n²−1`、旋转两端可走性一致、对称地图两侧读数相同，失败 exit 2）。

### 旧地图基线（seeds 7 / 11 / 23，红蓝已验证逐项相同）

| seed | 可走格 | 最短距离 | 最宽切片的通路数 | choke（格） | **通路占可走面积** | 出生点视线被挡 |
|---|---|---|---|---|---|---|
| 7 | 12647 | 27.0 m | 2 | 14 | **5%** | 4/5 |
| 11 | 12413 | 31.0 m | 5 | 12 | **9%** | 5/5 |
| 23 | 12587 | 28.0 m | 2 | 16 | **6%** | 4/5 |

⭐⭐ **91–95% 的可走面积不在任何一条通往目标的可行路线上。** 只有一个目标时，别处根本没有去的理由。
这就是 C1 前提「单一 central KOTH zone 结构上无法产生 A/B 博弈」的实测形态 ——
也和坑 #23（目标压力为 0）、D1 的空结果（世界不奖励信息博弈）是同一件事的三个侧面。

`site commitment time / first pressure side / rotate frequency / defender rotation latency / split width /
post-objective retake paths` 六项**在单目标地图上没有定义**，探针直接印 n/a 而不是印 0 —— 那是 C1 要造出来的东西。

## [2026-09-12 23:30] C1 诊断：世界**用目标的货币给淘汰发工资**  #measure #decision

C1 的 target shape 里有一条「elimination 仍是合法胜法，但**不能永远支配 objective play**」。
查代码时发现这条已经在 `world.step()` 里被违反了：

```ts
if (this.aliveCount[RED] === 0 || this.aliveCount[BLUE] === 0) {
  const remaining = Math.max(0, cfg.matchSeconds - this.t);
  if (this.aliveCount[RED] > 0) this.score[RED] += remaining * cfg.zonePointsPerSecond;
```

**团灭一次 = 把剩余时间**按占区费率**直接记成占区分**，一步都不用走进区。

实测（两组跨 run 冠军对打，40 场）：
- 只有 **13%** 的比赛以团灭结束；
- 但那些团灭平均给出 **3.13 分/场**，而全部 40 场里**真的靠站在区里**赚到的只有 **2.22 分/场**；
- ⇒ **白送的那份是所有占区收入的 1.4 倍**。折算下来一次团灭 ≈ 24 分，
  而一整场正常比赛的占区收入 ≈ 2.2 分 —— **一次团灭约等于十场比赛的占区价值**。
- 换个说法：一场比赛最多 40 分的目标价值，实际被占区认领掉的只有 **5.5%**。

⇒ 坑 #23（冠军对 rusher 0%）、D1 的空结果（不奖励信息博弈）、mapprobe 的 91–95% 死区，
现在有了**同一个机制解释**：这个世界的最优「占区」策略是杀光对面。

### ⛔ 但不要顺手把这段删掉

那段代码是个**仿真快捷方式**，替代的是「活下来的人慢慢走过去无人干扰地占满剩下的时间」。
直接删掉 ⇒ 团灭一分不值，过度矫正，也违反「elimination 仍是合法胜法」。

真正的修法在 C1 target shape 自己那一条：**objective action 要有时间成本和可中断性** ——
一个你可以提前投入、并且**在你死后仍然继续计时**的目标（职业 CS 的 plant/defuse 就是这个形状）。
那时杀光对面不再等于拿下目标，因为对面可能已经投入了。⇒ 这条作为 C1 的设计约束记进 ROADMAP。

## [2026-09-12 23:45] C1a ship：目标现在有投入成本、有独立倒计时、可被反悔  #ship #decision

按 ROADMAP C1 的「最小设计」三刀里的第一刀，**不动地图**，只把回合机制换掉。
`roundMode: 'capture'`（`SimConfig`，**默认仍是 `'koth'`**，所以旧世界一个字节都没动 ——
12 代训练输出的**每一行和两条 duel 行逐字相同**，只有耗时那一行不同）。

**机制**：attacker 独占站在 site 里累积 capture meter（`captureSeconds`，离开会衰减，被 defender 顶住就不动）；
满了 ⇒ **armed**，一个 `armedSeconds` 的倒计时**按自己的钟走**；defender 独占站进去消耗 defuse meter（`defuseSeconds`）。
终局全部由规则判定：倒计时归零 = 攻方赢；defuse 满 = 守方赢；未 armed 时攻方团灭或时间耗尽 = 守方赢。
**armed 之后回合不因时间到而结束** —— 炸弹比回合钟活得久。

⭐⭐ **那段「团灭白送剩余时间」的加分自然消失了**：终局是规则判定，不需要再拿占区费率替代
「活下来的人慢慢走过去占满」。测试 `pays nothing for time not spent` 钉死这一点，
而且**团灭守方不再结束回合** —— 攻方仍然得自己走进去把它拿下。

**攻守角色按比赛分配**（`new World(..., { attackers })`），两种分配都跑 ⇒ `red`/`blue` 仍然只是 sides。

### 验收

- 6 条新测试，最承重的那条是 ⭐ **「armed 之后杀光全部攻方，守方仍然输」** ——
  这正是 koth 下「团灭 = 拿下目标」的反面。另外五条：污染时不推进 / 离开会衰减 / defuse 能赢 /
  **未 armed 前团灭攻方守方立刻赢（elimination 仍是合法胜法）** / armed 的点位活过回合钟。74 → 80 测试。
- reference bot 实测（rusher 打 rusher，48 回合，两种角色分配都跑）：capture 下
  **攻方角色胜率 50%**（角色公平）、**50% 的回合被 armed**（平均 10.6 s）。
  ⚠ rusher 对 rusher 时 100% 的回合以团灭收场，所以「armed 之后被团灭」出现 **0 次** ——
  这条要靠一个**会退守再进场 defuse 的 reference bot** 才演得出来，属于 **C1c**。机制本身由单测钉住。
- ⚠ camper 当守方时攻方 **100%** 获胜：camper 蹲在出生点，而地图**故意**让出生点看不见目标区（墓碑坑 3）
  ⇒ 它结构上防不住。这是 C1c 需要一个真正的 site defender reference bot 的第一条证据，不是机制问题。

⚠ **平衡没调**：`captureSeconds 3 / armedSeconds 15 / defuseSeconds 5` 是首版数字，
⛔ 别把它们当结论；调之前先把 C1b 的双 site 做出来，否则调的是一个即将消失的拓扑。

### 边界

- ⚠ **evolving agent 现在看不见 armed / 倒计时** —— 公开回合状态是 **C2** 的活。
  `self.scoreDiff` 在 capture 下改成携带「攻方进度 − 守方进度」∈ [−1,1]（同一条合法 HUD 通道，只是换了尺度）。
  ⛔ 在 C2 之前，别拿进化种群的表现评判这套机制：它们还没被告知规则。
- `objectiveProgress` 加进 `TeamMetrics`（两种模式下都有意义），因为 capture 模式下 `zoneScore` 只会是 0–2。
- capture 模式的 fitness 是**零和**的攻方视角量：赢 = +1，输 = −1 + 0.6×最高进度（VISION §10 允许的冷启动 shaping）。
  ⚠ 伤害项仍保留 0.5 系数 —— 那一项已被实测判定不合规（永远压不过结果），但**重定它是另一根杠杆**，不搭这趟车。

## [2026-09-12 23:50] C1b-1：两个 site 的地图，先让探针量得到它  #ship #measure

C1b 本身又太大（改地图 + 改 world 的多点位逻辑 + 改 observation ⇒ genome 全作废），所以再拆一次：
**C1b-1 只动地图和度量，world 仍然只玩 site 0** —— 于是这一刀不作废任何 genome、不改 obsDim，
`siteCount: 1`（默认）下的地图**逐字节不变**（测试钉死 `generateMap(7, siteCount:1)` 与旧输出 `toEqual`）。

**布局**：两个 site 放在 `(±siteOffset, 0)`（默认 12），刚好互为 180° 旋转像 ——
这是「攻守不对称」还能 side-fair 的唯一办法：旋转世界之后你就站在对手的位置上，A 和 B 换个名字。
**四面 screen**（两对，因为**每个 site 都要对两条出生排都不可见**，一对只挡自己那边）+ 一道**中央隔墙**
（它自己就是自己的旋转像，所以只 push 一次），把「打哪边」变成一个真的要提前投入的选择。

### 实测（`npm run mapprobe --sites 2 --seeds 7,11,23`）

| | 单 site（旧） | 双 site（新） |
|---|---|---|
| **通路占可走面积**（对所有 site 取并集） | **5–9%** | **18–20%** |
| 每个 site 的通路数 | 2–5 | 3–5 |
| choke（格） | 12–16 | 18–36 |
| 出生点视线被挡 | 4–5 / 5 | 4–5 / 5（每个 site 都测） |

⭐ ROADMAP 给 C1b 定的验收线「通路占比要从 5–9% 显著上升」**达成：2–4 倍**。

新增、以前印 n/a 的两项：
- **A → B 步行 39.0 m = 全速 6.5 s** —— 任何 rotation 的**几何下限**。
- **同一侧通往 A 与 B 的通路重叠只有 4–19%** ⇒「打哪边」是真正的承诺，不是同一条路两个名字。

**side-fairness 机械校验**：三个 seed 上红→A 与蓝→B、红→B 与蓝→A **逐格相同**，写进
`mapprobe --self-test`（已在 CI 里）。⚠ 注意 A 和 B 对**同一侧**并不等价（seed 7：红→A 39.0 m / 3 条路，
红→B 36.0 m / 5 条路）—— 每一侧都有一个「近点」和一个「远点」。这**不违反** side-fairness（另一侧看到的是镜像），
而且正是让 rotate / fake 有意义的那种不对称。

### ⭐ 一个没调出来、是算出来的平衡点（观察，不是结论）

`armedSeconds = 15`，而猜错边的守方**最好情况**要 6.5 s 走过去 + 5 s defuse = **11.5 s**。
⇒ 猜错边可以救，但只够一次**干净且无人干扰**的 rotation。这是几何和 C1a 常数**碰巧**对上的，
⛔ 不是调出来的，也**还没有**被 agent 验证过 —— 真正的裁决在 C1c 的 reference bot。

## [2026-09-12 23:55] C1b-2：world 真的在玩两个点位  #ship

capture 逻辑从「一个 zone」改成「每个 site 一条 meter」：`capture: number[]`、`armedSite`（−1 = 未 armed）。
⭐ **只可能有一个点位被 armed** —— 是一颗炸弹，不是每个点位一颗；一旦 armed，别处的 capture 不再有意义。

⚠ **有意不做的事：observation 没动。** 两个 site 的位置、哪个被 armed、倒计时还剩多少 ——
全都是**公开回合状态，属于 C2**。所以这一刀**不作废任何 genome、不改 obsDim**。
⛔ 代价是：`siteCount: 2` 下 `obj.*` 那组观测仍然只指向 site 0，对进化 agent 是**不完整的**。
默认 `siteCount: 1` 所以没有任何东西是带着这个缺陷发出去的，但 C2 之前 ⛔ 别在双点位地图上训练并解读结果。

### 验收

- 两条新测试，承重的那条是 ⭐ **「守方五个人全站在 A 上，攻方照样把 B 拿下」** ——
  这就是两个点位和一个大点位的全部区别。另一条钉住「只有一个点位能被 armed」。85 测试绿。
- 冒烟（rusher 对 rusher，双点位 capture，48 回合两种角色分配）：攻方角色胜率 **50%**（角色公平），
  **50%** 的回合被 armed，平均回合 **31.5 s**。
  ⚠ **armed 的 24 回合全部发生在 site A** —— 因为 `RusherPolicy` 只认识 `map.zoneX/zoneZ`（= site A）。
  这不是世界的问题，是 reference bot 还不会选点位。⇒ **一个会选点位的 bot 是 C1c 的第一件事。**

## [2026-09-13 00:10] C1c：exit 3/3 过 —— 但前四版 FAIL 全是工具不是世界  #measure #decision #ship

`npm run c1exit`：用 reference bot 向**世界**提问（C1 的 exit 原文就是「scripted/reference agents 能证明
**世界允许**」），每个问题都是一次对照，且**两种角色分配都跑**。新增 reference bot：
`SiteAttackerPolicy`（可按 slot 分兵）/ `FakeAttackerPolicy` / `SiteDefenderPolicy` /
`ReactiveDefenderPolicy`（往人多的点位收）/ `EagerRotateDefenderPolicy`。
⛔ 它们读 engine truth，是 reference 专用，**永远不进 evolving population**（CLAUDE.md）。

### ⭐⭐ 先说方法：连着四版自信的 FAIL，四次都是工具

1. **bot 走直线，被 C1b 新加的 screen 顶住** —— 守方卡在 (13,14)，而点位在 z=0，**从没走到过任何点位**。
   三条 exit 全 FAIL，而且「hold」和「eager rotate」读数**逐位相同**（两个 bot 卡在同一面墙上）。
   ⇒ 修法：新建 `src/sim/nav.ts`（BFS 导航场，**reference/analysis 专用**，⛔ evolving policy 永不可 import），
   bot 改走导航场。同一个世界，E1 立刻从 0% 变 75%。
2. **「假打」的 bot 走进假点位并把它 arm 了** —— 那不是假打，是改主意。⇒ 假打时停在点位**边缘**（1.25×半径）。
3. **「过早 rotate」设在 t=8，而点位通常在那之前就 armed** ⇒ bot 从没偏离过 holder。⇒ 提前到 t=4。
4. **E3 的基线本身就 88% 攻方胜率** ⇒ 天花板效应把真实的 27pp 压成 0pp。⇒ 换成五人守 A 的基线。

⚠ 还有一条是**我的判据写错了**，不是工具错：E2 我原本要求「假打对反应型守方的收益 > 对固守型的收益」，
而 phase 原文是「在**某些** defender response 下有收益」。我把门槛提得比 phase 本身更严。改回原文口径。

新坑 **#26**：读到 FAIL 或零差异，先证明**这次测量到达了断言**，⛔ 别先改世界。
⚠「两组读数逐位相同」几乎永远是工具没生效。

### 结果（3 张地图 × 8 seed × 两种角色分配 = 每格 48 回合）

- **E1 两个点位都打得下来**：全压 A **88%**、全压 B **67%**（对 3/2 固守）。✅
- **E2 假打有收益，而且只对它针对的那种守法有收益**：
  对**反应型**守方 **79%** vs 直接打 B 的 48% ⇒ **+31pp**；
  对**固守型**守方反而 **−21pp**（假打白跑 39 m，而守方根本没动）。✅
  ⭐ 这正是 phase 要的条件式结构 —— 一个真实的战术取舍从**地图几何**里长出来，不是谁写进去的。
- **E3 早走会留下空间**：五人守 A 时攻方 50%，同样五人在 t=4 离开 A 之后攻方 **77%** ⇒ **早走的代价 27pp**。✅
- **E4 有没有支配一切的路**：几何问题。双点位地图上「必经的中段切片」宽 **20–63 格（10–31.5 m）**，
  旧单点位地图是 **12–31 格（6–15.5 m）**。⇒ 仍然是单连通，但那是一片**开阔地**不是走廊。
  ⚠ 严格说这条**没有被干净地证否**，只能说「不存在**窄的**必经走廊」。⛔ 别把它读成 PASS。

⚠ `mid` 这个指标本身也踩了一次同样的坑：第一版只报「最少连通分量」，读出来**每张地图每个点位都是 1**，
差点写成「C1 exit E4 全线失守」。但**靠近点位的切片必然收敛成 1**（所有路都要到达同一个地方），
而且**一片宽阔的开阔地也是 1 个连通分量**。加上「那片切片有多宽」之后结论才成立。

**判决：C1 CLOSED。** 三条行为 exit 全过，第四条几何上大幅改善但不宣称证否。

## [2026-09-13 00:25] C2 第一刀：死掉的队友一直在广播他死在哪  #ship #incident

C2 的 Build 清单里有一条「**kill feed without death coordinate**」。查现状时发现这条**已经被违反**，
而且不是在 kill feed 里 —— 在**队友 HUD 槽**里：`mate*.dx/dz/dist` 对**死掉的**队友照样写真实坐标，
于是每个幸存者的 HUD 上都钉着一枚**永久的死亡标记**，标在「敌人最后出现过的地方」。
comm 和 hp 在 V11 那一刀就已经对死人清零了，位置没有。

**改法**：死掉的队友只留 `alive = 0`（这就是「我们少一个人」这条合法公共信号的全部内容），
位置三个字段清零。⛔ 没有做「渐隐的死亡标记」那种更像 CS 的版本 —— 默认往安全的方向倒（`coding-practice`），
要放宽是 C2 后面可以显式决定的事。

**新探针 `A1-P24`**（registered `clean`）：把**尸体**挪 14 m，断言**没有任何字段动**；
⭐ 同一笔里带**正向护栏** —— 对**活着**的队友做同样的移动必须让 `mate*.dx` 动，
否则这条绿是因为整个通道死了，不是因为尸体闭嘴了（坑 #11）。
⭐ **实测过它有鉴别力**：把旧行为临时放回去，探针立刻变 `LEAK`（`mate3.dx, mate3.dz`），闸也标了 `!`。
（是 `mate3` 不是 `mate0`，因为死人被排到队友序列末尾 —— 顺带确认了那个排序也在工作。）

## [2026-09-13 02:55] C2 主刀：公开回合状态进观测（obsDim 100 → 103，旧 genome 全作废）  #ship #measure

这一刀是 C1 之后真正的解锁项：进化 agent 终于能看见**点位在哪**和**哪个点位 armed**。

**观测的目标区块从「一个 zone」改成「每个 site 一块 + 全局回合状态」**：
每个 site 六个字段（相对向量 dx/dz、距离、**我**在不在里面、**我方几个人**在里面、**它 armed 没有**），
外加两个全局字段（armed 点位的**倒计时**、**defuse 进度**）。
顺手删掉 `self.inZone`（和 `obj0.selfIn` 重复，单一真源）⇒ `SELF_BASE` 20 → 19。
⇒ **obsDim 100 → 103**（单点位）/ **109**（双点位），genome **5324 → 5444**。
⛔ **所有既存 genome 作废** —— 这是 ROADMAP 早就登记过的 C2 代价。

### ⭐ 刻意不公开的那一格

`objN.armed` 是公开的（一次 plant 在真实回合里是**会播报、有声音**的），
但**未完成的 capture 进度不公开** —— 想看着表填满，你得人在那里。
这给攻方留了一个窗口，也是「公开」和「全知」的分界线。
同一条边界上还有上一刀的结论：死掉的队友只报「他死了」，不报「死在哪」。

**合同守卫**：`World` 构造时断言 `map.sites.length === cfg.siteCount` ——
观测布局是从 cfg 推出来的，两者不一致就会静默错位。labMap 也跟着按 cfg 生成点位。

### 新探针 `A1-P25`（这就是 C2 的 Probe 原文）

「目标状态变化时，只有 legal HUD 字段改变，不夹带敌情」：在 capture 模式下把一个点位设成 armed，
断言**恰好只有** `obj0.armed` 与 `obj.countdown` 变化。
⭐ **两个方向都实测过有鉴别力**：把 `obj.countdown` 打成常数 0，探针立刻报
`the plant moved only [obj0.armed]: the public round state is not reaching the observation`（正向护栏生效）。
当前 **24 条 probe，矩阵与登记表一致**（exit 0）。

### bench：多了三个字段反而更快

交错配对（`git stash` A,B,A,B，严格前台，load ≈ 5）：
旧 **63.4 / 63.0** ms/match → 新 **60.7 / 60.8** ms/match ⇒ **快约 4%**，两轮同号。
真因应该是删掉 `self.inZone` 省掉了每 agent 每 tick 一次距离计算，而新增的三个字段都是现成值。

## [2026-09-13 03:25] 上一刀我违反了自己的规矩，拆开之后发现真因，而且量到了噪声上界  #measure #incident #decision

C2 主刀里我**一次动了两件信息层的事**，然后只量了一次 —— 正是我整晚在执行的「一次一根杠杆」。拆开来跑：

| 臂 | 内容 | obsDim | kills（s1 / s2 / s3） | 首枪 s |
|---|---|---|---|---|
| **A** `v6a-fade` | 两件都没做 | 100 | 2.98 / 3.29 | 5.8 / 5.3 |
| **D** `armD-deathfix` | 只做「死亡坐标关闭」 | 100 | 1.98 / 3.14 | 9.3 / 4.0 |
| **C** `c2-base` | 两件都做 | **103** | **0.35 / 1.65** | **34.2 / 12.8** |
| **C′** `armC2-koth100` | 死亡坐标 + 目标区块，**但 koth 下不发回合状态字段** | **100** | **2.87 / 2.95 / 2.87** | 6.7 / 5.6 / 4.2 |

⇒ **死亡坐标关闭基本是免费的**（D ≈ A，seed 2 甚至首枪更快、开火更多）；**崩的是 103 维那一版**；
**C′ 在三个 seed 上回到基线水平**，没有塌缩、没有 34 秒首枪。

### ⚠ 但我不能说「就是那三个死输入干的」

`Trainer` 用一条 `Rng(seed)` 顺序抽整个初始种群，而 `randomGenome` 消耗的高斯数**等于 genome 长度**。
⇒ 103 维那一版从第 0 代起就是**完全不同的种群**，哪怕 seed 一样。
⇒ C 与 C′ 的差里混着「三个死输入」和「抽奖运气」两份，**这个实验本身分不开**（新坑 **#27**）。

能说的只有三句：① 无条件发回合状态字段的那一版，在测过的两个 seed 上**确实**崩了；
② 按模式发放的版本在三个 seed 上**确实**回到基线；③ 这个修法**本身**就站得住 ——
**一个不可能变化的字段不是信息**，而常数输入不是免费的：它是一个没东西可学的自由参数，
外加一行只能被突变浪费的权重。⇒ koth 的 obsDim 回到 **100**、genome 回到 **5324**。

### ⭐ 顺手量到一条噪声上界（这条比上面都有用）

D 与 C′ **共享同一批初始种群**（长度相同 ⇒ 同一条 rng 抽出同样的数），
唯一差别是那 100 个**内容完全相同**的字段的**排列顺序**。结果：
seed 1 四项全面变好（kills 1.98 → 2.87、首枪 9.3 → 6.7 s），seed 2 涨跌互见（accuracy .260 → **.343**，kills 3.14 → 2.95）。
⇒ **光是把输入重新排个序，就能在 2 个 seed 上制造出和「真效应」同量级的差**。
⛔ 以后任何 2-seed 的行为侧 A/B，效应量都不可信，只能读方向 —— 这是本仓第一次把这条量出来。

## [2026-09-13 03:40] C2 收尾：尸体的沉默上了探针，kill feed 的边界钉死  #ship #decision

C2 Build 清单剩下的三条，逐条落地：

**「死亡玩家不得继续给活人 radio truth」—— 实现本来就对，但没人守着。** 上探针 `A1-P26`：
同时动**三条**通道（comm 总线、脚步音频、队友开火 cue），断言**一个字段都不动**。
⭐ 正向护栏：同样的改动在**活着**的队友身上会动 `mate0.hp / firing / comm0 / comm1 / audio0.footstep`
⇒ 尸体的沉默是真的，不是「三条通道都死了」的空过。
（为什么本来就对：`hear()` 的配对循环两端都跳过死人 ⇒ 尸体不出声；comm/hp 在 V11 已清零；位置在 `A1-P24` 关闭。）

**kill feed 的边界。** `world.events` 带精确坐标与身份，它有两个合法消费者：观战器（它是**观察者不是玩家**，
可以看见一切）和 `hear()`（把开火变成枪声 —— 那是**物理**不是 feed）。
⇒ 在类型上标成 **SPECTATOR CHANNEL**，⛔ 任何 policy 都不得读。
**玩家真正拿到的 kill feed 就是人数通道**（`self.aliveMine` / `self.aliveEnemy` / `mate*.alive`）
加上他听见的东西 —— 全都不含「在哪」。⇒ C2 那条「kill feed without death coordinate」满足了。

**explicit round lifecycle：判定为已足够，真正缺的那半属于 E2。** `t` / `timeLeft` / `done` / `winner` /
armed 状态已经把回合状态完整表达出来了；还缺的是 **freeze-time / opening prior**，
而那是 E2（Team DNA / opening prior）的活 ⛔ 不在 C2 里做。
观战器那个滚动 kill feed **UI** 仍留在 `TODO.md` —— 它是可视化，不是世界规则。

⇒ **C2 的世界规则部分收齐**：26 条 probe（新增 P24/P25/P26 三条），88 测试，观测普查回到
**100 字段 / 97 legal / 3 truth-form / 0 hidden**。

## [2026-09-13 03:55] 坑 #17 第二次中招：目标区块按世界顺序发，红蓝变成两个玩法  #incident #decision

准备在 C1/C2 世界里训练时先做了两件事，两件都抓到东西。

### ① trainer 在 capture 模式下从来不分配攻守角色

`runMatch` 的 opts 能带 `attackers`，但 trainer 一次都没设 ⇒ **红方在它打过的每一场里都是攻方**。
后果两条：红方会变成**永久的攻方物种**（VISION §11.2 明禁）；每个 fitness 都是**两种不同工作的混合**，
比例由排程随机决定，而 SUBSTRATE §10.3 要求 fitness 聚合必须 side-balanced。
⇒ capture 模式下每场配对**发两次**（同对手、同 seed、角色互换），koth 不动。测试把它**数出来**。
⚠ 侥幸之处：capture 此前只有 reference bot 跑过，而**它们的角色是显式传进去的** ——
这条本来会一直潜伏到第一个 capture 种群已经分化出来。

### ⭐⭐ ② 目标区块按**世界** site 顺序发 ⇒ 红蓝看到的是两个不同的游戏

红方的 `obj0` 是它**右边**那个点位，蓝方的 `obj0` 是它**左边**那个。
团队帧（blue 的帧 = 世界转 180°）保证了其他通道的镜像对称，而我新加的这条通道**按世界索引发**，
直接把镜像破掉了。

**镜像测试实测**（同一个基因组放两边，唯一差别是谁当攻方）：
攻方胜率 **红攻 0/48 vs 蓝攻 15/48**；逐场看是同一个基因组**当蓝方进了点位并拿下，当红方一次都没进去**。
修好之后 **1/48 vs 0/48**（随机基因组几乎不可能拿下点位，这才是对的量级）。

⇒ 修法和坑 #17 当年一样是**自我相对**：每队的点位顺序按**它自己帧里的 x** 排序，不按世界索引。
（用位置排而不是写死「两个点位互为镜像」，所以换布局也成立。）

⚠⚠ **为什么现役镜像测试没抓住**：它跑在**单点位 koth** 下 —— 那个配置里这条通道**结构上不存在**。
⇒ 坑 #17 补上第二个实例和一条推论：**镜像测试必须在「这条通道真的存在」的配置下跑**，不是在默认配置下跑。
新测试 `reports the sites in each team's OWN frame` 在 capture + 双点位下逐特征比，并**先断言通道非零**。
⭐ 实测它有鉴别力：把 bug 放回去，它报 `slot 0 field obj0.dx: expected 0.8 to be less than 1e-6`。

⚠ **`runs/c1c2-capture-s{1,2}` 作废** —— 那两个 run 是带着这个 bug 训出来的，重跑。
