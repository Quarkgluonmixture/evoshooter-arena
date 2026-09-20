# CHECKPOINT — evoshooter-arena

> 下一个 session 从这里接手。⛔ git 状态不写在这里：`git log --oneline origin/main..HEAD`。
> **接手顺序与 authority 规则在 `CLAUDE.md`**（VISION > SUBSTRATE > ROADMAP > 当前实现；
> 「现在到底实现了什么」以 `README.md` + `src/` + 实测为准）。⛔ 别在这里复述那一套。

## 一句话
自进化 3D 红蓝 5v5 射击场。主线是把它从「shared-brain + privileged structured state + 双 red/blue population」
迁成**信息诚实、玩家私有 belief、身体原语、有限通信、个体 × team DNA、side-neutral club league + opponent ecology**
的职业战术射击底座，让 trade / lurk / fake / crossfire / mid-round / emergent language 只能自然涌现、事后识别。

## Current cursor（2026-09-20）

⭐⭐ **E2b → E2c 两步走完了一个完整的闭环，一句话**：
**世界为「混合」付 14.5pp；底座原本生不出混合；补上私有骰子后它被用起来了，但这个对手分布不给它回报。**

- **E2b**：同一个对手下，四个冠军 × 两图 × 攻防的计划熵**恒为 0.000 bit**（世界挂 0.904）。
  机制在源码里：rng 只滚命中骰子、感知抖动是纯哈希、出生点固定 ⇒ **玩家没有私有骰子**。
  而 `ctl alternating` 在同一世界同一仪器读 **1.000** ⇒ 世界装得下混合，只是不会为
  「每回合输入都相同」的策略生出一个。
- **E2c**（用户 2026-09-19 在三个候选里选了私有骰子）：`privateDieDim` 已 ship、**默认关**。
  gen 0 → gen 299 八个守方格子**七个上升**（0.40 → 1.66 bit），`--freeze-die` 让八格**全部塌回 0.000**
  ⇒ **因果成立**，三层证据齐。
- ⛔ **但长出来的是「每人各自掷」，不是「队的混合计划」**：计划集合按独立逐 slot 翻转**几乎精确可分解**。
  ⭐⭐ **五颗私有骰子没有共同抽样，只能各掷各的；队级混合需要一次共同的抽，而共同的抽只能靠说出来**
  ⇒ **E 线和 D2/G3 在这里接上了：要队级的不可预测，先得有带内容的通信。**
- ⛔ **没有证据说它值钱**：`yardstick` 85.5% → 79%（⚠ 单格 ±21pp、2 seed，只读方向）。
  ⇒ 正确的一句话是**不受惩罚也不受奖励**，⛔ 不是「有用」也 ⛔ 不是「没用」。

⇒ **下一根承重杠杆：E6 对手生态** —— 要有人来收这 14.5pp，得先有一个会 best-response 的对手。
⚠ E6 前提「冠军很脆」在 40 代预算下没测到 ⇒ **开工前仍要一个 probe**，不是直接建 league。
逐条数字在 `docs/ROADMAP.md` Phase E2b / E2c + LOG 2026-09-19 / 09-20，预注册在 `predictions/`。

⭐⭐ **2026-09-15 那一天的结论仍然常驻：结构的「总量层」和「机制层」跨图稳，「身份层」不稳。**

| 层 | 跨图稳？ | 实测 |
|---|---|---|
| 总量：**有没有**结构 | ✅ | 互选搭档 **12/12 格**都存在且高于零假设（1.49–2.56×）；「最早几代动得最凶」三图都成立 |
| 机制：结构**被谁扛着** | ✅ | 搭档归因三图一致跟**出生位置**走（C 臂 by spawn 70/46/20% vs by carrier 4/9/1%） |
| 身份：**是哪一个** | ⛔ | 哪一对搭档 · 哪几代动（一致率 42/83/43%）· 逐代次序（tau 全 < 0.6）· **lurk 是哪个 slot（图 23 上整个塌掉）** |

⇒ ⛔ **不带地图限定就不要点名任何个体**；✅ 「结构有多少」「被什么扛着」可以搬运。
⚠ **lurk 连存在性都不跨图** ⇒ **G2 里每条 lurk 结论（含「守了 227 代」）都只在训练图上成立。**
⭐ E2b 又添了同形的一例：**「计划随对手变不变」也是谱系性质**（三个冠军读恰好 0，s2:R 读 1.79）。

**另外两条耐久结论**：
1. ⛔ **「时代」叙事已删除**：逐色闸在加密采样 + 独立谱系下复测四条轨迹全 FAIL ⇒ 只剩方法结论：**进步要逐色读**。
2. ⭐ **没有任何一次「换人」**：冠军基因组是**受约束的随机游走**（lag 曲线 4.3–4.6×），相邻代冠军不是亲子。

