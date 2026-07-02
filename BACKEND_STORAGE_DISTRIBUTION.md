# Unlimited Map 后端文件存储与分发现状说明

## 1. 文档目的

这份文档聚焦项目当前后端在媒体文件处理上的真实现状，尤其是图片、视频、音频在生成后的存储位置、在画布中的引用方式、以及如何继续分发给后续模型 API。本文也会给出后续接入 Bunny 的建议改造方向，方便后面把画布中产出的媒体统一沉淀为稳定 URL。

## 2. 当前结论摘要

当前项目还没有自建的后端媒体存储层。

现阶段媒体文件主要有三种来源：

1. 第三方 AI 平台直接返回的远程 URL
2. 第三方 AI 平台返回的 base64/data URL
3. 用户或流程节点手动写入的外部 URL

这些媒体内容不会先落到本项目自己的对象存储中。项目现在做的事情主要是：

1. 调用第三方生成接口
2. 读取第三方返回的 imageUrl、videoUrl、audioUrl、resultUrl 等字段
3. 把这些 URL 挂到节点数据和节点 output 里
4. 将整个画布快照保存到浏览器 localStorage

这意味着当前的“存储”本质上是“引用第三方结果 URL + 本地保存画布 JSON”，并不是后端托管媒体资产。

## 3. 当前后端技术栈

项目后端是基于 Next.js App Router 的 Route Handler。

主要后端职责：

1. 作为前端画布与第三方 AI 服务之间的代理层
2. 统一封装多家模型提供商
3. 负责轮询异步任务状态
4. 负责少量 TokenStar 资产管理接口封装

当前涉及媒体处理的核心技术栈包括：

1. Next.js Route Handlers
2. 302.AI provider 封装
3. TokenStar provider 封装
4. Kling / Sora2 / Seedance 等视频生成接口适配
5. Zustand 画布状态管理
6. 浏览器 localStorage 用于保存画布快照

## 4. 当前媒体数据流

### 4.1 画布发起生成

画布运行节点时，会在 store/canvasStore.ts 内根据上游节点结果拼装输入参数。这里会把上游节点里已有的图片、视频、音频 URL 收集起来，再传给后端接口。

关键点：

1. 图片来源优先读取节点 output 中的 imageUrl，其次读取节点本身 data.imageUrl
2. 视频来源会从 output 中提取 videoUrl、resultUrl、finalVideoUrl
3. 音频来源会从 output 中提取 audioUrl、resultUrl 或 provider 原始返回字段

这部分逻辑说明：画布内部传递的是“URL 引用”，不是二进制文件实体。

### 4.2 统一运行入口

统一运行入口在 app/api/ai/run-node/route.ts。

这个接口根据 nodeType 和 videoProvider，将请求继续分发到不同 provider：

1. 302.AI 图像、文本、音频、视频
2. 官方 Kling provider
3. TokenStar Seedance / Kling / Asset Video
4. Sora-2 image-to-video

该接口当前只负责：

1. 参数校验
2. provider 选择
3. 将第三方返回结果透传回前端

它没有做以下事情：

1. 下载第三方媒体文件
2. 上传到项目自有存储
3. 生成统一的自有 CDN URL
4. 记录媒体元数据到数据库

### 4.3 异步轮询入口

异步任务轮询入口在 app/api/ai/poll-task/route.ts。

这里根据 provider 和 taskId 去轮询第三方状态，然后把返回的 resultUrl、videoUrl、rawStatus 等继续传回前端。最终这些字段会被写回节点数据。

当前轮询返回的数据依然是第三方结果地址，不会二次归档。

## 5. 当前“存储”真实落点

### 5.1 画布状态存储

当前项目唯一明确落盘的地方，是浏览器 localStorage。

实现位于 lib/storage/canvasStorage.ts。

保存内容是整个 CanvasSnapshot，包括：

1. projectName
2. nodes
3. edges

由于 nodes 中直接包含 imageUrl、videoUrl、audioUrl、resultUrl、referenceImageUrl 等字段，所以本地存储的其实是“媒体引用信息”，不是媒体本身。

### 5.2 第三方托管结果

图片、视频、音频实际文件目前主要托管在第三方平台侧：

1. 302.AI 返回的远程 URL 或 data URL
2. TokenStar / Kling 返回的视频结果 URL
3. Sora-2 轮询结果返回的视频 URL

