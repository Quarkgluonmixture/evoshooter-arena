# TODO — 补充 backlog（主线以 docs/ROADMAP.md 为准）

> **承重级 substrate / vision 工作不要从这里挑。** Future agent 先走
> `CHECKPOINT.md → docs/VISION.md → docs/SUBSTRATE.md → docs/ROADMAP.md`。
> 本文件只放不改变主路线的补充活；做完立即删。

## 当前 roadmap 外的补充验证
- [ ] **run 内的历史 cross-play**：现在 `npm run crossplay` 只吃 hof 里挑出来的几代。把「末代冠军 vs 它自己全部
      历史冠军」做成一条命令（`--gens all` 或抽样），才是 ladder 在 run 内的真正替代品 —— ladder 只比两个点，
      而那两个点有 14% 的概率互相看不见（坑 #20）。
- [ ] ⚠ **cross-play 的漏网之鱼：动作语义变了但 SimConfig 没变。** drift guard 只比 `SimConfig`，
      V4 那种「target-slot 不再驱动转身」可能一个数字都不动 ⇒ 工具照跑，把「依赖自动瞄准的冠军打没有自动瞄准的」
      报成强弱差。⇒ **动 V4 之前先定死它的 A/B 怎么做**。已写进 `scripts/crossplay.ts` 头部的 KNOWN LIMIT。
- [ ] `objectiveProgress` 在角色互换后是攻/守**两种量的混合**（已写进 `TeamMetrics` 注释）。
      要按角色分别看的话得拆成两个指标，各带自己的分母。

## 观战 / 导播
- [ ] ⭐ **观战条头像的实时 comm 颜色点** —— 前置已就绪（D2a 的量化电台），顺手把可视化改成**符号**而不是连续色带。
- [ ] 导播切镜头淡入淡出；击杀慢动作回放（需要 world 快照或从 seed 重放到 tick）。
- [ ] 第三人称加鼠标环绕（现在完全跟随朝向，看不了侧面）。
- [ ] 第一人称枪模只有后坐，没有换弹/开火动画；换弹时 HUD 有状态但画面没提示。

## 可视化
- [ ] 热力图区分「移动」与「开火位置」两层。
- [ ] 把 cross-play 矩阵搬进页面（小图），观察非传递/循环。CLI 已有 `npm run crossplay`，
      ⛔ 别另写一套算法——读它的 `--out` JSON，或直接复用 `scripts/crossplay.ts` 的矩阵计算。

## 工程
- [ ] `lidar()` 的 ray-box 求交是 O(射线 × 箱子)（13 × 32），A3.3 之后 bench +22%。加个空间索引（网格/BVH）
      或按射线方向预筛箱子；⛔ 先 profile 确认它真是热点再动手。
- [ ] **地图池轮换防单图过拟合** —— 前置已解除（C1 已 CLOSED，拓扑稳定了）。
      ⭐ 已有证据：`crossplay --maps 7,11,23` 下六个冠军的强弱**顺序基本不变**（s2:R / s3:R 始终在前、s1 两条垫底），
      但**具体胜率摆动很大**（s2:B 43/68/39%）⇒ 单图过拟合不是排名层面的问题，是数值层面的。
- [ ] 导入 run 时按 mapSeed 自动重载，而不是弹 alert 让人手改 URL。
