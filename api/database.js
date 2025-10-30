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

        // Check if dividend_data is empty, and if so, insert an empty object.
        const { rows: dividendRows } = await sql`SELECT COUNT(*) as count FROM dividend_data`;
        if (dividendRows[0].count === '0') {
            await sql`INSERT INTO dividend_data (data) VALUES ('{}')`;
        }

        // Check if pie_allocations is empty, and if so, insert an empty array.
        const { rows: pieRows } = await sql`SELECT COUNT(*) as count FROM pie_allocations`;
        if (pieRows[0].count === '0') {
            await sql`INSERT INTO pie_allocations (data) VALUES ('[]')`;
        }

        // Check if yield_history is empty, and if so, insert an empty array.
        const { rows: yieldRows } = await sql`SELECT COUNT(*) as count FROM yield_history`;
        if (yieldRows[0].count === '0') {
            await sql`INSERT INTO yield_history (data) VALUES ('[]')`;
        }


        console.log('Connected to the Vercel Postgres database and tables are set up.');
    } catch (error) {
        console.error('Error setting up the database:', error);
        throw error;
    }
}

createTables();

module.exports = { sql };
