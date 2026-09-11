# LOG — append-only（发生了什么 + 为什么）

标签：#decision #measure #deadend #incident #ship。查目录：`grep -n '^## ' LOG.md LOG-archive/*.md`。

## [2026-09-11 17:30] 立项：自进化 3D 红蓝射击场  #decision
- 需求：红蓝两队、队内合作、3D、对抗训练、战术深度、可视化感受进化。
- 栈：Vite + TS + three + vitest；Node 26 直跑 TS（可擦除语法 + `.ts` import），无 tsx。
- 核心决定：队伍帧镜像（蓝方看到的世界旋转 180°），任何基因组能打任何一边 ⇒ 「冠军对自己过去」才公平；队伍共享一张网 + slot one-hot 让角色可分化；战术零手写，只设计环境可供性（掩体两种高度、视野、瞄准稳定、换弹、控制区、共享情报、2 维通讯）。

## [2026-09-11 17:50] 首次无头训练 30 代（旧战斗顺序）  #measure #incident
- pop 16、2.5 s/代；末代红冠军对第 0 代 65–80% 胜。
- 但红队每个 seed 都系统性占优 ⇒ 排查出战斗按 agent 顺序结算，红方永远先手（开局对称测试通不出来）。改成同 tick 两阶段同时结算；加镜像对打公平性测试（60 场，红胜率须 33–67%），通过。

## [2026-09-11 18:10] 「全员躲藏」吸引子，第一轮修规则  #deadend
- seed 1 第 29–30 代：zoneShare→0、首枪 24–26 s、队内间距 4 ⇒ 双方都躲，0-0 平局是安全解。
- 尝试：适应度加零和的占区占有差（0.2）、视距 40→30、远距离命中衰减更陡、名人堂比重提到一半。seed 1 好转（掩体使用 0.05→0.55，首枪 31→5 s，末代对第 0 代 80–100%），seed 2 红队仍塌（末代对第 0 代全是平局）。

## [2026-09-11 18:40] 第二轮修规则：中墙  #decision #deadend
- 机制：出生排到区中心 27 m < 视距 30 ⇒ 站进区里会被出生点蹲守者点掉 ⇒ 「蹲出生点」打败「占区」。
- 加一对 ±9 m 高墙 + 2.4 m 中门（三条路线），测试断言 >75% 出生点→区视线被挡（实测 81.7%，中门给中路出生点留 62% 的缝，是有意的窥视线）。
- 结果**更差**：两 seed 都塌成全员躲藏。⇒ 规则不是主因。

## [2026-09-11 19:00] 真因 = 突变尺度；定默认超参  #measure #decision
- 观察：best 每代在 0.5↔1.4 跳、mean 贴 0 ⇒ 冠军行为传不下去。每个孩子改 4%×5324≈213 个权重、σ=0.15，而首层权重量级 ≈0.1。
- 4 组对照（seed 1/2 × σ 0.05/0.08，率 2%，每基因组 5 场，40 代，pop 16）：σ 0.05 两 seed 冠军对第 0 代全程 88–100%，掩体使用 0.52–0.67，首枪 5–9 s；σ 0.08 的 seed 1 蓝队仍塌。
- 定默认：σ 0.05、率 0.02、reset 0.002、pairings 3 + hof 2。复算：`npm run train -- --gens 40 --pop 16 --seed 1`；表在 README Evidence（含日期）。

## [2026-09-11 19:20] 浏览器端 + 渲染验证  #ship
- Worker 池评估器（4 worker、pop 12 ≈1 s/代）、Three.js 场景、12 项行为小图、热力图、任意两代对战、导出/导入。
- 用 sibling 的 playwright + SwiftShader 无头截图验证（不在本仓装依赖）；只剩 three 阴影类型弃用警告，已改 PCFShadowMap。

## [2026-09-11 19:40] 导播视角  #ship #incident
- 自由/第三/第一人称 + 观战条 + 快捷键 + 自动导播（兴趣分：开火、挨打、可见敌人数、距离、区内、近期击杀；最短镜头 3 s，死后停 1 s）。
- 事故：5199 端口被另一进程占用，探针页返回别的项目 ⇒ 差点拿别人的页面当验证。规则：起 dev server 后先 grep title。
- 第一人称背光面全黑 ⇒ 加反向填充光；跟随镜头太贴身 ⇒ 拉到后 8 m、高 5.2 m。

## [2026-09-11 18:27] 建远端 + 四件套  #ship #decision
- 远端 = https://github.com/Quarkgluonmixture/evoshooter-arena（个人号，**私有**，可随时改公开）。用 `GH_TOKEN=$(gh auth token --user Quarkgluonmixture)` 单命令建仓，不切全局账号。
- 推送前把 5 个本地 commit 的作者从机器本地身份改成 evofootball 同款 noreply 身份（`git rebase -r --root --exec "git commit --amend --no-edit --reset-author"`），无远端时安全。
- 推送覆盖法（当 helper 拿到公司号 token 时）：`git -c credential.helper= -c credential.helper='!f() { echo username=Quarkgluonmixture; echo "password=$(gh auth token --user Quarkgluonmixture)"; }; f' push origin main`。
- 四件套按 kit checkpoint skill 建：CHECKPOINT / TODO / LOG（本文件）；无 roadmap；坑先放 CHECKPOINT 一节，够多再拆 GOTCHAS。

