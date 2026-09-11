# evoshooter-arena — 给 agent 的入口

## 接手顺序（binding）

1. `CHECKPOINT.md` — 当前现场、current cursor；`GOTCHAS.md` — 耐久陷阱（编号稳定，动手前扫）。
2. `docs/VISION.md` — **用户想要什么的最高层 authority / Gold Standard**。
3. `docs/SUBSTRATE.md` — VISION 对应的底座与信息权限工程合同。
4. `docs/ROADMAP.md` — 承重级迁移 phase、exit、当前施工顺序。
5. `README.md` — **当前已 ship** 的规则 / 控制 / 架构 / 实测证据；不要把未来 docs 当成已经实现。
6. `TODO.md` — 不属于主 roadmap 的短 backlog；LOG 只按需读，接手可先 `tail -n 60 LOG.md`。

## Authority 规则

- 方向冲突：`VISION > SUBSTRATE > ROADMAP > 当前实现`。不要为了保住现行代码降低愿景。
- 事实冲突：当前已经实现了什么，以 `README.md` + `src/` + 实测为准。
- 战术**只能涌现**：`trade / lurk / fake / crossfire / entry / anchor / rotate / save` 等只能做 read-only analytics / 人类叙事，不能成为 live action、role enum、隐藏奖励或特殊权限。
- Policy 不能读 engine truth；新增 sensor/team feature 必须过 `SUBSTRATE.md` 的 counterfactual information-leak tests。
- 当前主线按 `docs/ROADMAP.md` 的 Current Cursor 自走；一次一根杠杆，probe-first，预测先冻结，A/B，过 exit 才 close。
- 改 observation / network / genome 前后必须 `npm run bench`；改仿真机制后必须至少 short same-seed evolution A/B，再下结论。
- 改样式 / 相机后必须真实页面截图验证（方法见 CHECKPOINT「Ops 速查」）。
- `src/brain/scripted.ts` 只服务 reference/probe，evolving agents 永远不能调用手写战术。

## Git / ops

- 提交按显式路径 stage；push 走个人号，方法见 CHECKPOINT。
- ⛔ 不要为了做新 roadmap 一次同时重写 perception + recurrent brain + individual genomes + map objective；无法归因就是失败。
