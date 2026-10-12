# Product Video Studio · 场景连续性 P0–P4 恢复开发检查点

- 日期：2026-10-10（北京时间）
- AgentDock-company-2 原任务：`tsk_00e2db5e1dcd9866`
- 方案：P-C（沿用现有V8正式导演与ProductionPlan，不另做冲突的导演）
- **状态：执行中。P0/P1/P2阶段已记录完成，P3/P4部分代码已完成但未闭环，最终验收不得标记完成。**
- 本轮未调用任何需要积分的即梦生成/图像服务，未触发抖音发布/回复。正式3090网页未重启、未部署这一轮代码。

## 1. 已实施并验证

### P0 / 环境保护
- P0留档：`.runtime/continuity-engine-p0-20261010/git-status-before.txt`、`git-head.txt`、`key-file-hashes.json`。
- 正式`prisma/dev.db`通过SQLite在线备份至同一P0目录，`integrity_check=ok`；不执行`git clean/reset`，不覆盖用户已有大量修改。
- 原3090`/health`仍返回HTTP200。旧V3/V8显式审批、生成请求和历史数据保持原模式（新V8版本开关默认OFF）。

### P1 / 精确资产绑定
- `src/application/services/asset-image-bindings.ts`：`资产名@图片N`解析、按priority+assetId确定图像顺序、assetId和Sha256固定、命令模式输入槽映射、序号不存在/重名/换图/换位时付费前阻断。
- 已进入单视频`agent-mode-service.ts`、正式`prompt-compiler.ts`、`generation-preflight.ts`及`verified-dreamina-runtime-loader.ts`（最终`--image`真实argv之前再次核验）。
- V8新`PVS_SCENE_CONTINUITY_V1=1`在待确认的新PromptPackage中编译角色/场景图片编号。旧V8已确认文本保持原哈希，不能静默升级既有任务。
- `县令@图片1 / 场景@图片3 / 上一尾帧@图片5`可保证**程序的图片清单/路径与文字编号一致**；不能声称Seedance有经验证的原生`@`特殊解析能力，普通多图中的尾帧仍是REFERENCE_IMAGE。

### P2 / 连续性契约
- `clip-continuity-engine.ts`：`HARD_CONTINUITY`、`SAME_SCENE_CUT`、`SCENE_OR_TIME_JUMP`和`REVIEW_REQUIRED`四种关系；同场景状态Hash矛盾时必须人工复核；强连续要求原状态及真实来源。
- 新V8`incomingContinuity`进入镜头PromptPackage并带契约哈希；旧Run不迁移。
- 局部重做影响范围算法只追踪真正依赖Clip的后续段，遇独立时空跳转停止，不把全片无差别标为废弃。

### P3 / 部分已实现
- `actual-tail-frame-capture.ts`：读取真实MP4、SHA核对，FFmpeg提取尾部帧、保存独立不可变PNG和状态快照；幂等复用，快照/图像/原视频被替换均拒绝；新V8下载后自动生成`PENDING`证据，不假称已经人工审片。
- `continuity-generation-choice.ts`：只有上一片来源已审核且专用首帧与音频/画幅条件满足才建议专用图生视频；多图普通引用不能替代强制首帧，缺声音或比例能力则阻断。
- 9:16等明确画幅在新图片引用路径不能悄悄降级AUTO；`generated-media-spec-qc.ts`下载后核对真实分辨率，异常保留已付费视频但阻止AI自动采用。
- 连续性纯函数`reviewAcceptedActualClipObservation`只有核对当前最新成功Attempt、原视频SHA及用户同一Clip确切ACCEPT才把尾帧状态投影为REVIEWED；后续如有更新的REDO将拒绝继承。该结果尚未接到正式存储和Worker自动转换。
- 新V8`preparePaidScope`仅准备没有尚未满足上游依赖的第一批；`GenerationPreflight`直接调用也禁止未审核后续强连续片段绕过；`validatePaidScope`校验第一批确切Clip集合。第一批不能直接被误当作全片完成而进入剪辑。
- **仍缺**：上一Clip`ACCEPT`后生成版本化`REVIEWED`观察、自动为第二批重编译包含尾帧文件和专用首帧槽的完整Prompt/GenerationRequest，以及第二批新Consent/Approval和Worker恢复循环。当前不是可自动出完整连续长片的实现。

