# Mindverse Agent 架构分析与内部测试优化方案

> 更新日期：2026-08-05
> 当前阶段：内部测试，不以公众开放和多租户上线为本阶段目标
> 当前主目标：提高 Agent 的意图理解、画布操作准确率、计划质量、执行连续性和问题可调试性
> 关联总交接文档：`WORKSPACE_HANDOFF.md`

## 1. 结论先行

当前 Agent 已经具备一套有价值的骨架：语义路由、能力目录/RAG、证据约束计划、确定性校验、Canvas Patch 编译、审批预览、自主执行、观察修复和 checkpoint 都已存在。因此不建议更换框架或从零重写。

当前最影响内部使用体验的不是模型“能力不够”，而是 Agent 状态与产品语义没有完全闭环：

1. 统一 Agent 和旧 Agent API 同时存在，行为可能漂移。
2. “修改画布”在统一链路里实际多为“基于选中节点创建新分支”，并不是真正的修改。
3. 绝大多数模型能力都要求审批；用户批准后只能应用 Patch，不能让同一个 Agent Run 继续自主执行。
4. 应用 Patch 就会把 Run 标记 completed，但媒体还没有运行，状态语义不准确。
5. 恢复 Agent Run 时可能重新应用原始 Patch，生成重复节点。
6. 对话、最近 Run 和项目工作流的绑定不完整，刷新或切换项目后上下文容易错位。
7. 观察器主要验证状态、URL、时长和比例，尚不能验证“画面内容是否真的满足需求”。
8. 缺少一套固定 Agent 测试题、期望结果和可比较指标，优化很难判断是真提升还是偶然波动。

内部阶段最优先的工作应是：先建立 Agent Eval 和完整 trace，再统一入口与状态机，然后修复编辑、审批、恢复三个闭环，最后优化延迟、记忆、检索与多模态质量验证。

## 2. 当前 Agent 架构

### 2.1 总体链路

```text
AgentWorkflowPanel
  -> 收集用户消息、对话、选中节点、画布快照、项目记忆、Active Skill
  -> POST /api/ai/agent-router
  -> Semantic Router LLM
       -> dialogue
       -> plan/create
       -> plan/edit
       -> organize
       -> tool/image_search
       -> clarify（随后交给 Requirement LLM 再判断）
  -> Capability Retriever
       -> TypeScript 确定性能力目录
       -> 可选 Postgres hybrid RAG
       -> Skill / Tool / Model / Runtime evidence
  -> Requirement LLM
       -> ready
       -> awaiting_user
  -> Capability Planner LLM
  -> bindPlanCapabilities / bindRoutedCanvasInputs
  -> capabilityPlanGraphIssues / capabilityPlanIssues
  -> 失败时最多再规划一次
  -> 可选 Prompt Composer
  -> compileWorkflowPlanToCanvas / compileCapabilityPlanToEditPatch
  -> Preview / Approval
  -> 可选 runAutonomousAgent（浏览器执行）
  -> 逐节点 runNode / pollNode
  -> agent-observe + ffprobe + Verifier LLM
  -> 可选 repair patch，最多 2 次
  -> AgentRun checkpoint
```

### 2.2 分层职责

| 层 | 当前文件 | 当前职责 |
| --- | --- | --- |
| Agent Console | `features/agent/components/AgentWorkflowPanel.tsx` | 对话、选择、Skill、预览、审批、自主模式、Run UI、图片搜索选择 |
| Client API | `features/agent/services/agentClient.ts` | 安全快照、Agent API、Run 写入队列 |
| Browser Executor | `features/agent/services/autonomousAgent.ts` | 应用 Patch、拓扑执行、等待异步节点、观察、修复、checkpoint |
| Unified Orchestrator | `app/api/ai/agent-router/route.ts` | 路由、检索、澄清、规划、校验、编译、Run 记录 |
| Prompt/LLM Adapter | `server/agent/agentPrompt.ts`、`server/ai/302aiLLMProvider.ts` | Router/Requirement/Planner/Composer/Verifier prompt 和 JSON 解析 |
| Capability Layer | `server/agent/capabilities/*` | 能力目录、约束、检索、绑定和确定性校验 |
| Compiler | `server/agent/compile*.ts` | 将语义计划编译为安全 Canvas Patch |
| Observation | `server/agent/observeAgentRun.ts`、`probeAgentMedia.ts` | 输出存在性、状态、媒体参数和 FFprobe 检查 |
| Persistence | `server/storage/agentRunStorage.ts` | trace、checkpoint、revision、取消/恢复、worker lease |
| Shared Contract | `shared/agent/*` | route、plan、patch、memory、run、tool 和 capability 类型 |

