# Mindverse 项目交接文档

> 更新时间：2026-08-14
>
> 项目目录：`D:\HKGAI\V2-map\Mindverse`
>
> 当前分支：`agent-improve`
>
> 功能基线提交：`ff9d300 Add MiniMax ref2va video model`

## 1. 项目概况

Mindverse 是一个基于无限画布和节点连接的多模态创作平台。用户可以在私有工作区中组织文本、图片、视频、音频、分镜、Agent 和后期处理流程，并把上游节点的结果作为下游模型的输入。

目前项目已经具备第一版可用的多用户产品框架：

- 用户注册、登录、退出与服务端会话。
- 用户私有工作区和项目隔离。
- Postgres 保存用户、会话、工作区、项目索引和能力检索数据。
- Bunny Storage 保存工作流快照和归档媒体。
- 浏览器草稿作为远程保存失败时的恢复副本。
- 文本、图片、视频、音频、分镜、视频剪辑和 Agent 节点。
- 多家外部模型供应商的服务端接口适配。

当前版本适合受控内测。生产高并发、任务队列、配额计费、完整审计和自动化回归测试仍需继续建设。

## 2. 当前技术架构

| 层级 | 当前实现 |
| --- | --- |
| Web 框架 | Next.js 15 App Router、React 19、TypeScript |
| 画布 | React Flow、Zustand |
| 身份认证 | 邮箱/密码、HttpOnly 会话 Cookie、Postgres Session |
| 权限隔离 | `users`、`workspaces`、`workspace_members`、`workflows` 等 Postgres 表 |
| 工作流保存 | Postgres 元数据与 revision；Bunny Storage 工作流 JSON 快照 |
| 媒体归档 | Bunny Storage workspace-scoped 路径与 CDN URL |
| AI 接口 | 服务端 `/api/ai/*` 路由；API Key 不下发浏览器 |
| 异步任务 | 浏览器轮询为主；支持页面恢复后继续轮询部分任务 |
| Agent | Semantic Router → Capability Retriever → Planner → Validator → Canvas Compiler → Executor → Observe/Repair |
| Agent 运行记录 | 本地 JSON 或 Bunny；已有 checkpoint、取消、恢复和 worker lease 协议 |
| 能力检索 | 确定性能力目录；可选 Postgres + pgvector 混合检索 |
| 视频后处理 | FFmpeg、ffprobe、HyperFrames、Codex |

### 2.1 工作区隔离

浏览器不会提交一个可信的 workspace ID 来决定数据归属。服务端从登录会话解析用户和工作区，并在读取、保存、删除项目或 Skill 时进行成员权限检查。A 用户默认无法查看 B 用户的项目。

### 2.2 保存策略

远程项目采用以下策略：

1. 用户修改画布后触发延迟自动保存。
2. Postgres 记录项目元数据与 revision。
3. Bunny Storage 保存 workspace-scoped JSON 快照。
4. 保存请求在真正发送时携带最新已确认 revision，降低连续保存造成的 409 冲突。
5. 当前浏览器同时保存一份不超过 3 MB、且不包含内嵌媒体的恢复草稿。
6. 页面隐藏、离开或卸载时尝试刷新最后一次修改。

生产环境不要使用 `WORKFLOW_STORAGE_PROVIDER=local`。Render 本地文件系统是临时的，部署或实例重启后可能丢失文件。

## 3. 已完成功能

### 3.1 用户、登录和项目

- 注册、登录、退出登录。
- `invite` 和 `open` 两种注册策略。
- 用户私有工作区。
- 项目新建、重命名、删除、打开。
- 旧访问码工作区向指定管理员账号迁移。
- 项目自动保存、revision 冲突处理和浏览器草稿恢复。
- JSON 导入、导出。
- Skill 创建、保存和复用入口。

### 3.2 画布基础能力

- 节点创建、拖动、连接、删除、复制和撤销。
- 图片、视频、音频本地上传并归档到 Bunny。
- 从剪贴板粘贴图片、视频或音频到画布。
- 节点单独运行和整条工作流按依赖顺序运行。
- `Shift + 鼠标左键拖动` 框选多个节点。
- 松开鼠标后保留选择框。
- 拖动选择框统一移动节点。
- 批量运行、批量删除、清除选择。
- 选择节点后设置颜色分组和锁定分组的基础能力。

