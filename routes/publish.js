import express from "express";
import connectToDatabase from "../lib/db.js";
import { fetchHierarchy } from "../lib/notion.js";
import { blocksToPlainText } from "../lib/text.js";
import Article from "../models/Article.js";
import Category from "../models/Category.js";
import Meta from "../models/Meta.js";

const router = express.Router();

router.post("/", async (req, res) => {
  console.log("=== PUBLISH STARTED ===");
  
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const authHeader = req.headers["x-publish-key"] || req.query.key;
  
  if (authHeader !== process.env.PUBLISH_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.ROOT_PAGE_ID) {
    return res.status(400).json({ error: "ROOT_PAGE_ID is not set" });
  }

  try {
    await connectToDatabase();
    const { siteTitle, siteBlocks, categories } = await fetchHierarchy(process.env.ROOT_PAGE_ID);

    await Meta.findOneAndUpdate(
      { key: "siteTitle" },
      { value: siteTitle },
      { upsert: true }
    );
    await Meta.findOneAndUpdate(
      { key: "siteBlocks" },
      { value: siteBlocks || [] },
      { upsert: true }
    );

    for (const cat of categories) {
      const savedCat = await Category.findOneAndUpdate(
        { slug: cat.slug },
        { title: cat.title, slug: cat.slug, tree: cat.tree || [], blocks: cat.blocks || [] },
        { upsert: true, new: true }
      );

      const batchSize = 25;
      const articles = cat.articles || [];
      for (let i = 0; i < articles.length; i += batchSize) {
        const slice = articles.slice(i, i + batchSize);
        const ops = slice.map((art) => {
          const searchText = blocksToPlainText(art.blocks);
          const contentPreview = searchText.slice(0, 240);
          return {
            updateOne: {
              filter: { slug: art.slug },
              update: {
                $set: {
                  title: art.title,
                  slug: art.slug,
                  categoryId: savedCat._id,
                  blocks: art.blocks,
                  searchText,
                  contentPreview,
                  lastUpdated: new Date(),
                },
              },
              upsert: true,
            },
          };
        });
        if (ops.length) {
          await Article.bulkWrite(ops, { ordered: false });
        }
      }
    }

    console.log("=== PUBLISH COMPLETED ===", { categories: categories.length, siteTitle });
    return res.status(200).json({ ok: true, categories: categories.length, siteTitle });
  } catch (e) {
    console.error("=== PUBLISH FAILED ===", e);
    return res.status(500).json({ error: "Publish failed" });
  }
});

export default router;
