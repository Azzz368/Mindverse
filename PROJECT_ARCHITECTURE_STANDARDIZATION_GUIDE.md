# 无限画布平台工程化结构整理指导

本文档基于当前项目结构与关键文件阅读整理，目标是在不改动现有业务代码的前提下，为后续重构提供一份可执行的架构指导。建议仍保持 TypeScript + Next.js App Router + React + Zustand 的技术栈，不做语言和框架大迁移。

## 1. 当前项目简要画像

当前项目是一个 AI 创作无限画布平台，核心能力包括：

- 画布节点编排：Prompt、Text、Script、Storyboard、Image、Video、Audio、Reference、Output 等节点。
- 节点运行：前端画布组装节点输入，通过 `/api/ai/run-node` 调用服务端 AI provider。
- 异步任务轮询：通过 `/api/ai/poll-task` 查询 image/video/audio 任务状态。
- Agent 规划与编辑：`/api/ai/agent-plan`、`/api/ai/agent-edit`、`/api/ai/agent-organize`、`/api/ai/agent-dialogue`。
- 工作流存储：`/api/workflows` 与 `/api/workflows/[workflowId]`，后端使用 Bunny 存储 JSON。
- 媒体归档：`/api/storage/archive` 与 `lib/storage/mediaArchive.ts`。
- 多供应商 AI 适配：302.AI、Kling、TokenStar、Sora2、Mock provider。

已有结构的优点：

- `app/api/*` 与 `lib/ai/*` 已经把服务端密钥和 provider 逻辑留在 server side。
- `types/canvas.ts` 已集中定义画布节点和快照类型。
- `components/ui/*` 已有基础 UI 组件目录。
- `lib/workflow/*`、`lib/agent/*`、`lib/storage/*` 已初步按能力拆分。

主要工程化问题：

- 前端组件和 store 直接散落调用 `/api/*` 字符串，payload 类型在调用处临时定义，接口契约不集中。
- `store/canvasStore.ts` 同时承担画布状态、节点输入编译、远程请求、轮询、Agent patch、导入导出、布局整理等职责，文件过大且业务边界不清。
- `app/api/ai/run-node/route.ts` 聚合了过多 provider 分支，后续新增视频/图像供应商时容易继续膨胀。
- `types/canvas.ts` 把所有节点字段压在一个 `CanvasNodeData` 上，节点类型越多，字段越难维护。
- 前端 UI、领域逻辑、API 契约、后端 provider adapter 的层次尚未完全分离。

## 2. 本次整理的核心目标

工程化标准化的重点不是简单移动文件，而是建立稳定边界：

1. 前端改 UI 时，不需要了解服务端 provider 细节。
2. API route 改实现时，不影响组件层和画布交互层。
3. 新增节点类型、新增 AI provider、新增存储方式时，有明确落点。
4. 类型、契约、服务调用、领域规则分层清晰。
5. 保留 TypeScript，不引入大规模技术迁移。

建议采用的原则：

- `app/` 只保留路由入口和页面壳，不承载复杂业务逻辑。
- `features/` 承载前端功能模块，包括组件、hooks、client service、局部 store slice。
- `server/` 或 `lib/server/` 承载服务端 use case、provider adapter、存储 repository。
- `shared/` 承载前后端都可引用的类型、API 契约、纯函数。
- `types/` 可以保留，但建议逐步迁入 `shared/types` 或按领域拆分。

## 3. 推荐目标目录结构

建议最终演进为如下结构：

