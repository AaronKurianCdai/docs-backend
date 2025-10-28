import express from "express";
import connectToDatabase from "../lib/db.js";
import Article from "../models/Article.js";

const router = express.Router();

// GET /api/search?q=query
router.get("/", async (req, res) => {
  try {
    await connectToDatabase();
    
    const { q } = req.query;
    
    if (!q || q.trim() === "") {
      return res.json({ results: [] });
    }
    
    const results = await Article.find(
      { $text: { $search: q } },
      { score: { $meta: "textScore" } }
    )
    .populate("categoryId", "title slug")
    .sort({ score: { $meta: "textScore" } })
    .limit(20);
    
    res.json({ 
      results: results.map(article => ({
        title: article.title,
        slug: article.slug,
        contentPreview: article.contentPreview,
        category: article.categoryId,
        lastUpdated: article.lastUpdated
      }))
    });
  } catch (error) {
    console.error("Error searching articles:", error);
    res.status(500).json({ error: "Failed to search articles" });
  }
});

export default router;
