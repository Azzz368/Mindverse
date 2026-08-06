# Mindverse 项目现状与工作区迁移交接

> 更新日期：2026-08-05
> 项目目录：`D:\HKGAI\V2-map\Mindverse`
> Git 远端：`https://github.com/Azzz368/Mindverse.git`
> 当前分支：`agent-improve`
> 当前基线提交：`13c890746deefbc26ed549cb83a25bcba54c68a2`（`improve VideoNode media references`）
> 当前产品阶段：内部测试；当前开发重点是 Agent 使用体验和执行可靠性，不以公众开放为近期目标
> 本文依据当前代码、Git 历史、现有文档、TypeScript 检查和生产构建整理；外部 AI/Bunny/Postgres 服务未做真实付费调用。

## 1. 一句话定位

Mindverse（README 中仍使用 Lumen Flow 名称）是一个基于 Next.js App Router、React Flow 和 Zustand 的 AI 创作无限画布。用户可以把文本、剧本、分镜、图像、视频、音频、声音克隆、FFmpeg 剪辑和 HyperFrames 动效组织成有向工作流，也可以让 Agent 通过能力检索、计划校验和自主执行来创建或修改工作流。

项目已经达到“可构建、核心链路齐全、适合继续迭代”的阶段。当前是可信内部测试环境，近期主线应放在 Agent 的意图准确率、计划质量、编辑语义、审批后执行、恢复幂等和调试评测闭环。正式鉴权、后台任务系统、并发一致性和公网安全仍需保留在上线前清单中，但不必先于本阶段的 Agent 优化。

Agent 专项架构分析和建议见 `AGENT_ARCHITECTURE_OPTIMIZATION.md`。

## 2. 当前工作区状态

### 2.1 已验证

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `npm.cmd run lint` | 通过 | 脚本实际执行 `tsc --noEmit`，不是 ESLint |
| `npm.cmd run build` | 通过 | Next.js 15.5.19 成功构建，静态页面生成阶段完成 33/33 |
| TypeScript | `strict: true` | 同时启用了 `skipLibCheck: true` |
| 本地 Node | `v24.14.1` | Docker 生产镜像使用 Node 22，迁移后应优先用 Node 22 再复验 |
| npm | `11.11.0` | 使用 `package-lock.json` 和 `npm ci` 可复现依赖 |
| 自动化测试 | 未配置 | 仓库内没有单元、集成或 E2E 测试文件和 test 脚本 |

### 2.2 未提交改动

当前 `git status` 标记以下文件为修改状态，切换工作区前必须保留：

- `features/agent/components/AgentWorkflowPanel.tsx`：Agent 面板 UI 调整，包括移除引导建议/项目记忆卡片、Agent Run 详情折叠、清空记忆入口和发送按钮样式。
- `shared/skills/skillTemplate.ts`：Git 标记为修改；当前普通文本 diff 未显示内容差异，可能只是行尾或索引状态，迁移前仍应重新确认。

不要使用 `git reset --hard` 或覆盖式 checkout。本轮只新增/更新交接分析 Markdown，不修改上述业务文件。

### 2.3 本机忽略目录

| 路径 | 当前大小 | 是否应迁移 |
| --- | ---: | --- |
| `.mindverse/` | 约 391 MiB | 通常不迁移；主要是 Codex/HyperFrames 作业和诊断文件 |
| `.mindverse-local/` | 极小 | 当前只有空工作流索引，没有实际本地工作流 |
| `.next/` | 约 197 MiB | 不迁移，重新构建 |
| `node_modules/` | 约 1.5 GiB | 不迁移，运行 `npm ci` |
| `.env.local` | 已存在 | 不提交、不放入交接文档；在新环境通过安全渠道重建 |

`.mindverse/codex-home-letaicode` 可能包含本地 Codex 状态或凭据，严禁复制进仓库、压缩包或公共存储。新工作区应重新登录，或通过 Render Secret File 配置 `MINDVERSE_CODEX_AUTH_FILE`。