### 3.3 文本、分镜和图片

- Prompt、Text、Script、Storyboard、Storyboard Image 节点。
- Storyboard 结果可物化为后续场景节点。
- GPT Image 2（TokenStar）图片生成。
- Nano Banana（TokenStar）图片生成/编辑入口。
- 角色转面、九宫格、俯视场景等图片提示词预设。
- 图片参考节点连接和参考素材选择。
- 图片标注：箭头、矩形、圆形和文字。
- 根据标注创建新的图片修订节点，保留原图。
- 长提示词输入框限制最大显示高度，避免节点被无限撑大。

### 3.4 视频模型与工具

VideoNode 当前包含以下模型预设或能力：

- TokenStar Seedance 2.0 文生视频。
- TokenStar Seedance 2.0 Asset / Asset Fast 多素材视频。
- 数字人视频：人物图片 + 音频。
- Volcengine OmniHuman 1.5：单图 + 音频数字人。
- 302.AI Gen-4.5。
- Kling v2.6 官方接口。
- TokenStar Kling v3 图片、文本和 Omni 模式。
- HKGAI `minimax_h3`：`t2_minimax-h3_bf16_7k2p`。
- HKGAI `minimax_ref2va`：`t2_minimax-h3_bf16_ref2va`。
- Sora 2 图片转视频。

已完成的视频辅助节点：

- 视频抽帧节点：从 VideoNode 抽取“当前画面”或“最后一帧”。
- 当前画面时间会在关闭放大预览后保留，不会自动回到 0 秒。
- 抽帧结果创建 Reference 节点，并显示视频到图片的连接。
- Video Edit 节点：排序、裁剪、淡入淡出、配乐、字幕和转码基础流程。
- Codex + HyperFrames 节点：自然语言描述后期需求，生成和渲染 HTML 视频工程。
- MiniMax H3 2K 再生成节点：支持 `base_video` 和 `source_task_id` 两种模式。

### 3.5 MiniMax 专项能力

#### minimax_h3

- 前端名称：`minimax_h3`。
- 服务端模型：`t2_minimax-h3_bf16_7k2p`。
- 提示词最长 7,000 字符。
- 最多 2 张参考图片。
- 5–15 秒。
- 支持 16:9、9:16、1:1。
- Context IR 提示词增强任务已接入。

#### minimax_ref2va

- 前端名称：`minimax_ref2va`。
- 服务端模型：`t2_minimax-h3_bf16_ref2va`。
- 模式一：固定 1 张图片 + 1 段音频。
- 模式二：1–3 段自带音轨的视频，总时长不超过 15 秒。
- 图片和视频不能混用。
- 视频模式不能再单独传入音频。
- 输出时长支持 4–15 秒，默认 4 秒。
- `audio_flow_shift` 默认 3.0，可在节点设置中调整。
- 图片使用 multipart 单数字段 `input_reference`。
- 视频无论一段或多段都使用重复字段 `input_references`。
- 音频通过 `audio_reference.audio_url` Data URI 提交。
- 提交前使用 ffprobe 验证视频含音轨并统计总时长。
- 输出比例由参考图片或视频决定，不做错误的固定比例验证。

#### MiniMax H3 2K 再生成

- `base-video`：必须连接一个符合 H3 768P 规格的原视频。
- `source-task`：使用同账号、成功且仍可查询的官方 MiniMax 任务 ID。
- 原视频模式下，原始提示词可从连接的 VideoNode 自动继承。
- 原视频使用过的参考图片、视频或音频不会自动从历史请求恢复，需要重新连接。
- 固定输出 2K；依赖 `MINIMAX_API_KEY`。

### 3.6 音频能力

- 普通 Audio 节点和本地音频上传。
- HKGAI Music Generation。
- HKGAI TTS 内置音色。
- HKGAI TTS 参考音色创建流程。
- QwenCloud 人声克隆。
- 使用已克隆 Voice ID 进行 TTS。
- 参考声音操作包含授权确认，禁止上传无授权录音。

### 3.7 Agent 与 Skill

