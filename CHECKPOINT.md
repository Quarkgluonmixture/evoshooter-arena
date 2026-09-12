# CHECKPOINT — evoshooter-arena

> 下一个 session 从这里接手。git 状态不写在这里：`git log --oneline origin/main..HEAD`。
> **方向/愿景 authority = `docs/VISION.md`；目标底座合同 = `docs/SUBSTRATE.md`；施工 phase = `docs/ROADMAP.md`；
> 当前已 ship 的规则/架构/数字 = `README.md` + `src/`。** 四者职责不要混。

## 一句话
自进化 3D 红蓝 5v5 射击场。现行 baseline 已能 deterministic co-evolution + 3D 观战；新主线是把它从“shared-brain + privileged structured state + 双 red/blue population”迁成**信息诚实、玩家私有 belief、身体原语、有限通信、个体 × team DNA、side-neutral club league + opponent ecology** 的职业战术射击底座，让 trade / lurk / fake / crossfire / mid-round / emergent language 等只能自然涌现、事后识别，并能展示其出生→稳定→因果验证→对手反制/语义漂移/消亡的证据链。

## 现状（截至 2026-09-11 晚）
- 四条入口都能跑：`npm run dev`（浏览器训练 + 观战）· `npm test`（vitest，含 leak matrix）· `npm run leaks`（当期信息泄漏矩阵）· `npm run train -- --gens 40 --pop 16 --seed 1`（无头）。
- 默认超参在 `src/core/config.ts`（`DEFAULT_SIM` / `DEFAULT_EVO`），改之前先看 LOG 里 `#deadend` 为什么现在是这个值。
- 已知行为：胜负主要靠淘汰，占区时间占比很低；被长期压制的一方偶发滑向躲藏。旧结论与数字见 README Evidence。
- **D1 step 1 已 ship（2026-09-12）**：`recurrentDim`（`SimConfig`，**默认 0**）把上一 tick 的第一隐层激活
  接回输入。状态放在 **World 上不是 policy 上**（policy 按 genome 缓存、跨比赛复用，状态放它上面会让
  一场比赛取决于之前跑过哪些比赛）。`--rec 40`：输入 100→140、genome 5324→**6924**、交错配对 bench **+12.6%**；
  前向路径逐列不变（`runs/ff-regression-12gen.txt`）。⛔ **step 2（拿掉 world 的完美记忆）还没做**，
  所以现在的 recurrent state 还没有任何它必须记住的东西。
- 当前 observation / action 是**baseline，不是 Gold Standard**：enemy truth features、360° lidar、target-slot auto-turn、feed-forward shared team brain 等已在 `docs/SUBSTRATE.md` 登记为承重 gap（V1 team-shared enemy 已在 A2 拿掉）。
- 当前 trainer 的 **red population vs blue population 也是 bootstrap，不是终局 ontology**：未来 ROADMAP E4–E6 迁成 `Club = team/coach DNA + five player blocks`，red/blue 只作为比赛 sides；对手分布由 peers / diverse contemporaries / history / exploiters 构成。⛔ 这不是当前 cursor，别现在跳过去改 trainer。
- **文化进化只先落设计边界，不实现。** `docs/CULTURAL-TRANSMISSION-CONTRACT.md` 已预留未来 E7：遗传与文化是两种 transmission，opponent ecology 是 selection；D1 RNN / local memory 默认不跨比赛偷偷持久化，也不能叙述成 club culture。真正 E7 必须等 E1–E6 的 player identity / club genotype / side-neutral league / opponent ecology 能分别测量后再开。
- 无头训练输出在 `runs/`（gitignore），浏览器端用「export run」拿 JSON。
- 观战体验做过一轮五修（底栏布局 / 转头平滑 / 射击命中特效 / 三个跟随镜头 / 渲染插值），实测数字与取舍在 LOG 2026-09-11 21:30。
  其中**转头是仿真机制改动**（`turnRate` 交战 2π + `scanTurnRate` 扫视 2.6 rad/s + look 动作 0.45 s 低通），⚠ 它踩在 SUBSTRATE **V4 要删掉的 `targetId` 抽象**上 ⇒ A2/V4 动手时必须重新推导，不能照搬（LOG 同条末尾）。
  ⭐ **A0 census 就冻改动后的值**（改动后才是 main 上的现实，A1/A2 从这里出发；改动前的 run 留在 `runs/post-turnfix-s*.json` 仅作历史）。⛔ 别再重议这一条。

