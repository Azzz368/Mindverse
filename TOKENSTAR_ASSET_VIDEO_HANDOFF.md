# TokenStar Asset Video 全流程交接文档

> 目标读者：接手 `D:\HKGAI\Unlimited_Map` 的 agent / 开发者。
> 范围：Next.js + TypeScript + React Flow 中的 TokenStar `asset-video` 链路，重点是「图像节点连接 VideoNode」自动生成视频。
> 状态：代码已包含自动素材组、图片/视频/音频引用、资产轮询和错误处理；**真实 TokenStar 素材组响应尚未成功采集，`material group id is required` 仍是当前最高优先级 bug，不能宣称 asset-video 已验证可用。**

## 1. 项目与安全边界

- 项目根目录：`D:\HKGAI\Unlimited_Map`
- Git 分支：`picture/623`
- 最近已推送提交：`ede1d4f Add video providers and storyboard pipeline`
- 工作区有未提交改动；不要执行 `git reset --hard`、`git checkout --`，不要覆盖其他已有改动。
- 严禁读取、打印、提交 `.env.local`。
- TokenStar Key 只能留在 Next.js 服务端环境；浏览器只调用项目 API Route。
- 已多次通过：`npm run lint`（实际命令是 `tsc --noEmit`）。
- 不要声称 `npm run build` 已通过；该环境过去会无输出卡住。

## 2. 已确认的 TokenStar 契约

### 服务与鉴权

```text
Origin: https://api.tokenstar.world
Authorization: Bearer <raw TokenStar Virtual API Key>
```

- 不要使用 `.io`。
- 不要把 origin 配成 `.world/v1`；代码自行拼接路径。
- `TOKENSTAR_API_KEY` 的值必须是原始 Key，不应包含 `Bearer `。
- 环境变量变更后需重启 `npm run dev`。

### 端点

| 目的 | 方法与路径 | 请求形式 |
| --- | --- | --- |
| 创建素材组 | `POST /volc/asset/CreateAssetGroup` | JSON |
| 查询素材组 | `POST /volc/asset/ListAssetGroups` | JSON |
| 创建素材 | `POST /volc/asset/CreateAsset` | JSON URL 或 multipart 文件 |
| 查询素材 | `POST /volc/asset/ListAssets` | JSON |
| 创建视频任务 | `POST /v1/video/generations` | JSON |
| 轮询视频任务 | `GET /v1/video/generations/{taskId}` | GET |

### 关键请求形状

创建组：

```json
{
  "model": "volc-asset",
  "Name": "asset-group-test"
}
```

查询组：

```json
{
  "model": "volc-asset",
  "Filter": { "Name": "asset-group-test" },
  "PageNumber": 1,
  "PageSize": 10
}
```

从 URL 创建图片素材：

```json
{
  "model": "volc-asset",
  "GroupId": "group-...",
  "Name": "character-reference",
  "AssetType": "Image",
  "URL": "https://example.com/character-reference.png"
}
```

上传文件的 multipart 字段：

| 素材类型 | 必填字段 | 额外字段 |
| --- | --- | --- |
| 图片 | `file`, `GroupId`, `Name` | 当前已确认图片上传不强制 `model` / `AssetType` |
| 视频 | `file`, `GroupId`, `Name` | `model=volc-asset-video`, `AssetType=Video` |
| 音频 | `file`, `GroupId`, `Name` | `model=volc-asset-audio`, `AssetType=Audio` |

资产视频生成示例：

```json
{
  "model": "seedance-2.0-asset-fast",
  "content": [
    { "type": "text", "text": "@图1 中的人物走在阳光明媚的街道上，电影质感" },
    {
      "type": "image_url",
      "image_url": { "url": "asset://asset-..." },
      "role": "reference_image"
    }
  ],
  "resolution": "720p",
  "duration": 5
}
```

视频轮询成功响应的已确认形式之一：

```json
{
  "id": "agt_...",
  "status": "succeeded",
  "content": { "video_url": "https://..." }
}
```

## 3. 配置约定

服务端相关变量只放在 `.env.local`，不要把真实值写进代码、客户端或此文档：

