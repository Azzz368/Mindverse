# Mindverse 项目状态与开发交接

> 更新时间：2026-08-13
>
> 项目目录：`D:\HKGAI\V2-map\Mindverse`
>
> 当前分支：`agent-improve`
>
> 最近已推送提交：`1d3b1d0 Add private user workspaces and authentication`

## 1. 当前结论

Mindverse 已从访问码共享画布升级为第一版多用户私有创作空间：用户通过注册和登录进入自己的工作区，服务端根据会话确定用户及工作区，浏览器不能通过自行传入 workspace ID 访问他人的数据。

当前版本适合继续进行受控内测。账号、工作区隔离、Postgres 元数据、Bunny 工作流快照、主要媒体生成节点均已接通。多人高并发、长任务后台执行、配额与审计能力仍需继续建设。

## 2. 最近验证状态

- `npm run lint`：通过（当前脚本执行 TypeScript `tsc --noEmit` 检查）。
- `npm run build`：通过，Next.js 15.5.19 共生成 42 个页面/路由。
- 数据库与存储只读检查：工作流表、会话表、最新工作流记录均可读取，Bunny 文件读取返回 HTTP 200。
- 当前没有完整的自动化单元测试和端到端测试套件；发布前仍需手动验证登录、保存、批量选中及各外部模型。

## 3. 当前架构

| 层级 | 当前实现 |
| --- | --- |
| 前端画布 | Next.js App Router、React Flow、Zustand |
| 身份验证 | 邮箱/密码、服务端会话 Cookie、Postgres session |
| 工作区隔离 | users、workspaces、workspace_members、workflows 等 Postgres 表 |
| 工作流保存 | Postgres 保存索引与 revision，Bunny Storage 保存工作流 JSON 快照 |
| 媒体存储 | Bunny Storage，使用 workspace-scoped 路径 |
| AI 路由 | 站内 `/api/ai/*` 服务端路由，密钥不下发浏览器 |
| Agent 检索 | 确定性能力目录；可选 Postgres + pgvector RAG |

保存策略是“远程快照为主，浏览器草稿为恢复副本”。自动保存队列会在发送请求时采用最新 revision；Bunny 快照使用唯一对象路径，避免并发保存写入同一个对象。

## 4. 已完成并已推送

### 用户与工作区

- 注册、登录、登出和服务端会话。
- 用户私有工作区及服务端成员权限检查。
- Postgres schema 与 `db:migrate` 脚本。
- 旧访问码工作区迁移到管理员账号的脚本。
- Bunny 工作流及媒体路径按 workspace 隔离。

### 画布与媒体能力

- 视频抽帧迁移为 Video 分类下的独立节点。
- 支持从 VideoNode 抽取“当前画面”或“尾帧”，生成相连的 Reference 节点。
- VideoNode 会记住当前播放时间，退出放大预览后不会因回到 0 秒而抽错帧。
- 图片节点长提示词输入框已限制高度，与视频节点交互一致。
- HKGAI MiniMax H3 视频模型，前端名称为 `minimax_h3`，支持 5–15 秒与允许的画面比例。
- HKGAI MiniMax H3 Context IR 提示词增强任务。
- HKGAI Music、TTS 与参考音色创建流程。
- Volcengine Seedance OmniHuman 1.5 单图加音频数字人视频。
- TokenStar Seedance 文生视频与 asset video 流程。

## 5. 当前本地尚未推送的改动

### 持久化框选与批量操作

- 按住 `Shift`，在画布空白处按下鼠标左键并拖动进行区域框选。
- 松开鼠标后橙色虚线框保留，不要求用户继续按住 Shift。
- 拖动选择框可带动内部节点一起移动。
- 支持批量运行、批量删除和清除选择；批量运行按依赖顺序执行。
- 仅在实际移动发生时记录 undo，避免产生空历史记录。

### 工作流保存稳定性

- 修复连续自动保存时排队请求携带过期 revision 导致 409 冲突的问题。
- 保存成功后清理旧错误；针对离线、401、404、409、413 和服务端异常显示更准确的提示。
- Bunny 快照改用唯一对象路径，降低并发写入互相覆盖的风险。