- Agent 可创建、编辑、整理和运行画布工作流。
- 支持语义路由、能力检索、确定性校验和工作流编译。
- 支持 Agent Run Trace、checkpoint、取消和恢复协议。
- 支持 full-web 图片搜索工具及版权来源提示。
- Skill 可保存画布模板，并从 Skill 页面重新放置到画布。
- Agent 可选不同执行模型；服务端仅接受 allowlist ID。
- Codex + HyperFrames 已作为视频后期专项执行器接入。

## 4. 关键代码位置

| 模块 | 主要位置 |
| --- | --- |
| 画布节点和交互 | `features/canvas/components/` |
| 画布状态和运行 | `features/canvas/state/canvasStore.ts` |
| 节点输入编译 | `features/canvas/domain/nodeInputCompiler.ts` |
| 节点输出标准化 | `features/canvas/domain/nodeOutputNormalizer.ts` |
| 视频模型预设 | `shared/workflow/videoModelPresets.ts` |
| 节点连接 Handle | `shared/workflow/connectionHandles.ts` |
| 通用节点执行入口 | `server/ai/application/runNodeUseCase.ts` |
| 异步任务轮询 | `server/ai/application/pollTaskUseCase.ts` |
| HKGAI MiniMax H3 | `server/ai/hkgaiVideoProvider.ts` |
| HKGAI MiniMax ref2va | `server/ai/hkgaiMinimaxRef2vaProvider.ts` |
| MiniMax 2K 再生成 | `server/ai/minimaxH3VideoRegeneration.ts` |
| Volcengine OmniHuman | `server/ai/volcengineOmniHumanProvider.ts` |
| TokenStar 视频 | `server/ai/tokenstar/` |
| FFmpeg 视频编辑 | `server/video/ffmpegEditRunner.ts` |
| 视频抽帧 | `server/video/videoFrameExtractor.ts` |
| 工作流存储 | `server/storage/workflowStorage.ts` |
| 媒体归档 | `server/storage/mediaArchive.ts` |
| 登录与权限 | `server/auth/`、`app/api/auth/` |
| 数据库迁移 | `server/db/migrations/`、`scripts/db-migrate.mjs` |
| Agent Router | `app/api/ai/agent-router/route.ts` |
| Agent Runtime | `docs/AGENT_RUNTIME.md` |
| Capability RAG | `docs/CAPABILITY_RAG.md` |

## 5. 本地开发

### 5.1 基本命令

```powershell
npm install
npm run db:migrate
npm run dev
```

打开：

- 注册：`http://localhost:3000/register`
- 登录：`http://localhost:3000/login`
- 项目列表：`http://localhost:3000/workspace`

`npm run db:migrate` 用于把数据库 schema 升级到当前代码需要的版本。迁移可重复执行，不需要用户每次登录时执行；只有新环境首次部署或代码包含数据库结构变化时需要运行。

### 5.2 最低配置

```dotenv
DATABASE_URL=postgresql://...
DATABASE_SSL=true
MINDVERSE_AUTH_SECRET=至少32字符且长期保持不变的随机值
MINDVERSE_REGISTRATION_MODE=invite
MINDVERSE_REGISTRATION_INVITE_CODE=你的邀请码

WORKFLOW_STORAGE_PROVIDER=bunny
BUNNY_STORAGE_ZONE=...
BUNNY_ACCESS_KEY=...
BUNNY_STORAGE_REGION=sg
BUNNY_PULL_ZONE_URL=...
```

生成 Auth Secret：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

修改 `MINDVERSE_AUTH_SECRET` 会使已有登录会话失效，用户需要重新登录，但不会删除用户、工作区或项目数据。

### 5.3 外部模型配置

按实际启用的能力配置，不需要把所有 Key 都填写：

