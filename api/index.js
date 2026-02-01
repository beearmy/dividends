const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { sql } = require('./database');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Helper to get account key from headers
const getAccountKey = (req) => req.headers['x-account-key'] || 'default';

// ── Portfolio Data Endpoints ────────────────────────────────────────────────
app.get('/api/portfolioData', async (req, res) => {
    const key = getAccountKey(req);
    try {
        const { rows } = await sql`SELECT data FROM portfolio_data WHERE account_key = ${key}`;
        res.json(rows.length > 0 ? { data: rows[0].data } : { data: null });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/portfolioData', async (req, res) => {
    const key = getAccountKey(req);
    const { portfolios, combinedGoal, combinedGoalName, combinedGoal2, combinedGoal2Name, combinedGoal3, combinedGoal3Name, combinedTopUp, includeTopUp } = req.body;
    const data = { portfolios, combinedGoal, combinedGoalName, combinedGoal2, combinedGoal2Name, combinedGoal3, combinedGoal3Name, combinedTopUp, includeTopUp };

    try {
        await sql`
            INSERT INTO portfolio_data (account_key, data)
            VALUES (${key}, ${JSON.stringify(data)})
            ON CONFLICT (account_key)
            DO UPDATE SET data = EXCLUDED.data;
        `;
        res.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Dividend Data Endpoints ─────────────────────────────────────────────────
app.get('/api/dividendData', async (req, res) => {
    const key = getAccountKey(req);
    try {
        const { rows } = await sql`SELECT data FROM dividend_data WHERE account_key = ${key}`;
        res.json(rows.length > 0 ? { data: rows[0].data } : { data: null });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/dividendData', async (req, res) => {
    const key = getAccountKey(req);
    try {
        await sql`
            INSERT INTO dividend_data (account_key, data)
            VALUES (${key}, ${JSON.stringify(req.body)})
            ON CONFLICT (account_key)
            DO UPDATE SET data = EXCLUDED.data;
        `;
        res.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Pie Allocations Endpoints ───────────────────────────────────────────────
app.get('/api/pieAllocations', async (req, res) => {
    const key = getAccountKey(req);
    try {
        const { rows } = await sql`SELECT data FROM pie_allocations WHERE account_key = ${key}`;
        res.json(rows.length > 0 ? { data: rows[0].data } : { data: null });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/pieAllocations', async (req, res) => {
    const key = getAccountKey(req);
    try {
        await sql`
            INSERT INTO pie_allocations (account_key, data)
            VALUES (${key}, ${JSON.stringify(req.body)})
            ON CONFLICT (account_key)
            DO UPDATE SET data = EXCLUDED.data;
        `;
        res.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Yield History Endpoints ─────────────────────────────────────────────────
app.get('/api/yieldHistory', async (req, res) => {
    const key = getAccountKey(req);
    try {
        const { rows } = await sql`SELECT data FROM yield_history WHERE account_key = ${key}`;
        res.json(rows.length > 0 ? { data: rows[0].data } : { data: null });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/yieldHistory', async (req, res) => {
    const key = getAccountKey(req);
    try {
        await sql`
            INSERT INTO yield_history (account_key, data)
            VALUES (${key}, ${JSON.stringify(req.body)})
            ON CONFLICT (account_key)
            DO UPDATE SET data = EXCLUDED.data;
        `;
        res.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;