## 新 docs（先读）
- `docs/VISION.md` — Gold Standard；决定“什么值得做、什么绝不能写死”；两根北极星：**对手分布才是老师**、**观赏性来自可解释的新行为诞生**。
- `docs/SUBSTRATE.md` — world truth / sensors / private belief / body actions / radio / Club DNA / league ecology / discovery analytics 的工程边界与 hard tests。
- `docs/ROADMAP.md` — future agent 可直接自走的 Programme A–G phase ledger；E4–E6 = club/league/opponent ecology，G4 = Evolution Discovery Feed。
- `docs/DISCOVERY-EXPLAINABILITY-CONTRACT.md` — G2–G4 / emergence strong-claim 的专门证据合同：**surface form ≠ causal function；effect ≠ intent；mechanism ≠ evolved mechanism**；定义双空间 discovery、event graph、forkable epistemic replay、communication/convention claim ladder 与 lineage。
- `docs/EVOLUTION-ECOLOGY-CONTRACT.md` — E5/E6 的专门生态合同：**cycles 是内容而非唯一 gate；优先看 frequency-dependent payoff / runaway style；League 发现 counter、world 提供 counter-payoff surface**；明确生态是 selector，不是 inheritance channel，并登记长期 scaffold retirement。
- `docs/CULTURAL-TRANSMISSION-CONTRACT.md` — **未来 E7 的预留合同**：genotype / episodic memory / acquired individual state / institutional culture 分层；禁止 telepathy 式文化复制；文化 strong claim 至少要 fixed-genome formation → newcomer uptake → founder-removal persistence，并进一步可做 transfer / semantic drift / cultural lineage。

这三份专门合同**不改变当前施工顺序**；只在未来 E5/E6/E7/G2–G4 或任何“已经学会语言/战术/角色/文化”的 strong claim 时强制读取。

## ⭐⭐ 目标压力已经归零——归属 Phase C1，不是现在顺手修

**40 代共演化出来的冠军，对手写 rusher 是 0%**（12 个冠军里 11 个 0%、1 个 6%，**gen 0 与 gen 39 没区别**）。
逐场：champion zoneShare **0.000**、比分 0:36.5、团灭 0–5。机制：`winner` 只看占区分、fitness 里有 0.5×伤害差，
两边都不进区 ⇒ 占区差恒 0 ⇒ 梯度只剩打架，且**谁都不吃亏，因为对手也不占点**（坑 #23）。

**按 VISION / ROADMAP 读出来的归属（2026-09-12，已不再是待裁决项）：**
- ⛔ **不把 scripted bot 放进训练对手池** —— Phase C1 的 Exit 写死「reference bot 只验证世界是否允许，
  不进入 evolving population」，E6 的四类对手也全是进化实体。它的正确用法就是 `npm run yardstick`（验收镜子）。
- ⚠ **也不直接调大占区奖励** —— VISION §10 对 shaping 的判据是「可被结果主导地压过去」，实测没被压过去，
  所以 0.5×伤害项确实已不合规；但 ecology contract §5 要求 counter-payoff **来自世界**，不是来自系数。
- ⇒ 正确的修法是 **Phase C1 的 objective 拓扑**。证据与新增的 exit 条件已写进 `docs/ROADMAP.md` Phase C1。
⚠ 这是**先前就存在**的性质（gen 0 就 0%），和 D1 正交。

