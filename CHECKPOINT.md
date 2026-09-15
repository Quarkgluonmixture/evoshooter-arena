# CHECKPOINT — evoshooter-arena

> 下一个 session 从这里接手。⛔ git 状态不写在这里：`git log --oneline origin/main..HEAD`。
> **接手顺序与 authority 规则在 `CLAUDE.md`**（VISION > SUBSTRATE > ROADMAP > 当前实现；
> 「现在到底实现了什么」以 `README.md` + `src/` + 实测为准）。⛔ 别在这里复述那一套。

## 一句话
自进化 3D 红蓝 5v5 射击场。主线是把它从「shared-brain + privileged structured state + 双 red/blue population」
迁成**信息诚实、玩家私有 belief、身体原语、有限通信、个体 × team DNA、side-neutral club league + opponent ecology**
的职业战术射击底座，让 trade / lurk / fake / crossfire / mid-round / emergent language 只能自然涌现、事后识别。

## Current cursor（2026-09-15）

⭐⭐ **进行中 = G2 只读战术 detector（`npm run detect`）**：用已跑出的 run 回答「哪些形状真的发生了」，零算力承诺。
**六个词条全部结案，两个读到东西**：trade ❌ · crossfire ✅(冠军一次没形成) · rotate ❌ · tempo ❌ ·
⭐ **lurk ✅ 有形状** · ⭐ **pair ✅ 有形状**。逐条经过与数字在 `docs/ROADMAP.md` 的 G2 节，过程在 `LOG.md`。
⭐ 铁律：先过手写正/负对照的 precision，没过⛔ 不读冠军；**关闭的 detector 默认不打印冠军行**（`--reopen rotate,tempo` 才开，
且只在配新预注册时合法）；零假设必须保住真实的时间结构。

⭐⭐⭐ **这一轮真正的产出 = 一条走完三层的证据链（lurk）**，`docs/ROADMAP.md` G2 节有全部数字：
- **形状**：s1 红 0 号占自己可计 tick 的 **47%**（其余 slot 0%），集中度 **3.17×**（手写 lurker 对照 3.08×），
  episode 内跑 2.82 m/s、390 伤害、4 人头 ⇒ 不是卡住的身体。⚠ s2 蓝 1 号是**另一种**形状（游荡但完全不开火），⛔ 别合并。
- **birth（层①）**：**第 72 代锁定**，此后每个采样代、两条臂都在 slot 0 直到 299（**227 代**）；60–68 代是闪烁前兆。
  ⭐ 两臂分歧即结论：**派几个人去游猎是对手依赖的，派谁不是**。
- **干预（层③，`npm run lurkswap`）**：⭐⭐ **角色跟出生位置走，不跟身份输入走**（读 one-hot 0 的身体只扛 6–8%，
  站在出生点 0 的扛 29–54%；placebo 换两个**非** lurker 的身份**完全不掉** ⇒ 「越界编辑打散一切」被答掉）。
  ⭐⭐ 但两臂总孤立都**腰斩** ⇒ **形状要的是训过的那一对 (spawn 0, one-hot 0)**。
  ⭐ **对 SUBSTRATE 的 Club/Player-block 是降温读数：此处的 player block 还不是能转会的东西** —— E5/E6 做 transfer 时第一条重测。