### 2.3 当前做得好的地方

- Router 不直接决定画布拓扑，Planner 不直接创建 React Flow 节点。
- Planner 只能引用检索返回的 capability/evidence，减少虚构 provider 和参数。
- provider 限制、媒体输入数量、时长、比例和分辨率由确定性代码校验。
- Canvas compiler 控制 ID、布局、连接和 handle，避免 LLM 直接修改底层图结构。
- 外部媒体/data URI 不直接进入 Agent prompt 和持久 trace。
- 有 plan repair、run repair、approval metadata、checkpoint 和事件轨迹。
- Agent 失败不会覆盖用户原始媒体，编辑编译器也有字段白名单和非破坏策略。
- Postgres/RAG 不可用时能回退确定性 catalog，内部测试不会完全阻塞。

这些能力应该被保留并收敛到一个正式 orchestrator，而不是被新框架替换。

## 3. 当前主要问题

### 3.1 两套 Agent 入口同时存在

统一面板使用 `/api/ai/agent-router`，但 `canvasStore.ts` 仍保留：

- `/api/ai/agent-plan`
- `/api/ai/agent-edit`
- `/api/ai/agent-organize`
- `/api/ai/agent-dialogue`

这些 route 与统一 Router 重复实现能力检索、规划和编译，但上下文、Requirement、Prompt Profile、Run checkpoint 和项目记忆并不完全一致。未来修一个入口，另一个入口很容易继续产生旧行为。

优化方向：

- 只保留一个 `AgentOrchestrator` 服务端 use case。
- 旧 route 暂时变成兼容 wrapper，内部调用同一个 orchestrator，不再复制业务逻辑。
- Canvas store 删除未使用的 `generateAgentPlan/Edit/Organize`，或明确标记 deprecated。
- 建立一份统一 `AgentRequest -> AgentDecision` contract。

### 3.2 Agent Router Route 过度聚合

`agent-router/route.ts` 约 780 行，同时处理请求解析、Run 创建、路由、tool、RAG、Requirement、Planner、Prompt Composer、编译和响应持久化。任何一段变化都会影响整条链路，也很难单独测试。

建议拆为：

```text
server/agent/orchestrator/
  handleAgentRequest.ts
  routeIntent.ts
  resolveRequirements.ts
  retrievePlanningContext.ts
  buildActionPlan.ts
  validateActionPlan.ts
  compileAgentAction.ts
  prepareApproval.ts
  persistAgentCheckpoint.ts
```

API Route 只负责解析请求、调用 `handleAgentRequest` 和返回统一响应。

### 3.3 “编辑”语义与用户预期不一致

统一 edit 链路使用 `compileCapabilityPlanToEditPatch()`。这个编译器会把 Planner 的步骤编译成新节点，并连接到选中的旧节点；返回的 `editPlan.intent` 固定为 `expand_workflow`。因此：

- “把选中的视频改成 9:16”可能创建新分支，而不是更新当前节点。
- “修改提示词”也可能产生新节点。
- 真正支持 update/delete/connect/move 的 `compileCanvasEditPlanToPatch()` 主要还在旧链路和 repair 中使用。
- 用户强制点击“修改画布”但没有选中节点时，最终可能被降级为 create。

建议把编辑意图显式拆成三种 mutation mode：

