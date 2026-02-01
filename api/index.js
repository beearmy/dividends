const express = require('express');
const { sql } = require('./database.js');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

app.use(cors());
app.use(bodyParser.json());

// Helper to get user from token (password hash)
async function getUserId(req) {
    const token = req.headers['x-auth-token'];
    if (!token) return { error: 'Unauthorized', status: 401 };
    try {
        const { rows } = await sql`SELECT id FROM users WHERE password_hash = ${token}`;
        if (!rows[0]) return { error: 'Invalid token', status: 401 };
        return { userId: rows[0].id };
    } catch (error) {
        return { error: error.message, status: 500 };
    }
}

// Authentication endpoint
app.post('/api/auth', async (req, res) => {
    const { passwordHash } = req.body;
    if (!passwordHash) return res.status(400).json({ error: 'passwordHash is required' });
    try {
        // Simple registration/login: create user if hash is new
        await sql`INSERT INTO users (password_hash) VALUES (${passwordHash}) ON CONFLICT (password_hash) DO NOTHING`;
        const { rows } = await sql`SELECT id FROM users WHERE password_hash = ${passwordHash}`;
        // Return the hash as the token (in a real app, this would be a JWT)
        res.json({ token: rows[0].password_hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoints for dividend_data
app.get('/api/dividendData', async (req, res) => {
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    try {
        const { rows } = await sql`SELECT data FROM dividend_data WHERE user_id = ${userId}`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : {}
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dividendData', async (req, res) => {
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    const data = req.body;
    try {
        const result = await sql`
            INSERT INTO dividend_data (user_id, data)
            VALUES (${userId}, ${JSON.stringify(data)})
            ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
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
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    try {
        const { rows } = await sql`SELECT data FROM portfolio_data WHERE user_id = ${userId}`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : { portfolios: [], combinedGoal: 0 }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/portfolioData', async (req, res) => {
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    const data = req.body;
    try {
        const result = await sql`
            INSERT INTO portfolio_data (user_id, data)
            VALUES (${userId}, ${JSON.stringify(data)})
            ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
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
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    try {
        const { rows } = await sql`SELECT data FROM pie_allocations WHERE user_id = ${userId}`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pieAllocations', async (req, res) => {
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    const data = req.body;
    try {
        const result = await sql`
            INSERT INTO pie_allocations (user_id, data)
            VALUES (${userId}, ${JSON.stringify(data)})
            ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
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
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    try {
        const { rows } = await sql`SELECT data FROM yield_history WHERE user_id = ${userId}`;
        res.json({
            "message": "success",
            "data": rows[0] ? rows[0].data : []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/yieldHistory', async (req, res) => {
    const { userId, error, status } = await getUserId(req);
    if (error) return res.status(status).json({ error });
    const data = req.body;
    try {
        const result = await sql`
            INSERT INTO yield_history (user_id, data)
            VALUES (${userId}, ${JSON.stringify(data)})
            ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
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