```text
app/
  layout.tsx
  page.tsx
  workspace/
    page.tsx
    [workflowId]/
      page.tsx
  api/
    ai/
      run-node/route.ts
      poll-task/route.ts
      agent-plan/route.ts
      agent-edit/route.ts
      agent-organize/route.ts
      agent-dialogue/route.ts
      list-models/route.ts
      edit-image/route.ts
    workflows/
      route.ts
      [workflowId]/route.ts
    storage/
      archive/route.ts
    video/
      tokenstar/...
      kling/...

features/
  canvas/
    components/
      Workspace.tsx
      CreativeCanvas.tsx
      CustomNode.tsx
      AnnotatedCustomNode.tsx
      PropertyPanel.tsx
      NodeToolbar.tsx
      AddNodeMenu.tsx
      BottomRunBar.tsx
      TopBar.tsx
      TemplateGallery.tsx
      ImageAnnotationEditor.tsx
      ImageAnnotationModal.tsx
    hooks/
      usePendingTaskRecovery.ts
      useCanvasAutosave.ts
      useCanvasHotkeys.ts
    state/
      canvasStore.ts
      canvasActions.ts
      canvasSelectors.ts
    services/
      canvasClient.ts
      nodeExecutionClient.ts
      mediaArchiveClient.ts
    domain/
      canvasLayout.ts
      nodeInputCompiler.ts
      nodeOutputNormalizer.ts
      nodeFactory.ts
      workflowGrouping.ts
  workspace/
    components/
      WorkflowDashboard.tsx
    services/
      workflowClient.ts
    types.ts
  agent/
    components/
      AgentWorkflowPanel.tsx
    services/
      agentClient.ts
    domain/
      agentPatch.ts

server/
  ai/
    application/
      runNodeUseCase.ts
      pollTaskUseCase.ts
      editImageUseCase.ts
      listModelsUseCase.ts
    providers/
      index.ts
      mock/
      302ai/
      kling/
      tokenstar/
      sora2/
    contracts/
      provider.ts
      generation.ts
    errors.ts
  agent/
    application/
      planWorkflowUseCase.ts
      editCanvasUseCase.ts
      organizeCanvasUseCase.ts
      dialogueUseCase.ts
    prompts/
    skills/
  storage/
    application/
      archiveMediaUseCase.ts
      workflowUseCases.ts
    repositories/
      bunnyWorkflowRepository.ts
      bunnyMediaRepository.ts
    clients/
      bunnyClient.ts

shared/
  api/
    client.ts
    response.ts
    aiContracts.ts
    workflowContracts.ts
    storageContracts.ts
  canvas/
    nodeTypes.ts
    nodeData.ts
    snapshot.ts
    guards.ts
  workflow/
    graph.ts
    topologicalSort.ts
    detectCycle.ts
  i18n/
    strings.ts
  templates/
    templates.ts

components/
  ui/
    Button.tsx
    Input.tsx
    Select.tsx
    Textarea.tsx
    Badge.tsx
  providers/
    ThemeProvider.tsx
    LangProvider.tsx
  theme/
    ThemeToggle.tsx
```

说明：

- `app/api/*/route.ts` 可以保留现有 URL，不破坏外部调用，但 route 文件内部应只做请求解析、调用 use case、返回 response。
- `features/*` 是前端业务模块。组件之间允许组合，但不要直接引用 `server/*`。
- `server/*` 只能被 route handler 调用，默认包含 `server-only` 依赖。
- `shared/*` 必须保持纯净，不读环境变量，不访问浏览器 API，不访问服务端密钥。
- `components/ui/*` 只放无业务的基础 UI。

## 4. 分层边界设计

### 4.1 前端展示层

职责：

- 页面布局、交互、表单、画布渲染、节点外观。
- 调用 feature service，不直接拼接复杂 API payload。
- 不处理 provider 分支，不读取服务端环境变量。

适合放置：

- `features/canvas/components/*`
- `features/workspace/components/*`
- `features/agent/components/*`

不适合放置：

- AI provider 选择逻辑。
- Bunny 存储路径规则。
- TokenStar/Kling/Sora2 专属字段分支。
- 大段节点运行输入编译逻辑。

### 4.2 前端状态层

职责：

- 保存画布节点、边、选中节点、运行状态、错误信息。
- 暴露稳定 action，例如 `addNode`、`updateNodeData`、`runNode`。
- 只协调前端动作，不直接堆积所有领域算法。

建议把当前 `store/canvasStore.ts` 拆成：

- `canvasStore.ts`：创建 Zustand store，组合 slices。
- `slices/nodeSlice.ts`：节点增删改、复制、选择。
- `slices/edgeSlice.ts`：边增删改、连接。
- `slices/executionSlice.ts`：运行节点、运行工作流、轮询。
- `slices/agentSlice.ts`：Agent 计划、编辑、整理、patch 应用。
- `slices/persistenceSlice.ts`：本地保存、导入导出、远程自动保存触发。
- `selectors.ts`：常用派生数据，例如 selectedNode、upstreamNodes、workflowGroups。