## 3. 技术栈与目录边界

| 层 | 主要技术/目录 | 职责 |
| --- | --- | --- |
| Web | Next.js 15 App Router、React 19、Tailwind 3 | 页面、API Route、SSR/构建 |
| 画布 | `@xyflow/react`、Zustand | 节点、边、选择、运行状态、撤销、布局 |
| 前端功能 | `features/*` | Canvas、Agent、Workspace、Skill UI 和 client service |
| 共享契约 | `shared/*`、`types/*` | API 类型、节点类型、Agent schema、纯函数 |
| 服务端 | `server/*` | AI provider、Agent、RAG、存储、FFmpeg、HyperFrames、Qwen |
| 持久化 | Bunny Storage、本地 JSON、Render Postgres + pgvector | 工作流、Skill、媒体、Agent Run、RAG 文档 |
| 媒体运行时 | FFmpeg/ffprobe、HyperFrames、GSAP、Chromium Headless Shell、Codex CLI | 视频剪辑、动效工程生成和渲染 |
| 部署 | Docker / Render | Node 22、FFmpeg、Chromium、CJK 字体、Codex secret 注入 |

当前目录分层已经比旧版清晰，但 `canvasStore.ts`、`AgentWorkflowPanel.tsx`、`AnnotatedCustomNode.tsx`、`agent-router/route.ts` 和 `motionCompositionRunner.ts` 仍然过大，是后续拆分重点。

## 4. 页面与 API 入口

### 4.1 页面

- `/`：入口页。
- `/workspace`：访问码验证和工作流仪表盘。
- `/workspace/[workflowId]`：远程持久化工作流画布。
- `/workspace/local`：仅浏览器/本机画布。
- `/skills`、`/skills/new`、`/skills/[skillId]`：Skill 列表、创建和编辑。

### 4.2 API 分类

| 分类 | 入口 | 用途 |
| --- | --- | --- |
| 节点执行 | `/api/ai/run-node`、`/api/ai/poll-task` | 统一运行节点和轮询异步任务 |
| Agent | `/api/ai/agent-router`、`agent-plan`、`agent-edit`、`agent-organize`、`agent-dialogue`、`agent-observe` | 路由、规划、编辑、整理、对话、观察修复 |
| Agent Run | `/api/ai/agent-runs*` | checkpoint、取消、恢复、worker claim/lease |
| 图像/模型 | `/api/ai/edit-image`、`/api/ai/list-models` | 图像修订、供应商模型列表 |
| 工作流 | `/api/workflows*` | 工作流 CRUD 和快照保存 |
| Skill | `/api/skills*` | Skill CRUD、模板保存和 RAG 索引 |
| 媒体归档 | `/api/storage/archive` | 上传文件或归档远程 URL 到 Bunny |
| Qwen | `/api/qwen/voices*`、`/api/qwen/tts` | 声音克隆管理和 TTS |
| TokenStar | `/api/video/tokenstar/*` | 资产组、资产上传、视频创建与轮询 |
| Kling | `/api/video/kling/element` | Kling 元素/参考主体能力 |

## 5. 核心 Pipeline

### 5.1 工作流加载与保存

```text
/workspace
  -> 输入访问码并读取工作流索引
  -> 创建/打开 workflowId
  -> Workspace 从 Bunny 或本地 JSON 加载快照
  -> 与 localStorage 恢复草稿比较 updatedAt
  -> 选择较新的可恢复版本并写入 Zustand
  -> 节点/边/项目记忆变动
  -> 300 ms 防抖生成持久化快照
  -> 去除 data URI、压缩大型 provider 字段
  -> 保存本地恢复草稿 + PUT /api/workflows/[workflowId]
  -> Bunny/local JSON
  -> 成功工作流和项目记忆以 best-effort 方式进入 RAG
```

页面隐藏、离开和组件卸载时会尝试 flush 最新快照。无 `workflowId` 的 `/workspace/local` 使用 `lumen-flow-canvas-v1` 保存在浏览器 localStorage。