```dotenv
AI_VIDEO_PROVIDER=tokenstar
TOKENSTAR_API_ORIGIN=https://api.tokenstar.world
TOKENSTAR_VIDEO_MODEL=seedance-2.0-fast
TOKENSTAR_VIDEO_ASSET_MODEL=seedance-2.0-asset-fast
TOKENSTAR_DEFAULT_RATIO=16:9
TOKENSTAR_DEFAULT_DURATION=8
TOKENSTAR_DEFAULT_RESOLUTION=720p
TOKENSTAR_GENERATE_AUDIO=true
TOKENSTAR_POLL_INTERVAL_MS=5000
TOKENSTAR_ASSET_POLL_INTERVAL_MS=1500
TOKENSTAR_ASSET_MAX_POLL_ATTEMPTS=20
```

### 模型配置注意事项

- 当前默认的资产视频请求模型是 `seedance-2.0-asset-fast`。
- 源码 fallback、`.env.example`、前端 preset 与 Agent 默认能力均统一使用 `seedance-2.0-asset-fast`。
- 本地与 Render 若显式设置 `TOKENSTAR_VIDEO_ASSET_MODEL`，也应同步为 `seedance-2.0-asset-fast`。

## 4. 代码地图

| 文件 | 职责 |
| --- | --- |
| `store/canvasStore.ts` | 从 React Flow 上游节点收集图片、视频、音频 URL，构造 VideoNode 输入并发起 `/api/ai/run-node` |
| `app/api/ai/run-node/route.ts` | 服务端选择 TokenStar，验证输入并调用 `createSeedanceAssetVideo` |
| `lib/ai/tokenstar/tokenstarVideoProvider.ts` | 资产视频总编排：上传引用、合并既有 `asset://`、构造 `content`、创建/轮询视频任务 |
| `lib/ai/tokenstar/tokenstarReferenceAssets.ts` | 下载上游媒体、MIME 校验、创建素材组、上传各引用、等待素材 ready |
| `lib/ai/tokenstar/tokenstarAsset.ts` | `CreateAssetGroup` / `ListAssetGroups` / `CreateAsset` / `ListAssets`、ID 解析与轮询 |
| `lib/ai/tokenstar/tokenstarClient.ts` | Server-only TokenStar HTTP 客户端、origin、Authorization、JSON / multipart 标头处理 |
| `lib/ai/tokenstar/tokenstarTypes.ts` | TokenStar 传入/传出类型与标准化任务类型 |
| `app/api/video/tokenstar/create/route.ts` | 可选的直接 TokenStar 创建 API Route |
| `app/api/ai/poll-task/route.ts` | 根据 `provider=tokenstar` 路由视频轮询 |
| `components/canvas/PropertyPanel.tsx` | VideoNode 的 TokenStar 模式、已有 `asset://` 图片/视频/音频引用输入框 |
| `lib/ai/errors.ts` | `TokenStarError` 转为安全的前端错误信息，清理 Key/Bearer 字串 |

## 5. 图像节点连接 VideoNode：完整数据流

### 5.1 图层数据采集

1. 用户在画布生成 ImageNode。
2. ImageNode 成功后，节点输出通常包含 `output.value.imageUrl`。
3. 用户用 React Flow 连线把 ImageNode 接到 VideoNode。
4. `store/canvasStore.ts` 的 `inputFor(video, upstream)` 过滤所有上游 `nodeType === "image"`，用 `imageUrlFrom` 取 URL，形成：

```ts
{
  referenceImageUrls: string[],
  referenceVideoUrls: string[],
  referenceAudioUrls: string[],
  // 其余 prompt、model、ratio、duration 等字段
}
```

5. 浏览器仅发送该结构到项目的 `POST /api/ai/run-node`；不会发送 TokenStar Key。

### 5.2 API Route 与 provider 选择

`app/api/ai/run-node/route.ts` 仅在以下条件之一命中 TokenStar：

```ts
input.videoProvider === "tokenstar"
// 或 VideoNode 未指定 provider 且 AI_VIDEO_PROVIDER === "tokenstar"
```

且 `input.mode === "asset-video"` 时执行：

```ts
createSeedanceAssetVideo(input)
```

`text-to-video` 则走 `createSeedanceVideo(input)`，不会上传引用素材。

### 5.3 服务端素材组与上传

`createReferenceAssets()` 的预期顺序：

