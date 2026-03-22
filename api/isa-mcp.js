const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Configuration ───────────────────────────────────────────────
const T212_BASE = 'https://live.trading212.com/api/v0';

function getAuthHeader() {
  const key = process.env.T212_ISA_API_KEY;
  const secret = process.env.T212_ISA_API_SECRET;
  if (!key || !secret) throw new Error('T212 ISA API credentials not configured');
  const encoded = Buffer.from(`${key}:${secret}`).toString('base64');
  return `Basic ${encoded}`;
}

// ─── Trading 212 API Client (Read-Only) ─────────────────────────
async function t212Fetch(path, options = {}) {
  const url = `${T212_BASE}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`T212 API Error (${res.status}): ${text}`);
  }

  return res.json();
}

async function t212FetchPaginated(path, limit = 50) {
  let allItems = [];
  let nextPath = `${path}?limit=${limit}`;

  while (nextPath) {
    const url = `${T212_BASE}${nextPath}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`T212 API Error (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (data.items) allItems = allItems.concat(data.items);
    nextPath = data.nextPagePath || null;
  }

  return allItems;
}

// ─── Tool Definitions ───────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_isa_summary',
    description: 'Get ISA account summary: cash balance, invested amount, total value, P&L, and account currency. Use this for a quick portfolio overview.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_isa_positions',
    description: 'Get all open ISA positions with ticker, quantity, average price, current price, P&L in GBP, and P&L percentage. Returns every holding in the ISA.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_isa_dividends',
    description: 'Get ISA dividend payment history. Returns all dividend payments received with date, ticker, amount, and quantity. Paginated — fetches all records automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records per page (default 50, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_isa_orders',
    description: 'Get ISA order/trade history. Returns all executed orders with date, ticker, action (buy/sell), quantity, price, and value. Paginated — fetches all records automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records per page (default 50, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_isa_transactions',
    description: 'Get ISA transaction history: deposits, withdrawals, and other cash movements. Paginated — fetches all records automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records per page (default 50, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_isa_instruments',
    description: 'Search all tradeable instruments on Trading 212. Returns ticker, name, ISIN, currency, and type. Useful for looking up specific stocks or ETFs.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_isa_income_analysis',
    description: 'Composite tool: analyses ISA dividend income. Groups dividends by ticker and by month/year. Calculates total income, average monthly income, income growth rate, and estimated annual yield based on current portfolio value. Use this for FIRE progress tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Filter to a specific year (e.g. 2025). Omit for all-time.' },
      },
      required: [],
    },
  },
];

// ─── Tool Handlers ──────────────────────────────────────────────
async function handleToolCall(name, args) {
  switch (name) {
    case 'get_isa_summary': {
      const data = await t212Fetch('/equity/account/summary');
      return JSON.stringify(data, null, 2);
    }

    case 'get_isa_positions': {
      const data = await t212Fetch('/equity/positions');
      return JSON.stringify(data, null, 2);
    }

    case 'get_isa_dividends': {
      const limit = args?.limit || 50;
      const items = await t212FetchPaginated('/equity/history/dividends', limit);
      return JSON.stringify({ count: items.length, dividends: items }, null, 2);
    }

    case 'get_isa_orders': {
      const limit = args?.limit || 50;
      const items = await t212FetchPaginated('/equity/history/orders', limit);
      return JSON.stringify({ count: items.length, orders: items }, null, 2);
    }

    case 'get_isa_transactions': {
      const limit = args?.limit || 50;
      const items = await t212FetchPaginated('/equity/history/transactions', limit);
      return JSON.stringify({ count: items.length, transactions: items }, null, 2);
    }

    case 'get_isa_instruments': {
      const data = await t212Fetch('/equity/metadata/instruments');
      return JSON.stringify({ count: data.length, instruments: data }, null, 2);
    }

    case 'get_isa_income_analysis': {
      // Fetch dividends and account summary in parallel
      const [dividends, summary] = await Promise.all([
        t212FetchPaginated('/equity/history/dividends', 50),
        t212Fetch('/equity/account/summary'),
      ]);

      // Group by ticker
      const byTicker = {};
      // Group by year-month
      const byMonth = {};
      // Group by year
      const byYear = {};

      for (const div of dividends) {
        const date = new Date(div.paidOn || div.reference);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const ticker = div.ticker;
        const amount = div.amount || 0;

        // Filter by year if specified
        if (args?.year && year !== args.year) continue;

        // By ticker
        if (!byTicker[ticker]) byTicker[ticker] = { total: 0, payments: 0 };
        byTicker[ticker].total += amount;
        byTicker[ticker].payments += 1;

        // By month
        if (!byMonth[yearMonth]) byMonth[yearMonth] = 0;
        byMonth[yearMonth] += amount;

        // By year
        if (!byYear[year]) byYear[year] = 0;
        byYear[year] += amount;
      }

      // Calculate metrics
      const totalIncome = Object.values(byYear).reduce((a, b) => a + b, 0);
      const monthKeys = Object.keys(byMonth).sort();
      const avgMonthlyIncome = monthKeys.length > 0 ? totalIncome / monthKeys.length : 0;
      const portfolioValue = summary?.totalValue || summary?.total || 0;
      const estimatedYield = portfolioValue > 0 ? ((avgMonthlyIncome * 12) / portfolioValue) * 100 : 0;

      // Sort tickers by total income descending
      const sortedTickers = Object.entries(byTicker)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([ticker, data]) => ({ ticker, ...data, total: Math.round(data.total * 100) / 100 }));

      // Year-over-year growth
      const years = Object.keys(byYear).sort();
      const yoyGrowth = {};
      for (let i = 1; i < years.length; i++) {
        const prev = byYear[years[i - 1]];
        const curr = byYear[years[i]];
        yoyGrowth[years[i]] = prev > 0 ? Math.round(((curr - prev) / prev) * 10000) / 100 : null;
      }

      const result = {
        summary: {
          totalDividendIncome: Math.round(totalIncome * 100) / 100,
          averageMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
          projectedAnnualIncome: Math.round(avgMonthlyIncome * 12 * 100) / 100,
          currentPortfolioValue: Math.round(portfolioValue * 100) / 100,
          estimatedYieldPercent: Math.round(estimatedYield * 100) / 100,
          filterYear: args?.year || 'all-time',
        },
        incomeByYear: byYear,
        yearOverYearGrowth: yoyGrowth,
        incomeByMonth: byMonth,
        topPayersByIncome: sortedTickers.slice(0, 20),
        allPayers: sortedTickers,
      };

      return JSON.stringify(result, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Token Auth ─────────────────────────────────────────────
function authenticateRequest(req) {
  const token = process.env.ISA_MCP_TOKEN;
  if (!token) return true; // No token configured = no auth (dev mode)

  // Check query param
  if (req.query?.token === token) return true;

  // Check Authorization header
  const authHeader = req.headers?.authorization;
  if (authHeader === `Bearer ${token}`) return true;

  return false;
}

// ─── MCP Streamable HTTP Transport ──────────────────────────────
app.post('/api/mcp/isa', async (req, res) => {
  if (!authenticateRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC version' } });
  }

  try {
    let result;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'Trading 212 ISA',
            version: '1.0.0',
          },
        };
        break;

      case 'notifications/initialized':
        // Client acknowledgement — no response needed for notifications
        return res.status(204).end();

      case 'tools/list':
        result = { tools: TOOLS };
        break;

      case 'tools/call': {
        const { name, arguments: args } = params;
        try {
          const content = await handleToolCall(name, args);
          result = {
            content: [{ type: 'text', text: content }],
          };
        } catch (toolError) {
          result = {
            content: [{ type: 'text', text: `Error: ${toolError.message}` }],
            isError: true,
          };
        }
        break;
      }

      case 'ping':
        result = {};
        break;

      default:
        return res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }

    return res.json({ jsonrpc: '2.0', id, result });
  } catch (error) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error.message },
    });
  }
});

// Health check / info endpoint
app.get('/api/mcp/isa', (req, res) => {
  if (!authenticateRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    name: 'Trading 212 ISA MCP Server',
    version: '1.0.0',
    transport: 'streamable-http',
    tools: TOOLS.map(t => t.name),
    status: 'ok',
  });
});

module.exports = app;