### 5.2 节点执行

```text
画布节点 + 上游边
  -> nodeInputCompiler 汇总 prompt、文本和媒体引用
  -> canvasStore.runNode
  -> POST /api/ai/run-node
  -> runNodeUseCase 按 nodeType/provider 分派
  -> 外部模型、FFmpeg、Qwen 或 Motion job
  -> archiveResultMedia 尝试归档到 Bunny
  -> 同步结果直接完成，异步结果返回 taskId
  -> canvasStore.pollNode -> POST /api/ai/poll-task
  -> 供应商轮询 + 比例验证 + 媒体归档
  -> 标记 success/error，保存 output 和历史
  -> Workspace 自动保存
```

`runWorkflow()` 会先拓扑排序再顺序执行；检测到环会拒绝运行。刷新页面后，`PendingTaskRecovery` 会恢复仍处于 pending/running 的任务轮询。

### 5.3 Agent 规划与自主执行

```text
AgentWorkflowPanel
  -> POST /api/ai/agent-router（附画布摘要、选中节点、对话、项目记忆、Skill）
  -> 语义 Router LLM；失败时使用启发式 fallback
  -> Capability Retriever
       -> 确定性能力目录
       -> 可选 Postgres vector + full-text 混合检索
       -> Skill / Tool / Model / Runtime evidence bundle
  -> Requirement LLM 检查阻塞信息
  -> Planner 只能引用检索返回的 capability/evidence ID
  -> 确定性 graph/capability validator
  -> 最多一次计划修复
  -> Canvas compiler 生成 CanvasPatch / CanvasEditPatch
  -> 有费用/审批要求：只展示 preview，等待用户应用
  -> 无审批且开启自主模式：浏览器 runAutonomousAgent
  -> 拓扑运行受影响节点
  -> agent-observe + ffprobe 检查状态、比例、时长、Codex 结果
  -> 最多 2 次 repair patch
  -> AgentRun checkpoint 持久化，可取消和恢复
```

重要边界：自主节点执行目前仍由浏览器和 Zustand 驱动。服务端虽已有 run record、claim 和 lease API，但没有真正的后台 Worker 进程。

### 5.4 Motion / Codex + HyperFrames

```text
MotionNode
  -> enqueueMotionJob
  -> 本地或 Bunny 保存 job JSON
  -> 当前 Next.js 进程内的串行 Promise 队列
  -> 下载并本地化素材
  -> Codex CLI 生成/修改 HyperFrames composition
  -> 禁止远程脚本和 CDN 依赖
  -> HyperFrames 检查与 Chromium 渲染
  -> FFmpeg/音轨处理
  -> 上传 Bunny
  -> /api/ai/poll-task 返回进度和结果
```

进程重启时排队或执行中的 Motion job 不会被另一个 worker 自动接管；超时后会被标记失败并要求重新运行。

### 5.5 媒体和知识存储

- 媒体：供应商 HTTPS/data URL -> 服务端下载/解码 -> Bunny -> CDN URL 回写节点。
- 工作流：Bunny JSON；开发模式可回退 `.mindverse-local`。
- Skill：Bunny/local JSON；包含 `SKILL.md`、角色、触发语、prompt profile 和可选画布模板。
- Agent Run：本地原子 JSON或 Bunny JSON；过滤 data URI，单记录上限约 5 MB。
- RAG：Postgres + pgvector，可选 HNSW；能力、项目记忆、修复记录、成功工作流、Skill 和 prompt profile 都可索引。

## 6. 已完成功能

这里的“完成”表示代码链路已实现并通过当前类型检查/构建，不表示所有第三方供应商已用真实 Key 做过端到端验收。

### 6.1 画布和交互