```text
ImageNode URL / VideoNode URL / AudioNode URL
        |
        v
下载到 Next.js 服务端 Blob，并校验 MIME
        |
        v
POST CreateAssetGroup(model=volc-asset, Name=lumen-flow-references-<timestamp>)
        |
        v
POST ListAssetGroups，获取真实 GroupId
        |
        v
逐个 POST CreateAsset（multipart）
        |
        v
逐个 POST ListAssets，直到素材可用
        |
        v
得到 asset://asset-... URL 列表
```

当前自动上传 MIME 白名单：

| 上游节点 | 必须的媒体 MIME |
| --- | --- |
| ImageNode | `image/jpeg`、`image/png`、`image/webp` |
| VideoNode | `video/mp4` |
| AudioNode | `audio/mpeg`、`audio/mp3` |

限制与原因：

- 只接受 `https:` 或 `data:` URL，拒绝浏览器本地 `blob:` URL；Next.js 服务端无法读取浏览器作用域内的 blob。
- Mock Provider 的 ImageNode 输出 `data:image/svg+xml`，会被明确拒绝。SVG 是预览图，不应上传到 TokenStar 作为参考图片。
- 自动素材上传是串行的，保证素材在生成视频前已经 ready；这会牺牲一些速度但减少时序错误。

### 5.4 生成视频的 `content` 顺序

`tokenstarVideoProvider.ts` 合并两类引用：

1. 画布自动上传获得的 `asset://`；
2. PropertyPanel 中手填的已有 `asset://`。

随后按固定顺序构造：

```text
text
image_url (role=reference_image) × N
video_url (role=reference_video) × N
audio_url (role=reference_audio) × N
```

所有手填值必须匹配 `asset://...`。若没有任何自动或手填引用，asset-video 在调用远端前直接返回 400。

### 5.5 视频任务轮询

`pollSeedanceVideo()` 访问：

```text
GET /v1/video/generations/<taskId>
```

标准化逻辑会寻找以下视频 URL 位置：

```text
result_url / resultUrl / video_url
data.* / output.* / content.video_url
```

状态映射：

| TokenStar 原状态 | 画布状态 |
| --- | --- |
| `PENDING` 或未知 | `pending` |
| `RUNNING` / `IN_PROGRESS` | `running` |
| `SUCCEEDED` / `SUCCESS` / `COMPLETED` / `DONE`，或有结果 URL | `completed` |
| `FAILED` / `ERROR` / `CANCELLED` | `failed` |

## 6. 当前素材组 bug：`material group id is required`

### 现象

当真实图片连接到 VideoNode，模式为 `asset-video` 时，前端可能返回：

```json
{
  "ok": false,
  "error": {
    "message": "material group id is required",
    "code": "TOKENSTAR_ERROR",
    "status": 400
  }
}
```

这表示视频生成尚未开始；失败位置是 `CreateAsset` 文件上传阶段。TokenStar 没有认可传入的素材组 ID。

### 已做的代码修正

1. 资产组创建后不再立即假设创建响应里的任意 `id` 就是 GroupId。
2. 使用 `ListAssetGroups` 按创建组名查找真实组。
3. 解析器只接受明确的 `GroupId` / `MaterialGroupId`，或以 `group-` 开头的 `Id`。
4. 若找不到组，会在上传前返回“asset group was not available”而不是把明显错误的 ID 发给 `CreateAsset`。
5. 对 `ListAssetGroups` 的 `Filter.Name` 查询未命中时，会回退到未筛选列表，再按名称匹配。

### 未验证事实与风险

**尚未采集到一次带有效 Key 的 `CreateAssetGroup` 与 `ListAssetGroups` 原始响应。** 因此无法确认：

- 返回对象的精确字段层级；
- 返回 ID 的真实字段名、前缀与组状态字段；
- 创建组是否异步可见；
- `ListAssetGroups` 是否接受当前 `Filter.Name` 形状。

此前手动验证没有得到有效响应：一次是终端环境变量缺失导致 401，另一次是在本地构造 Authorization 头时包含控制字符。它们都不能证明 TokenStar 的创建组接口失败。

### 下一位 agent 的首要任务

不要继续猜 `GroupId`、`MaterialGroupId` 或 JSON 层级。先获取真实响应，再修解析器。

安全诊断原则：

