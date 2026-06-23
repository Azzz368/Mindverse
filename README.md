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
AI_302_API_KEY=sk-your-key-here
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

## Image annotation and revision

After an ImageNode has a result, select **Annotate & Refine** below its preview. The editor supports arrows, boxes, circles, and text notes; all coordinates are stored relative to the image, so annotations remain aligned when the canvas is resized.

Use **Generate revision** to create a new ImageNode beside the original. The source image is never changed. Annotation metadata, the source image reference, and the revision instruction are included in saved canvases and JSON exports.

The mock provider creates a local revision preview. Real 302.AI image revision deliberately remains unavailable until a confirmed image-edit endpoint is configured; the new revision node will show a clear error instead of silently using a text-to-image replacement.
