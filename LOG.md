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
