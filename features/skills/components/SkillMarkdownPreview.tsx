type PreviewBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "paragraph"; text: string };

const markdownBody = (markdown: string) => markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();

const blocksFrom = (markdown: string): PreviewBlock[] => {
  const lines = markdownBody(markdown).split(/\r?\n/);
  const blocks: PreviewBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list });
    list = [];
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = [];
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      return;
    }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) {
      flushParagraph();
      list.push(item[1]);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }
    paragraph.push(line.trim());
  });
  flushParagraph();
  flushList();
  if (code.length) blocks.push({ type: "code", text: code.join("\n") });
  return blocks;
};

export function SkillMarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = blocksFrom(markdown);
  if (!blocks.length) return <p className="text-[#8d8d8d]">暂无可预览内容。</p>;
  return (
    <article className="space-y-5 text-[15px] leading-7 text-[#d6d6d6]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const className = block.level === 1 ? "text-2xl" : block.level === 2 ? "text-xl" : "text-base";
          return <h3 key={index} className={`${className} font-semibold text-white`}>{block.text}</h3>;
        }
        if (block.type === "list") {
          return <ul key={index} className="list-disc space-y-1 pl-6">{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
        }
        if (block.type === "code") {
          return <pre key={index} className="overflow-x-auto rounded-md bg-[#171717] p-4 font-mono text-sm text-[#b8e6d0]">{block.text}</pre>;
        }
        return <p key={index}>{block.text}</p>;
      })}
    </article>
  );
}