| 模式 | 用户语义 | 默认行为 |
| --- | --- | --- |
| `in_place` | 修改参数、改名、换模型、重新连接、整理 | 更新现有节点/边，清空旧执行结果 |
| `revision` | 保留原图、生成另一个版本、基于它再做 | 创建非破坏分支 |
| `expand` | 接着生成、添加剪辑/动效/输出 | 在选中节点后添加新步骤 |

Router 只判断 mutation mode 和 target；Planner 负责需要哪些能力；Compiler 再选择 update patch 或 branch patch。UI 预览必须明确显示“将更新 2 个节点 / 新建 3 个节点 / 删除 0 个节点”。

### 3.4 审批与自主执行链路断开

所有 text/image/video/audio 模型能力目前都标记为 `requiresApproval: true`。当计划包含任何这些步骤时，即使用户开启“自主执行”，面板也不会调用 `runAutonomousAgent`，而是只展示 Preview。

用户点击应用后：

- Patch 被放入画布。
- Agent Run 被标记 `completed`。
- 节点并没有自动执行。
- 用户还要再手动运行工作流。

这使“自主模式”对真实生成工作流几乎无法完成闭环。

建议实现 approval continuation：

```text
plan_ready
  -> awaiting_approval
  -> 用户查看预计模型、步骤和成本
  -> approve(stepIds, budget, runId)
  -> execution_ready
  -> 同一个 runAutonomousAgent 继续
  -> executing -> verifying -> completed
```

内部测试阶段可先做简单版本：

- “批准并运行”按钮：应用 Patch 后立即继续当前 Run。
- 会话级预算策略：本次允许 N 个图片/N 个视频任务。
- `approvedStepIds` 和 `approvedAt` 写入 checkpoint。
- “仅应用到画布”与“批准并运行”分成两个按钮。

### 3.5 Agent Run 状态语义不准确

当前 `completed` 可能表示：

- 对话回答完成；
- 画布 Patch 已应用；
- 整理完成；
- 所有媒体节点执行并观察完成。

这些状态对内部调试和用户理解并不等价。尤其 `applyPreview()` 会在节点未运行时标记 completed。

建议将状态和阶段拆清：

```text
status:
  running | awaiting_user | awaiting_approval | ready | completed | blocked | cancelled

phase:
  received
  routing
  retrieving
  clarifying
  planning
  validating
  plan_ready
  applying
  execution_ready
  executing
  polling
  verifying
  repairing
  completed
```

同时增加 `completionScope: dialogue | plan | canvas_change | deliverable`，避免所有完成状态混在一起。

### 3.6 Resume 可能重复创建节点

`runAutonomousAgent()` 在正常执行和恢复执行时都会调用 `applyInitialResponse()`。现有 Patch 再次应用时，`dedupePatch()` 会为冲突 ID 生成新 ID，因此恢复 Run 可能复制整套节点并运行副本。

同时 checkpoint 虽然保存 `canvasSnapshot` 和 `executedNodeIds`，UI 恢复时没有先核对：

- 当前 workflow 是否与 Run 的 `workflowId` 一致；
- 当前画布 revision 是否与 checkpoint 一致；
- 原 Patch 是否已应用；
- 原计划 step ID 对应的是哪些实际 node ID。

建议：

- checkpoint 保存 `planStepToNodeId`、`patchAppliedAt`、`canvasRevision`。
- Resume 时如果 Patch 已应用，只继续现有 node ID，绝不再次 apply。
- 当前画布 revision 不匹配时显示 diff，让测试者选择“使用当前画布继续”或“恢复 checkpoint”。
- 节点执行增加 `executionKey = runId + planStepId + attempt`，防止重复调用付费 provider。

### 3.7 对话和 Run 没有完整绑定到 workflow

- Chat 只存在 `AgentWorkflowPanel` 本地 state，刷新即丢失。
- localStorage 只保存一个全局 `mindverse:last-agent-run-id`。
- 打开另一个 workflow 时，UI 可能加载上一个 workflow 的 Run。
- Run record 保存了 `workflowId`，但 UI 恢复时没有校验。
- Agent memory 持久化到 workflow，但 chat、决策理由和用户批准记录没有形成完整 session。