### P4 / 部分已实现
- `clip-reference-bindings-ui.ts`并入V3/V8逐Clip Prompt卡，按当片实际素材顺序显示名称`@图片N`、可用已确认图片的预览，不重新排列已生成结果。
- `clip-transition-media-qc.ts`本地比较前后真实MP4的画幅、音轨和强连续边界帧差；同场景正常切机位不得仅因像素不同误判。**技术帧接近仍必须人工判断角色、道具、动作、机位轴线与故事连续性**。
- 影响范围`affectedContinuationClipIds`支持精确计算局部重做后继，但尚未串进持久化ReviewDecision/审批失效及UI操作，不能宣称局部连续性自动修复已闭环。
- 现有V3“视频与Prompt同卡”和底部“重新进行视觉质检”布局保留。

## 2. 真实测试证据

- 本次恢复前已过资产绑定7项与V8正式20项等定向测试。
- 恢复后的新测试：
  - `tests/actual-tail-frame-capture.test.ts`：真实合成MP4抽帧/持久化/幂等/证据篡改拒绝。
  - `tests/clip-continuity-engine.test.ts`：关系、依赖、首次可生成批次及局部重做影响追踪。
  - `tests/continuity-generation-choice.test.ts`：首帧槽、原生音频及画幅能力冲突。
  - `tests/generated-media-spec-qc.test.ts`与`tests/clip-transition-media-qc.test.ts`：实际视频比例/静帧差异/音轨审查。
  - `tests/clip-reference-bindings-ui.test.ts`及V8/V3浏览器审稿：图片编号卡片、XSS转义与工作流保持。
- `npm test`完成一次全仓隔离回归，**618通过、0失败**（日志`.runtime/continuity-engine-full-20261010.log`）。随后少量独立模块/测试改动另经`npm run build`及对应专项测试验证；需在最终收口时再次对最后代码版本跑全量。
- 全站Chrome隔离E2E：**48通过、1跳过、0失败**（`.runtime/continuity-engine-e2e-20261010.log`），含正式V8人工采用和V3 Prompt同卡。
- `npm run license:gate` PASS；`git diff --check` exit 0。
- 用此前真实生成的两段公堂视频A→C1做零付费只读QC，正确标出C1实际1280×720与要求9:16不符，判`BLOCKED`。
- **上述工程通过≠即梦实际高保真角色或无缝连续性效果已验收**，P5用户付费真实小样仍须另行确认。

## 3. 未完成的必要任务（继续本任务，不得写成已完成）
1. **P3-A 审核状态绑定**：已具备严格核对当前Attempt/用户ACCEPT的纯函数；还要接入正式Review仓库/业务接口、保存审计不可变的REVIEWED派生状态。
2. **P3-B 第二批生成**：以REVIEWED来源编译对应Clip新的图片清单、专用首帧模式与完整Prompt，保留原台词、观众知情点、场景/人物身份；新Prompt和Request哈希必须绑定上一片Attempt及尾帧SHA。
3. **P3-C 分段授权与恢复**：SmartRun状态机逐批产生新的付费范围；每批用户明确确认后才允许提交。未知远端任务不得自动重复生成；前批审核失败时暂停并提示局部返工。
4. **P4-A 正式连续性QC接线**：从实际双MP4帧对照、语音与人物/道具变化生成可解释结果，影像证据不足时转人工，不通过不能AI自动采用。
5. **P4-B 审批失效与UI**：用户在同卡内审核继承关系、首尾帧预览、选择局部重做；将受影响后续Clip在业务持久状态中标STALE而非仅算出列表；旧视频保留、不自动扣费。
6. **最终全回归/安全部署**：在隔离浏览器完成三种转场及资产1/3/5对照、桌面和手机回归；正式3090部署前后比较数据库/视频SHA，若不一致直接回退；新版功能默认OFF，单一新试点显式开启后才验收。不得以旧测试通过代替P5实际样片。

## 4. 本检查点结论

**本次恢复确有代码交付与测试进展，但P3、P4不满足完整验收条件，AgentDock任务继续保持ACTIVE，不执行final_review=pass/complete。** 当前没有部署正式网页，因此用户若刷新3090仍看到旧产品界面，这是预期保护而非假称上线。
