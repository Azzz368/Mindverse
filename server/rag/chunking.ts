import { createHash } from "node:crypto";

export type RagChunkDraft = {
  chunkIndex: number;
  heading?: string;
  content: string;
  contentHash: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const estimateTokenCount = (value: string) => {
  const latinWords = value.match(/[a-zA-Z0-9_]+/g)?.length || 0;
  const cjkCharacters = value.match(/[\u3400-\u9fff]/g)?.length || 0;
  const punctuation = value.match(/[^\s\w\u3400-\u9fff]/g)?.length || 0;
  return Math.max(1, Math.ceil(latinWords * 1.3 + cjkCharacters * 1.15 + punctuation * 0.25));
};

const splitLargeSection = (heading: string | undefined, body: string, maxCharacters: number) => {
  if (body.length <= maxCharacters) return [body];
  const paragraphs = body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  paragraphs.forEach((paragraph) => {
    if (paragraph.length > maxCharacters) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxCharacters) {
        chunks.push(paragraph.slice(offset, offset + maxCharacters).trim());
      }
      return;
    }
    const candidate = [current, paragraph].filter(Boolean).join("\n\n");
    if (candidate.length > maxCharacters) flush();
    current = [current, paragraph].filter(Boolean).join("\n\n");
  });
  flush();
  return chunks.length ? chunks : [heading || body.slice(0, maxCharacters)];
};

export function chunkMarkdownBySections(
  markdown: string,
  options: { maxCharacters?: number; metadata?: Record<string, unknown> } = {},
): RagChunkDraft[] {
  const source = markdown.replace(/\r\n/g, "\n").trim();
  if (!source) return [];
  const maxCharacters = Math.max(800, options.maxCharacters || Number(process.env.RAG_CHUNK_MAX_CHARACTERS || 3_000));
  const lines = source.split("\n");
  const sections: Array<{ heading?: string; body: string[] }> = [];
  let current: { heading?: string; body: string[] } = { body: [] };
  lines.forEach((line) => {
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      if (current.body.some((item) => item.trim())) sections.push(current);
      current = { heading: headingMatch[2].trim(), body: [] };
      return;
    }
    current.body.push(line);
  });
  if (current.heading || current.body.some((item) => item.trim())) sections.push(current);

  const drafts: Array<{ heading?: string; content: string }> = [];
  sections.forEach((section) => {
    const body = section.body.join("\n").trim();
    const sectionText = [section.heading ? `# ${section.heading}` : "", body].filter(Boolean).join("\n\n");
    splitLargeSection(section.heading, sectionText, maxCharacters).forEach((content) => drafts.push({ heading: section.heading, content }));
  });

  return drafts.map((draft, chunkIndex) => ({
    chunkIndex,
    heading: draft.heading,
    content: draft.content,
    contentHash: hash(draft.content),
    tokenCount: estimateTokenCount(draft.content),
    metadata: { ...(options.metadata || {}), heading: draft.heading, chunkIndex },
  }));
}

export const ragContentHash = (value: string) => hash(value.replace(/\r\n/g, "\n").trim());