建议：

- 使用 `mindverse:last-agent-run-id:<workflowId>`，本地画布使用独立 key。
- 服务端增加 `AgentSession`，按 workflow 保存最近若干轮精简对话。
- Run 恢复必须验证 workflowId。
- 对话正文、项目记忆和 Run trace 分开：对话用于交互，memory 用于稳定事实，trace 用于调试。

### 3.8 项目记忆字段存在，但自动维护不足

`AgentProjectMemory` 定义了 visualStyle、characters、locations 和 constraints，但当前 UI 主要写入 storyBrief、selectedDirection、pending request、Skill 和 referenceAssets。角色、场景、风格不会从对话或成功输出中稳定抽取。

结果是多轮创作时，Agent 仍可能丢失人物服装、地点、视觉规则和已确认限制。

建议增加独立 Memory Extractor：

- 只提取明确事实，不保存模型猜测。
- 每次对话后输出 `memoryPatch`，由用户可见、可编辑、可撤销。
- 字段增加 source、confidence、updatedByRunId。
- 角色/场景引用直接绑定 Canvas node ID 和已归档素材 URL。
- Planner 使用 compact memory，不反复塞入完整历史对话。

### 3.9 Planning 调用链偏长，用户看不到实时进度

一次 create/edit 可能依次调用：

1. Router LLM
2. 首次 RAG 静态同步与 hybrid retrieval
3. Requirement LLM
4. Planner LLM
5. Planner repair LLM
6. Prompt Composer LLM

当前服务器在请求结束后才把 Agent Run events 一次性返回，用户等待期间只能看到“处理中”。内部测试也难判断慢在哪一步。

建议：

- 显式 UI 模式按钮已指定 create/edit/organize 时，跳过 Router 分类，只做必要的语义抽取。
- Requirement LLM 只在 Router 低置信、缺少 target/source 或命中阻塞规则时调用。
- 静态 capability/Skill 索引改为部署或后台预热，不阻塞第一次用户请求。
- Capability catalog 按 env/config version 缓存。
- edit 只摘要选中节点和一跳邻居，不发送全画布所有节点字段。
- Router/Requirement 使用快速模型，Planner 使用高质量模型。
- 使用 SSE 或流式事件将 routing/retrieving/planning/validating 实时展示。
- trace 记录每次 LLM 的 model、耗时、token usage、重试、输入/输出 hash，不记录 Key 和媒体正文。

### 3.10 Retrieval 有硬编码偏置和污染风险

当前检索有这些具体问题：

- 第一次 Postgres 检索会同步全部静态 catalog、Skill 和 Prompt Profile，增加首请求延迟。
- Skill backfill 和多个查询仍使用固定 `666666` / `shared` scope。
- 只要 query 出现“视频、短片、动画、分镜”，检索就强制加入默认 Seedance、FFmpeg 等 capability；“只做分镜”也可能收到视频能力噪声。
- availability 只检查环境变量是否有 Key，不验证模型权限、余额或端点健康。
- catalog lexical score 对中文长词组较粗，Postgres 不可用时召回稳定性有限。
- 成功工作流/repair evidence 可能跨项目影响不相关任务。

建议：

- capability 必选集合由 route 的明确 requiredCapabilities 决定，不用宽泛关键词强制加入。
- storyboard、video_generation、video_edit、motion_graphics 分开判定。
- evidence 增加 project/global scope、freshness、success count 和 provider version。
- RAG 只负责软知识召回；硬约束继续留在 capability registry。
- 增加 retrieval debug 面板：query、候选、分数、淘汰原因、最终 evidence。
- 对 provider availability 增加 `configured | healthy | degraded | unavailable`。

### 3.11 Planner 的确定性修正不可见

`bindPlanCapabilities()` 会在 Planner 选择不合法时更换 capability/provider/evidence；`validateAgentPlan()` 也会补默认 kind、比例、sceneCount 和依赖。这个机制提高成功率，但内部测试者看不到“模型原始计划”和“规范化后计划”的差异。

