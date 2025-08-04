const express = require("express");
const path = require("path");
const { generate } = require("./generate");
require("dotenv").config();

const app = express();
app.use(express.json());

// 📤 Trigger File Generation
app.post("/generate-sacrra", async (req, res) => {
  try {
    const type = req.body.type || "daily";
    const files = await generate(type);
    res.status(200).send({ message: "Files generated", files });
  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});

// 📥 Download File (filename from query)
app.get("/download", (req, res) => {
  const file = req.query.filename;
  const filePath = path.join(__dirname, file);
  res.download(filePath);
});

app.listen(3000, () => console.log("SACRRA generator API running on :3000"));
