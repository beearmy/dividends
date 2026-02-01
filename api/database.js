const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ rowCount: this.changes });
        });
    });
}

function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows });
        });
    });
}

const sql = async (strings, ...values) => {
    let query = strings[0];
    const params = [];
    for (let i = 0; i < values.length; i++) {
        query += '?' + strings[i + 1];
        params.push(values[i]);
    }

    query = query.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    query = query.replace(/JSONB/g, 'TEXT');
    query = query.replace(/EXCLUDED\./g, 'excluded.');
    query = query.replace(/ADD COLUMN IF NOT EXISTS/g, 'ADD COLUMN');

    if (query.trim().toUpperCase().startsWith('SELECT')) {
        const res = await get(query, params);
        res.rows = res.rows.map(r => {
            if (r.data && typeof r.data === 'string') {
                try { r.data = JSON.parse(r.data); } catch(e) {}
            }
            return r;
        });
        return res;
    } else {
        try {
            return await run(query, params);
        } catch (e) {
            if (e.message.includes('duplicate column name')) return { rowCount: 0 };
            throw e;
        }
    }
};

sql.query = (q, p) => {
    // Basic shim for query
    return get(q, p);
};

async function createTables() {
    try {
        await sql`CREATE TABLE IF NOT EXISTS portfolio_data (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, account_key TEXT)`;

        const legacyData = { portfolios: [{ id: 1, name: 'Feb 2026 Portfolio' }], combinedGoal: 1000 };
        // Use template syntax correctly
        const dataStr = JSON.stringify(legacyData);
        await sql`INSERT INTO portfolio_data (data, account_key) VALUES (${dataStr}, 'legacy')`;

        console.log('Mock database set up with data for legacy account.');
    } catch (error) {
        console.error('Error setting up mock database:', error);
    }
}

createTables();

module.exports = { sql };