⭐⭐⭐ **pair 走完了同样的三层，结论和 lurk 相反**：四个冠军都有稳定互选搭档（s1 红 1-3 / s1 蓝 0-1 / s2 红 0-2 / s2 蓝 0-1），
干预（`lurkswap --focus i --partner j`，三臂 + placebo）给出：
**s1 红 1-3（出生间距 8m）跟身份走** —— by carrier **60% ± 2.5pp** vs by spawn **1%**，**六条臂 by-spawn 全 ≤ 3%**；
两个**相邻**搭档（4m）都**跟位置走**（by spawn 76–81%，placebo 完好）；⚠ s2 红 0-2 **归因不了**（两臂都塌**且 placebo 也打没**）。
中途把「分界线是邻接」写进预注册再跑最后两个：**s2 蓝 ✅、s2 红 ❌** ⇒ 假说只过一半，⛔ 别改轴名。
⭐⭐ **意义 = 第一个住在身份输入而不是几何里的形状**，且与**同一冠军**的 lurk 结论相反
⇒ **同一支队、同一个基因组、两种形状、两个载体**（⛔ 排除「这个冠军就是纯位置/纯身份」这种解释）。
⚠ **复现状态 = n=1 干净 + n=1 归因不了，⛔ 引用必须带这两个数字。下一步 = 更多冠军（别的 seed / 世代），⛔ 不是换个更强的词。**
⛔ 命名纪律：不叫 "pair coordination"（暗含共同意图），叫**「反复出现的互选最近邻对」**。
⚠ 没做的：s2 蓝那个「只游荡不开火」的形状没做 birth/干预。

⚠ **两条零假设的教训（写 detector 前必读，正文见坑 #35/#36）**：跨场置换只有在**被置换的量不是时钟的函数**时才算零假设
（tempo 就死在这：人数差≈回合时钟，置换吃掉 88% 的真效应，还让负对照空过）；想证明「没有角色/没有搭档」的对照
**必须逐场随机重排** slot 绑定 —— 固定绑定会让几何替你发角色，而**循环轮转保住「两个 slot 的差」这个不变量**（pair 统计看得见）。

**观战线已完成**（用户 2026-09-14 在闸门上说「看 vision」后按 VISION §0/§12.1 选的）：双点位渲染 · kill feed · 电台符号灯 · 规则守卫 ·
导入即采用 run 的世界 · 慢动作回放 · 导播淡出 · 第三人称环绕 · 热力图开火层 · cross-play 面板；README 已对齐。
⚠ **训练侧四个 phase 都停在「不要动工」**，动它们之前先读各自的进度段：D2s（种群 3× / 评估场次 3× 等算力都买不到电台内容）·
E1（形态级角色比每人一个常数还低 13pp）· E2（共识 −4pp，但**混合**值 +14.5pp，只对会适应的对手兑现）· E6 前置（40 代 best response 只打穿 1/4 冠军）。
⭐ 内容读数 = `radiouse` 的 `replay`（另一场同一 tick 的整队电台）；`speaker` 会把节奏 / 同步 / 时钟读成内容（坑 #31），D2b 的「更正」已撤回。
⭐ 单冠军判据一律用**逐场配对 mean ± SE**，⛔ 不拿单次空跑当尺子（坑 #32）。
⚠ 本机会以内存不足杀长任务：`train.ts` / `uptake train` 带 `--snap-every` 时，同一条命令重跑即续上。
⚠ 观战 / 回放入口必须比**整套世界规则**（回合模式 · 点位数 · 电台三参数），genome 长度相同不构成保证（坑 #33）：
页面用 `?sites=2&mode=capture&tokens=2&interval=5&delay=3` 才是 D2 训练的那个世界。

D 程序留下的表（**先问世界、再问进化**，方法 `npm run memdemand`）：

| | 世界付的钱 | 进化用了吗 | 堵在哪 |
|---|---|---|---|
| 记忆（**追击**用法） | 小（~2 s 峰 24%），且**不如「不追」参照的 38%** | 没用（当常数偏置） | **需求侧** ⇒ D1 ⛔ 不再算债 |
| **通信**（共享接触） | **大：13% → 42%（+29pp）**，armed 率 76–88% → **58%** | 发送端无内容（按冠军拆开最高 4–9%，唯一的 9% 按比赛阶段条件化后 0.9%）；接收端：电台是承重输入，但对照组用的是它的形状（节奏 / 同步 / 时钟）不是本场内容（replay 读数） | **不是需求侧** |

