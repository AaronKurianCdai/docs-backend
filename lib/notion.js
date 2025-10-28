import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN, timeoutMs: 120000 });

async function sleep(ms) {
  return await new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, label = "notion") {
  const maxAttempts = 6;
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e?.status || e?.response?.status || e?.statusCode || 0;
      const code = e?.code || e?.cause?.code || "";
      const name = e?.name;
      const isRate = status === 429 || e?.code === "rate_limited";
      const isNetwork = ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(String(code));
      const isRetryable = isRate || isNetwork || status === 502 || status === 503 || status === 504 || name === "FetchError" || name === "TypeError";
      if (!isRetryable) break;

      const retryAfterHeader = e?.headers?.["retry-after"] || e?.response?.headers?.["retry-after"] || e?.body?.retry_after;
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;

      const backoff = retryAfterMs || Math.min(60000, 800 * Math.pow(2, attempt));
      await sleep(backoff);
      attempt += 1;
    }
  }
  throw lastErr;
}

export async function getChildren(pageId) {
  const results = [];
  let cursor;
  do {
    const resp = await withRetry(() => notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 }), "blocks.children.list");
    results.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results;
}

export function richTextToPlain(rich = []) {
  return rich.map((r) => r.plain_text).join("");
}

export function serializeRichText(rich = []) {
  return rich.map((r) => ({
    text: r.plain_text || r.text?.content || r.equation?.expression || "",
    href: r.href || r.text?.link?.url || null,
    annotations: r.annotations || {},
    type: r.type,
    equation: r.equation?.expression || null,
    mention: r.mention || null,
  }));
}

export function makeSlug(title) {
  return richTextToPlain(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toEmbeddableVideoUrl(url) {
  if (!url || typeof url !== "string") return url;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube → embed URL
    if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
      // Already an embed link
      if (u.pathname.startsWith("/embed/")) return url;

      let id = "";
      // youtu.be/<id>
      if (host === "youtu.be") {
        id = u.pathname.slice(1);
      }
      // youtube.com/watch?v=<id>
      if (!id && u.pathname === "/watch") {
        id = u.searchParams.get("v") || "";
      }
      // youtube.com/shorts/<id>
      if (!id && u.pathname.startsWith("/shorts/")) {
        id = u.pathname.split("/")[2] || "";
      }
      if (!id) return url;

      // Support start time (?t=1h2m3s or seconds)
      let start = 0;
      const t = u.searchParams.get("t");
      if (t) {
        const match = /^((\d+)h)?((\d+)m)?((\d+)s)?$/.exec(t);
        if (match) {
          const h = parseInt(match[2] || "0", 10);
          const m = parseInt(match[4] || "0", 10);
          const s = parseInt(match[6] || "0", 10);
          start = h * 3600 + m * 60 + s;
        } else if (/^\d+$/.test(t)) {
          start = parseInt(t, 10);
        }
      }

      const qp = new URLSearchParams();
      if (start > 0) qp.set("start", String(start));
      const qs = qp.toString();
      const base = `https://www.youtube-nocookie.com/embed/${id}`;
      return qs ? `${base}?${qs}` : base;
    }

    // Vimeo → player URL
    if (host.endsWith("vimeo.com")) {
      const m = /vimeo\.com\/(?:.*\/)?(\d+)/.exec(u.href);
      if (m && m[1]) {
        return `https://player.vimeo.com/video/${m[1]}`;
      }
      return url;
    }

    return url;
  } catch (_) {
    console.error(e_ => e.message);
    return url;
  }
}

export async function fetchHierarchy(rootPageId) {
  let siteTitle = "Documentation";
  try {
    const root = await withRetry(() => notion.pages.retrieve({ page_id: rootPageId }), "pages.retrieve");
    const titleRich = root.properties?.title?.title || root.properties?.Name?.title || [];
    const maybe = richTextToPlain(titleRich);
    if (maybe) siteTitle = maybe;
  } catch (_) {
    console.error(e_ => e.message);
  }

  const rootChildren = await getChildren(rootPageId);
  const categoryBlocks = rootChildren.filter((b) => b.type === "child_page");
  const siteBlocks = await fetchBlocks(rootPageId);

  const categories = [];
  for (const catBlock of categoryBlocks) {
    const catTitleRich = [{ plain_text: catBlock.child_page?.title || "Untitled" }];
    const category = {
      notionId: catBlock.id,
      title: richTextToPlain(catTitleRich),
      slug: makeSlug(catTitleRich) || catBlock.id,
      tree: [],
      articles: [],
      blocks: [],
    };

    // Build a nested tree of pages beneath the category
    category.tree = await buildTree(catBlock.id);
    // Flat list with blocks for persistence
    category.articles = await collectArticles(catBlock.id);
    // Category page content (if any)
    category.blocks = await fetchBlocks(catBlock.id);

    categories.push(category);
  }

  return { siteTitle, siteBlocks, categories };
}

async function buildTree(pageId) {
  const children = await getChildren(pageId);
  const nodes = [];
  for (const child of children) {
    if (child.type !== "child_page") continue;
    const titleRich = [{ plain_text: child.child_page?.title || "Untitled" }];
    const node = {
      notionId: child.id,
      title: richTextToPlain(titleRich),
      slug: makeSlug(titleRich) || child.id,
      children: await buildTree(child.id),
    };
    nodes.push(node);
  }
  return nodes;
}