## [2026-09-11 18:29] 首推验证 + 换仓库本地 helper  #ship #incident
- 首推：`gh auth git-credential` helper 拿到的是全局活跃的公司号 token ⇒ 鉴权失败三次；单命令覆盖法成功，远端读回 main 6 commits。
- 把仓库本地 credential.helper 改成钉死 Quarkgluonmixture 的函数式 helper（先置空再 add，避免全局 helper 先应答），以后直接 `git push`。本条 commit 就是用它推的。
- 删除已合并的本地分支 feat/core-sim；之后在 main 上先开分支再改。

## [2026-09-11] Gold Standard / substrate roadmap reframe  #decision
- 用户用成熟 `EvoFootball VISION` 明确了 Shooter 的质量尺：**底座给自由度，战术从选择里长；内部意图 / 外显动作 / observer-local belief 必须分权；现实职业 CS 只作验收镜子，不作战术 API。**
- 深挖 current world 后确认 8 个承重 gap：team-shared exact enemy knowledge、enemy truth features、hard-range + 360° lidar、target-slot auto-turn、无真实 hearing、无 private temporal belief、shared brain 穿五个身体、continuous comm 潜在高带宽 state bus。
- prior-work 裁决：Valve CS2 把远距视觉可读性与环境化音频当核心 game-state channel；modl.ai + Riot tactical-shooter work 证明 structured/raycast sensor 可替代 pixels 但仍保持 human-like perception；DeepMind CTF / limited-communication MARL 支持 population play + recurrent memory + constrained communication；职业 CS 采访支持 opening call + distributed local information + secondary voice + mid-round adaptation，而不是全知 commander。
- 新 authority：`docs/VISION.md`（Gold Standard）→ `docs/SUBSTRATE.md`（底座合同）→ `docs/ROADMAP.md`（Programme A–G phase ledger）；`README.md` 继续只写当前已 ship reality。
- 关键新裁决：当前 central KOTH objective 结构上无法产生真正 A/B fake/rotate/anchor 博弈；ROADMAP C1 单列 tactical objective topology，但必须在 information/action boundary 稳定后再做，避免一次改太多无法归因。
- Current cursor = A0（authority + baseline freeze）；下一步先 baseline test/bench/census，再 A1 把已知 information leaks 变成红灯 probes，⛔ 不直接跳 A2 改 observation。

## [2026-09-11 21:30] 观战体验五修：底栏 / 转头 / 中弹 / 三个镜头 / 卡顿  #ship #measure
用户看完的五条反馈，逐条定根因后改。渲染四条不碰仿真，转头那条改的是规则。

- **底栏按钮被挡**：spec-bar 与 view-bar 是两个各自 absolute 的条，靠写死的 74 px 间距错开；窗口一窄 view-bar 换行长高就顶进 spec-bar，而 spec-bar `nowrap` + 920 px 宽会顶出画面。
  浏览器里 A/B（`addStyleTag` 还原旧规则，不动 git）：1100×780 有 **14 个控件点不到**（R1/R2 已出屏）、1300×800 有 12 个、1600×900 才是 0。改成单个 `#bottom-ui` 纵向 flex 后三档全 0。
  ⇒ 教训：**"我这台看着没事"不能证明布局没事**，重叠是宽度的函数，验证要跨宽度。
- **视野乱跳**：`A_LOOK_*` 是每 tick 直接吃网络输出，再按 3π rad/s（540°/s，一 tick 36°）转 ⇒ 网络噪声被原样放大成抽搐。
  改：look 意图先过 0.45 s 低通（存在 agent 的**队伍系** `lookX/lookZ`，保持镜像对称），并把转速拆成**交战 2π / 扫视 2.6 rad/s**。
  实测（6 局随机基因组，35 k 个 agent-tick）：平均 |Δyaw| 3.72°→**1.22°**/tick，>20° 的 tick 9.0%→**0.6%**，方向反转 14.5%→**3.7%**。
  ⭐ **拆解过归因**：低通负责消抖动（反转 14.5%→4.3%，与限速无关），限速负责消大跳（>20% 的 tick 8.8%@360°/s→0.6%@149°/s）。
  ⛔ **第一版扫视取 1.6 rad/s 被否**：抖动指标与 2.6 完全相同（0.6% / 3.7%），但**饿死了学习信号** —— seed 2 红方冠军对第 0 代掉到 45%/50%（改动前 100%/100%）、首枪停在 15 s。2.6 rad/s 两边都要得到：seed 1 两色 100%/100%（比改动前的蓝方 50% 平局还好）、seed 2 红 90%/100% 蓝 100%/100%，掩体使用 0.57–0.70、首枪 6.6/8.8 s。
  ⇒ 教训：**观感指标达标不代表可以 ship**，同一个视觉效果有多档参数能达到，要挑**对学习代价最小**的那档；判据是 same-seed 阶梯，不是肉眼。
  新增回归测试：喂每 tick 翻转的 look 动作，断言方向反转率 <20%（去掉低通时实测 **99.5%**）。
