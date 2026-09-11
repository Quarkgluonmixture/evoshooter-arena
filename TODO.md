# TODO — 补充 backlog（主线以 docs/ROADMAP.md 为准）

> **承重级 substrate / vision 工作不要从这里挑。** Future agent 先走
> `CHECKPOINT.md → docs/VISION.md → docs/SUBSTRATE.md → docs/ROADMAP.md`。
> 本文件只放不改变主路线的补充活；做完立即删。

## 当前 roadmap 外的补充验证
- [ ] **A2 之后的 ladder 疑云**：末代冠军对第 0 代冠军，基线 4/4 血统 90–100%，A2 后 3/6 打不赢（s1 红/蓝平手、s3 红 5%）。
      下一步不是再跑一个 seed，而是**换尺子**：把下面「冠军 vs 全部历史冠军胜率矩阵」提前做出来，用 cross-play 而不是单一标量判断是否退步
      （SUBSTRATE §10.2）。若 A3 再现同样现象，再考虑加预算（pop / 代数）。
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
- [ ] 每代冠军 vs 全部历史冠军的胜率矩阵（小图），观察非传递/循环。

## 工程
- [ ] GitHub Pages 部署（对齐 `../evofootball-arena/.github/workflows/pages.yml`：npm ci + test + build）。
- [ ] 地图池轮换防单图过拟合——C1 tactical objective topology 稳定后再做，避免为旧 KOTH map 过度工程。
- [ ] 导入 run 时按 mapSeed 自动重载，而不是弹 alert 让人手改 URL。
