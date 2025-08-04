const express = require('express');
const bodyParser = require('body-parser');
const { generate } = require('./generate');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Health check
app.get('/', (req, res) => {
  res.send('SACRRA Generator API is running');
});

// POST endpoint to generate file
app.post('/generate-sacrra', async (req, res) => {
  try {
    const type = req.body.type || 'daily';
    const tableName = req.body.tableName;
    const result = await generate(tableName, type);
    res.status(200).send({ message: 'Files generated', files: result });
  } catch (err) {
    console.error('Error in /generate-sacrra:', err);
    res.status(500).send({ error: err.message });
  }
});

// GET endpoint to download files
app.get('/download', (req, res) => {
  const file = req.query.filename;
  if (!file) return res.status(400).send('Missing filename');
  res.download(`${__dirname}/${file}`);
});

app.listen(port, () => {
  console.log(`SACRRA Generator API running at http://localhost:${port}`);
});
