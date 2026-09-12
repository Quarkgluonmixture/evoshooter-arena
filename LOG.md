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