原计划是 E1（「一个脑子穿五个身体 ⇒ 电台学不会」）。**E1 的 probe-first 把这个前提推翻了**（`npm run identity`）：
slot one-hot 本身就是每人一条 40 维的第一层 bias，而且进化用上了 —— carrier 身份 36–66%（去掉电台特征 31–55%），
chance 20%，16/16 格。说与听在 MLP 里本来就是不同权重；team-crossplay 现在就能做（按 slot 分发 Policy）。
⇒ 架构假说削弱。**D2c 又排除了 channel**（`npm run radiodemand`）：手写一符号报点只走真实电台链路，
守方 13% → 40%，拿回 telepathy 增益的 93%（D2 训练配置 91%）⇒ **剩 search / selection**。
⛔ 不改电台、不加通信奖励、不造 player block；⛔ 也不要为救 D1 改世界（要改先有「记忆回报 > 站位回报」的理由）。
⚠ 记忆只测了**追击**用法。全文在 `docs/ROADMAP.md` 的 D1 / D2 / E1 节，经过在 `LOG.md`。

**C1/C2 世界学得动**（baseline：首枪 33 s → 7–8 s、accuracy .08 → .29、
⭐ objectiveProgress .08 → **.23/.35**，旧 KOTH 四十代钉在 .01–.04）。

**已关闭**：A0–A4 · V11/V12 · V6a · **D1（实现 ship、默认不翻、行为 exit 未过）** ·
**C1a/C1b/C1c（C1 CLOSED，exit 3/3）** · **C2 的世界规则部分**。细节在 `docs/ROADMAP.md`，经过在 `LOG.md`。

**默认值仍是旧世界**：`roundMode: 'koth'` · `siteCount: 1` · `recurrentDim: 0` · `memorySeconds: 3`。
⇒ 浏览器和 `npm run dev` 看到的还是单点位 KOTH。⛔ 翻默认是一次单独的决定，不要搭车。

