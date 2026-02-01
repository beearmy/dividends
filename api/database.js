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
        // This ensures the data is NOT "visible to all" anymore.
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

        // We do NOT seed the 'default' account with dummy data anymore,
        // so new users see a blank version as requested.
        // Existing users can regain their data by using the "This is an old password" checkbox
        // with their previous password in the Switch Account modal.

        console.log('Connected to the Vercel Postgres database and tables are set up.');
    } catch (error) {
        console.error('Error setting up the database:', error);
        throw error;
    }
}

createTables();

module.exports = { sql };