### 4.3 领域逻辑层

职责：

- 不依赖 React，不依赖 fetch，不依赖 window。
- 接收 plain object，返回 plain object。
- 可以被前端 store 和服务端 use case 复用。

建议抽取当前 store 中的纯逻辑：

- `promptFrom`、`contextFrom`、`inputFor` -> `features/canvas/domain/nodeInputCompiler.ts`
- `outputFromProvider`、`makeOutput` -> `features/canvas/domain/nodeOutputNormalizer.ts`
- `arrangeWorkflowNodes`、`connectedComponentsFor` -> `features/canvas/domain/canvasLayout.ts`
- `dedupePatch`、`offsetPatchTo`、`applyEditPatchToState` -> `features/agent/domain/agentPatch.ts`
- `makeNode` 可从 `lib/templates/templates.ts` 逐步迁到 `features/canvas/domain/nodeFactory.ts` 或 `shared/canvas/nodeFactory.ts`

### 4.4 API 契约层

职责：

- 集中定义 request/response 类型。
- 集中定义 API 路径和 client 方法。
- 前端调用 API 时只通过 client，避免组件和 store 散落 fetch 字符串。

建议新增：

```text
shared/api/response.ts
shared/api/aiContracts.ts
shared/api/workflowContracts.ts
shared/api/storageContracts.ts
features/canvas/services/nodeExecutionClient.ts
features/workspace/services/workflowClient.ts
features/agent/services/agentClient.ts
```

统一响应类型示例：

```ts
export type ApiSuccess<T> = { ok: true; output: T; provider?: string; polling?: PollingConfig };
export type ApiFailure = { ok: false; error: { message: string; code?: string; status?: number } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export type PollingConfig = { intervalMs?: number; maxAttempts?: number };
```

前端 client 示例：

```ts
export async function runNode(request: RunNodeRequest): Promise<RunNodeResponse> {
  return postJson("/api/ai/run-node", request);
}
```

这样 `canvasStore` 不再关心 URL、headers、错误 JSON 解析细节。

### 4.5 服务端应用层

职责：

- route handler 只做 HTTP 适配。
- use case 处理业务流程。
- provider adapter 只处理第三方 API 差异。

建议改造 `app/api/ai/run-node/route.ts`：

```text
route.ts
  -> parseRunNodeRequest()
  -> runNodeUseCase(request)
  -> NextResponse.json(result)

server/ai/application/runNodeUseCase.ts
  -> 根据 nodeType / provider 选择 handler
  -> 调用 provider adapter
  -> 调用 archiveMediaUseCase
  -> 返回统一 RunNodeResponse

server/ai/providers/*
  -> 只做第三方平台请求、响应映射和错误转换
```

视频供应商建议拆成策略表，而不是在 route 中累积 if 分支：

```ts
const videoHandlers = {
  kling: runKlingVideo,
  tokenstar: runTokenStarVideo,
  "302-sora2": runSora2Video,
  "302ai": run302Video,
};
```

## 5. 现有目录的建议归属

| 当前路径 | 建议归属 | 说明 |
| --- | --- | --- |
| `components/canvas/*` | `features/canvas/components/*` | 画布功能组件，属于 canvas feature。 |
| `components/workspace/WorkflowDashboard.tsx` | `features/workspace/components/WorkflowDashboard.tsx` | 工作区列表功能。 |
| `components/ThemeProvider.tsx`、`LangProvider.tsx` | `components/providers/*` | 全局 provider。 |
| `components/ThemeToggle.tsx` | `components/theme/ThemeToggle.tsx` | 全局主题控件。 |
| `components/ui/*` | 保持 `components/ui/*` | 无业务基础组件。 |
| `store/canvasStore.ts` | `features/canvas/state/*` | 按 slice 拆分。 |
| `types/canvas.ts` | `shared/canvas/*` | 节点类型、快照、类型守卫分文件。 |
| `lib/ai/*` | `server/ai/providers/*` 与 `server/ai/contracts/*` | provider adapter 与接口类型。 |
| `lib/storage/*` | `server/storage/*` + `features/*/services/*` | server 存储与 browser client 分离。 |
| `lib/workflow/*` | `shared/workflow/*` 或 `server/workflow/*` | 纯图算法可进 shared，服务端 runner 留 server。 |
| `lib/agent/*` | `server/agent/*` + `features/agent/domain/*` | LLM prompt/use case 留 server，patch 纯逻辑可前端复用。 |
| `lib/templates/templates.ts` | `shared/templates/templates.ts` | 模板与节点工厂如果无环境依赖，可共享。 |
| `lib/i18n/strings.ts` | `shared/i18n/strings.ts` | 前端共享文案。 |