建议 trace 保存脱敏的结构化 diff：

- capability changed
- provider rebound
- canvas input auto-bound
- dependency added/removed
- constraint defaulted
- scene count clamped
- prompt composer fallback

UI 可只显示简洁提示，调试模式显示完整 diff。这样才能判断问题来自 Planner、Binder、Validator 还是 Compiler。

### 3.12 Storyboard 全局限制为 3 个场景

`MAX_STORYBOARD_SCENE_COUNT = 3` 会让 Router/Planner/Script/Storyboard/图像分支统一最多 3 镜。内部测试中用户请求 5 镜或 8 镜时会被压缩，这可能被误判为 Agent 理解错误。

建议把限制变为：

- `MINDVERSE_MAX_STORYBOARD_SCENES` 配置；
- Planner capability constraint；
- UI 清楚显示“内部测试上限”和被压缩原因；
- 对批量场景采用分批运行，而不是在 schema 层静默截断。

### 3.13 自主执行的超时、轮询和取消不一致

- `waitForTerminalNode` 默认 15 分钟。
- TokenStar 默认 80 次、每 12 秒，理论窗口约 16 分钟。
- `canvasStore.pollNode` 没有真正使用服务端返回的 `maxAttempts` 计数。
- TokenStar/Motion 轮询失败会继续调度，可能无限重试。
- Browser Agent 忙碌执行时不会轮询服务端 cancel flag；其他标签页发出的 cancel 不能及时中止本地执行。

建议：

- 统一 `TaskPollingPolicy`：deadline、maxAttempts、backoff、retryable codes。
- Agent 等待时间由节点 polling policy 派生，不再写死 15 分钟。
- 每次轮询写 attempt 和 nextPollAt。
- Browser executor 周期读取 cancelRequestedAt，或使用 SSE/WebSocket 接收取消。
- 超时后节点和 Agent Run 同时进入明确的 `timed_out`/blocked 状态。

### 3.14 “观察完成”不等于“内容正确”

确定性 observer 当前主要检查：

- 节点是否 success/error；
- 是否有媒体 URL；
- FFprobe 时长、宽高、音视频流；
- 请求文本中用正则提取的比例/时长；
- 是否存在 Motion/BGM 连接。

当所有节点成功且没有 warning 时，系统会直接返回 completed，不调用 Verifier LLM。它不会检查：

- 图片主体是否正确；
- 人物是否一致；
- 视频是否有用户要求的动作；
- 字幕和标题是否真的可见；
- 音频是否为空、失真或语言错误；
- 最终输出是否满足 Planner 的 successCriteria。

建议将 verification 分层：

1. L0：状态、URL、MIME、大小。
2. L1：FFprobe、比例、时长、音轨、帧数。
3. L2：抽帧/波形/ASR/OCR。
4. L3：多模态模型依据结构化 success criteria 评分。
5. L4：内部测试者人工评分并反馈。

Planner 必须生成机器可验证的 `successCriteria`，并随 checkpoint 传给 observer，而不是只把原始 userMessage 交给正则解析。

### 3.15 Repair 没有完全遵循统一 capability 协议

初始规划使用 capability plan + validator，但 run repair 会调用旧 `runAgentEditLLM()` 生成自由操作，再用 `compileCanvasEditPlanToPatch()` 编译。虽然修复前检索了 repair evidence，也过滤删除和部分 update，但没有再次执行完整 capability/provider/evidence 校验。

建议 Repair 也输出统一 `AgentActionPlan`：

- 明确 failedStepId 和 rootCauseCategory。
- 只允许修改失败节点及其后代。
- provider 切换必须引用新 capability evidence。
- 默认 in-place retry，不创建重复分支。
- 每次 repair 保存 before/after diff 和验证结果。
- 相同错误连续两次不要继续相同修复。

### 3.16 Skill 路径不统一

