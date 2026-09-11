# CHECKPOINT — evoshooter-arena

> 下一个 session 从这里接手。git 状态不写在这里：`git log --oneline origin/main..HEAD`。
> 规则 / 控制 / 架构 / 实测证据的**权威是 `README.md`**，这里只放接手需要的现场与指针，⛔ 不抄数字。

## 一句话
自进化 3D 红蓝 5v5 射击场：确定性仿真 + 红蓝双种群协同进化（共享 MLP，队伍帧镜像）+ Three.js 观战/CS:GO 式导播 + 进化仪表盘。战术只能涌现，不手写。

## 现状（截至 2026-09-11 晚）
- 三条入口都能跑：`npm run dev`（浏览器训练 + 观战）· `npm test`（32 个 vitest）· `npm run train -- --gens 40 --pop 16 --seed 1`（无头）。
- 默认超参在 `src/core/config.ts`（`DEFAULT_SIM` / `DEFAULT_EVO`），改之前先看 LOG 里 `#deadend` 为什么现在是这个值。
- 已知行为：胜负主要靠淘汰，占区时间占比很低；被长期压制的一方偶发滑向躲藏（README Evidence 表 seed 1 蓝队）。这是 TODO 第一条的来源。
- 无头训练输出在 `runs/`（gitignore），浏览器端用「export run」拿 JSON。

## Ops 速查
- **渲染验证**（样式/相机改动必须做）：本仓不装 playwright，借 `../evofootball-arena/node_modules/playwright`；起 `npx vite --port <空闲端口> --strictPort`，⚠ 先 `curl | grep "<title>EvoShooter"` 确认端口上是本项目（见坑 5）。
- **推送**：个人号 Quarkgluonmixture；仓库本地 git config 已设身份 + **钉死个人号的 token helper**（`git config --local --get-all credential.helper` 可看），所以直接 `git push` 即可。⛔ 不要 `gh auth switch`（全局共享态）；⛔ 不要换回 `gh auth git-credential`——它按全局活跃账号发 token，公司号活跃时会 鉴权失败（LOG 2026-09-11 `#ship` 条）。
- Node ≥ 22.6 直跑 TS：源码只用可擦除语法（`erasableSyntaxOnly`），import 带 `.ts` 后缀。
- `npm run bench` 量 ms/match；改网络尺寸或观测维度前先跑一次。

## Phase cursor
没有 roadmap 文档：README 顶部描述的功能已全部落地。下一步全在 `TODO.md`。

## 坑（还没到拆 GOTCHAS 的量；编号只增不重排）
1. (2026-09-11) 突变 σ 相对权重尺度（首层 ≈ 0.1）过大 ⇒ 孩子继承不到父代行为，best 每代 ±0.5 跳、mean 贴 0，最终种群塌成全员躲藏。**先查优化器再改规则。** 闸: 无 — 是超参判断；证据在 README Evidence。
2. (2026-09-11) 战斗按 agent 顺序结算 ⇒ 先处理的队永远先手，开局对称测试抓不到。闸: `tests/world.test.ts` fairness（镜像对打红胜率须在 33–67%）。
3. (2026-09-11) 出生点直视目标区 ⇒ 蹲出生点压过占区，双方都学会躲。闸: `tests/map.test.ts`（>75% 出生点→区视线被挡）。
4. (2026-09-11) vitest 默认 5s 超时：后台训练抢 CPU 时慢测试会假失败（不是断言错）。闸: 无 — 已把逐元素 expect 改成聚合断言减负；跑测试时别并行开训练。
5. (2026-09-11) 端口被别的项目占时 `curl` 会命中别人的页面，截图/验证全是假的。闸: 无 — 启动后先 grep 页面 title。

## 链接
`README.md` · `TODO.md` · `LOG.md` · `src/core/config.ts` · `scripts/train.ts`