| 能力 | 主要变量 |
| --- | --- |
| 302.AI | `AI_302_API_KEY`、`AI_302_BASE_URL` |
| HKGAI 文本/MiniMax H3/ref2va | `HKGAI_MAAS_API_KEY`、`HKGAI_MAAS_BASE_URL` |
| HKGAI Music/TTS | `HKGAI_SPEECH_API_KEY` 或对应 Music/TTS 覆盖变量 |
| MiniMax Context IR/2K 再生成 | `MINIMAX_API_KEY`、`MINIMAX_API_BASE_URL` |
| TokenStar | `TOKENSTAR_API_KEY`、`TOKENSTAR_API_ORIGIN` |
| Kling 官方 | `KLING_API_KEY`、`KLING_API_ORIGIN` |
| Volcengine OmniHuman | `VOLCENGINE_OMNIHUMAN_ACCESS_KEY_ID`、`VOLCENGINE_OMNIHUMAN_SECRET_ACCESS_KEY` |
| Qwen 人声克隆/TTS | `DASHSCOPE_API_KEY` |
| Agent 图片搜索 | `SERPAPI_API_KEY` 或 Google CSE 配置 |
| Codex + HyperFrames | `MINDVERSE_CODEX_HOME` 或 Render Secret File 配置 |

所有 Key 只能放在 `.env.local` 或 Render Environment 中。不要使用 `NEXT_PUBLIC_` 前缀，不要提交到 Git。

## 6. Render 部署交接

### 6.1 必须确认

1. Web Service 使用稳定的 `DATABASE_URL`。
2. `MINDVERSE_AUTH_SECRET` 在各次部署间保持不变。
3. 生产注册建议使用 `MINDVERSE_REGISTRATION_MODE=invite`。
4. 工作流存储使用 Bunny，而不是 Render 临时磁盘。
5. 新数据库首次上线时执行 `npm run db:migrate`。
6. 需要 RAG 时执行 `npm run rag:migrate`。
7. 迁移旧访问码项目时设置 `MINDVERSE_LEGACY_OWNER_EMAIL`，然后只运行一次 `npm run workspace:migrate-legacy`。
8. 部署后验证注册、登录、退出、项目隔离、自动保存和至少一个真实模型任务。

本地注册用户只有在本地与 Render 使用同一套 Postgres 和 Bunny Storage 时，才会在 Render 中出现。使用不同数据库时不会自动同步。

### 6.2 当前容量边界

当前 Render Standard 2 GB RAM / 1 CPU 更适合小规模受控内测，而不是公开高并发。Web 服务同时负责页面、API、媒体下载、ffprobe/FFmpeg 和部分长任务协调；真实可承载人数取决于任务类型，不能只按登录人数估算。

在迁移到独立 worker 前，应保守限制同时提交的大型视频、音频和 HyperFrames 任务数量。

## 7. 当前验证状态

截至 `ff9d300`：

- `npm run lint`：通过，当前实际执行 `tsc --noEmit`。
- `npm run build`：通过，Next.js 生产构建成功。
- `minimax_ref2va` 编译、multipart 字段构造和本地 ffprobe 预检已完成。
- 没有为了验证而自动发起付费 `minimax_ref2va` 生成任务。
- 项目当前缺少覆盖主要流程的单元测试、集成测试和端到端测试套件。

## 8. 已知问题和风险

### 8.1 前端中文乱码

部分历史源码字符串存在编码损坏，表现为中文按钮或错误信息乱码。README 和本交接文档已经使用正常 UTF-8，但 UI 源码仍需系统性清理。不要继续复制乱码字符串到新组件。

### 8.2 TokenStar 参考音频容器

曾出现文件名和 HTTP `Content-Type` 声明为 MP3，但实际容器为 M4A/MP4、编码为 AAC 的情况。TokenStar 会把这类资产标记为 `Failed`。建议上传前统一用 FFmpeg 转为真实 MP3，并让扩展名、MIME 和容器一致。

### 8.3 浏览器承担异步执行

当前很多异步任务仍由浏览器启动轮询。关闭页面、实例重启、部署或网络切换会影响用户体验。虽然部分任务可在重新打开页面后恢复轮询，但还不是完整的后台任务系统。

### 8.4 Bunny JSON 并发

工作流和 Agent Run 使用 Bunny JSON 时，应用进程内锁不能解决多实例同时写入的全部竞争问题。高并发或多 worker 场景应迁移到 Postgres 乐观锁或队列支持的事件存储。

### 8.5 外部供应商变化

模型字段、权限、白名单、时长、比例和价格可能变化。每个 provider 都需要定期真实冒烟测试和错误响应记录，不能只依赖 TypeScript 构建通过。

