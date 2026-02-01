const { sql } = require('@vercel/postgres');

async function createTables() {
    try {
        // Tables now use account_key (TEXT)
        await sql`
            CREATE TABLE IF NOT EXISTS dividend_data (
                id SERIAL PRIMARY KEY,
                account_key TEXT UNIQUE,
                data JSONB
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS pie_allocations (
                id SERIAL PRIMARY KEY,
                account_key TEXT UNIQUE,
                data JSONB
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS yield_history (
                id SERIAL PRIMARY KEY,
                account_key TEXT UNIQUE,
                data JSONB
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS portfolio_data (
                id SERIAL PRIMARY KEY,
                account_key TEXT UNIQUE,
                data JSONB
            );
        `;

        // Migration logic: convert old unkeyed data to a legacy account key
        const legacyHash = 'd5378a00c61377598c6f3dc4a00d4507b68f7e214bbee32ac241d6957aa0b7bd';

        try { await sql`ALTER TABLE dividend_data ADD COLUMN IF NOT EXISTS account_key TEXT`; } catch(e){}
        try { await sql`UPDATE dividend_data SET account_key = ${legacyHash} WHERE account_key IS NULL`; } catch(e){}
        try { await sql`ALTER TABLE dividend_data ADD CONSTRAINT dividend_data_key_unique UNIQUE (account_key)`; } catch(e){}

        try { await sql`ALTER TABLE pie_allocations ADD COLUMN IF NOT EXISTS account_key TEXT`; } catch(e){}
        try { await sql`UPDATE pie_allocations SET account_key = ${legacyHash} WHERE account_key IS NULL`; } catch(e){}
        try { await sql`ALTER TABLE pie_allocations ADD CONSTRAINT pie_allocations_key_unique UNIQUE (account_key)`; } catch(e){}

        try { await sql`ALTER TABLE yield_history ADD COLUMN IF NOT EXISTS account_key TEXT`; } catch(e){}
        try { await sql`UPDATE yield_history SET account_key = ${legacyHash} WHERE account_key IS NULL`; } catch(e){}
        try { await sql`ALTER TABLE yield_history ADD CONSTRAINT yield_history_key_unique UNIQUE (account_key)`; } catch(e){}

        try { await sql`ALTER TABLE portfolio_data ADD COLUMN IF NOT EXISTS account_key TEXT`; } catch(e){}
        try { await sql`UPDATE portfolio_data SET account_key = ${legacyHash} WHERE account_key IS NULL`; } catch(e){}
        try { await sql`ALTER TABLE portfolio_data ADD CONSTRAINT portfolio_data_key_unique UNIQUE (account_key)`; } catch(e){}

        // Original default data
        const defaultDividendData = {
            "2020": { "Jan": 2.38, "Feb": 8.05, "Mar": 6.29, "Apr": 0.63, "May": 6.29, "Jun": 6.27, "Jul": 5.96, "Aug": 11.07, "Sep": 15.34, "Oct": 0.71, "Nov": 9.19, "Dec": 6.77 },
            "2021": { "Jan": 2.74, "Feb": 82.94, "Mar": 12.42, "Apr": 4.28, "May": 4.01, "Jun": 9.11, "Jul": 8.97, "Aug": 18.00, "Sep": 18.24, "Oct": 3.07, "Nov": 9.00, "Dec": 6.28 },
            "2022": { "Jan": 3.50, "Feb": 10.80, "Mar": 8.00, "Apr": 12.00, "May": 8.50, "Jun": 23.00, "Jul": 6.00, "Aug": 14.00, "Sep": 23.50, "Oct": 2.20, "Nov": 11.00, "Dec": 9.00 },
            "2023": { "Jan": 5.85, "Feb": 13.39, "Mar": 11.00, "Apr": 9.77, "May": 10.69, "Jun": 24.19, "Jul": 7.29, "Aug": 23.16, "Sep": 26.96, "Oct": 9.50, "Nov": 16.61, "Dec": 17.56 },
            "2024": { "Jan": 7.33, "Feb": 8.26, "Mar": 11.89, "Apr": 19.69, "May": 19.44, "Jun": 33.42, "Jul": 27.60, "Aug": 19.03, "Sep": 34.56, "Oct": 30.54, "Nov": 20.31, "Dec": 33.85 },
            "2025": { "Jan": 35.85, "Feb": 25.20, "Mar": 44.84, "Apr": 53.72, "May": 44.76, "Jun": 62.39, "Jul": 75.65, "Aug": 47.27, "Sep": 117.14, "Oct": null, "Nov": null, "Dec": null }
        };
        const defaultPieData = [
            { "name": "Income Factory", "currentYield": 10.77, "allocation": 0, "targetAllocation": null, "color": "#f59e0b" },
            { "name": "Low Risk", "currentYield": 4.42, "allocation": 0, "targetAllocation": null, "color": "#10b981" },
            { "name": "Medium Risk", "currentYield": 3.03, "allocation": 0, "targetAllocation": null, "color": "#8b5cf6" },
            { "name": "High Risk", "currentYield": 22.0, "allocation": 0, "targetAllocation": null, "color": "#ef4444" },
            { "name": "Top UK Payers", "currentYield": 8.21, "allocation": 0, "targetAllocation": null, "color": "#3b82f6" }
        ];
        const defaultYieldData = [
            { "date": "Oct 2025", "Income Factory": 10.77, "Low Risk": 4.42, "Medium Risk": 3.03, "High Risk": 22.0, "Top UK Payers": 8.21 },
            { "date": "Nov 2025", "Income Factory": null, "Low Risk": null, "Medium Risk": null, "High Risk": null, "Top UK Payers": null }
        ];
        const defaultPortfolioData = { portfolios: [], combinedGoal: 0 };

        const seedKeys = ['default', legacyHash];

        for (const key of seedKeys) {
            const { rows: divRows } = await sql`SELECT COUNT(*) as count FROM dividend_data WHERE account_key = ${key}`;
            if (divRows[0].count === '0') {
                await sql`INSERT INTO dividend_data (data, account_key) VALUES (${JSON.stringify(defaultDividendData)}, ${key})`;
            }
            const { rows: pieRows } = await sql`SELECT COUNT(*) as count FROM pie_allocations WHERE account_key = ${key}`;
            if (pieRows[0].count === '0') {
                await sql`INSERT INTO pie_allocations (data, account_key) VALUES (${JSON.stringify(defaultPieData)}, ${key})`;
            }
            const { rows: yieldRows } = await sql`SELECT COUNT(*) as count FROM yield_history WHERE account_key = ${key}`;
            if (yieldRows[0].count === '0') {
                await sql`INSERT INTO yield_history (data, account_key) VALUES (${JSON.stringify(defaultYieldData)}, ${key})`;
            }
            const { rows: portRows } = await sql`SELECT COUNT(*) as count FROM portfolio_data WHERE account_key = ${key}`;
            if (portRows[0].count === '0') {
                await sql`INSERT INTO portfolio_data (data, account_key) VALUES (${JSON.stringify(defaultPortfolioData)}, ${key})`;
            }
        }

        console.log('Connected to the Vercel Postgres database and tables are set up.');
    } catch (error) {
        console.error('Error setting up the database:', error);
        throw error;
    }
}

createTables();

module.exports = { sql };