涉及代码文件：

- `features/canvas/components/AnnotatedCustomNode.tsx`
- `features/canvas/components/CreativeCanvas.tsx`
- `features/canvas/components/Workspace.tsx`
- `features/canvas/state/canvasStore.ts`
- `server/storage/workflowStorage.ts`
- `app/globals.css`

## 6. 已知问题与风险

### TokenStar 参考音频格式

`reference-audio-1` 是站内生成的资产名称，不是 URL。已检查到失败资产虽然扩展名及 HTTP `Content-Type` 都是 MP3，但实际容器是 M4A/MP4，音频编码为 AAC；TokenStar 因真实格式与声明格式不一致将资产标记为 `Failed`。

下一步应在 TokenStar 上传前使用 ffmpeg 将参考音频规范化为真实 MP3，并以匹配的文件名与 MIME 类型上传。此修复尚未实现。

### 运行与运维风险

- Agent 或长视频任务仍可能受 Web 实例重启及请求生命周期影响，后续应拆分 durable worker 与任务队列。
- 尚未建立按用户的并发限制、额度限制、管理后台和完整审计日志。
- 外部模型接口需要在 Render 真实环境逐项做生成回归，避免供应商字段或权限变化未被发现。
- `MINDVERSE_AUTH_SECRET` 修改后，已有登录会话将失效，用户需要重新登录，但用户及工作区数据不会丢失。

## 7. 本地运行

```powershell
npm install
npm run db:migrate
npm run dev
```

首次使用访问 `http://localhost:3000/register`。如果注册模式为 invite，需要输入 `MINDVERSE_REGISTRATION_INVITE_CODE`。登录后进入 `/workplace`，再进入用户自己的 `/workspace`。

至少需要配置：

```dotenv
DATABASE_URL=postgresql://...
MINDVERSE_AUTH_SECRET=至少32字符且保持稳定的随机密钥
MINDVERSE_REGISTRATION_MODE=invite
MINDVERSE_REGISTRATION_INVITE_CODE=你的邀请码
WORKFLOW_STORAGE_PROVIDER=bunny
BUNNY_STORAGE_ZONE=...
BUNNY_ACCESS_KEY=...
BUNNY_STORAGE_REGION=...
BUNNY_PULL_ZONE_URL=...
```

本地用户是否能在 Render 看到，取决于两边是否连接同一个 Postgres 数据库和 Bunny Storage。使用不同数据库时，本地注册用户不会自动同步到 Render。

## 8. Render 部署检查清单

1. 在 Render 设置稳定的 `DATABASE_URL`、`MINDVERSE_AUTH_SECRET`、注册策略和 Bunny 变量。
2. 每次包含 schema 变更的版本运行 `npm run db:migrate`。迁移是数据库结构升级，不是登录步骤。
3. 首次把旧工作区归属管理员时，设置 `MINDVERSE_LEGACY_OWNER_EMAIL` 并仅运行一次 `npm run workspace:migrate-legacy`。
4. 构建命令保持项目当前的安装与 `npm run build` 流程；启动命令使用项目现有 production start 配置。
5. 部署后依次验证注册/登录、工作区隔离、创建节点、刷新恢复、连续保存和退出登录。

不要把任何 API Key、数据库密码、Bunny Access Key 或 Auth Secret 写入 Git。

## 9. 下一步建议优先级

1. 在 TokenStar 资产上传前增加 ffmpeg 音频规范化，并做真实 reference audio 回归。
2. 为 Shift 框选、整组拖动、批量运行和保存 revision 冲突补充端到端测试。
3. 将长耗时生成任务迁移到队列与独立 worker，增加可恢复的任务状态。
4. 增加用户额度、并发限制、操作审计和管理员管理能力。
5. 补齐外部供应商接口的定期健康检查与失败原因观测。

## 10. 常用命令

```powershell
npm run dev
npm run lint
npm run build
npm run db:migrate
npm run workspace:migrate-legacy
npm run rag:migrate
```

`db:migrate` 可重复运行，用于确保数据库 schema 与当前代码一致；它不需要用户每次登录时执行。
