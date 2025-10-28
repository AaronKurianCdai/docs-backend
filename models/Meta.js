import mongoose from "mongoose";

const MetaSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.models.Meta || mongoose.model("Meta", MetaSchema);


