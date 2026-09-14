# TODO — 补充 backlog（主线以 docs/ROADMAP.md 为准）

> **承重级 substrate / vision 工作不要从这里挑。** Future agent 先走
> `CHECKPOINT.md → docs/VISION.md → docs/SUBSTRATE.md → docs/ROADMAP.md`。
> 本文件只放不改变主路线的补充活；做完立即删。

## 当前 roadmap 外的补充验证
- [ ] ⚠ **cross-play 的漏网之鱼：动作语义变了但 SimConfig 没变。** drift guard 只比 `SimConfig`，
      V4 那种「target-slot 不再驱动转身」可能一个数字都不动 ⇒ 工具照跑，把「依赖自动瞄准的冠军打没有自动瞄准的」
      报成强弱差。⇒ **动 V4 之前先定死它的 A/B 怎么做**。已写进 `scripts/crossplay.ts` 头部的 KNOWN LIMIT。

## 观战 / 导播
- [ ] 导播切镜头淡入淡出。（击杀慢动作回放已做：`MatchViewer.replayLastKill` 从 seed 重建，⛔ 不存快照。）
- [ ] 第三人称加鼠标环绕（现在完全跟随朝向，看不了侧面）。
- [ ] 第一人称枪模只有后坐，没有换弹/开火动画；换弹时 HUD 有状态但画面没提示。

## 可视化

## 工程
- [ ] **地图池轮换防单图过拟合** —— 前置已解除（C1 已 CLOSED，拓扑稳定了）。
      ⭐ 已有证据：`crossplay --maps 7,11,23` 下六个冠军的强弱**顺序基本不变**（s2:R / s3:R 始终在前、s1 两条垫底），
      但**具体胜率摆动很大**（s2:B 43/68/39%）⇒ 单图过拟合不是排名层面的问题，是数值层面的。
