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

## Current cursor
**V6a — 先把 3 秒记忆的断崖做成连续衰减**（验收 = `A1-P15` 按 0.05 量级判据翻绿）；之后 V6b（记忆搬进 brain）、
最后 V4（自动瞄准，要连带重做转头手感）。顺序与理由在 `docs/ROADMAP.md` Current Cursor。

2026-09-11 夜到 09-12 凌晨连关九刀：A0 · A1 · A2 · A3.1 · A3.2a · A3.2b(+镜像修复) · A3.3 · A4 · V11+V12。
**V1 / V2 / V3 / V5 / V11 / V12 已关闭**；仍开着 V4 · V6 · V7/V8/V9/V10。

- **仪器先行**：`npm run leaks` 打印当期矩阵并**在不一致时返回非零**（是闸不是报告）；
  `tests/leak.test.ts` 断言「实测 == 登记的精确字段集」。⇒ 每一刀的验收就是**哪几条 probe 该翻绿**。当前 22 条 probe。
  ⭐ **每条修复都要配正向护栏**（`A1-P22` / `A1-P17` 那种）——把字段改成恒 0 也能让泄漏探针变绿，那是空过。
- **现在的世界**：敌情私有 · contact = 按把握缩放的 bearing/range/quality（量化 + 确定性抖动）·
  几何 = 13 条跟头走的射线（±90°、背后全无）· 听觉 = 4 扇区脚步/枪声（无身份无阵营）·
  队友 HUD 只剩位置/血量（开火要看得见）· objective 不再数敌人。
  **obsDim 100**、genome 5324（巧合与 A0 基线同数，内容全变）、bench ≈ 62 ms/match（空机器）。
- ⚠ **七条别踩**：① `coverRatio` 不可跨 A2 比较（#12）；② 零和指标不能当独立 cell 写预测（#14）；
  ③ bench 前看 `uptime`（#15）；④ 性能结论必须**交错配对**量（#16）；
  ⑤ ⭐⭐ 抖动 key 用 **slot**、量化格建在**自我相对量**上，中局镜像测试要覆盖新通道（#17）；
  ⑥ ⭐ 行为指标变了先做 **same-genome 对照**；⑦ ⭐⭐ 同一 run 的两个冠军可能互相根本不接触（#18）。
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
- `npm run bench` 量 ms/match；改网络尺寸或观测维度前后都跑。

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
**全部搬到 `GOTCHAS.md`（编号连续，永不重排）——动手前扫一遍。** 这里不再复制，避免两份漂移。

## 链接
`docs/VISION.md` · `docs/SUBSTRATE.md` · `docs/ROADMAP.md` · `docs/DISCOVERY-EXPLAINABILITY-CONTRACT.md` · `docs/EVOLUTION-ECOLOGY-CONTRACT.md` · `docs/CULTURAL-TRANSMISSION-CONTRACT.md` · `README.md` · `GOTCHAS.md` · `TODO.md` · `LOG.md` · `src/core/config.ts` · `scripts/train.ts`
