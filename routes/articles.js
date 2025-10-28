import express from "express";
import connectToDatabase from "../lib/db.js";
import Article from "../models/Article.js";

const router = express.Router();

// GET /api/articles/:slug
router.get("/:slug", async (req, res) => {
  try {
    await connectToDatabase();
    
    const article = await Article.findOne({ slug: req.params.slug }).populate("categoryId", "title slug");
    
    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }
    
    res.json({
      title: article.title,
      slug: article.slug,
      blocks: article.blocks,
      lastUpdated: article.lastUpdated,
      category: article.categoryId
    });
  } catch (error) {
    console.error("Error fetching article:", error);
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

export default router;
