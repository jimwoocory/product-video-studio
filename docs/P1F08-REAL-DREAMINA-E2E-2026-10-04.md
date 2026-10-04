# P1F-08 真实 Dreamina E2E 记录（2026-10-04）

## 范围

项目：Tonemay 耳机宣传  
Smart Run：`173d2ead-7480-478e-91fd-9101efae19cf`  
用户明确授权范围：Seedance 2.0 Mini / 720p / 9:16 / 15 秒 / 1 个 Dreamina 请求，并明确接受成本未知。  
Paid scope SHA256：`de7dcddfd5fd498515492bc5913c155396cdde52c98c7d38c7a562b4d25c654d`。

## 首次提交暴露的真实问题

首次 Attempt `3126af7a-e724-4adb-b284-9cdcf4c2f08a` 在提交前的 CLI OAuth 状态已失效。

真实 `dreamina user_credit` 返回：
- `user_id=0`
- `user_name=""`
- `total_credit=0`

旧 verified runtime 仅看到 `total_credit` 字段就误判为已登录。提交 stderr 明确返回：

`当前账号没有 dreamina_cli 使用权限: current account is not allowed to use dreamina_cli`

旧失败分类又将该明确权限拒绝误归类成 `SUBMISSION_OUTCOME_UNKNOWN`。

### 修复

`config/dreamina-runtime.verified.json`：
- AUTHENTICATED 必须匹配非零 `user_id`。
- `user_id=0` / 空 `user_name` 明确视为 NOT_AUTHENTICATED。
- “当前账号没有 dreamina_cli 使用权限 / current account is not allowed...” 明确视为终态 FAILED，而非 UNKNOWN。

新增真实格式回归；专项通过。

原 UNKNOWN Attempt 在重新提交前做了严格审计：
- 无 submit_id / provider handle。
- 无 submittedAt。
- 无 output Artifact。
- SUBMIT exitCode 非零且未 timeout。
- stderr Artifact READY 且实际文件 SHA256 与记录一致。
- stderr 精确命中已复核权限拒绝。

因此只将**同一 Attempt**恢复为 CREATED，并保留首次失败命令审计；未创建第二个 Attempt、未扩大付费 scope。

## OAuth 恢复

使用官方 `dreamina relogin --headless` 重新授权。
官方授权页显示“即梦创作CLI请求你的授权”，完成同意后：

- user_id：`4121392829182957`
- vip_level：`maestro`
- 授权前积分：`14252`

## 真实 Dreamina 提交

复用原 consent / paidScope / Attempt 后真实提交成功。

- Attempt：`3126af7a-e724-4adb-b284-9cdcf4c2f08a`
- submit_id：`c5745cdd-e68e-40f4-b55c-e80cc0d23264`
- 模型：`seedance2.0mini`
- 画幅：`9:16`
- 分辨率：`720p`
- 请求时长：15 秒
- 实际平台状态：`success`
- 实际输出：720×1280
- 平台返回 duration：15.042 秒
- 实际扣费：90 积分
- OAuth 当前剩余积分：14162

输出 Artifact：
- id：`f2e45c34-5a26-4f83-8c07-bd592cd5fd94`
- relativePath：`outputs/eba639f7-a901-4286-b20c-e49bb1a6ee99/3126af7a-e724-4adb-b284-9cdcf4c2f08a.mp4`
- SHA256：`48d4c9d755d78234491ef5dfc53beaf4ade7beb4ad60e82cc82cbed288c34c84`
- size：11,413,123 bytes
- integrity：READY

浏览器实测可播放，720×1280，HTML media duration 约 15.104 秒。

## 真实视觉审片

视觉 AI 自动审片没有越过人工 Gate：

- Smart status：`WAITING_FOR_CLIP_REVIEW`
- blocker：`VISUAL_REVIEW_REQUIRED`
- assessment：BLOCKED / MEDIUM
- 结论：产品外形总体相符、后段稳定，但可见字幕重复。

人工抽取 2s / 6s / 10s / 14s 实际视频帧进一步确认：
- 开场“你的脚步声，慢了半拍？”重复两行。
- 结尾品牌型号被生成成 **“Tonmay Q8”**，不是确认的 **“Tonemay Q8”**。
- 小号免责声明也存在生成文字失真风险。

因此本次真实结果**不应自动 ACCEPT**。系统保持人工审片暂停，没有自动 REDO，也没有产生第二次积分消费。

## RC2：准确文字后期化

真实 E2E 证明：让视频生成模型直接烧录可读中文、品牌型号、数值、免责声明或 CTA 会造成重复/拼写错误/乱码。

RC2 改为：

1. ProductionPlan Segment 新增 `postProductionText`，支持：
   - LABEL
   - LEGAL
   - CAPTION
   - CTA
   - 精确文本、时间、位置、字号、Beat/Fact 引用。
2. Product Director 被明确要求：
   - Dreamina 视觉字段不得要求生成可读文字。
   - 精确文字只能进入 `postProductionText`。
   - 常见“屏幕文字/字幕打出/型号文字/角标显示”等烧字指令由代码直接阻断。
3. Prompt Compiler：
   - 模板升级为 `v2-posttext`。
   - 写入 `readable_text_policy=POST_PRODUCTION_ONLY`。
   - Dreamina 只接收“预留干净文字安全区”，不接收 cue 的精确文案。
   - 手工计划如果仍要求烧字，编译直接阻断。
4. AutoEdit：
   - LABEL / LEGAL 作为精确后期文字始终渲染。
   - CAPTION 跟随字幕开关。
   - CTA 跟随 CTA 开关。
   - 已有结构化 CTA 时不再重复添加脚本 CTA。
5. 长镜头拆分 / whole-second 归一化同时调整 postProductionText 时间，避免文字时间漂移。

## 验证

- 相关专项：38/38 PASS。
- 最终全量隔离回归：**242/242 PASS**，0 fail / 0 skip / 0 todo。
- Build PASS。
- Typecheck PASS。
- License Gate PASS：35 packages / 5 external runtimes。
- 无新增数据库迁移。
- 正式版本：`0.3.0-p1-final-rc.2`。
- 正式 3090 已加载 RC2。
- 当前真实 Smart Run 保持 WAITING_FOR_CLIP_REVIEW；重启未触发自动重做。

## 当前 Gate

本次第一次真实付费请求已经完成并成功产生视频，但内容质量 Gate 未通过，因此 P1 Final 仍不能关闭。

任何重做都是**新的付费范围**，原明确授权“不包含重做或新增镜头”。重做前必须重新规划到新的 paidScope，并再次取得用户明确授权。