### 8.6 缺少产品级治理

当前尚未完整实现：

- 用户配额与并发限制。
- 费用预算和付费任务二次确认。
- 管理员后台。
- 操作审计和供应商费用对账。
- 邮箱验证、找回密码和账号冻结。
- 媒体删除、保留期限和用户导出策略。

## 9. 未来优化路线

### P0：生产稳定性

1. 增加真实端到端回归：注册/登录、项目隔离、自动保存、Shift 框选、各核心模型创建与轮询。
2. 把视频、音频、Agent 和 HyperFrames 长任务迁移到持久队列和独立 worker。
3. 为任务创建增加幂等键，避免网络重试产生重复计费任务。
4. 增加按用户和供应商的并发限制、每日额度、超时和取消。
5. 对 TokenStar 音频上传增加 FFmpeg 规范化。
6. 修复全部用户可见中文乱码。
7. 增加 Sentry/结构化日志、任务 ID、provider request ID 和失败原因仪表盘。

### P1：数据与媒体治理

1. 建立统一 media asset 表，记录 workspace、node、provider、task ID、MIME、大小、hash、Bunny key 和生命周期。
2. 相同素材按 hash 去重，避免重复上传和重复创建供应商资产。
3. 增加媒体删除、回收站、保留期限和孤儿文件清理。
4. 将 Agent Run 与高并发工作流状态从 Bunny JSON 迁移到 Postgres。
5. 增加版本历史、手动保存点和可视化冲突恢复。

### P1：Agent 架构

1. 建立 30–50 个真实 Agent Eval，用于规划正确性、节点连接和修复能力回归。
2. 拆分体积较大的 Agent Router，用独立 use case 管理路由、计划、校验、工具和观察。
3. 保留 Mindverse 的确定性能力校验和 Canvas Compiler。
4. 增加统一 `AgentExecutor` 接口。
5. 优先让 Codex 作为 HyperFrames、复杂 FFmpeg、Skill 编写和疑难修复的专项执行器，而不是直接替换整个领域编排层。
6. 增加图片帧、视频内容和音频语义的多模态结果验证。

### P2：用户体验

1. 显示明确的“已保存/保存中/仅本地草稿/保存失败”状态。
2. 增加任务中心，允许离开画布后查看生成状态。
3. 增加模型费用、预计耗时、输入约束和失败前检查。
4. 把临时框选分组升级为可命名、可折叠、可嵌套的持久分组。
5. 增加素材库、搜索、标签和跨项目复用。
6. 增加节点模板、常用工作流市场和更完整的新手引导。

## 10. 发布前检查清单

```text
[ ] npm run lint
[ ] npm run build
[ ] 数据库迁移已在目标环境执行
[ ] Render 环境变量没有缺失或泄露
[ ] 注册、登录、退出正常
[ ] 两个测试账号无法互相访问项目
[ ] 新建、重命名、删除项目正常
[ ] 连续编辑后远程保存 revision 正常
[ ] 刷新页面后画布恢复正常
[ ] 图片、视频、音频上传能得到 Bunny URL
[ ] 至少一个文本、图片、视频和音频任务真实成功
[ ] 异步任务刷新页面后能继续观察状态
[ ] 供应商失败信息不会包含 API Key
[ ] 未创建不必要的付费测试任务
```

## 11. 常用命令

```powershell
npm run dev
npm run lint
npm run build
npm run db:migrate
npm run workspace:migrate-legacy
npm run rag:migrate
npm run hyperframes:doctor
```

## 12. 交接原则

- 不要把 API Key、数据库密码、Bunny Access Key、Auth Secret 或 Codex 凭据提交到 Git。
- 修改 provider 前先保存原始任务 ID、HTTP 状态、request ID 和不含秘密的错误正文。
- 新模型必须同时声明输入端口、数量限制、时长/比例约束、服务端校验和轮询方式。
- 外部接口示例中的字段和值不能默认等于完整能力范围；需要以明确文档或真实测试确认。
- 任何可能计费的自动化测试都应有显式开关和预算上限。
- 数据库迁移应保持幂等；旧数据迁移脚本必须可审计且避免破坏原始备份。
