# Lumen Flow

An original, local-first creative workflow canvas for text, image, video, audio, and storyboards. It runs with a built-in mock provider by default, so no API key is needed to explore the app.

## Local development

```powershell
npm install
npm run dev
```

Open [http://localhost:3000/workspace](http://localhost:3000/workspace).

## 302.AI configuration

1. Copy `.env.example` to `.env.local`.
2. Set `AI_PROVIDER=302ai` and add your own `AI_302_API_KEY`.
3. Keep the remaining model values from the example or replace them with models available to your 302.AI account.
4. Restart `npm run dev` after changing environment variables.

```dotenv
AI_PROVIDER=302ai
AI_302_API_KEY=********
AI_302_BASE_URL=https://api.302.ai/v1
# Optional compatibility alias. If both are set, this value takes precedence.
AI_302_OPENAI_BASE_URL=https://api.302.ai/v1
```

The API key is read only by server-side code in `lib/ai` and the Next.js `/api/ai/*` routes. It is never sent by a client component, included in browser storage, or exposed with a `NEXT_PUBLIC_` variable. `.env.local` is ignored by Git; do not commit or paste it into GitHub.

### Supported 302.AI operations

- Text: `POST /v1/chat/completions`
- Storyboard: chat completion with strict JSON parsing and a safe fallback
- Image: GPT-Image models use `POST /v1/images/generations`; other configured image models use `POST /302/images/generations`
- Video: `POST /302/v2/video/create`, then poll `GET /302/v2/video/fetch/{task_id}`
- Audio: `POST /302/audio/speech`; async audio polling is also prepared
- Models: `GET /v1/models?llm=1`

With `AI_PROVIDER=mock`, all nodes use local deterministic mock results and no external request is made. With `AI_PROVIDER=302ai` but without `AI_302_API_KEY`, the affected node shows a clear configuration error instead of crashing the canvas.

## Kling official image-to-video

Use `videoProvider=kling` in a VideoNode, or set `AI_VIDEO_PROVIDER=kling` on the server. Kling image-to-video requires a prompt plus a first-frame image, so connect a completed ImageNode to the VideoNode or set the VideoNode reference image URL. The first frame must be an HTTPS image URL or a JPG/PNG base64 data URL.

```dotenv
AI_VIDEO_PROVIDER=kling
KLING_API_KEY=********
KLING_API_ORIGIN=https://api-singapore.klingai.com
KLING_IMAGE_TO_VIDEO_PATH=/image-to-video/kling-3.0-turbo
KLING_IMAGE_TO_VIDEO_POLL_PATH_TEMPLATE=/image-to-video/kling-3.0-turbo/{taskId}
KLING_DEFAULT_DURATION=5
KLING_DEFAULT_RESOLUTION=720p
KLING_WATERMARK_ENABLED=false
KLING_POLL_INTERVAL_MS=5000
```

`KLING_API_KEY` must be filled only in `.env.local` or the Render environment. The create endpoint uses `POST /image-to-video/kling-3.0-turbo` with `contents` containing `prompt` and `first_frame`, and `settings` containing `resolution` and `duration`. If Kling changes the query endpoint, update `KLING_IMAGE_TO_VIDEO_POLL_PATH_TEMPLATE` without changing application code.

## TokenStar Seedance video

Use `videoProvider=tokenstar` in a VideoNode, then configure server-only values in `.env.local`:

```dotenv
AI_VIDEO_PROVIDER=tokenstar
TOKENSTAR_API_KEY=********
TOKENSTAR_API_ORIGIN=https://api.tokenstar.world
TOKENSTAR_VIDEO_MODEL=seedance-2.0-fast
TOKENSTAR_VIDEO_ASSET_MODEL=seedance-2.0-asset-fast
TOKENSTAR_DEFAULT_RATIO=16:9
TOKENSTAR_DEFAULT_DURATION=8
TOKENSTAR_DEFAULT_RESOLUTION=720p
TOKENSTAR_GENERATE_AUDIO=true
TOKENSTAR_ASSET_POLL_INTERVAL_MS=1500
TOKENSTAR_ASSET_MAX_POLL_ATTEMPTS=20
```

Text-to-video creates a task at `/v1/video/generations`; polling reads `/v1/video/generations/{taskId}` and displays the returned video URL (`content.video_url` in current TokenStar responses, with `result_url` fallbacks). For asset video, connect completed ImageNodes (PNG, JPEG, or WebP), VideoNodes (MP4), and/or AudioNodes (MP3) to the VideoNode. The server uploads them to one TokenStar asset group, polls `ListAssets` until each asset is available, and then sends the resulting `asset://` URLs in image → video → audio order. Existing TokenStar `asset://` URLs can also be supplied in the VideoNode inspector. Mock ImageNodes produce SVG previews and are intentionally rejected. The browser only calls project API routes; the TokenStar key remains server-only.

## Image annotation and revision

After an ImageNode has a result, select **Annotate & Refine** below its preview. The editor supports arrows, boxes, circles, and text notes; all coordinates are stored relative to the image, so annotations remain aligned when the canvas is resized.

Use **Generate revision** to create a new ImageNode beside the original. The source image is never changed. Annotation metadata, the source image reference, and the revision instruction are included in saved canvases and JSON exports.

The mock provider creates a local revision preview. Real 302.AI image revision deliberately remains unavailable until a confirmed image-edit endpoint is configured; the new revision node will show a clear error instead of silently using a text-to-image replacement.
