# P1F Douyin Browser Publisher Integration

日期：2026-10-05  
Product Video Studio 分支：`feat/douyin-browser-publisher`  
social-auto-upload 二开分支：`feat/pvs-douyin-engine`  
social-auto-upload 二开提交：`9059bca234efe71a578938c37a60b0ac6966b364`

## 目标

在现有 Product Video Studio PublishProvider 架构中新增抖音浏览器自动发布主路径，不替换现有 SDK / H5 / OpenAPI / Manual Export 代码。

当前用户可见主方案：

- DOUYIN_BROWSER_AUTOMATION
- MANUAL_EXPORT 作为永久兜底

SDK / H5 / OpenAPI 继续保留为 capability-gated Provider，但不作为当前默认主路径。

## 结构

Product Video Studio：

```text
PublishBridgeService
  -> DouyinBrowserAutomationProvider
      -> SocialAutoUploadRuntime
          -> sau-pvs structured bridge
              -> social-auto-upload DouYinVideo
                  -> Patchright Chromium
                      -> creator.douyin.com
```

Product Video Studio 不直接拼接原始 `sau douyin ...` 业务命令，只调用结构化 Runtime Port。

## social-auto-upload 二开

新增：

- `pvs_bridge.py`
- `sau-pvs` CLI entry
- 机器可读 `PVS_BRIDGE_JSON:` 输出
- `probe`
- `check`
- `login`
- `publish`
- `SAU_RUNTIME_HOME`，允许 Product Video Studio 隔离 Cookie/会话
- 账号显示身份从抖音创作者中心实时读取；本地 Cookie 文件名不作为用户昵称
- 当前已登录身份：昵称 `WC`，抖音号 `50805615998`
- 发布后进入作品管理页再次按本次标题做结果确认
- 若平台已接受提交但无法确认作品，返回 `SUBMISSION_UNKNOWN`，禁止盲目重试
- 补齐当前 CLI 仍使用的 `playwright==1.52.0` 依赖声明

## Product Video Studio 集成

新增：

- `DOUYIN_BROWSER_AUTOMATION`
- `DouyinBrowserPublisherRuntime` Port
- `SocialAutoUploadRuntime` Adapter
- `DouyinBrowserAutomationProvider`
- 抖音账号状态 / 登录 HTTP 接口
- 发布设置页登录 / 重新登录按钮
- Final / Publish Center 中的抖音浏览器发布确认流程
- `SUBMISSION_UNKNOWN` PublishPackage / Receipt 语义

默认 Provider 改为 `DOUYIN_BROWSER_AUTOMATION`。

## 安全边界

抖音 Cookie 只放在：

```text
.runtime-secrets/publishing/social-auto-upload/
```

该目录已被 `.gitignore` 排除。

Cookie 不进入：

- Prisma
- project.json
- Artifact
- 普通应用日志
- Git

真实发布仍要求 Product Video Studio 的显式用户确认。点击/提交不直接等于 PUBLISHED；只有作品管理页再次确认到本次作品才写 `PUBLISHED_CONFIRMED`。

## 已完成验证

Product Video Studio：

- typecheck PASS
- License Gate PASS
- Prisma validate PASS
- 全量 tests 297/297 PASS
- 发布专项 18/18 PASS
- 实际 Runtime Adapter probe = READY
- 实际抖音账号昵称 `WC`、抖音号 `50805615998`，check = VALID

social-auto-upload：

- `py_compile` PASS
- `sau-pvs probe` PASS
- `sau-pvs check --account 50805615998` = VALID，并返回 `displayName=WC` / `platformUserId=50805615998`
- 上游原始 commit `0012d2c` 与二开分支运行相同完整 unittest 套件时均存在相同的 6 个既有失败，因此未把这些既有失败归因于本次二开。

## 未执行

本次 Gate **没有执行真实视频发布**，避免在没有针对某个具体视频明确授权的情况下向抖音提交内容。

下一步真实 E2E 应由用户指定一个测试视频、标题/描述，并明确确认该次真实发布后再执行。
