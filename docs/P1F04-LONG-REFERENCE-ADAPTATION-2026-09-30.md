# P1F-04 长参考视频自动适配执行记录

日期：2026-09-30。唯一总目标仍为 `docs/P1-FINAL-OPTIMIZATION-PLAN.md`。本记录不关闭 P1 Final / P1.5。

## 1. 实际能力真值

本轮直接读取当前国内 Dreamina CLI：

`dreamina multimodal2video -h`

当前实机能力：
- Seedance 2.0 / 2.0fast / 2.0 VIP / 2.0fast VIP / 2.0mini：图片≤9、视频≤3、音频≤3、总输入≤12；每个及总视频/音频参考时长 2–15 秒。
- Seedance 2.5：图片≤30、视频≤10、音频≤10、总输入≤50；每个及总视频/音频参考时长 2–30 秒。
- `--audio` 是参考音频输入，不是原生输出声音开关。

正式 3090 动态能力接口部署后再次读取，六个模型的模型级 `inputMediaMinSeconds/inputMediaMaxSeconds` 与上述 CLI help 一致；2.0 系列为 2–15 秒，2.5 为 2–30 秒。

## 2. 实现

新增 `agent-reference-adaptation.ts`，用于 Agent / 生成直参的长视频适配：

1. 只在 `multimodal2video` 下基于当前 Registry 的模型级输入时长、视频数、图片数和总输入数执行。
2. 实际读取 Artifact 文件和媒体时长，不信任 UI 上的历史 durationMs。
3. 长视频或多个视频总时长超过模型限制时，不再只报错：
   - 保留原视频 Artifact，不覆盖、不删除；
   - 根据视频时长、场景切点和输入槽位选取代表性时间点；
   - 生成不可变 PNG 关键帧 Artifact；
   - 相同关键帧 SHA256 去重；
   - GenerationRequest 实际引用关键帧。
4. 每个派生帧在 GenerationRequest manifest 中保存：
   - 原视频 Artifact ID / SHA256；
   - adapter version；
   - 原视频实际时长；
   - seek timestamp；
   - frameIndex。
5. 提交前再次读取原视频实际文件并核对 SHA256。即使派生帧仍存在，只要原视频来源已损坏/变化，也不会执行付费 submit。
6. 超长音频不会自动裁掉。音频语义可能因裁剪改变，因此继续明确 BLOCKED，要求用户裁剪或移除。
7. UI 显示“长参考视频已自动适配”、原时长、当前模型输入上限、派生关键帧缩略图/时间点和实际提交素材统计。

## 3. 验证

- 新增专项：45 秒视频 → Seedance 2.0mini / 15 秒限制 → 3 张关键帧；原文件字节保持不变。
- 重复规划复用确定性的关键帧 Artifact，不重复生成副作用。
- 2×10 秒视频在总时长 15 秒限制下自动将部分视频关键帧化。
- 20 秒参考音频在 15 秒限制下保持阻断，确认不会静默截断。
- Agent 实际规划生成 1 个 GenerationRequest / 1 个 Preflight，使用派生图片并保存来源元数据；付费 submit=0。
- 篡改原长视频后，提交前阻断；Provider submit 调用数=0。
- 专项：12/12 PASS。
- 全量隔离 SQLite：**222/222 PASS，0 fail / 0 skip**。
- TypeScript typecheck / build：PASS。
- License Gate：PASS（35 packages / 5 external runtimes）。
- 隔离浏览器：45 秒素材页面显示 3 张关键帧、任务 READY_TO_CONFIRM、1 request / 1 preflight、0 pageerror、0 real paid submit。
- 正式 3090 已加载新代码；动态能力只读验收通过，没有修改生产项目数据或执行付费生成。

## 4. 代码保护

实施前源码快照：

`C:\Users\Administrator\AgentDock\Product-Video-Studio-Checkpoints\P1F04-long-reference-start-20260930-1819.zip`

SHA256：

`4b5f414b08f46354f3d68191e497d4b63032a933945795287fbd5292a5f7a224`

本阶段不新增数据库迁移。部署前确认正式环境 generation/research/render/agent 活跃数均为 0，两个 SmartRun 列表为空，随后仅重启 3090 加载已通过 Gate 的代码。

## 5. 边界与下一步

当前实现解决的是**生成直参中的超长视频输入**。参考视频分析链本身仍保持“结构/方法分析”与“Dreamina 生成直参”分离。

长音频没有自动截断；若未来需要自动拆音频，必须先有语义/台词边界模型和用户可见确认，不能按固定秒数破坏语义。

下一项未完成能力：视觉 AI 对已生成视频做产品稳定性、动作完整性、穿帮、候选版本和最佳区间/切点评估。AI 只应产出审计建议，不直接覆盖原视频或绕过用户审片。
