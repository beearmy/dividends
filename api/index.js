const express = require('express');
const { sql, ensureInit } = require('./database.js');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

app.use(cors());
app.use(bodyParser.json());

// Endpoints for dividend_data
app.get('/api/dividendData', async (req, res) => {
    try {
        await ensureInit();
        const { rows } = await sql`SELECT data FROM dividend_data WHERE id = 1`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : {}
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoints for portfolio_data
app.get('/api/portfolioData', async (req, res) => {
    try {
        await ensureInit();
        const { rows } = await sql`SELECT data FROM portfolio_data WHERE id = 1`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : { portfolios: [], combinedGoal: 0 }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/portfolioData', async (req, res) => {
    const data = req.body;
    try {
        await ensureInit();
        const result = await sql`UPDATE portfolio_data SET data = ${JSON.stringify(data)} WHERE id = 1`;
        res.json({
            "message": "success",
            "rows_affected": result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dividendData', async (req, res) => {
    const data = req.body;
    try {
        await ensureInit();
        const result = await sql`UPDATE dividend_data SET data = ${JSON.stringify(data)} WHERE id = 1`;
        res.json({
            "message": "success",
            "rows_affected": result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoints for pie_allocations
app.get('/api/pieAllocations', async (req, res) => {
    try {
        await ensureInit();
        const { rows } = await sql`SELECT data FROM pie_allocations WHERE id = 1`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pieAllocations', async (req, res) => {
    const data = req.body;
    try {
        await ensureInit();
        const result = await sql`UPDATE pie_allocations SET data = ${JSON.stringify(data)} WHERE id = 1`;
        res.json({
            "message": "success",
            "rows_affected": result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoints for yield_history
app.get('/api/yieldHistory', async (req, res) => {
    try {
        await ensureInit();
        const { rows } = await sql`SELECT data FROM yield_history WHERE id = 1`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/yieldHistory', async (req, res) => {
    const data = req.body;
    try {
        await ensureInit();
        const result = await sql`UPDATE yield_history SET data = ${JSON.stringify(data)} WHERE id = 1`;
        res.json({
            "message": "success",
            "rows_affected": result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;

// Start the server for local testing
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}