- 14 种节点：Prompt、Text、Script、Storyboard、Storyboard Image、Image、Video、Video Edit、Motion、Audio、Voice Clone、Voice TTS、Reference、Output。
- React Flow 节点/边编辑、专用连接 handle、视频多媒体输入端口和循环检测。
- 节点添加、复制、删除、锁定、选择、多选、分组、工作流编号、自动整理和模板画廊。
- 单步撤销、画布 JSON 导入/导出、本地保存/读取。
- 从剪贴板粘贴图片、视频、音频或远程图片 URL，并在进入画布前归档媒体。
- 图像生成历史画廊、活动版本切换。
- Storyboard 成功后自动物化文本、剧本和分镜图分支。
- 图片标注（箭头、矩形、圆形、文字）和非破坏式 revision 节点。

### 6.2 AI 与媒体能力

- HKGAI MaaS：文本、剧本、分镜、Agent LLM 的 OpenAI-compatible 路径。
- 302.AI：文本、GPT Image/Gemini 图像、图像编辑、通用视频、音频和任务轮询。
- TokenStar：GPT Image、Seedance 文生视频、Seedance asset-video、Kling v3 text/image/omni、素材组与素材上传。
- Kling 官方：图片到视频。
- 302 Sora-2：图片到视频。
- QwenCloud/DashScope：声音克隆、声音列表/删除和克隆声音 TTS；包含用户授权确认。
- FFmpeg：多视频/音频输入、裁剪/拼接、音量、淡入淡出、简单转场、比例/分辨率/FPS。
- HyperFrames：模板模式和 Codex 生成模式、GSAP、本地 Chromium 渲染、音轨保留、进度轮询。
- 视频输入源比例检查和生成结果比例验证。

### 6.3 Agent 与 Skill

- 统一 Agent 路由：dialogue、create、edit、organize、tool、skill。
- 缺失需求澄清、多轮 pending request 和项目记忆。
- Google/Bing（SerpAPI）、Google CSE、Wikimedia 图片搜索及来源信息保留。
- 可执行能力目录、结构化约束、evidence ID、provider capability ID 和确定性校验。
- Postgres hybrid retrieval、RRF、词法 rerank、可选 LLM rerank 和 catalog fallback。
- 自主执行、观察、失败跳过、repair patch、取消、checkpoint 和浏览器恢复。
- Skill Library CRUD、`SKILL.md` 校验、画布模板、模板 ID 重映射、Skill RAG 索引。
- Prompt profile Skill 解析、检索和视觉节点 prompt composer。

### 6.4 持久化与部署

- 工作流 dashboard、远程 CRUD、Bunny 持久化、本地恢复草稿、pagehide flush。
- 大画布快照去 data URI 和 provider 大字段压缩，3 MB 请求限制可配置。
- 旧内联媒体迁移脚本：`npm run workflow:migrate-inline-media -- <workflow-id>`。
- Bunny 媒体归档和 CDN URL 分发。
- Render Postgres RAG migration 和可选 HNSW migration。
- Docker 生产镜像包含 Node 22、FFmpeg、Chromium Headless Shell、CJK 字体、Codex CLI 和 secret-file entrypoint。

## 7. 需要修复的问题

本节保留完整技术债。P0 表示“对公众上线前必须解决”，不代表当前内部测试阶段应先于 Agent 优化实施；内部阶段的实际顺序以第 8 节和 `AGENT_ARCHITECTURE_OPTIMIZATION.md` 为准。

### P0：上线前必须解决

1. **没有正式鉴权和租户隔离。** `server/storage/workflowStorage.ts` 将访问码硬编码为 `666666`，Skill/RAG 也复用该账号；访问码存放于 localStorage，并在部分 GET/DELETE URL query 中传输。任何知道代码的人都能访问同一数据空间。应改为正式身份系统、服务端 session、tenant/user ID 和逐资源授权。

2. **付费 AI/API 路由没有统一鉴权、限流和配额。** 除 worker claim/lease 外，大多数 `/api/ai/*`、归档、Qwen 和视频端点可被直接调用，存在密钥额度被滥用和成本失控风险。应加入 middleware/API gateway、用户配额、并发限制、幂等键和审计日志。