## 6. API 边界建议

### 6.1 保持 URL 稳定

建议第一阶段不要改现有 API URL：

- `POST /api/ai/run-node`
- `POST /api/ai/poll-task`
- `POST /api/ai/edit-image`
- `POST /api/ai/agent-plan`
- `POST /api/ai/agent-edit`
- `POST /api/ai/agent-organize`
- `POST /api/ai/agent-dialogue`
- `GET /api/workflows`
- `POST /api/workflows`
- `GET /api/workflows/[workflowId]`
- `PUT /api/workflows/[workflowId]`
- `PATCH /api/workflows/[workflowId]`
- `DELETE /api/workflows/[workflowId]`
- `POST /api/storage/archive`

这样前端迁移到 client 层时，不需要同步改后端路径。

### 6.2 统一响应格式

现有 route 大体已经使用 `{ ok, output, error }`，建议固化为唯一标准：

```ts
type ApiResponse<T> =
  | { ok: true; output: T; provider?: string; polling?: PollingConfig }
  | { ok: false; error: ApiError };
```

前端所有 client 统一处理：

- HTTP 非 2xx。
- `ok: false`。
- error message fallback。
- JSON parse 错误。

### 6.3 请求类型集中化

例如 `RunNodeRequest` 不要在 `canvasStore.ts` 和 route 里各写一份临时类型：

```ts
export type RunNodeRequest = {
  nodeType: "text" | "script" | "image" | "image-revision" | "video" | "audio" | "storyboard";
  input: GenerateTextInput | GenerateImageInput | GenerateVideoInput | GenerateAudioInput | GenerateStoryboardInput;
};
```

如果暂时不引入 Zod 等运行时校验库，也建议至少提供 TypeScript 类型 + 手写 type guard：

```ts
export function isRunNodeRequest(value: unknown): value is RunNodeRequest {
  // route handler 中使用，避免随处写散落校验
}
```

## 7. 画布节点类型建议

当前 `CanvasNodeData` 是一个大对象，所有节点共享大量可选字段。短期可以保留，长期建议逐步演进为 discriminated union：

```ts
type BaseNodeData = {
  title: string;
  status: NodeExecutionStatus;
  output?: NodeOutput;
  error?: string;
  workflowId?: string;
  groupId?: string;
};

type TextNodeData = BaseNodeData & {
  nodeType: "text";
  instruction?: string;
  inputText?: string;
  model?: string;
  temperature?: number;
};

type ImageNodeData = BaseNodeData & {
  nodeType: "image";
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  size?: string;
  referenceImageUrl?: string;
};

export type CanvasNodeData =
  | TextNodeData
  | ImageNodeData
  | VideoNodeData
  | AudioNodeData
  | ScriptNodeData
  | StoryboardNodeData
  | ReferenceNodeData
  | OutputNodeData;
```

好处：

- `PropertyPanel` 能按节点类型拿到更准确字段。
- `nodeInputCompiler` 能减少无效字段。
- 新增节点类型时必须显式定义数据结构。
- 后端 `run-node` 契约更容易对应。

迁移建议：

1. 先拆 `shared/canvas/nodeTypes.ts`、`shared/canvas/snapshot.ts`，不改变类型形状。
2. 再新增各节点 data type，但保留兼容的 `CanvasNodeData` 导出。
3. 最后逐步让 `PropertyPanel`、`nodeInputCompiler` 使用具体节点类型。

## 8. 功能板块边界

### 8.1 Canvas Feature

包含：

- 无限画布渲染。
- 节点增删改查。
- 边连接与工作流拓扑。
- 节点属性面板。
- 画布本地保存、导入导出。
- 运行节点和工作流的前端协调。

不包含：

- 第三方 AI 供应商请求。
- Bunny 存储路径和认证。
- Agent prompt 构造细节。

### 8.2 AI Execution Feature / Server Module

包含：