- Key 仅在用户本机临时终端或 Next.js 服务端使用。
- 不打印、记录、截图或发送 Key / Authorization 头。
- 允许发送响应 JSON，但必须删除意外出现的 token、Cookie、签名 URL。
- 必须保留响应中的 `data`、`items`、`Name`、`Id`、`GroupId`、`MaterialGroupId`、`Status` 等结构字段。

需要的最小证据：

```text
POST CreateAssetGroup 的成功 JSON 响应
POST ListAssetGroups 的成功 JSON 响应
```

拿到后按以下规则处理：

1. 若创建响应直接含规范 GroupId：可将其作为候选，但仍用列表确认。
2. 若列表条目包含 GroupId：使用该字段，不使用外层 request / trace / generic ID。
3. 若列表条目只有 `Id`：仅当该 ID 确认为素材组 ID 时使用；不要因字段名叫 `id` 就直接传给上传接口。
4. 若组需要特定 ready 状态：扩展 `isReadyStatus()`。
5. 若服务要求不同的 multipart 字段名：以真实成功 cURL 为准，集中修改 `createAssetFromFile()`，不要在客户端拼请求。

## 7. 推荐的真实验收路径

### 前置条件

1. 本机服务端环境已配置 TokenStar Key 与 `https://api.tokenstar.world`。
2. `TOKENSTAR_VIDEO_ASSET_MODEL` 明确为已确认的 asset 模型。
3. 重启 `npm run dev`。
4. 使用真实 PNG / JPEG / WebP ImageNode；不要使用 Mock SVG。

### 最小图流程

```text
真实 ImageNode (success, PNG/JPEG/WebP)
        |
        +---- React Flow edge ----> VideoNode
                                      provider = tokenstar
                                      mode = asset-video
                                      prompt 非空
```

### 通过标准

1. CreateAssetGroup 返回成功。
2. ListAssetGroups 能找到同名组，且代码使用的 GroupId 是真实素材组 ID。
3. CreateAsset 成功，且 ListAssets 找到同名素材。
4. 素材状态 ready / available / success 后生成 `asset://asset-...`。
5. `/v1/video/generations` 返回任务 ID。
6. 轮询最终得到 `content.video_url` 或兼容的结果 URL。
7. 画布 VideoNode 显示视频预览并标记 success。

### 失败分类

| 错误 | 常见位置 | 首要检查 |
| --- | --- | --- |
| `401` | 任意 TokenStar 端点 | 原始 Key、是否多了 `Bearer `、开发服务器是否已重启 |
| `material group id is required` | CreateAsset | 实际 GroupId 字段与当前解析器选择的值 |
| group not available / 504 | ListAssetGroups 等待 | 列表响应结构、过滤条件、创建组可见性和轮询时长 |
| SVG / unsupported MIME | 上传前本地校验 | 上游是否 Mock、是否 PNG/JPEG/WebP/MP4/MP3 |
| `asset://` 格式错误 | 构造 video `content` 前 | 手填字段必须是 `asset://...`，不要填普通 URL |
| 视频任务失败 | `/v1/video/generations` 或轮询 | 模型、额度、素材状态、服务原始错误消息 |

## 8. 可安全执行的维护操作

```powershell
cd D:\HKGAI\Unlimited_Map
npm run lint
git diff --check
git status --short
```

不要把 `npm run build` 作为当前成功证据；该环境有已知卡住历史。

不要为调试去读取 `.env.local`。若需要用户确认环境配置，应让用户自行核对变量名和值的格式，而不是让 agent 输出文件内容。

## 9. 当前工作区状态

涉及 TokenStar 的改动尚未提交、推送或创建 PR。当前重点文件包括：

```text
lib/ai/tokenstar/tokenstarAsset.ts
lib/ai/tokenstar/tokenstarReferenceAssets.ts   (新文件)
lib/ai/tokenstar/tokenstarVideoProvider.ts
lib/ai/tokenstar/tokenstarTypes.ts
lib/ai/tokenstar/tokenstarClient.ts
app/api/ai/run-node/route.ts
app/api/video/tokenstar/create/route.ts
store/canvasStore.ts
components/canvas/PropertyPanel.tsx
README.md
.env.example
```

提交前应先完成真实素材组响应验证，并确保只提交本任务相关文件。