3. **服务端远程媒体下载存在 SSRF 和资源耗尽面。** `/api/storage/archive` 接受用户提供的任意 HTTPS URL并跟随重定向；多个 provider/ffmpeg/probe 路径也会服务端 fetch。需要阻止私网、回环、metadata IP、DNS rebinding 和不安全重定向，并对远程内容设置 Content-Length、流式硬上限、MIME 嗅探和解压/解析限制。

4. **TokenStar asset-video 尚未完成真实契约验收。** 旧 `TOKENSTAR_ASSET_VIDEO_HANDOFF.md` 明确记录过 `material group id is required`。当前代码已增强 GroupId 解析、ListAssets、OSS 等待和重试，但仓库没有真实成功样例或自动回归，不能宣称链路稳定。需用测试账号保存脱敏的 CreateAssetGroup/ListAssets/CreateAsset/video create 契约 fixture，并完成一次 image -> asset -> video -> poll -> Bunny 的 E2E。

5. **后台执行还未真正后台化。** Agent 自主执行由浏览器完成；Motion 使用单个 Web 进程内串行队列。刷新、关闭浏览器、部署或进程崩溃都会影响执行。应实现独立 worker + durable queue，把节点执行和 provider polling 提取为幂等 server activity。

### P1：近期应修复

1. **Mock 模式与 README 声明不一致。** README 说 `AI_PROVIDER=mock` 时全部节点可无 Key 运行，但 `getTextAIProvider()` 始终返回真实 provider，`AI_TEXT_PROVIDER` 默认又落到 HKGAI；复制当前 `.env.example` 还会把图片 provider 指向 302.AI。需要让 text/image/storyboard 明确遵守 mock 配置，或修正文档和 UI。

2. **没有自动化测试。** 当前“lint”只是 TypeScript。至少应补：纯函数单测、provider 响应 fixture、API Route 集成测试、持久化并发测试、Agent plan/patch golden test、Playwright 画布 E2E、Docker smoke test。

3. **Bunny JSON 并发一致性不足。** 工作流/Skill 的对象和 index 是分步读改写，没有事务、revision compare-and-swap 或跨进程锁；多标签页/多人/多实例可 last-write-wins、丢失索引更新或留下孤立对象。Agent Run 的锁也只在单进程内有效。正式协作前迁移 Postgres 或加入版本号和条件写。

4. **媒体归档超时会留下弱一致状态。** 非 data URL 默认只等待约 8 秒；超时后节点继续使用第三方临时 URL，而后台上传 Promise 即使成功也不会把 CDN URL写回节点，可能产生 Bunny 孤儿文件。应改为持久归档 job、回调/轮询状态和引用计数清理。

5. **Agent/Media 记录缺少统一生命周期管理。** `.mindverse` 作业、Bunny 媒体、Motion job、Agent Run 和 RAG 文档没有完整 TTL、引用计数、垃圾回收和管理 UI。长时间运行会持续占空间。

6. **外部 provider 健康度不可见。** 缺少启动期配置校验、provider health page、余额/限流提示、契约版本监控和生产 synthetic test。现在主要依赖用户运行节点后看错误。

7. **状态恢复仍有浏览器耦合。** localStorage 草稿、Agent last run ID、pending task timer 和 Zustand 执行状态分散；跨设备迁移无法恢复浏览器本地画布/对话上下文。

### P2：工程质量与体验优化