- 节点运行 use case。
- provider 选择。
- 供应商字段映射。
- 任务轮询。
- 媒体归档。

不包含：

- React 组件。
- Zustand 状态。
- 画布拖拽 UI。

### 8.3 Agent Feature

包含：

- 前端 Agent 面板。
- Agent 对话 client。
- Agent patch 预览、放置、应用。
- 服务端 planner/editor/organizer use case。

建议拆分：

- `features/agent/components`：面板 UI。
- `features/agent/services`：调用 `/api/ai/agent-*`。
- `features/agent/domain`：patch 去重、偏移、应用前验证。
- `server/agent/application`：调用 LLM 和技能编译。

### 8.4 Workspace Feature

包含：

- workflow 列表。
- 创建、重命名、删除。
- 访问码前端缓存。
- 打开远程 workflow。

建议把 `WorkflowDashboard.tsx` 里的 fetch 迁到 `features/workspace/services/workflowClient.ts`。

### 8.5 Storage Module

包含：

- Bunny client。
- workflow repository。
- media archive repository。

建议后续把硬编码访问码、Bunny 路径、存储格式从 route 中进一步集中到 repository/use case。

## 9. 推荐迁移顺序

### 阶段 1：建立契约与 client 层

风险最低，收益最高。

1. 新增 `shared/api/response.ts`。
2. 新增 `shared/api/aiContracts.ts`、`workflowContracts.ts`、`storageContracts.ts`。
3. 新增 `features/canvas/services/nodeExecutionClient.ts`。
4. 新增 `features/workspace/services/workflowClient.ts`。
5. 新增 `features/agent/services/agentClient.ts`。
6. 把组件和 store 中的 `fetch("/api/...`)` 替换为 client 方法。

完成后，前端改 UI 时不会碰 API URL 和响应解析。

### 阶段 2：拆 `canvasStore.ts`

建议每次只拆一类职责，避免大爆炸式重构。

1. 先抽纯函数：`nodeInputCompiler`、`nodeOutputNormalizer`、`canvasLayout`。
2. 再抽 services：运行节点、轮询、Agent 请求。
3. 最后拆 Zustand slices。

完成后，store 应该主要是状态协调，不再是业务逻辑集合体。

### 阶段 3：服务端 route 瘦身

优先处理体积最大、分支最多的 route。

1. `app/api/ai/run-node/route.ts` 调用 `server/ai/application/runNodeUseCase.ts`。
2. `app/api/ai/poll-task/route.ts` 调用 `server/ai/application/pollTaskUseCase.ts`。
3. `app/api/workflows/*` 调用 `server/storage/application/workflowUseCases.ts`。
4. `app/api/storage/archive/route.ts` 调用 `server/storage/application/archiveMediaUseCase.ts`。

完成后，新增 provider 时不再主要修改 route handler。

### 阶段 4：节点类型标准化

1. 拆分 `types/canvas.ts` 到 `shared/canvas/*`。
2. 保留原导出路径一段时间，避免一次性改动全部 import。
3. 逐步引入 discriminated union。
4. 为每类节点建立默认值、字段配置、输入编译器。

### 阶段 5：完善测试和质量门禁

建议保持当前 `npm run lint` 使用 `tsc --noEmit`，再逐步增加：

- 纯函数单元测试：节点输入编译、输出归一化、拓扑排序、布局整理。
- API contract 测试：run-node 请求校验、poll-task 请求校验。
- provider mock 测试：避免真实调用第三方平台。
- workflow 存储测试：保存、读取、重命名、删除。

## 10. 新增功能时的落点规则

### 新增一个节点类型

应修改：

- `shared/canvas/nodeTypes.ts`
- `shared/canvas/nodeData.ts`
- `features/canvas/domain/nodeFactory.ts`
- `features/canvas/domain/nodeInputCompiler.ts`
- `features/canvas/components/PropertyPanel.tsx` 或字段配置文件
- `server/ai/application/runNodeUseCase.ts`，如果它需要远程执行

不应修改：

- 多个组件中散落的 switch。
- route handler 中直接堆新 provider 细节。

### 新增一个 AI provider

应修改：

- `server/ai/providers/<providerName>/*`
- `server/ai/providers/index.ts`
- `server/ai/contracts/provider.ts`，如需要扩展 provider 能力
- 对应 use case 的策略表

不应修改：

- 前端组件。
- `CanvasNodeData` 中大量新增 provider 专属字段，除非该字段确实是用户可配置的节点参数。

### 新增一个工作区功能

应修改：

- `features/workspace/components/*`
- `features/workspace/services/workflowClient.ts`
- `shared/api/workflowContracts.ts`
- `server/storage/application/workflowUseCases.ts`

不应修改：

- canvas store。
- AI provider。

### 新增一个 Agent 能力

应修改：

- `features/agent/components/*`，如果需要 UI。
- `features/agent/services/agentClient.ts`。
- `features/agent/domain/*`，如果涉及 patch 应用。
- `server/agent/application/*`。
- `server/agent/prompts/*` 或 skills。

不应修改：

- AI provider adapter，除非 Agent 需要新模型能力。

## 11. 命名和代码组织规范

建议统一以下命名：

- API client：`xxxClient.ts`，只处理 HTTP。
- 服务端 use case：`xxxUseCase.ts`，处理业务流程。
- 第三方适配器：`xxxProvider.ts` 或 provider 目录下的 `index.ts`。
- 纯领域逻辑：使用业务名，如 `nodeInputCompiler.ts`、`canvasLayout.ts`。
- 类型契约：`xxxContracts.ts`。
- 类型守卫：`guards.ts` 或与 contract 同文件。

Import 方向规则：

```text
app -> features -> shared
app/api -> server -> shared
features -> shared
server -> shared
shared -> 不依赖 features/server/app
```

禁止方向：

```text
features -> server
shared -> features
shared -> server
server -> features/components
```

## 12. 当前最值得优先处理的文件

优先级从高到低：

1. `store/canvasStore.ts`
   - 当前聚合过多职责。
   - 先抽 client 和纯函数，再拆 slice。

2. `app/api/ai/run-node/route.ts`
   - 当前 provider 分支集中在 route。
   - 建议迁到 `server/ai/application/runNodeUseCase.ts` 和 provider strategy。

3. `types/canvas.ts`
   - 当前节点字段全可选，长期类型约束不足。
   - 建议先拆文件，再逐步 union 化。

4. `components/canvas/PropertyPanel.tsx`
   - 字段配置和 UI 渲染混在一起。
   - 建议把字段 schema 抽到 `features/canvas/domain/nodeFieldConfig.ts`。

5. `components/workspace/WorkflowDashboard.tsx` 与 `components/canvas/Workspace.tsx`
   - 当前直接调用 workflow API。
   - 建议迁到 `workflowClient.ts` 与 autosave hook。

## 13. 建议的第一批实际改动清单

如果后续开始真正改代码，建议第一批只做低风险结构调整：

1. 新增 `shared/api/response.ts`。
2. 新增 `shared/api/aiContracts.ts`。
3. 新增 `shared/api/workflowContracts.ts`。
4. 新增 `features/canvas/services/nodeExecutionClient.ts`。
5. 新增 `features/workspace/services/workflowClient.ts`。
6. 新增 `features/agent/services/agentClient.ts`。
7. 将 `canvasStore.ts` 和 `WorkflowDashboard.tsx` 的 fetch 替换为 client。
8. 运行 `npm run lint` 确认 TypeScript 无误。

这批改动不会改变现有 API URL，也不会改变画布行为，但会先建立前后端隔离层。

## 14. 完成标准

一次阶段性整理可以用以下标准验收：

- 前端组件中没有直接拼接复杂 `/api/*` 请求，统一通过 feature client。
- route handler 不再包含大量 provider 业务分支，只调用 server use case。
- `canvasStore.ts` 单文件明显变小，纯函数移到 domain。
- `shared/api/*` 中能看到所有核心接口 request/response 类型。
- `shared/canvas/*` 中能清楚看到节点类型、节点数据、快照结构。
- 新增节点、新增 provider、新增工作区功能时，有明确且有限的修改范围。

## 15. 一句话总结

这个项目不需要换技术栈，当前最需要的是建立“前端 feature client + shared contract + server use case/provider”的分层。先把接口契约和请求调用集中起来，再拆大 store 和胖 route，后续新增功能时就能做到前端 UI、API 节点、供应商适配、存储逻辑各走各的边界。