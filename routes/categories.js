import express from "express";
import connectToDatabase from "../lib/db.js";
import Category from "../models/Category.js";
import Meta from "../models/Meta.js";

const router = express.Router();

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    await connectToDatabase();
    
    const siteTitleDoc = await Meta.findOne({ key: "_siteTitle" });
    const siteBlocksDoc = await Meta.findOne({ key: "_siteBlocks" });
    
    const _siteTitle = siteTitleDoc?.value || "Documentation";
    const _siteBlocks = siteBlocksDoc?.value || [];
    
    const categories = await Category.find({}).populate({
      path: "tree",
      populate: {
        path: "children",
        populate: {
          path: "children",
          populate: {
            path: "children"
          }
        }
      }
    });
    
    const categoriesWithBlocks = categories.map(cat => ({
      ...cat.toObject(),
      blocks: cat.blocks || []
    }));
    
    res.json({
      _siteTitle,
      _siteBlocks,
      categories: categoriesWithBlocks
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

export default router;