1. 拆分 `CanvasNodeData` 大型可选字段联合，改为按 nodeType 的 discriminated union，并对 API 入参使用运行时 schema（如 Zod）。
2. 拆分大文件：`AnnotatedCustomNode.tsx`、`AgentWorkflowPanel.tsx`、`canvasStore.ts`、`agent-router/route.ts`、`motionCompositionRunner.ts`。
3. 将 Zustand store 拆为 node/edge/execution/agent/persistence slices，轮询和 autosave 改为可测试 service/hook。
4. 增加真正的 ESLint/format/check 脚本、pre-commit 和 CI；`lint` 命名应与实际行为一致。
5. 统一项目命名：目录叫 Mindverse、README 标题叫 Lumen Flow、package 名叫 `unlimited-map`，旧文档还引用 `Unlimited_Map` 和过期分支。
6. 统一中英文错误、API 状态码、错误 code 和客户端提示；避免 route 各自拼装不同 error shape。
7. 增加结构化日志、request/run/task correlation ID、OpenTelemetry、指标和告警，避免只靠 `console.warn/error`。
8. 优化首屏和大画布性能：节点组件拆包、selector 精细订阅、虚拟化/LOD、历史输出缩略图懒加载、避免大型 raw provider 数据留在前端状态。
9. 增加 workflow schema migration/version upgrade，而不是只检查 `version: 1` 和 nodes/edges 数组。
10. 统一清理旧 API：`/api/ai`、专用 TokenStar route 和统一 `/api/ai/run-node` 有一定功能重叠，应定义公共/内部接口边界。

## 8. 建议的实施顺序

### 里程碑 A：Agent Eval 和调试基线

- 建立 30-50 条固定 Agent 测试场景，覆盖 dialogue/create/edit/organize/tool/clarify/approval/resume/repair。
- 保存输入画布 fixture、期望 route/target/capability/graph shape 和禁止操作。
- Run trace 补充模型、耗时、token、retrieval 候选、validator 修正和 Patch 摘要。
- 增加内部 Debug Drawer 和正确/部分正确/错误评分。
- 修复 mock 模式，建立无外部 Key 的确定性回归入口。

### 里程碑 B：Agent 核心闭环

- 统一 `/agent-router` 与旧 plan/edit/organize/dialogue 入口，收敛为一个 orchestrator。
- 将 edit 明确拆成 in-place、revision、expand 三种模式。
- 将“仅应用到画布”和“批准并运行”分开，使付费步骤审批后能继续同一个自主 Run。
- 区分 plan ready、patch applied 和 deliverable completed。
- 修复 resume 重复应用 Patch，保存 step -> node ID、canvas revision 和 execution idempotency key。
- 最近 Agent Run 和对话按 workflowId 隔离。

### 里程碑 C：Agent 质量、延迟和执行可靠性

- Router/Requirement 条件调用，RAG 预热，编辑任务只摘要选中节点和邻居。
- 项目记忆增加可见、可编辑的角色/场景/风格抽取。
- success criteria 结构化，并接入 FFprobe、抽帧、OCR/ASR 和多模态验证。
- Repair 统一使用 capability/evidence/validator 协议。
- 统一 polling deadline、attempt、backoff、取消和超时状态。
- 先抽象 ExecutionAdapter，再按内部测试结果决定何时迁移独立 Worker。

### 里程碑 D：公众开放前安全与产品扩展

- 正式登录/session/tenant，移除硬编码访问码，并给付费 API 加鉴权、限流和配额。
- 给远程媒体下载加 SSRF 防护和流式大小上限。
- Postgres 保存协作 metadata，建立 durable queue、worker 和媒体生命周期管理。
- 多用户项目、邀请、角色权限、评论、版本历史、差异比较和恢复。
- 素材库、标签/搜索、版权/授权字段、跨项目复用和用量统计。
- 真正的视频时间线、关键帧、字幕、配音轨、批量变体和渲染预设。
- RAG 管理台、重建索引、检索评估集、命中解释和知识失效策略。

## 9. 更换工作区操作清单

### 9.1 旧工作区先做

1. 运行 `git status --short --branch`，确认上述未提交文件以及两份交接分析文档。
2. 将业务改动提交到临时分支或生成 patch；不要只复制整个目录后覆盖新仓库。
3. 确认远程 Bunny/Postgres 数据是否继续使用同一套服务。
4. 如果需要迁移 `/workspace/local`，在 UI 中导出 Canvas JSON；Git 不会带走浏览器 localStorage。
5. 如需保留未保存的远程工作流草稿，先等待 autosave 成功或手动导出 JSON。
6. 安全记录新环境需要的变量名，但不要把 Key 写入 Markdown、Git commit 或聊天记录。

