import mongoose from "mongoose";

const ArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    blocks: { type: Array, default: [] },
    searchText: { type: String, default: "" },
    contentPreview: { type: String, default: "" },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ArticleSchema.index({ title: "text", searchText: "text" });

export default mongoose.models.Article || mongoose.model("Article", ArticleSchema);