这些 URL 是否长期有效，完全依赖对应第三方平台，不受本项目控制。

### 5.3 data URL 情况

在 302.AI 图像生成与图像编辑链路中，如果上游没有直接返回远程 URL，有时会返回 base64 数据，代码会将其转换成 data:image/...;base64,... 形式。

这类结果虽然可以立即在前端展示，但问题是：

1. 无法作为长期稳定的 CDN 资源管理
2. 会膨胀节点 JSON 和 localStorage 体积
3. 不适合继续大规模分发给其他模型服务

## 6. 当前分发方式

这里的“分发”不是 CDN 分发，而是“把已有 URL 继续传给下游模型 API”。

### 6.1 图像分发

图像会以这些方式继续传递：

1. referenceImageUrl
2. referenceImageUrls
3. sourceImageUrl
4. image

典型用途：

1. 作为图片生成的参考图
2. 作为图片编辑的 source image
3. 作为视频生成的首帧图

### 6.2 视频分发

视频会通过这些字段继续传递：

1. referenceVideoUrl
2. referenceVideoUrls
3. video

典型用途：

1. 作为 Kling Omni 的视频输入
2. 作为 TokenStar asset-video 的参考视频

### 6.3 音频分发

音频会通过这些字段继续传递：

1. audioUrl
2. referenceAudioUrls

但当前项目音频链路整体还比较轻，重点仍是图像和视频。

## 7. TokenStar 资产模式的现状

这是当前项目里最接近“文件资产管理”的一部分，但它依然不是本项目自建存储。

### 7.1 已有能力

项目已经封装了 TokenStar 资产相关接口：

1. 创建素材组
2. 通过 URL 创建资产
3. 通过文件上传创建资产
4. 查询资产列表
5. 轮询资产是否 ready

相关逻辑主要在：

1. lib/ai/tokenstar/tokenstarAsset.ts
2. app/api/video/tokenstar/assets/create/route.ts
3. app/api/video/tokenstar/assets/create-group/route.ts
4. app/api/video/tokenstar/assets/list/route.ts

### 7.2 它解决了什么

TokenStar 的 asset-video 模式要求输入是 asset:// URL，而不是任意公网 URL。项目现在已经有一层适配，会尝试把参考图、参考视频、参考音频转换成 TokenStar 资产引用，再调用 asset-video。

### 7.3 它没有解决什么

TokenStar asset 不是你的统一媒体仓库，原因有三点：

1. 它服务的是 TokenStar 自己的生成链路
2. 资产地址是 asset:// 协议，不适合作为通用外部分发 URL
3. 它不能替代你未来希望统一交给其他 LLM / 多家模型平台复用的媒体 CDN 层

所以，TokenStar asset 更像“某个上游平台的专用中转格式”，不是全项目的主存储。

## 8. 当前方案的主要问题

### 8.1 文件生命周期不可控

第三方返回的 URL 可能会过期、失效、限流或改变访问策略。

### 8.2 无法形成统一媒体中心

现在每个 provider 都在返回自己的 URL 格式，没有统一的资源域名、统一的权限策略、统一的元数据记录。

### 8.3 不利于后续多模型复用

如果后面你要把某张图或某段视频继续交给别的 LLM、视频模型、剪辑模型使用，直接复用第三方临时 URL 风险很高。

### 8.4 前端快照会越来越重

尤其 data URL 会导致画布 JSON 急剧增大，localStorage 容易顶满，也不适合后续协作与服务端持久化。

### 8.5 缺少媒体元数据层

当前项目还没有自己的 media table 或 asset registry，因此没法统一管理：

1. 文件类型
2. 来源 provider
3. 原始任务 ID
4. 文件大小
5. MIME type
6. 创建时间
7. 归属节点
8. 对外分发 URL

## 9. 接入 Bunny 的建议架构

你的目标非常明确：把画布内产生的图片、视频内容统一落到 Bunny，再生成稳定 URL 给其他 LLM API 使用。这个方向是对的，而且应该尽量放在 provider 返回结果之后、写回节点之前完成。

建议增加一个“媒体归档层”。

### 9.1 推荐目标状态

建议未来统一走下面这条链路：

1. 画布节点请求后端生成
2. 后端调用第三方 provider
3. provider 返回远程 URL 或 data URL
4. 后端立即把结果拉取或解码
5. 后端上传到 Bunny Storage
6. 后端生成 Bunny CDN URL
7. 后端把自有 URL 写回节点 output
8. 后续所有下游模型一律优先使用 Bunny URL

