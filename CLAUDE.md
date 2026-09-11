# evoshooter-arena — 给 agent 的入口

- 接手先读 `CHECKPOINT.md`（含坑一节，动手前扫），再 `TODO.md`；LOG 只 `tail -n 60 LOG.md`。
- 规则 / 控制 / 架构 / 实测证据的权威是 `README.md`；超参权威是 `src/core/config.ts`。⛔ 别在文档里手抄数字。
- 战术**只能涌现**：改环境可供性和优化器，不写任何行为脚本（`src/brain/scripted.ts` 只服务测试）。
- 改样式 / 相机后必须无头截图验证（方法在 CHECKPOINT「Ops 速查」）；改仿真数值后必须重跑 `npm run train` 至少一条 seed 再下结论。
- 提交按显式路径 stage；push 走个人号，方法见 CHECKPOINT。