## Current cursor
⭐⭐ **下一刀 = ROADMAP Phase C1（objective 拓扑）。** D1 已经走完并给出判决（下条），
它失败的原因和 yardstick 那条独立证据指向同一个根：**这个世界既不奖励占点、也不奖励信息博弈**。
⛔ 不要在 C1 之前回头换 GRU / 加宽 recurrent state / 调 fitness 系数——那是在一个不付钱的世界里调参。
**C1a 已 ship（2026-09-12）**：`roundMode: 'capture'`（默认仍 `'koth'`，旧世界逐行不变）——
attacker 独占站点累积 capture meter → armed → **倒计时按自己的钟走，攻方全灭也照走** → defender 独占站点 defuse。
⭐ 承重断言：**armed 之后杀光全部攻方，守方仍然输**。团灭白送分自然消失；团灭守方也不再结束回合。
⚠ 常数（3/15/5 秒）是首版，⛔ 别在 C1b 换掉拓扑之前调。
⚠ **evolving agent 还看不见 armed/倒计时**（那是 C2）⇒ ⛔ 别拿种群表现评判这套机制。
**C1b 也 ship 了（2026-09-12，拆成两半）**：
- **C1b-1 地图**：`siteCount: 2`（默认仍 1，单点位地图逐字节不变）把两个 site 放在 `(±12, 0)`，互为 180° 旋转像。
  ⭐ 验收线达成：**通路占可走面积 5–9% → 18–20%**；A→B 步行 39.0 m（全速 6.5 s，rotation 的几何下限）；
  同一侧到 A/B 的通路只重叠 4–19%。side-fairness 由 `mapprobe --self-test` 机械校验（已在 CI）。
- **C1b-2 world**：每个 site 一条 capture meter，`armedSite` 只能有一个。
  ⭐ 承重测试 = **守方全站 A，攻方照样拿下 B**。
- ⚠ **observation 有意没动**（点位位置 / armed / 倒计时都是 **C2** 的公开回合状态）⇒ genome 与 obsDim 不变，
  但 `siteCount: 2` 下 `obj.*` 仍只指向 site 0。⛔ **C2 之前不要在双点位地图上训练并解读结果。**

**C1c 也过了 ⇒ ⭐⭐ C1 CLOSED（2026-09-12）。** `npm run c1exit`（3 图 × 8 seed × 两种角色分配）：
E1 全压 A 88% / 全压 B 67% ✅ · E2 假打对**反应型**守方 **+31pp**、对**固守型** −21pp（正是 phase 要的
条件式收益）✅ · E3 五人早走代价 **27pp** ✅ · E4 几何上必经中段切片 20–63 格（旧图 12–31）⇒ 无**窄**走廊，
⚠ 但没干净证否，⛔ 别读成 PASS。
⚠⚠ **前四版 exit 全读 FAIL，四次都是工具不是世界**（bot 走直线撞 screen / 假打把假点位 arm 了 /
早 rotate 设得比 arm 还晚 / 基线天花板）⇒ 新坑 **#26**，新模块 `src/sim/nav.ts`
（BFS 导航场，**reference/analysis 专用**，⛔ evolving policy 永不可 import）。

**下一刀 = Phase C2（公开回合状态）。** 现在挡路的是**进化 agent 看不见回合状态**（点位在哪 / 哪个 armed /
倒计时）。⛔ C2 之前不要在双点位地图上训练并解读结果。
⚠ C2 之后第一件事是**重跑 baseline** —— 胜负条件和地图都换了，README Evidence 表、坑 #23 的 0%、
所有 `runs/*.json` 的 cross-play 胜率都是旧规则下的数（坑 #12）。

⭐⭐ **C1 的第一约束已经量出来了**：`world.step()` 团灭时把剩余时间**按占区费率直接记成占区分**。
实测团灭只占 13% 的比赛却贡献 3.13 分/场，而真正站在区里赚到的只有 2.22 分/场 —— **白送的多 1.4 倍**。
⛔ 别顺手删那段（它替代的是「活下来的人慢慢走过去占满」）；正确形状是**可提前投入、死后仍继续计时的目标**。
细节与数字在 `docs/ROADMAP.md` Phase C1 + LOG 2026-09-12 23:30。
⛔ V4 也先不动：它改的是**动作的语义**而不是 SimConfig 里的数字，cross-play 的 drift guard 可能静默放行（见 TODO 首条）。
⛔ 任何 A/B 都不许再用 champion-vs-gen0 的单一数字下行为结论 —— 走 `npm run crossplay` / `npm run yardstick`（坑 #20/#23）。

