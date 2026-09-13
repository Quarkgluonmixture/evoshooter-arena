# evoshooter-arena — 给 agent 的入口

## 接手顺序（binding）

1. `CHECKPOINT.md` — 当前现场、current cursor；`GOTCHAS.md` — 耐久陷阱（编号稳定，动手前扫）。
2. `docs/VISION.md` — **用户想要什么的最高层 authority / Gold Standard**。
3. `docs/SUBSTRATE.md` — VISION 对应的底座、信息权限、Club/League 进化生态工程合同。
4. `docs/ROADMAP.md` — 承重级迁移 phase、exit、当前施工顺序。
5. **若工作触及 E5/E6、未来 E7，或 G2–G4 / emergence claim，再读三份专门合同**：
   - `docs/EVOLUTION-ECOLOGY-CONTRACT.md` — opponent ecology / frequency dependence / counter-payoff / scaffold retirement；
   - `docs/CULTURAL-TRANSMISSION-CONTRACT.md` — genetic inheritance vs cultural transmission、跨比赛 acquired state、newcomer/founder-removal/transfer 证据门；
   - `docs/DISCOVERY-EXPLAINABILITY-CONTRACT.md` — `form ≠ function`、`effect ≠ intent`、forkable epistemic replay、claim ladder、lineage。
6. `README.md` — **当前已 ship** 的规则 / 控制 / 架构 / 实测证据；不要把未来 docs 当成已经实现。
7. `TODO.md` — 不属于主 roadmap 的短 backlog；LOG 只按需读，接手可先 `tail -n 60 LOG.md`。

## Authority 规则

- 方向冲突：`VISION > SUBSTRATE > ROADMAP > 当前实现`。专门合同只**细化**未来 E5/E6/E7/G2–G4 的证据与工程边界，不得反过来覆盖更高层 authority 或 current cursor。
- 事实冲突：当前已经实现了什么，以 `README.md` + `src/` + 实测为准。
- 战术**只能涌现**：`trade / lurk / fake / crossfire / entry / anchor / rotate / save` 等只能做 read-only analytics / 人类叙事，不能成为 live action、role enum、隐藏奖励或特殊权限。
- Policy 不能读 engine truth；新增 sensor/team feature 必须过 `SUBSTRATE.md` 的 counterfactual information-leak tests。
- 当前 red-vs-blue 两 population 是 **bootstrap**；最终 target 是 side-neutral `Club = Team/Coach DNA + 5 Player blocks` 的 League。⛔ 但绝不因为这条 future target 绕过 ROADMAP current cursor 提前重写 trainer。
- **对手分布才是 curriculum**：未来 progress 必须经 current peers / diverse contemporaries / history / exploiters 的 cross-play 检验，不能把“只克唯一熟悉对手”当进步；非传递循环是内容，不是唯一多样性 gate，E6 优先检查 frequency-dependent payoff / runaway style。
- **League 只能发现 counter，不能替世界创造 counter**：dominant meta 出现时先查真实 counter-payoff surface 是否缺失/不 binding，再怪 scheduler。
- “学会了语言/战术/角色”是 strong claim：遵守 `DISCOVERY-EXPLAINABILITY-CONTRACT.md` 的 claim ladder。`长得像` 不等于 `功能相同`，`产生效果` 不等于 `有意为之`，`有机制` 不等于 `进化选择了机制`。
- communication 不等于 radio；物理动作（脚步/枪声/身体 cue）也可能被重新利用成 signal/convention。任何 intentional-language claim 必须比“有信息/receiver 会响应”更强。
- **遗传与文化是两种 transmission；生态是 selection，不是第三种 inheritance。** 当前 E1–E6 只授权 inherited genotype + opponent ecology。未来 E7 才允许跨比赛 acquired state / social transmission。
- **D1 recurrent memory ≠ culture**：直到 E7 明确打开前，任何 RNN/hidden/contact memory 只按对应 round/match scope 使用和 reset；不得因为“能记住”就叙述成长期 club culture。
- 未来声称“文化”必须至少经过 fixed-genome learning → newcomer uptake → founder-removal persistence；直接复制 `ClubCultureVector` / token meaning / teammate intent 给新人是违规。
- player/coach/club culture 不得偷并成一个对象：transfer 可以带走个人 acquired state，coach 可以带走 philosophy，但 club convention 是否留下必须由合法社会传播实验决定。
- analytics/discovery 只读：novelty / motif / style / causal embedding 默认不得回流 reproduction 或 live policy。
- 当前主线按 `docs/ROADMAP.md` 的 Current Cursor 自走；一次一根杠杆，probe-first，预测先冻结，A/B，过 exit 才 close。
- 改 observation / network / genome 前后必须 `npm run bench`；改仿真机制后必须至少 short same-seed evolution A/B，再下结论。
- 改样式 / 相机后必须真实页面截图验证（方法见 CHECKPOINT「Ops 速查」）。
- `src/brain/scripted.ts` 只服务 reference/probe，evolving agents 永远不能调用手写战术。

## Git / ops

- 提交按显式路径 stage；push 走个人号，方法见 CHECKPOINT。
- ⭐ **push 自主**（用户 2026-09-13 授权，覆盖全局「push 先问」）：commit 后直接推，不必再问。
- ⭐ **遇到不确定的判断，先拿 `docs/VISION.md` 过一遍再决定**（用户 2026-09-13）：对照相关章节写明依据，而不是弹回去问。
- ⛔ 不要为了做新 roadmap 一次同时重写 perception + recurrent brain + individual genomes + map objective + league scheduler；无法归因就是失败。
- ⛔ **不要现在实现 E7。** 文化合同现在只负责把门的位置和违规形状钉死；真正施工必须等 E1–E6 的 identity/club/league/ecology 能分别测量后再开。