- **中弹像水波**：命中特效是一个**放大**的球（`scale.multiplyScalar(1+dt*6)`）⇒ 读起来就是涟漪。
  换成真实射击链路：枪口闪光（枪挂在胶囊上，弹道从枪口出）+ 0.09 s 曳光 + **弹道飞溅碎片**（受重力、会**缩小**、落地反弹）+ 被击中者**白闪** + 观战者屏幕血色 vignette + 轻微镜头抖。击杀是更大一蓬碎片。
  验证：注入 6 shot + 1 kill 后池计数 = 6 曳光/66 碎片/10 闪光，1.5 s 内归零；近距离截图能看到碎片按弹道散开。
- **卡一卡**：仿真 15 Hz、渲染 60 Hz，而 `sync` 直接贴仿真位姿 ⇒ 每 4 帧才动一次。
  改成固定步长插值：`captureTick` 存上一 tick，`sync(world, alpha)` 在两 tick 间插值（yaw 走最短弧），相机也改读**插值位姿**。
  实测：同一段 150 个动画帧，仿真位姿只在 **28** 帧变化，渲染位姿在 **149** 帧变化。
- **三个镜头**：① 第三人称遇到掩体时是"缩短吊臂"，一贴墙就缩进胶囊里 ⇒ 改成**抬高越过掩体**（按视线要清掩体顶算需要的高度，最高 7.5 m，实在不行才收到 3.2 m），并加过肩偏移、注视点从身前 8 m 收到 3 m；② 第一人称眼睛前移 0.25 m，近处队友按距离淡出（不透明的**面罩和枪**要单独隐藏，它们跟不了 body 材质的透明度）；③ 加了挂在相机上的第一人称枪模（会后坐、有枪口闪光）——初版太大且纯黑看不见，缩小 + 自发光才读得出来；④ 换局时 `rig.reset()`，不再从上一局位置飞过去；导播不在**开火中途**切镜头。
- 顺手加了 `window.evo.probe()` 调试口（模式/主体/相机/插值位姿/FX 计数），无头验证不用再靠肉眼猜。
  ⇒ 教训：**用场景图里"可见的 Sprite 数"当特效证据是假信号**——血条也是 Sprite，数出来 29 个里全是血条。要数就数特效池本身（`fxStats()`）。
- **与新 authority 的关系**（rebase 后补记）：这一轮是 baseline 级观感修复，不属于 ROADMAP 的承重杠杆，A0 baseline census 尚未落数 ⇒ **census 会冻住改动后的值**（若你想冻改动前的，说一声，pre-change 的 run 在 `runs/post-turnfix-s*.json`，pre-turnfix 的旧数字在 git 里 README 的上一版）。
- ⚠ **这个修法踩在 SUBSTRATE 计划删掉的抽象上**：交战/扫视两档转速是按 `targetId >= 0` 判定的，而 `targetId` 正是 V4（target-slot auto-aim）要拿掉的东西；look 低通也建立在"动作是绝对方向向量"这个参数化上，而 §5.1 的目标动作是 `lookYawDelta`（角速度）。⇒ **V4 / A2 动手时这两条必须重新推导，不能照搬**（那时没有"是否交战"这个位，平滑应该落在角速度限幅与感知执行误差里）。这条值不值得写进 `docs/SUBSTRATE.md` V4 一行，是你的文档、你定。

## [2026-09-11 19:27] 文档归位：坑拆出 GOTCHAS；census 与 V4 埋雷定案  #decision
- 坑从 CHECKPOINT 拆到 `GOTCHAS.md`（触发条件：加到 10 条，把快照顶过 1-2 页硬上限）。编号 1–10 原样搬走**不重排**——LOG 与 commit message 按号引用。CHECKPOINT 只留指针不留副本；`CLAUDE.md` 接手顺序第 1 条同笔加上 GOTCHAS（否则子 agent 读不到它）。
- **A0 baseline census 冻改动后的值**（转头规则改动之后）。理由：改动后才是 main 上的现实，A1/A2 从这里出发；改动前的世界没人会回去。改动前的 run 留在 `runs/post-turnfix-s*.json` 仅作历史。⛔ 别再重议。
- 在 `docs/SUBSTRATE.md` V4 条目下加了一条**前瞻警告**：当前交战 / 扫视两档转速按 `targetId` 切换、look 低通建立在动作=绝对方向向量上，而 V4 要删 `targetId`、§5.1 的目标动作是 `lookYawDelta` ⇒ V4 落地时这两条会**静默失效**（不报错，只是退回抽搐或变钝），必须重新推导不能照搬常数。
- 下一步 = ROADMAP **A0**（authority 读回检查 · `npm test` · `npm run bench` · 记 obsDim / 参数量 / ms-match · LOG 一条 #measure），A0 关掉才进 A1 leak probes。⛔ 不跳 A2。

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