## D1 已收（2026-09-12）：实现 ship、默认不翻、行为侧 exit 未过
- 两个开关都在且**默认关**：`recurrentDim: 0`、`memorySeconds: 3`。`--rec` / `--mem` 可复现三臂。
- 泄漏侧 exit **过了**：mem0 下 `A1-P23` clean（世界不再替玩家存记录）。
- 行为侧 **没过**：拿掉世界记忆很痛（首枪 5.8→9.8 / 5.3→14.8），recurrent 臂训练指标补回 50–80%，
  但 `npm run recprobe` 的四档消融证明**补回来的不是记忆**——从**另一场比赛**抓来的常数状态（var 0.000）
  和逐 tick 更新的 live **打平**。⇒ 学出来的是**常数偏置**，进步来自**容量**（坑 #24）。
- ⚠ mem0 两臂的 `coverRatio` 全 0.000 是**定义变了**不是行为变了（坑 #12），⛔ 不可跨 mem 值比较。
- 前一轮的 optimizer sensitivity 结论仍然成立且已用上：genome 变大本身不需要改 σ（坑 #22）。

2026-09-11 夜到 09-12 凌晨连关十一刀：A0 · A1 · A2 · A3.1 · A3.2a · A3.2b(+镜像修复) · A3.3 · A4 · V11+V12 · V6a，
再加 09-12 的**换尺子**一刀（不在 ROADMAP phase 编号里，它是仪器不是迁移）。
⭐⭐ **信息层已全部关闭**（V1/V2/V3/V5/V11/V12）：observation 100 维、**97 legal / 3 truth-form / 0 hidden** ——
没有任何一个观测字段是玩家无权知道的。剩下的账只在**动作层**（V4，`A1-P12`/`A1-P14`）和**记忆归属**（V6b，`A1-P23`）。

- **两把仪器**：
  ① `npm run leaks` 打印当期泄漏矩阵、**不一致时返回非零**（是闸不是报告）；`tests/leak.test.ts` 断言
  「实测 == 登记的精确字段集」。当前 **23 条 probe / 3 条仍 leak**。
  ② `npm run crossplay`（2026-09-12 新增）= 强弱判断的唯一合法尺子：任意几个 run 的 hof 冠军互打，
  每对双色打、共用 seed、胜率按 side 平衡，**每个格子自带分母**（sighting ticks / shots），零接触印 `··`。
  跨 run 的 `SimConfig` 差异直接报错。用法见 `README.md`「Cross-play」。
  ③ `npm run inherit`（2026-09-12 新增）= 改任何网络/genome 尺度前的闸：量一次 `mutate()` 把每层
  pre-activation 推开多远，配闭式解 `mutationVariance()`（与 `mutate()` 同文件，只有一份）。
  ⭐ 结论已经反直觉两次：旋钮是 **`resetProb` 不是 `mutSigma`**，且看 **fan-in 不看 genome 大小**（坑 #22）。
  ④ `npm run yardstick`（2026-09-12 新增）= **唯一能跨 phase 边界比的尺子**：手写 bot 没有 genome、
  不读 obs ⇒ 在任何规则集下都是同一个对手。`recurrentDim` 可以不同，其余 SimConfig 差异硬报错；
  allowlist `BRAIN_ONLY_FIELDS` 由 `tests/world.test.ts` 机械校验。⭐ 它一上来就抓到了上面那条（坑 #23）。
  ⑤ `npm run recprobe`（2026-09-12 新增）= 消融要配 **in-distribution 对照**（live/wiped/frozen/alien，
  只消融被观察的那一队）。只跑「有/无」两档会把「这块输入有用」误读成「它编码了历史」（坑 #24）。
  ⑥ `npm run mapprobe`（2026-09-12 新增）= 地图拓扑度量（可行通路 / 通路数 / choke / 出生点视线）。
  ⭐ **`--self-test` 已接进 CI**：给对称性背书的尺子自己必须先对称（坑 #25）。
  ⭐⭐ 它**不只守当期这一刀**：V6a 第一版把 `recency` 在「看得见」时写成恒 1，视距边界又出现满幅断崖，
  被**三刀前**写的 `A1-P8` 抓住 —— 规矩是「这个槽里每个字段都必须乘 confidence」。
  ⭐ 每条修复都要配**正向护栏**（`A1-P22`/`A1-P17`）：把字段改成恒 0 也能让泄漏探针变绿，那是空过。