`AgentRouterIntent` 包含 `skill`，Panel 也保留 `intent === "skill"` 分支，但统一 Router 实际主要把 Skill 当检索指导或 Active Skill prompt；内置固定场景 Skill 又通过 UI 的 `useWorkflowSkill()` 直接预览，不经过统一语义路由。

建议统一为：

- Skill 是 planning policy/recipe，不是顶层 intent。
- 用户明确选择 Skill 时写入 `activeSkillIds`。
- Retriever 返回 Skill guidance，Planner 仍生成统一 plan。
- 只有纯确定性模板 Skill 才允许 shortcut compiler，并在 trace 标记 `planningMode: deterministic_skill`。

## 4. 推荐目标架构

### 4.1 统一中间协议

建议用一个比现有 `AgentWorkflowPlan` 更完整的动作协议连接 create/edit/organize/repair：

```ts
type AgentActionPlan = {
  intent: "dialogue" | "create" | "edit" | "organize" | "tool";
  mutationMode?: "in_place" | "revision" | "expand";
  objective: string;
  targetNodeIds: string[];
  assumptions: string[];
  capabilities: AgentCapabilityStep[];
  canvasOperations: AgentCanvasOperation[];
  successCriteria: AgentSuccessCriterion[];
  approval: {
    requiredStepIds: string[];
    approvedStepIds: string[];
    budget?: { images?: number; videos?: number; maxCost?: number };
  };
};
```

LLM 主要生成 objective、mutationMode、capability steps 和 success criteria；Canvas operations 尽量由确定性 compiler 生成。

### 4.2 Orchestrator 与 Executor 分离

```text
Agent Console
  -> Agent Orchestrator
       Context Resolver
       Router
       Requirement Gate
       Capability Retriever
       Planner
       Validator/Binder
       Compiler
       Approval Gate
  -> Agent Run Store
  -> Execution Adapter
       BrowserExecutionAdapter（内部阶段保留）
       WorkerExecutionAdapter（以后启用）
  -> Observer / Repair
```

内部阶段不必立刻实现完整 Worker，但应该先定义 `ExecutionAdapter`，让自主循环不再直接依赖 Zustand。这样可以继续用浏览器执行，同时为以后迁移 server worker 留出稳定边界。

### 4.3 可解释的调试数据

每个 Run 建议记录：

- request/session/workflow/canvas revision；
- route 原始输出、fallback、confidence 和最终 intent；
- retrieval query、候选分数、过滤原因和最终 evidence；
- Planner 原始结构、normalized diff、validator issues；
- 编译 Patch 摘要和 step -> node ID 映射；
- approval、预算和用户选择；
- 每节点 provider、taskId hash、attempt、耗时和终态；
- observation criteria、实际值、repair decision；
- 总 token、LLM 调用次数、规划耗时、执行耗时。

不要保存 API Key、完整 data URL、第三方原始大响应或未脱敏用户秘密。

## 5. 内部测试阶段实施顺序

### Phase A：先建立 Agent Eval（最高优先级）

在继续调 prompt 前先建立 30-50 条固定测试场景：

| 类别 | 示例 | 主要断言 |
| --- | --- | --- |
| Dialogue | “一起构思一个悲情骑士故事” | route=dialogue，不改画布 |
| Create | “生成三镜竖屏分镜工作流” | create、3 镜、9:16、无多余音频 |
| Edit in-place | “把选中视频改成 9:16” | target 正确、更新而非新建整套流 |
| Revision | “保留原图再做一个夜景版本” | 创建 revision，原节点不变 |
| Expand | “在这个视频后加标题动效” | 新增 Motion 并正确连接 |
| Organize | “把同一故事整理成一组” | 只改布局/标记，不运行媒体 |
| Clarify | “帮我处理一下”且无选择 | 询问 target，不擅自创建 |
| Tool | “找一张香港夜景参考图” | image_search，不调用生成模型 |
| Approval | 图片/视频计划 | awaiting_approval，可批准后继续 |
| Resume | 执行中刷新 | 不重复节点、不重复付费调用 |
| Repair | provider 失败 | 最小修复，不复制成功分支 |