### 9.2 建议新增抽象

建议新增一个独立模块，例如：

1. lib/storage/mediaArchive.ts
2. lib/storage/bunnyClient.ts
3. lib/storage/mediaTypes.ts

这个模块统一负责：

1. 接收 provider 输出
2. 判断是 https URL 还是 data URL
3. 下载或解码文件
4. 推断扩展名和 MIME type
5. 上传到 Bunny
6. 返回统一结构

建议返回结构示例：

```ts
type ArchivedMedia = {
  storageProvider: "bunny";
  mediaType: "image" | "video" | "audio";
  originalUrl?: string;
  cdnUrl: string;
  storageKey: string;
  mimeType?: string;
  sizeBytes?: number;
  sourceProvider?: string;
  sourceTaskId?: string;
};
```

### 9.3 最佳接入点

最适合接 Bunny 的位置，不是在前端，也不是单独做一个人工上传按钮，而是在后端 provider 输出返回后统一归档。

优先接入点：

1. app/api/ai/run-node/route.ts
2. app/api/ai/poll-task/route.ts
3. app/api/ai/edit-image/route.ts

原因：

1. 这三个入口已经拿到了最终生成结果
2. 这里最容易统一不同 provider 的输出结构
3. 可以保证写回前端的就是自有 URL，而不是第三方临时 URL

### 9.4 建议归档策略

建议按媒体类型和业务上下文生成 Bunny 路径，例如：

```text
/projects/{projectId}/images/{nodeId}/{timestamp}.png
/projects/{projectId}/videos/{nodeId}/{timestamp}.mp4
/projects/{projectId}/audio/{nodeId}/{timestamp}.mp3
```

如果暂时没有 projectId，也可以先用：

```text
/canvas/{date}/{nodeType}/{uuid}.{ext}
```

### 9.5 节点数据建议新增字段

为了让前端和后端都能区分“原始第三方地址”和“归档后的正式地址”，建议给节点 output 或 node.data 增加这些字段：

1. originalImageUrl
2. originalVideoUrl
3. originalAudioUrl
4. archivedImageUrl
5. archivedVideoUrl
6. archivedAudioUrl
7. storageProvider
8. storageKey

更实际的做法是：

1. 继续兼容现有 imageUrl、videoUrl、audioUrl 字段作为“最终可用 URL”
2. 同时保留 originalUrl 类字段用于排查来源

## 10. 与当前代码的兼容改造建议

### 10.1 第一阶段

先不大改前端，只改后端返回结果。

做法：

1. provider 正常调用第三方
2. 拿到结果 URL 后归档到 Bunny
3. 用 Bunny URL 覆盖 output.imageUrl / output.videoUrl / output.audioUrl

这样画布现有的大部分逻辑可以不改，因为 store/canvasStore.ts 已经是围绕这些字段在传递。

### 10.2 第二阶段

为媒体建立统一元数据结构。

建议给 output.value 增加 media 对象，例如：

```ts
{
  imageUrl: "https://cdn.xxx/...png",
  originalImageUrl: "https://third-party/...png",
  media: {
    provider: "bunny",
    key: "projects/abc/images/node-1/xxx.png",
    mimeType: "image/png"
  }
}
```

### 10.3 第三阶段

把 localStorage 从“唯一快照存储”升级成“仅前端缓存”，再补一个服务端持久化层。

否则即便 Bunny 接好了，画布结构本身仍只存在浏览器里，后面多人协作、历史版本、项目回溯都会受限。

## 11. 实施优先级建议

推荐按以下顺序推进：

1. 先实现 Bunny 上传客户端
2. 再在 run-node / poll-task / edit-image 三个入口接入归档
3. 再让节点统一保存 Bunny URL
4. 最后再补媒体元数据库和项目级持久化

如果只做第一步和第二步，你就已经能满足“统一创建 URL 分发给其他 LLM API”这个核心目标。

## 12. 一句话结论

当前项目后端并没有真正保存媒体文件，只是在代理第三方生成服务，并把第三方结果 URL 或 data URL 存进节点和 localStorage；如果你要把画布中产生的图片、视频稳定复用于其他模型，最合理的方案就是在后端生成结果返回时统一归档到 Bunny，并让节点后续只消费 Bunny URL。