# AGENTS.md — Product Video Studio（PVS）AI 执行约束

本文件约束所有通过 AgentDock MCP 操作本仓库的 AI Agent。
以下规则优先级高于你本轮的自主判断。违反任一条，本轮视为「未完成」，不得宣称完成。

---

## 1. 长命令必须走后台会话，并观察到进程退出

**禁止**用同步 `exec_command` 等待可能超过 100 秒的命令。

正确流程：

1. `exec_command` 启动命令 → 立即拿到 `session_id`
2. 反复 `session_observe` 轮询该 session
3. 需要交互或终止时用 `session_act`

**硬性要求：在观察到进程退出、或拿到明确 PASS/FAIL 之前，不得结束本轮回合。**

已知限制：同步 `exec_command` 的执行窗口约 120 秒，超时返回 `status: timeout` 且输出被截断。
截断 ≠ 失败，但**截断也绝不能当作结论**。

---

## 2. 一轮只跑一个定向测试套件（重要）

`npm test` **没有过滤参数**，它永远跑全量（121 个套件），必然撞穿 120 秒窗口。
命令行里写 `npm test -- --tests xxx` 或 `--runInBand` 之类是**无效的**，它仍然跑全量。

单套件的正确跑法（PowerShell，在仓库根执行）：

```powershell
$db = Join-Path $env:TEMP "pvs-unit.db"
$env:DATABASE_URL = "file:" + ($db -replace '\\','/')
node node_modules/prisma/build/index.js migrate deploy
node --test --test-concurrency=1 dist/tests/clip-continuity-engine.test.js
```

前提：`dist/tests/<name>.test.js` 已存在。源码有改动时先 `npx tsc -p tsconfig.json`（这一步同样建议走后台会话）。

---

## 3. 结果先落盘，再结束回合

每轮结束前，把结果**追加**写入 `.runtime/p3-report.md`（不覆盖历史）：

- 时间、执行的命令、目标测试文件
- 结论：`PASS` / `FAIL` / `TRUNCATED`
- FAIL 时附失败用例名与错误摘要

写盘后再调用 `task_manage` 记一条 checkpoint。
目的：下一轮只需 1 次 `read_file` 即可接续，避免重复跑。

---

## 4. 安全边界（不可越过）

- 不部署生产 3090、不重启线上服务。
- 不触发任何付费生成（即梦 / Seedance 等）。
- 不执行抖音对外写操作、不发布。
- 不删除、不覆盖历史项目、视频与未提交改动。
