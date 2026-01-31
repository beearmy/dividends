const express = require('express');
const { sql } = require('./database.js');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Serve static files
app.use(express.static(__dirname));

app.use(cors());
app.use(bodyParser.json());

// Endpoints for dividend_data
app.get('/api/dividendData', async (req, res) => {
    try {
        const { rows } = await sql`SELECT data FROM dividend_data WHERE id = 1`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : {}
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dividendData', async (req, res) => {
    const data = req.body;
    try {
        const result = await sql`
            INSERT INTO dividend_data (id, data)
            VALUES (1, ${JSON.stringify(data)})
            ON CONFLICT (id)
            DO UPDATE SET data = EXCLUDED.data
        `;
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
        const result = await sql`
            INSERT INTO pie_allocations (id, data)
            VALUES (1, ${JSON.stringify(data)})
            ON CONFLICT (id)
            DO UPDATE SET data = EXCLUDED.data
        `;
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
        const result = await sql`
            INSERT INTO yield_history (id, data)
            VALUES (1, ${JSON.stringify(data)})
            ON CONFLICT (id)
            DO UPDATE SET data = EXCLUDED.data
        `;
        res.json({
            "message": "success",
            "rows_affected": result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoints for portfolio_data
app.get('/api/portfolioData', async (req, res) => {
    try {
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
        const result = await sql`
            INSERT INTO portfolio_data (id, data)
            VALUES (1, ${JSON.stringify(data)})
            ON CONFLICT (id)
            DO UPDATE SET data = EXCLUDED.data
        `;
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
