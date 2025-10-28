export function blocksToPlainText(blocks = []) {
  const parts = [];
  const pushRich = (rich = []) => {
    for (const r of rich) if (r && typeof r.text === "string") parts.push(r.text);
  };
  const walk = (bs = []) => {
    for (const b of bs) {
      if (!b) continue;
      if (Array.isArray(b.richText)) pushRich(b.richText);
      if (b.text) parts.push(b.text);
      if (Array.isArray(b.rows)) {
        for (const row of b.rows) for (const cell of row) pushRich(cell);
      }
      if (Array.isArray(b.children)) walk(b.children);
    }
  };
  walk(blocks);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}