## 仪器（强弱 / 信息 / 继承 / 拓扑 / 需求 / 身份，各管一段）
⭐ **两件最新的回答的是「世界付不付钱」** —— 先问世界，再问进化找不找得到。这是 C1 立下的方法。
| 命令 | 回答什么 | ⛔ 别拿它干什么 |
|---|---|---|
| `npm run leaks [--mem N --rec N]` | 当期信息泄漏矩阵，**不一致返回非零**（是闸不是报告） | variant 配置下是诊断、不失败构建 |
| `npm run crossplay` | 「谁更强 / 有没有退步」——每对双色打、每格自带分母、零接触印 `··` | ⛔ 跨规则集（genome 不互通时它会硬报错，这是对的） |
| `npm run yardstick` | **唯一能跨 phase 边界比**的尺子（手写 bot 无 genome、不读 obs） | ⛔ 别把 bot 放进训练池（C1 Exit 明禁） |
| `npm run inherit` | 改网络/genome 尺度前后的继承保真度（配闭式解） | ⛔ 别只看 σ —— 旋钮是 `resetProb`（坑 #22） |
| `npm run recprobe` | 消融要配 **in-distribution 对照**（live/wiped/frozen/alien） | ⛔ 只跑「有/无」两档会读反（坑 #24） |
| `npm run mapprobe [--sites 2] [--self-test]` | 地图拓扑（可行通路 / 通路数 / choke / 出生点视线）；`--self-test` 在 CI | ⛔ 给对称性背书前先过 self-test（坑 #25） |
| `npm run c1exit` | C1 exit 的四问，reference bot 向**世界**提问 | ⛔ 读到 FAIL 先证明工具到达了断言（坑 #26） |
| `npm run memdemand` | ⭐ **世界为记忆 / 通信付多少钱**（扫 reference bot 的记忆档 + telepathy 上界） | ⛔ 别把 telepathy 当合法策略，它只是上界 |
| `npm run radio [--gen G]` | 电台上有什么（**发送端**）：符号熵 / 静默率 / MI，按冠军分行 + `MI \| phase`（坑 #30） | ⛔ 高 MI 只是相关；⛔ 它的接收端消融两队一起动、固定步长取池 —— 接收端用 `radiouse` |
| `npm run identity [--drop comm0,comm1]` | 同队五个人是**五个人还是五个身体**（one-hot 旋转拉丁方：body vs carrier + 随机标签对照） | ⛔ 低 carrier 只说明「这个分类器在这些特征上找不到」（坑 #28） |
| `npm run exploit -- <run.json> --gen G --colour R\|B --peers <run>` | ⭐ **这个冠军有多好打**：冻住它，训一个挑战者只打它 40 代，头对头 + 同辈冠军参照 | ⛔ 高分只说这个冠军脆，不说挑战者强（坑 #23）；⛔ 低分只约束这个预算 |
| `npm run detect -- <runs> --gen G` | ⭐ **只读战术 detector**（G2）：trade（条件化零假设）· crossfire（夹角 + 最小距离）· rotate ⛔已关 · tempo ⛔已关（逐玩家配对 DiD + `donor agree/∩` 列）· ⭐ lurk（12 m/2 s + 场内 slot 置换零假设，逐 slot 孤立% + episode 内速度/伤害）· ⭐ pair（互选最近邻 + 同一零假设 + **实测**出生间距）；每个都自带手写正/负对照，`--precision` 只跑对照 | ⛔ 形状不是意图；⛔ 结果永不进训练（T8 防火墙）；⛔ precision 没过就别读冠军；⛔ 已关的两段不打印冠军行（`--reopen` 需配新预注册） |
| `npm run lurkswap -- <run> --gen G --colour R\|B [--focus i --partner j]` | ⭐ **形状跟身份走还是跟出生点走**（VISION §12.1 层③）：换 one-hot / 换出生点 / placebo 三臂，按 carrier 与 spawn 双标签归因 | ⛔ 两个标签必须各维护一张表 —— 按 agent 下标算会把同一件事印两遍（坑 #26）；⛔ 只动被观测队；⚠ 两臂不一致 = 归因不了，别挑合心意的那条 |
| `npm run roledemand` | ⭐ **形态级个体值多少**（手写守方：五个相同 / 每人一个常数 / 五个不同角色 / 完美分配上界） | ⛔ 一组手写角色只是角色空间里的一个点：低分只约束这一组 |
| `npm run radiodemand` | 一条**合法**有限电台值多少（手写一符号报点走真实量化 / 间隔 / 延迟，对照 telepathy 上界；静音行必须与私有视野逐场相同，否则脚本报错） | ⛔ 只是协议空间里的一个点：低分只约束这个协议 |
| `npm run commstep` | 只突变「说」/「听」权重（配同尺寸对照），看单边台阶存不存在 | ⛔ 实测分辨率不够：六类在同一冠军内同起同落（坑 #26 ④），别拿它判「学不会」 |
| `npm run uptake -- train/eval` | 说话者完美（注入报点）时进化学不学得会听：normal / flipped / off，对手取同臂所有 run | ⛔ 脚手架 run 带 `scaffold` 字段：不得当种群来源，不得和正常 run 进同一张 crossplay |
| `npm run radiouse -- <runs> --gens a,b` | 被测队**自己的**电台依赖，只动被测队：⭐ `replay`（另一场同一 tick 的整队电台 = 内容读数）+ speaker / frozen / shuffled / off，每种带换种子的噪声底 | ⛔ 别拿 Δspeaker 当内容（坑 #31）；单冠军「依赖」看**逐场配对的 mean ± SE**，⛔ 不拿单次空跑当尺子（坑 #32） |

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
LOG 接手 `tail -n 150 LOG.md`（live 从 2026-09-13 00:25 起 = C1 关闭之后；
检索 **live + 全部归档**：`grep -n '^## ' LOG.md LOG-archive/*.md`）。
`docs/VISION.md` · `docs/SUBSTRATE.md` · `docs/ROADMAP.md` · 三份专门合同（E5/E6/E7/G2–G4 时才读，清单在 `CLAUDE.md`）
· `README.md` · `GOTCHAS.md` · `TODO.md` · `LOG.md` · `src/core/config.ts` · `scripts/train.ts`