### 9.2 新工作区恢复

```powershell
git clone https://github.com/Azzz368/Mindverse.git
cd Mindverse
git checkout agent-improve
npm ci
Copy-Item .env.example .env.local
# 仅在本机安全地填写 .env.local；不要提交
npm run lint
npm run build
npm run dev
```

Windows PowerShell 如果因为执行策略拒绝 `npm.ps1`，使用 `npm.cmd run lint`、`npm.cmd run build` 和 `npm.cmd run dev`。

生产一致性建议使用 Node 22；本次虽然在 Node 24.14.1 构建通过，仍应在 Node 22 或 Docker 中再跑一遍。

### 9.3 环境变量按能力恢复

| 能力 | 关键变量 |
| --- | --- |
| 302.AI | `AI_302_API_KEY`、`AI_302_*` |
| HKGAI MaaS | `HKGAI_MAAS_API_KEY`、`HKGAI_MAAS_BASE_URL`、`HKGAI_*_MODEL` |
| TokenStar | `TOKENSTAR_API_KEY`、`TOKENSTAR_*` |
| Kling 官方 | `KLING_API_KEY`、`KLING_*` |
| Qwen 声音 | `DASHSCOPE_API_KEY`、`QWEN_*` |
| 图片搜索 | `SERPAPI_API_KEY` 或 Google CSE 变量 |
| Bunny | `BUNNY_STORAGE_ZONE`、`BUNNY_ACCESS_KEY`、`BUNNY_PULL_ZONE_URL` |
| 工作流/Skill | `WORKFLOW_STORAGE_PROVIDER`、可选 `SKILL_STORAGE_PROVIDER` |
| Agent Run | `AGENT_RUN_STORAGE_PROVIDER`、`AGENT_WORKER_TOKEN` |
| RAG | `DATABASE_URL`、`RAG_EMBEDDING_*`、可选 rerank |
| Codex/HyperFrames | `MINDVERSE_CODEX_HOME` 或 `MINDVERSE_CODEX_AUTH_FILE`、`MINDVERSE_CODEX_*` |
| Motion job | `MINDVERSE_MOTION_JOB_STORAGE_PROVIDER`、相关 root/stale/timeout 变量 |

如果复用相同 Bunny 和 Postgres，远程工作流、Skill、媒体和 RAG 不需要复制文件；只需安全恢复相同凭据。若更换后端账号，需要单独设计数据导出/导入，当前仓库没有完整的一键迁移器。

### 9.4 不会随 Git 迁移的数据

- `.env.local` 和所有服务密钥。
- 浏览器 localStorage：本地画布、远程草稿、访问码、最近 Agent Run ID。
- 浏览器 sessionStorage：待放置 Skill 和新 Skill 的临时画布模板。
- `.mindverse/` 下的 HyperFrames job、诊断文件和 Codex 本地状态。
- `.mindverse-local/` 下的本地工作流/Skill（当前工作区基本为空）。
- 外部 Bunny、Postgres 和供应商账户中的数据。

## 10. 迁移后 Smoke Test

按以下顺序验证，能快速定位是基础环境、存储还是 provider 问题：

1. 打开 `/workspace`，验证工作流列表读取、创建、改名、删除。
2. 打开一个 workflow，添加两个简单节点，刷新页面确认远程 autosave 恢复。
3. 在 mock 配置下运行 Text/Image；如果仍要求 HKGAI/302 Key，命中本文 P1 的 mock 配置问题。
4. 导入本地图片，确认归档后节点保存的是 Bunny HTTPS URL，而不是 data/blob URL。
5. 创建一个 Text -> Image -> Video 流程，检查 handle、拓扑执行和异步轮询。
6. 运行一次 Agent create，检查 route、evidence、preview、apply 和 Agent Run checkpoint。
7. 配置 Postgres 后运行 `npm run rag:migrate`，验证 Agent trace 的 retrieval mode 是 `postgres-hybrid`；未配置时应回退 `catalog`。
8. 运行一个小型 FFmpeg Video Edit。
9. 在具备 Codex/Chromium/Bunny 的环境中运行最小 Motion job，检查进度、渲染和上传。
10. 最后才用测试额度验证 TokenStar asset-video、Kling、Sora、Qwen 等真实外部链路。

