require('dotenv').config();

const path = require("path");
const cors = require("cors");
const express = require('express');
const bodyParser = require('body-parser');

const { generate } = require('./src/generate');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// Serve /tmp folder publicly so files can be downloaded via a link
app.use("/files", express.static("/tmp"));

// Health check
app.get('/', (req, res) => {
  res.send('SACRRA Generator API is running');
});

// POST endpoint to generate file
app.post('/generate-sacrra', async (req, res) => {
  try {
    const type = req.body.type || 'daily';
    const tableName = req.body.tableName;
    const monthEndDate = req.body.monthEndDate;

    const result = await generate(tableName, monthEndDate, type);
    
    res.status(200).send({ message: 'Files generated', files: result });
  } catch (err) {
    console.error('Error in /generate-sacrra:', err);
    res.status(500).send({ error: err.message });
  }
});

// GET endpoint to download files
app.get('/download', async (req, res) => {
  try {
    const tableName = req.query.table;
    const type = req.query.type || "both"; // daily | monthly | both

    console.log(`Generating ${type} file(s) for table: ${tableName}...`);

    const files = await generate(tableName, "20250831", type);

    if (!files.length) {
      return res.status(404).send("No files generated for given parameters.");
    }

    // Build public download links
    const fileLinks = files.map((filePath) => {
      const fileName = path.basename(filePath);
      return `${req.protocol}://${req.get("host")}/files/${fileName}`;
    });

    res.json({
      message: "Files generated successfully",
      files: fileLinks
    });

  } catch (error) {
    console.error("Error generating files:", error);
    res.status(500).send("Error generating files");
  }
});

app.listen(port, () => {
  console.log(`SACRRA Generator API running at http://localhost:${port}`);
});
