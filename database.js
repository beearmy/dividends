const { sql } = require('@vercel/postgres');

async function createTables() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS dividend_data (
                id SERIAL PRIMARY KEY,
                data JSONB
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS pie_allocations (
                id SERIAL PRIMARY KEY,
                data JSONB
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS yield_history (
                id SERIAL PRIMARY KEY,
                data JSONB
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS portfolio_data (
                id SERIAL PRIMARY KEY,
                data JSONB
            );
        `;

        // Seed dividend_data
        const { rows: dividendRows } = await sql`SELECT COUNT(*) as count FROM dividend_data`;
        if (dividendRows[0].count === '0') {
            const defaultDividendData = {
                "2020": { "Jan": 2.38, "Feb": 8.05, "Mar": 6.29, "Apr": 0.63, "May": 6.29, "Jun": 6.27, "Jul": 5.96, "Aug": 11.07, "Sep": 15.34, "Oct": 0.71, "Nov": 9.19, "Dec": 6.77 },
                "2021": { "Jan": 2.74, "Feb": 82.94, "Mar": 12.42, "Apr": 4.28, "May": 4.01, "Jun": 9.11, "Jul": 8.97, "Aug": 18.00, "Sep": 18.24, "Oct": 3.07, "Nov": 9.00, "Dec": 6.28 },
                "2022": { "Jan": 3.50, "Feb": 10.80, "Mar": 8.00, "Apr": 12.00, "May": 8.50, "Jun": 23.00, "Jul": 6.00, "Aug": 14.00, "Sep": 23.50, "Oct": 2.20, "Nov": 11.00, "Dec": 9.00 },
                "2023": { "Jan": 5.85, "Feb": 13.39, "Mar": 11.00, "Apr": 9.77, "May": 10.69, "Jun": 24.19, "Jul": 7.29, "Aug": 23.16, "Sep": 26.96, "Oct": 9.50, "Nov": 16.61, "Dec": 17.56 },
                "2024": { "Jan": 7.33, "Feb": 8.26, "Mar": 11.89, "Apr": 19.69, "May": 19.44, "Jun": 33.42, "Jul": 27.60, "Aug": 19.03, "Sep": 34.56, "Oct": 30.54, "Nov": 20.31, "Dec": 33.85 },
                "2025": { "Jan": 35.85, "Feb": 25.20, "Mar": 44.84, "Apr": 53.72, "May": 44.76, "Jun": 62.39, "Jul": 75.65, "Aug": 47.27, "Sep": 117.14, "Oct": null, "Nov": null, "Dec": null }
            };
            await sql`INSERT INTO dividend_data (data) VALUES (${JSON.stringify(defaultDividendData)})`;
        }

        // Seed pie_allocations
        const { rows: pieRows } = await sql`SELECT COUNT(*) as count FROM pie_allocations`;
        if (pieRows[0].count === '0') {
            const defaultPieData = [
                { "name": "Income Factory", "currentYield": 10.77, "allocation": 0, "targetAllocation": null, "color": "#f59e0b" },
                { "name": "Low Risk", "currentYield": 4.42, "allocation": 0, "targetAllocation": null, "color": "#10b981" },
                { "name": "Medium Risk", "currentYield": 3.03, "allocation": 0, "targetAllocation": null, "color": "#8b5cf6" },
                { "name": "High Risk", "currentYield": 22.0, "allocation": 0, "targetAllocation": null, "color": "#ef4444" },
                { "name": "Top UK Payers", "currentYield": 8.21, "allocation": 0, "targetAllocation": null, "color": "#3b82f6" }
            ];
            await sql`INSERT INTO pie_allocations (data) VALUES (${JSON.stringify(defaultPieData)})`;
        }

        // Seed yield_history
        const { rows: yieldRows } = await sql`SELECT COUNT(*) as count FROM yield_history`;
        if (yieldRows[0].count === '0') {
            const defaultYieldData = [
                { "date": "Oct 2025", "Income Factory": 10.77, "Low Risk": 4.42, "Medium Risk": 3.03, "High Risk": 22.0, "Top UK Payers": 8.21 },
                { "date": "Nov 2025", "Income Factory": null, "Low Risk": null, "Medium Risk": null, "High Risk": null, "Top UK Payers": null }
            ];
            await sql`INSERT INTO yield_history (data) VALUES (${JSON.stringify(defaultYieldData)})`;
        }

        // Seed portfolio_data (empty — users populate their own)
        const { rows: portfolioRows } = await sql`SELECT COUNT(*) as count FROM portfolio_data`;
        if (portfolioRows[0].count === '0') {
            const defaultPortfolioData = { portfolios: [], combinedGoal: 0 };
            await sql`INSERT INTO portfolio_data (data) VALUES (${JSON.stringify(defaultPortfolioData)})`;
        }

        console.log('Connected to the Vercel Postgres database and tables are set up.');
    } catch (error) {
        console.error('Error setting up the database:', error);
        throw error;
    }
}

createTables();

module.exports = { sql };
