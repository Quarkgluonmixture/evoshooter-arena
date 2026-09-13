# CHECKPOINT — evoshooter-arena

> 下一个 session 从这里接手。⛔ git 状态不写在这里：`git log --oneline origin/main..HEAD`。
> **接手顺序与 authority 规则在 `CLAUDE.md`**（VISION > SUBSTRATE > ROADMAP > 当前实现；
> 「现在到底实现了什么」以 `README.md` + `src/` + 实测为准）。⛔ 别在这里复述那一套。

## 一句话
自进化 3D 红蓝 5v5 射击场。主线是把它从「shared-brain + privileged structured state + 双 red/blue population」
迁成**信息诚实、玩家私有 belief、身体原语、有限通信、个体 × team DNA、side-neutral club league + opponent ecology**
的职业战术射击底座，让 trade / lurk / fake / crossfire / mid-round / emergent language 只能自然涌现、事后识别。

## Current cursor（2026-09-13）

**C1/C2 世界学得动**（baseline：首枪 33 s → 7–8 s、accuracy .08 → .29、
⭐ objectiveProgress .08 → **.23/.35**，旧 KOTH 四十代钉在 .01–.04）。

**D1 已在新世界重开并收掉（2026-09-13，两个预测都错，结论更干净）**：
① world 的 3 秒记忆在这个世界**本来就不承重**（A/B 初始种群相同，拿掉它 objectiveProgress 反而略升）；
② recurrent state **仍然是学出来的常数**（`recprobe` 的 alien 档 var=0.000 与 live 打平且多数更好）；
③ ⭐⭐ `npm run memdemand` 直接问世界：记忆价值 **~2 s 达峰 24%**，而**完全不追、只守点位的参照拿 38%** ——
**追击本身就是错的**。⇒ **需求侧限制，不是搜索侧**；D1 ⛔ 不再算本世界背着的债。
⚠ 窄结论：只测了**追击式**记忆。「记住敌人承诺了哪个点位 / 队友死在哪侧 / 他在换弹」都没测。

⭐⭐ **下一刀（两条，挑一条）**：
- **C2 剩下的观战侧**：kill feed UI（`TODO.md`，消费合法事件源）· 双点位的 HUD/观战渲染（现在只画 site 0）。
- **Programme D2（Radio v2）或 E1（player identity split）** —— 按 `docs/ROADMAP.md` 顺序，D2 在前。
⛔ 不要为了救 D1 再改世界：要改得先有「记忆回报 > 站位回报」的设计理由（已登记在 ROADMAP D1）。

**已关闭**：A0–A4 · V11/V12 · V6a · **D1（实现 ship、默认不翻、行为 exit 未过）** ·
**C1a/C1b/C1c（C1 CLOSED，exit 3/3）** · **C2 的世界规则部分**。细节在 `docs/ROADMAP.md`，经过在 `LOG.md`。

**默认值仍是旧世界**：`roundMode: 'koth'` · `siteCount: 1` · `recurrentDim: 0` · `memorySeconds: 3`。
⇒ 浏览器和 `npm run dev` 看到的还是单点位 KOTH。⛔ 翻默认是一次单独的决定，不要搭车。

## 六件仪器（强弱 / 信息 / 继承 / 拓扑，各管一段）
| 命令 | 回答什么 | ⛔ 别拿它干什么 |
|---|---|---|
| `npm run leaks [--mem N --rec N]` | 当期信息泄漏矩阵，**不一致返回非零**（是闸不是报告） | variant 配置下是诊断、不失败构建 |
| `npm run crossplay` | 「谁更强 / 有没有退步」——每对双色打、每格自带分母、零接触印 `··` | ⛔ 跨规则集（genome 不互通时它会硬报错，这是对的） |
| `npm run yardstick` | **唯一能跨 phase 边界比**的尺子（手写 bot 无 genome、不读 obs） | ⛔ 别把 bot 放进训练池（C1 Exit 明禁） |
| `npm run inherit` | 改网络/genome 尺度前后的继承保真度（配闭式解） | ⛔ 别只看 σ —— 旋钮是 `resetProb`（坑 #22） |
| `npm run recprobe` | 消融要配 **in-distribution 对照**（live/wiped/frozen/alien） | ⛔ 只跑「有/无」两档会读反（坑 #24） |
| `npm run mapprobe [--sites 2] [--self-test]` | 地图拓扑（可行通路 / 通路数 / choke / 出生点视线）；`--self-test` 在 CI | ⛔ 给对称性背书前先过 self-test（坑 #25） |
| `npm run c1exit` | C1 exit 的四问，reference bot 向**世界**提问 | ⛔ 读到 FAIL 先证明工具到达了断言（坑 #26） |

