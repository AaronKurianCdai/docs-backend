import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectToDatabase from "./lib/db.js";
import categoriesRouter from "./routes/categories.js";
import articlesRouter from "./routes/articles.js";
import searchRouter from "./routes/search.js";
import publishRouter from "./routes/publish.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

connectToDatabase().catch(console.error);

// Routes
app.use("/api/categories", categoriesRouter);
app.use("/api/articles", articlesRouter);
app.use("/api/search", searchRouter);
app.use("/api/publish", publishRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