- **现在的世界**：敌情私有 · contact = 按把握缩放的 bearing/range/quality（量化 + 确定性抖动）+ recency ·
  几何 = 13 条跟头走的射线（±90°、背后全无）· 听觉 = 4 扇区脚步/枪声（衰减、隔墙、无身份无阵营）·
  队友 HUD 只剩位置/血量（开火要看得见）· objective 不数敌人。obsDim 100、genome 5324、bench ≈ 61 ms/match（空机器）。
- ⚠ **十二条别踩**：⓪ ⭐⭐ **内部指标全绿 ≠ 打得过外面**（#23）· **ladder 的 50%/100% 可能是一场没发生的比赛**
  （#20，14% 的格子如此）· 跨 run 比训练 fitness 会倒挂（#21）· 改尺度时旋钮是 `resetProb` 不是 σ（#22）；① `coverRatio` 不可跨 A2 比较（#12）；② 零和指标不能当独立 cell 写预测（#14）；
  ③ bench 前看 `uptime`（#15）；④ 性能结论必须**交错配对**量（#16）；⑤ ⭐⭐ 抖动 key 用 **slot**、量化格建在
  **自我相对量**上、中局镜像测试要覆盖新通道（#17）；⑥ ⭐ 行为指标变了先做 **same-genome 对照**；
  ⑦ ⭐⭐ 同一 run 的两个冠军可能互相根本不接触（#18）；⑧ ⭐ **contact 槽里的每个字段都要乘 confidence**，
  否则视距边界必然出现断崖（V6a 实盘踩过）。
- ✅ **「seed 3 反复滑向互相找不到」这个说法已作废**（2026-09-12 实测推翻，⛔ 别再引用）：
  三张地图 × 六个冠军的矩阵显示，低接触是**成对**性质（两条策略的走位不相交），不是血统性质，也不是 map seed 7 的性质
  —— 换图没让这些对接触起来，有两对反而掉到 0。seed 3 只是在**同 run 内**撞上了这种配对。证据在 LOG 2026-09-12 03:35。
- **线上**：public + Pages 自动部署（见下「Ops 速查」）。

## Ops 速查
- **渲染验证**（样式/相机改动必须做）：本仓不装 playwright，借 `../evofootball-arena/node_modules/playwright`；起 `npx vite --port <空闲端口> --strictPort`，⚠ 先 `curl | grep "<title>EvoShooter"` 确认端口上是本项目（`GOTCHAS.md` #5）。
  - 页面上有 `window.evo.probe()`（模式/主体/相机/插值位姿/FX 计数）和 `evo.viewer.scene.fxStats()`，⭐ 无头验证走它们（见坑 8）。
  - 布局类改动**跨宽度量**（坑 7）；可以用 `page.addStyleTag` 还原旧规则做 A/B，不必动 git。
- **线上**：仓库 **public**，GitHub Pages 已接 Actions（`.github/workflows/pages.yml`：`npm ci` → `npm test` → `npm run leaks` → `npm run build` → 部署 `dist/`）。
  站点 = <https://quarkgluonmixture.github.io/evoshooter-arena/>；⚠ 只有动了代码才部署（`docs/**` 与 `**.md` 被 paths-ignore 跳过），要手动发就 `workflow_dispatch`。
  CI 跑 **macOS**（float 轨迹的跨平台 libm 漂移，姊妹仓实测过）。⭐ `npm run leaks` 现在**会返回非零**，它是闸不是报告。
- ⚠ **gh 的活跃账号可能是公司号**：⛔ 不要 `gh auth switch`（全局共享态）。要用个人号调 API 就
  `GH_TOKEN=$(gh auth token --user Quarkgluonmixture) gh ...` 单次注入。
- **推送**：个人号 Quarkgluonmixture；仓库本地 git config 已设身份 + **钉死个人号的 token helper**（`git config --local --get-all credential.helper` 可看），所以直接 `git push` 即可。⛔ 不要 `gh auth switch`（全局共享态）；⛔ 不要换回 `gh auth git-credential`——它按全局活跃账号发 token，公司号活跃时会鉴权失败（LOG `#ship` 条）。
- Node ≥ 22.6 直跑 TS：源码只用可擦除语法（`erasableSyntaxOnly`），import 带 `.ts` 后缀。
- `npm run bench` 量 ms/match；改网络尺寸或观测维度前后都跑。⚠ 先看 `uptime`（坑 #15/#16）。
- `npm run crossplay -- <run.json> [...] --gens first,last --n 6 --maps 7,11,23 --out runs/xp.json`
  —— 任何「谁更强 / 有没有退步」的判断都从这里出，⛔ 不从 ladder 的单一数字出。