## ⚠ 动手前必扫的几条（正文在 `GOTCHAS.md`）
- ⓪ **内部指标全绿 ≠ 打得过外面**（#23）· ladder 的 50%/100% 可能是**没发生的比赛**（#20）·
  跨 run 比训练 fitness 会**倒挂**（#21）。
- ① 改尺度：旋钮是 `resetProb` 不是 σ，且看 **fan-in** 不看参数总量（#22）；
  **改了 genome 长度，「同 seed A/B」就不是配对实验**（#27）。
- ② **新通道的镜像/对称测试必须跑在「这条通道真的存在」的配置下**（#17，2026-09-13 第二次中招）。
- ③ 判 FAIL 或零差异前，先证明这次测量**到达了断言**（#26）；消融要有 in-distribution 对照（#24）。
- ④ 两个 seed 的行为侧 A/B **只读方向不读效应量** —— 实测：只把 100 个同内容字段**重排顺序**，
  2 个 seed 上就能造出和真效应同量级的差。

## Ops 速查
- **渲染验证**（样式/相机改动必须做）：本仓不装 playwright，借 `../evofootball-arena/node_modules/playwright`；
  起 `npx vite --port <空闲端口> --strictPort`，⚠ 先 `curl | grep "<title>EvoShooter"` 确认端口上是本项目（坑 #5）。
  页面上有 `window.evo.probe()` 与 `evo.viewer.scene.fxStats()`，⭐ 无头验证走它们（坑 #8）；布局改动**跨宽度量**（坑 #7）。
- **线上**：仓库 public，Pages 接 Actions（`npm ci` → `npm test` → `npm run leaks` → `mapprobe --self-test` → `build`）。
  站点 = <https://quarkgluonmixture.github.io/evoshooter-arena/>。⚠ 只有动了代码才部署（`docs/**`、`**.md` 被 paths-ignore）；
  手动发走 `workflow_dispatch`。CI 跑 **macOS**（float 的跨平台 libm 漂移，姊妹仓实测过）。
  ⚠ macOS runner 排队可能十几分钟，别把「还没跑」当成失败。
- **推送**：仓库本地 git config 钉死个人号 token helper ⇒ 直接 `git push`。
  ⛔ 不要 `gh auth switch`（全局共享态）；⛔ 不要换回 `gh auth git-credential`（按全局活跃账号发 token，公司号活跃时鉴权失败）。
  要用个人号调 API：`GH_TOKEN=$(gh auth token --user Quarkgluonmixture) gh ...`。
- Node ≥ 22.6 直跑 TS：源码只用可擦除语法（`erasableSyntaxOnly`），import 带 `.ts` 后缀。
- `npm run bench` 量 ms/match；改网络尺寸或观测维度前后都跑，⚠ 先看 `uptime`，**交错配对**量（坑 #15/#16）。
- 无头训练输出在 `runs/`（gitignore）；浏览器端「export run」拿 JSON。默认超参在 `src/core/config.ts`。

## 工作纪律（只留 checkpoint 级的；完整版在 `CLAUDE.md` + `docs/VISION.md` §14）
- 一次一根承重杠杆；probe-first；**预测先冻结**（写进 `runs/*-predictions.txt`）；不过门就 revert/**reframe**。
- 战术术语只能事后 detector / 人类命名，⛔ 不进 live policy；policy ⛔ 不得读 engine truth。
- `src/sim/nav.ts` 与 `src/brain/scripted.ts` 与 `world.events` 都是 **reference/analysis/spectator 专用**，
  ⛔ 任何 evolving policy 不得碰。
- `README.md` 只在 phase 真 ship 后更新。

## 坑
**全部在 `GOTCHAS.md`——动手前按「你正要做什么」那张挑读索引扫相关几条**（编号永不重排；
⛔ 别在这里 pin 条数，`python3 ~/claude-kit/hooks/gotchas-contract.py --audit GOTCHAS.md` 会打印当期条数）。
⚠ 改那个文件时**保持格式**：条目头 `N. **标题**（日期）`、`闸:` 独占一行、小节标题不带编号 ——
否则 kit 的 `gotchas-contract` hook 会解析出 0 条（**静默失守**，本仓被它哑了整整一晚）。

## 链接
LOG 接手 `tail -n 150 LOG.md`（检索 `grep -n '^## ' LOG.md LOG-archive/*.md`）。
`docs/VISION.md` · `docs/SUBSTRATE.md` · `docs/ROADMAP.md` · 三份专门合同（E5/E6/E7/G2–G4 时才读，清单在 `CLAUDE.md`）
· `README.md` · `GOTCHAS.md` · `TODO.md` · `LOG.md` · `src/core/config.ts` · `scripts/train.ts`