async function collectArticles(pageId) {
  const out = [];
  const children = await getChildren(pageId);
  for (const child of children) {
    if (child.type === "child_page") {
      const titleRich = [{ plain_text: child.child_page?.title || "Untitled" }];
      out.push({
        notionId: child.id,
        title: richTextToPlain(titleRich),
        slug: makeSlug(titleRich) || child.id,
        blocks: await fetchBlocks(child.id),
      });
      const deeper = await collectArticles(child.id);
      if (deeper.length) out.push(...deeper);
    }
  }
  return out;
}

export async function fetchBlocks(pageId) {
  const blocks = await getChildren(pageId);
  const normalized = await Promise.all(blocks.map((b) => normalizeBlock(b)));
  return normalized.filter(Boolean);
}

export async function normalizeBlock(block) {
  const t = block.type;
  const hasChildren = !!block.has_children;
  const loadChildren = async () => (hasChildren ? await fetchBlocks(block.id) : []);

  if (t === "paragraph") {
    return {
      type: "paragraph",
      richText: serializeRichText(block.paragraph.rich_text),
      color: block.paragraph.color,
      children: await loadChildren(),
    };
  }

  if (t === "heading_1" || t === "heading_2" || t === "heading_3") {
    const node = block[t];
    return {
      type: t,
      richText: serializeRichText(node.rich_text),
      color: node.color,
      is_toggleable: !!node.is_toggleable,
      children: await loadChildren(),
    };
  }

  if (t === "bulleted_list_item" || t === "numbered_list_item") {
    const node = block[t];
    return {
      type: t,
      richText: serializeRichText(node.rich_text),
      color: node.color,
      children: await loadChildren(),
    };
  }

  if (t === "to_do") {
    return {
      type: "to_do",
      richText: serializeRichText(block.to_do.rich_text),
      checked: !!block.to_do.checked,
      color: block.to_do.color,
      children: await loadChildren(),
    };
  }

  if (t === "toggle") {
    return {
      type: "toggle",
      richText: serializeRichText(block.toggle.rich_text),
      color: block.toggle.color,
      children: await loadChildren(),
    };
  }

  if (t === "quote") {
    return {
      type: "quote",
      richText: serializeRichText(block.quote.rich_text),
      color: block.quote.color,
      children: await loadChildren(),
    };
  }

  if (t === "callout") {
    return {
      type: "callout",
      richText: serializeRichText(block.callout.rich_text),
      color: block.callout.color,
      icon: block.callout.icon?.emoji || null,
      children: await loadChildren(),
    };
  }

  if (t === "code") {
    return {
      type: "code",
      language: block.code.language,
      richText: serializeRichText(block.code.rich_text),
      color: block.code?.color,
    };
  }

  if (t === "divider") {
    return { type: "divider" };
  }

  if (t === "image") {
    const src = block.image.type === "external" ? block.image.external.url : block.image.file?.url;
    return src ? { type: "image", src, caption: serializeRichText(block.image.caption) } : null;
  }

  if (t === "video") {
    const raw = block.video.type === "external" ? block.video.external.url : block.video.file?.url;
    const src = block.video.type === "external" ? toEmbeddableVideoUrl(raw) : raw;
    return src ? { type: "video", src, caption: serializeRichText(block.video.caption) } : null;
  }

  if (t === "file" || t === "pdf" || t === "audio") {
    const node = block[t];
    const src = node.type === "external" ? node.external?.url : node.file?.url;
    return src ? { type: t, src, caption: serializeRichText(node.caption) } : null;
  }

  if (t === "bookmark" || t === "embed" || t === "link_preview") {
    const node = block[t];
    const url = node?.url || node?.url?.url || null;
    return url ? { type: t, url } : null;
  }

  if (t === "equation") {
    return { type: "equation", expression: block.equation.expression };
  }

  if (t === "table") {
    const rows = await getChildren(block.id);
    const data = [];
    for (const r of rows) {
      if (r.type !== "table_row") continue;
      const cells = r.table_row.cells.map((cell) => serializeRichText(cell));
      data.push(cells);
    }
    return {
      type: "table",
      table_width: block.table.table_width,
      has_column_header: !!block.table.has_column_header,
      has_row_header: !!block.table.has_row_header,
      rows: data,
    };
  }

  if (t === "synced_block") {
    const sourceId = block.synced_block.synced_from?.block_id || block.id;
    const children = await fetchBlocks(sourceId);
    return { type: "group", children };
  }

  if (t === "column_list") {
    const columns = await getChildren(block.id);
    const colNodes = [];
    for (const c of columns) {
      if (c.type !== "column") continue;
      const children = await fetchBlocks(c.id);
      colNodes.push({ children });
    }
    return { type: "columns", columns: colNodes };
  }

  if (t === "link_to_page") {
    const node = block.link_to_page;
    return { type: "link_to_page", page_id: node.page_id || null, database_id: node.database_id || null };
  }

  if (t === "table_of_contents" || t === "breadcrumb") {
    return { type: t };
  }

  return null;
}