## 11. 关键文件索引

| 主题 | 文件 |
| --- | --- |
| 画布状态/执行 | `features/canvas/state/canvasStore.ts` |
| 节点输入编译 | `features/canvas/domain/nodeInputCompiler.ts` |
| 画布页面/持久化 | `features/canvas/components/Workspace.tsx` |
| 节点 UI | `features/canvas/components/AnnotatedCustomNode.tsx` |
| 共享节点 schema | `shared/canvas/nodeData.ts`、`shared/canvas/nodeTypes.ts` |
| 统一执行 use case | `server/ai/application/runNodeUseCase.ts` |
| 统一轮询 use case | `server/ai/application/pollTaskUseCase.ts` |
| Provider 选择 | `server/ai/provider.ts`、`server/ai/textLLMClient.ts` |
| Agent UI/自主循环 | `features/agent/components/AgentWorkflowPanel.tsx`、`features/agent/services/autonomousAgent.ts` |
| Agent Router | `app/api/ai/agent-router/route.ts` |
| 能力检索/校验 | `server/agent/capabilities/*` |
| Agent Run | `server/storage/agentRunStorage.ts`、`docs/AGENT_RUNTIME.md` |
| RAG | `server/rag/*`、`server/db/migrations/*`、`docs/CAPABILITY_RAG.md` |
| 工作流/Skill 存储 | `server/storage/workflowStorage.ts`、`server/storage/skillStorage.ts` |
| 媒体归档 | `server/storage/mediaArchive.ts`、`server/storage/bunnyClient.ts` |
| TokenStar | `server/ai/tokenstar/*`、`TOKENSTAR_ASSET_VIDEO_HANDOFF.md` |
| FFmpeg | `server/video/ffmpegEditRunner.ts` |
| Motion | `server/motion/*`、`shared/motion/*` |
| 环境变量 | `.env.example` |
| Docker | `Dockerfile`、`docker-entrypoint.sh`、`docker/codex/config.toml` |

## 12. 现有文档使用建议

- `README.md`：保留安装和 provider 配置入口，但 mock 声明、旧 `lib/ai` 路径等内容需要更新。
- `docs/AGENT_RUNTIME.md`：Agent checkpoint 和未来 worker 边界仍有参考价值。
- `docs/CAPABILITY_RAG.md`：RAG schema、ingestion 和 retrieval 设计较新，可继续使用。
- `AGENT_ARCHITECTURE_OPTIMIZATION.md`：当前内部测试阶段的主开发路线，Agent 相关决策优先参考此文档。
- `TOKENSTAR_ASSET_VIDEO_HANDOFF.md`：只作为历史故障记录。它仍写着旧目录、旧分支和旧构建结论，不可当作当前项目总状态。
- `PROJECT_ARCHITECTURE_STANDARDIZATION_GUIDE.md`、`BACKEND_STORAGE_DISTRIBUTION.md`：部分建议已经落地，部分路径和现状过时；后续应标注 archived 或重写，避免与本文冲突。

## 13. 接手者的最短结论

当前代码可以通过类型检查和生产构建，主要创作、Agent、媒体和存储 pipeline 都已存在。内部测试阶段不要重写整套 Agent，应优先建立 Eval/Trace，统一入口，修复 edit 语义、审批继续执行和 resume 幂等，再优化记忆、检索、验证和 Worker 边界。公众鉴权、限流和 SSRF 等事项继续保留为上线前要求。迁移工作区时最容易丢的是未提交 UI 改动、浏览器本地草稿和密钥配置；最不应该复制的是 `node_modules`、`.next`、`.mindverse` 中的生成缓存与 Codex 凭据。