每条场景保存：输入画布 fixture、期望 route、target、capabilities、graph shape、approval、允许/禁止操作。模型输出可录制脱敏 fixture，用于确定性 validator/compiler 回归。

### Phase B：修复四个核心闭环

1. 统一 Agent 入口。
2. edit mutation mode。
3. 批准并继续自主执行。
4. resume 幂等与 workflow 绑定。

这四项完成后，Agent 才真正具备稳定内部使用价值。

### Phase C：提升交互和调试效率

- SSE 实时阶段进度。
- Run Debug Drawer。
- 持久化 workflow chat/session。
- Planner normalization diff。
- 一键复制脱敏诊断包。
- 内部评分按钮：正确/部分正确/错误，并选择错误阶段。

### Phase D：优化延迟和检索

- Router/Requirement 快速模型与条件调用。
- RAG 预热和 capability cache。
- 编辑任务的局部画布摘要。
- project-scoped RAG。
- provider health-aware capability availability。

### Phase E：提高结果质量

- 结构化 success criteria。
- 抽帧、OCR、ASR 和音轨检查。
- 多模态 verifier。
- evidence-bound repair。
- 成功/失败案例自动进入评测集，而不是直接无筛选进入 RAG。

## 6. 建议指标

先用 Eval 建立当前 baseline，再按周比较。推荐首阶段关注：

| 指标 | 建议内部目标 |
| --- | ---: |
| Route accuracy | >= 95% |
| Edit target accuracy | >= 98% |
| 首次计划通过确定性校验 | >= 90% |
| Patch graph 结构正确率 | >= 95% |
| 不必要节点率 | <= 5% |
| Clarification precision | >= 90%（只问真正阻塞项） |
| Approval 后继续执行成功率 | >= 95% |
| Resume 重复节点/重复任务率 | 0% |
| Repair 一次成功率 | 先建立 baseline，再提升 20% |
| P50 planning latency | <= 8 秒（不含媒体生成） |
| P95 planning latency | <= 20 秒（不含首次索引） |
| Run trace 完整率 | 100% |

同时保留人工质量评分：是否理解需求、是否选对素材、工作流是否简洁、结果是否可编辑、失败提示是否可操作。

## 7. 暂时不需要优先做的事情

因为当前是可信内部测试环境，以下项目仍要记录，但不应排在 Agent 优化之前：

- 完整多租户账号和计费系统；
- 面向公众的复杂权限模型；
- 大规模 worker 自动扩缩容；
- 完整素材市场和团队协作；
- 大规模 RAG HNSW 调优；
- 公众 SLA、客服和运营后台。

但内部环境仍应保留最低安全边界：不要提交 Key、限制测试额度、不要把服务暴露到公网、远程媒体下载继续避免不可信 URL。

## 8. 推荐的下一次代码迭代

建议下一次实际开发只做一个小而完整的迭代：

1. 新增 Agent Eval fixture 和 runner，先覆盖 15 条 route/plan/patch 用例。
2. 给 Agent Run 增加 `workflowId` 校验、`planStepToNodeId` 和 `patchAppliedAt`。
3. 修复 resume 重复 apply。
4. 将“应用”拆成“仅应用到画布”和“批准并运行”。
5. 将 applied 与 completed 状态分开。
6. 增加最小 Debug Drawer，展示 route、retrieval、validator 和 patch 摘要。

这一轮不需要改 provider、不需要迁移 LangGraph，也不需要先做后台 Worker；完成后就能显著提高 Agent 的可测性和日常内部使用体验。

## 9. 最终判断

Mindverse Agent 目前不是“缺少 Agent 架构”，而是已有架构尚未收敛成稳定产品闭环。最值得保留的是 capability/evidence/validator/compiler 这一条确定性主线；最需要优先修复的是入口统一、编辑语义、审批继续执行、恢复幂等和评测体系。先把这五件事做好，再优化模型 Prompt 或引入新的 Agent 框架，收益会更稳定也更容易验证。
