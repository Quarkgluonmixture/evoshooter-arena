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
