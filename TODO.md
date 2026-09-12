# TODO — 补充 backlog（主线以 docs/ROADMAP.md 为准）

> **承重级 substrate / vision 工作不要从这里挑。** Future agent 先走
> `CHECKPOINT.md → docs/VISION.md → docs/SUBSTRATE.md → docs/ROADMAP.md`。
> 本文件只放不改变主路线的补充活；做完立即删。

## 当前 roadmap 外的补充验证
- [ ] **run 内的历史 cross-play**：现在 `npm run crossplay` 只吃 hof 里挑出来的几代。把「末代冠军 vs 它自己全部历史冠军」
      做成一条命令（`--gens all` 或抽样），才是 ladder 在 run 内的真正替代品；现在 ladder 只比两个点，
      而那两个点有 14% 的概率互相看不见（GOTCHAS #20）。
- [ ] **exploitability 探针**：拿一个只针对当前冠军训练的挑战者去打它（SUBSTRATE §10.4 列的五项里唯一还没有工具的）。
- [ ] 在不干扰 A0/A1 的前提下，保留一次旧 baseline 长跑：pop 24、≥200 代、两 seed；只作为迁移前历史 census，不再把“旧 observation 下更稳定”当未来设计裁决。
- [ ] 旧 comm channel 的语义 census 可作为 D2 前 baseline：comm 值与「有敌人可见 / 在区内 / 换弹中」相关性；只测现状，不据此保留无限连续通信设计。

## 观战 / 导播
- [ ] kill feed（谁打死谁，右上角滚动）——C2 public event ship 后必须消费同一合法事件源，不能从 spectator truth 另造一套。
- [ ] 导播切镜头淡入淡出；击杀慢动作回放（需要 world 快照或从 seed 重放到 tick）。
- [ ] 第三人称加鼠标环绕（现在完全跟随朝向，看不了侧面）。
- [ ] 第一人称枪模只有后坐，没有换弹/开火动画；换弹时 HUD 有状态但画面没提示。
- [ ] 观战条头像加实时 comm 颜色点；D2 迁移为 token/quantized radio 后同步改可视化。

## 可视化
- [ ] 热力图区分「移动」与「开火位置」两层。
- [ ] 把 cross-play 矩阵搬进页面（小图），观察非传递/循环。CLI 已有 `npm run crossplay`，
      ⛔ 别另写一套算法——读它的 `--out` JSON，或直接复用 `scripts/crossplay.ts` 的矩阵计算。

## 工程
- [ ] `lidar()` 的 ray-box 求交是 O(射线 × 箱子)（13 × 32），A3.3 之后 bench +22%。加个空间索引（网格/BVH）或按射线方向预筛箱子；先 profile 确认它真是热点再动手。
- [ ] 地图池轮换防单图过拟合——C1 tactical objective topology 稳定后再做，避免为旧 KOTH map 过度工程。
      ⭐ 2026-09-12 有了新证据：`crossplay --maps 7,11,23` 下六个冠军的强弱**顺序基本不变**（s2:R / s3:R 始终在前，
      s1 两条始终垫底），但**具体胜率摆动很大**（s2:B 43/68/39%）⇒ 单图过拟合不是排名层面的问题，是数值层面的。
- [ ] 导入 run 时按 mapSeed 自动重载，而不是弹 alert 让人手改 URL。