- `npm run inherit -- <run.json> <yardstick.json> --children 16 --sweep --fanin`
  —— 改网络尺寸 / genome 结构**前后**都跑；⚠ 第二个 run 是必要的（父子对打会 0 接触，见坑 #18/#20）。
- `npm run yardstick -- <run.json> [...] --gens first,last --n 8`
  —— 任何「进步了」的结论都要有一个**不参与共演化**的对手作证（坑 #23）。

## 工作纪律摘要
- 一次一根承重杠杆；probe-first；预测先冻结；same-seed A/B；不过门就 revert/reframe。
- 战术术语只能事后 detector / 人类命名；不进入 live policy。
- Policy 不得读取 engine truth；每个新增信息通道都要过 counterfactual leak tests。
- **解释不是轨迹分类**：长得像 fake 不代表功能是 deception；重大 discovery 要追合法信息流、receiver/opponent response、fork intervention、lineage、ecology。
- **产生效果不等于故意传信**：枪声/脚步/动作可以从 cue 长成 convention，但 intentional signalling 需要 sender 对 receiver knowledge/availability/cost 的额外证据。
- 对手分布本身是选择压力：最终不得把“只会打赢唯一熟悉对手”称为 progress；但当前 A0/A1 不改 trainer。
- 多样性优先靠真实 counter-payoff + frequency dependence；不先加 style/novelty reproduction bonus。
- 声称“语言/战术/角色已涌现”要有 discovery + lineage + intervention，不能只看录像脑补。
- **遗传与文化分开，生态负责筛选。** 当前不得把局部 RNN memory 偷叙述成跨比赛 club culture；未来 E7 的 learned state 必须显式声明 owner / persistence / reset / transfer。
- **文化不是“多人知道同一件事”**：要证明社会传播，必须让 naive newcomer 在 genotype 不变、没有 semantic copy API 的前提下，通过合法共同经历学会；要叫 club culture，再证明 founder removal 后仍持续。
- analytics/discovery read-only；不要把 motif / novelty / style embedding 偷回流 fitness。
- 回退实现 ≠ 回退现实中的现象；旧手写战术不得换名字复活；成熟通用底座上线后要重新审视并拆除不再承重的旧 scaffold。
- `README.md` 只在 phase 真 ship 后更新，不提前描述未来世界。

## 坑
**全部在 `GOTCHAS.md`——动手前按「你正要做什么」那张挑读索引扫相关几条**（编号永不重排；⛔ 别在这里 pin 条数，
`python3 ~/claude-kit/hooks/gotchas-contract.py --audit GOTCHAS.md` 会打印当期条数）。
这里不复制，避免两份漂移。
⚠ 改那个文件时**保持格式**：条目头 `N. **标题**（日期）`、`闸:` 独占一行、小节标题不带编号 ——
否则 kit 的 `gotchas-contract` hook 会解析出 0 条（**静默失守**，本仓被它哑了整整一晚）。
自查一条命令：`python3 ~/claude-kit/hooks/gotchas-contract.py --audit GOTCHAS.md`。

## 链接
LOG 接手只需 `tail -n 120 LOG.md`（22:15 起为 live，更早在 `LOG-archive/`；检索用 `grep -n '^## ' LOG.md LOG-archive/*.md`）。

`docs/VISION.md` · `docs/SUBSTRATE.md` · `docs/ROADMAP.md` · `docs/DISCOVERY-EXPLAINABILITY-CONTRACT.md` · `docs/EVOLUTION-ECOLOGY-CONTRACT.md` · `docs/CULTURAL-TRANSMISSION-CONTRACT.md` · `README.md` · `GOTCHAS.md` · `TODO.md` · `LOG.md` · `src/core/config.ts` · `scripts/train.ts`