**已结案**：G2 六个 detector 全部结案 · G2 三层证据链 · G3 全部四个条目（style / eras / lineage / 观战面板 /
tactic frequency / vocabulary / identity cards / **clusters = 做不了，已证明**）· E2b。
**⛔ G4（Discovery Feed）本次明确不开**：它是把「新东西」浮出来的观战仪器，而 G2/G3 的证据说这条谱系里
没有可发现的东西 ⇒ 要开 G4，先得有一个值得被发现的世界。
**逐条数字与经过在 `docs/ROADMAP.md` 的 G2 / G3 / E2b 节 + `LOG.md`。⛔ 别在这里复述。**
G2 小尾巴：s2 蓝那个「只游荡不开火」的孤立形状没做 birth/干预。

⚠ **做 detector / 干预 / 任何行为结论前必读的方法坑（正文在 `GOTCHAS.md`）**：
**#42** ⭐ 检测性对照必须构造上确定，⛔ 别拿公平硬币当闸 · **#41** ⭐ 预注册不能写进 gitignore 的目录 ·
**#40** ⭐⭐ 一张图上的行为结论默认不跨图（哪怕出生点逐位相同）· **#39** < 8 个点的秩统计量只是线索 ·
**#38** 落地断言的期望值只能取自真正被用的对象 · **#37** ⭐ 只有「搬家到标签持有者」算归因 ·
**#36** 证明「没有角色/搭档」的对照必须逐场随机重排 slot 绑定 · **#35** 跨场置换要先证明被置换的量不是时钟的函数。

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
| `npm run lurkswap -- <run> --gen G --colour R\|B [--focus i --partner j]` | ⭐ **形状跟身份走还是跟出生点走**（VISION §12.1 层③）：换 one-hot / 换出生点 / **D 臂整份一起换** / placebo，按 carrier 与 spawn 双标签归因 | ⛔ 两个标签必须各维护一张表 —— 按 agent 下标算会把同一件事印两遍（坑 #26）；⛔ 只动被观测队；⚠ 两臂不一致 = 归因不了，别挑合心意的那条；⛔⛔ **只有「搬家到标签持有者」算归因，「还在原处」不算**（坑 #37）；⛔ 落地断言只能拿**真正被播的那张地图**比对（坑 #38） |
| `npm run style -- <run> [--gens ...] [--colour R\|B\|both]` | ⭐ **G3：逐代风格向量 + 2D 嵌入 + 逐代噪声底**（22 个 `METRIC_KEYS`，对手固定为另一色最终代） | ⛔ 不等间距扫描的 step 不可并排读（脚本会警告）；⛔ own-noise < 0.3 的行标 `det`，比值被撑大不得读；⚠ 噪声底只重掷命中骰子，不重跑世界；⛔⛔ **「哪几代动了」是地图特有的**（三图一致率 42/83/43% vs 偶然 50/62/50%）⇒ 结论必须带「在训练图上」 |
| `npm run lineage -- <run> [--colour R\|B\|both]` | ⭐ **G3：从基因组推断的血统**（完全保留率 / 「换人」/ ⭐ 距离随 lag 的曲线）；不跑仿真 | ⛔ trainer 无亲缘记录 ⇒ 只能说「推断」；⛔ 零换人**不等于**一条线在漂（要看 lag 曲线分辨收敛云团）；⛔ 不带时代叙事 |
| `npm run eras -- runs/xp-*.json` | ⭐ **G3：从 crossplay 产物读「时代」**（逐色 Spearman(代数, rowMean) · later-beats-earlier · 非传递环 · ⭐ 跨图 Kendall tau） | ⛔ 只消费不重算（旧格式文件直接拒绝）；⛔ 无接触的格子丢掉不当 50%；⛔ tau < 0.6 时不授权任何 era 结论 |
| `npm run roledemand` | ⭐ **形态级个体值多少**（手写守方：五个相同 / 每人一个常数 / 五个不同角色 / 完美分配上界） | ⛔ 一组手写角色只是角色空间里的一个点：低分只约束这一组 |
| `npm run mixing -- <runs> [--gen G] [--freeze-die]` | ⭐ **回合计划变不变**（E2b/E2c）：t=T 时五个 slot 最近点位的 5 元组熵 + **distinct plans** + **会动的 slot 数**，三条臂 own dice / opponents / maps；⭐ `--freeze-die` 是干预臂（每场用第 0 场的**合法**骰值） | ⛔ 0 bit 不说明冠军弱；⛔ `ctl alternating` 不读 1.000、有骰子时 `ctl die-reader` 不 > 0，就别读冠军行（坑 #42/#43）；⛔ **有骰子的 run 要比同一条 run 的 gen 0，不是比 0**（坑 #43）；⚠ alive5 < 50% 的格子已被摘要行排除 |
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
- ⭐ **新 clone 上先 `npm ci` 再重训 baseline**：`runs/` 与 `node_modules/` 都不在版本库里 ⇒ 所有吃冠军的仪器开局都是死的。baseline = `npm run train -- --sites 2 --mode capture --tokens 2 --comm-interval 5 --comm-delay 3 --gens 300 --pop 16 --snap-every 10 --out runs/d2-long-s<N>.json`（本机两条并行约 108 分钟）。
- ⭐ **预注册写 `predictions/`（进版本库），⛔ 不写 `runs/`**（坑 #41；`tests/predictions.test.ts` 守）。⛔ 09-19 之前那些 `runs/*-predictions.txt` 已随 clone 消失，救不回来。
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
