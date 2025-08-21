require('dotenv').config();

const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require('express');
const bodyParser = require('body-parser');

const { generate } = require('./src/generate');

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const EXPORTS_DIR = path.join(__dirname, "exports");

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

// Health check
app.get('/', (req, res) => {
  res.send('SACRRA Generator API is running');
});

function clearExports(dir) {
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

// POST endpoint to generate file
app.post('/generate-sacrra', async (req, res) => {
  try {
    const type = req.body.type || 'daily';
    const tableName = req.body.tableName;
    const monthEndDate = req.body.monthEndDate;
    const transactionDate = req.body.transactionDate;

    // Clear old files
    clearExports(EXPORTS_DIR);

    const result = await generate(tableName, monthEndDate, transactionDate, type, EXPORTS_DIR);

    // Build downloadable URLs (use Render domain in production)
    const files = result.map((filePath) => {
      const fileName = path.basename(filePath);
      const fileUrl = `https://${req.get("host")}/download/${encodeURIComponent(fileName)}`;
      return { name: fileName, url: fileUrl };
    });
    
    res.status(200).send({ message: 'Files generated', files });
  } catch (err) {
    console.error('Error in /generate-sacrra:', err);
    res.status(500).send({ error: err.message });
  }
});

// GET endpoint to download files
app.get('/download/:filename', async (req, res) => {
  const fileName = path.basename(req.params.filename);
  const filePath = path.join(EXPORTS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error("Download error:", err);
    }
  });
});

app.listen(PORT, () => {
  console.log(`SACRRA Generator API running at http://localhost:${PORT}`);
});
