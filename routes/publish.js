import express from "express";
import connectToDatabase from "../lib/db.js";
import { fetchHierarchy } from "../lib/notion.js";
import { blocksToPlainText } from "../lib/text.js";
import Article from "../models/Article.js";
import Category from "../models/Category.js";
import Meta from "../models/Meta.js";

const router = express.Router();

// POST /api/publish
router.post("/", async (req, res) => {
  try {
    const publishKey = req.headers["x-publish-key"];
    if (!publishKey || publishKey !== process.env.PUBLISH_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    await connectToDatabase();
    
    const rootPageId = process.env.ROOT_PAGE_ID;
    if (!rootPageId) {
      return res.status(500).json({ error: "ROOT_PAGE_ID not configured" });
    }
    
    const { siteTitle, siteBlocks, categories } = await fetchHierarchy(rootPageId);
    
    await Meta.findOneAndUpdate(
      { key: "_siteTitle" },
      { key: "_siteTitle", value: siteTitle },
      { upsert: true }
    );
    
    await Meta.findOneAndUpdate(
      { key: "_siteBlocks" },
      { key: "_siteBlocks", value: siteBlocks },
      { upsert: true }
    );
    
    let categoriesCount = 0;
    
    for (const categoryData of categories) {
      const category = await Category.findOneAndUpdate(
        { slug: categoryData.slug },
        {
          title: categoryData.title,
          slug: categoryData.slug,
          tree: categoryData.tree,
          blocks: categoryData.blocks || []
        },
        { upsert: true, new: true }
      );
      
      categoriesCount++;
      
      for (const articleData of categoryData.articles) {
        const searchText = blocksToPlainText(articleData.blocks);
        const contentPreview = searchText.substring(0, 200) + (searchText.length > 200 ? "..." : "");
        
        await Article.findOneAndUpdate(
          { slug: articleData.slug },
          {
            title: articleData.title,
            slug: articleData.slug,
            categoryId: category._id,
            blocks: articleData.blocks,
            searchText,
            contentPreview,
            lastUpdated: new Date()
          },
          { upsert: true }
        );
      }
    }
    
    res.json({
      ok: true,
      categories: categoriesCount,
      siteTitle
    });
  } catch (error) {
    console.error("Error publishing content:", error);
    res.status(500).json({ error: "Failed to publish content" });
  }
});

export default router;
