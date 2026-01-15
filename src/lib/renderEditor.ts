type Block = { type: string; data: any };

export function renderEditorHtml(doc: { blocks?: Block[] } | null | undefined): string {
  if (!doc || !Array.isArray(doc.blocks)) return "";
  return doc.blocks.map(renderBlock).join("\n");
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "paragraph":
      return `<p>${b.data?.text ?? ""}</p>`;

    case "header": {
      const lvl = clampLevel(b.data?.level);
      const text = b.data?.text ?? "";
      return `<h${lvl}>${text}</h${lvl}>`;
    }

    case "list": {
      const style = (b.data?.style || "unordered").toLowerCase();
      const items: string[] = Array.isArray(b.data?.items) ? b.data.items : [];
      const li = items.map(i => `<li>${i}</li>`).join("");
      return style === "ordered" ? `<ol>${li}</ol>` : `<ul>${li}</ul>`;
    }

    case "image": {
      const url = b.data?.file?.url || b.data?.url || "";
      const cap = b.data?.caption ? `<figcaption>${b.data.caption}</figcaption>` : "";
      const withBg = b.data?.withBackground ? " style=\"background:#f7f8fa;padding:8px;border-radius:8px;\"" : "";
      const withBorder = b.data?.withBorder ? " class=\"img-border\"" : "";
      const stretched = b.data?.stretched ? " class=\"img-stretch\"" : "";
      return url
        ? `<figure${withBg}><img src="${url}" alt="" loading="lazy"${withBorder || stretched}>${cap}</figure>`
        : "";
    }

    default:
      // Unknown block → no romper, dejar como comentario
      return `<!-- unsupported block: ${b.type} -->`;
  }
}

function clampLevel(n: any): 2|3|4|5|6 {
  const x = Number(n);
  if (x >= 6) return 6;
  if (x >= 5) return 5;
  if (x >= 4) return 4;
  if (x >= 3) return 3;
  return 2;
}
