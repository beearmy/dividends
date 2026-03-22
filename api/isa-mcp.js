const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Configuration ───────────────────────────────────────────────
const T212_BASE = 'https://live.trading212.com/api/v0';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min (inspired by lukeplausin/mcp-server-trading212)
const MAX_RETRIES = 3; // (inspired by KyuRish/trading212-mcp-server)

function getAuthHeader() {
  const key = process.env.T212_ISA_API_KEY;
  const secret = process.env.T212_ISA_API_SECRET;
  if (!key || !secret) throw new Error('T212 ISA API credentials not configured');
  const encoded = Buffer.from(`${key}:${secret}`).toString('base64');
  return `Basic ${encoded}`;
}

// ─── In-Memory Cache ────────────────────────────────────────────
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Rate-Limited Fetch with Auto-Retry ─────────────────────────
async function t212Fetch(path) {
  const cacheKey = `f:${path}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${T212_BASE}${path}`, {
      headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
    });

    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      const wait = reset ? Math.max(0, (parseInt(reset) * 1000) - Date.now()) + 500 : (attempt + 1) * 2000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      lastError = new Error(`T212 ${res.status}: ${text}`);
      if (res.status >= 500) { await new Promise(r => setTimeout(r, (attempt + 1) * 1000)); continue; }
      throw lastError;
    }

    const data = await res.json();
    cacheSet(cacheKey, data);
    return data;
  }
  throw lastError || new Error(`T212 failed after ${MAX_RETRIES} retries`);
}

async function t212Paginated(path, limit = 50) {
  const cacheKey = `p:${path}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let items = [];
  let nextPath = `${path}?limit=${limit}`;

  while (nextPath) {
    let data, lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(`${T212_BASE}${nextPath}`, {
        headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
      });
      if (res.status === 429) {
        const reset = res.headers.get('x-ratelimit-reset');
        const wait = reset ? Math.max(0, (parseInt(reset) * 1000) - Date.now()) + 500 : (attempt + 1) * 2000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        lastError = new Error(`T212 ${res.status}: ${text}`);
        if (res.status >= 500) { await new Promise(r => setTimeout(r, (attempt + 1) * 1000)); continue; }
        throw lastError;
      }
      data = await res.json();
      break;
    }
    if (!data) throw lastError || new Error('Paginated fetch failed');
    if (data.items) items = items.concat(data.items);
    nextPath = data.nextPagePath || null;
  }

  cacheSet(cacheKey, items);
  return items;
}

function r2(n) { return Math.round(n * 100) / 100; }

// ─── Tool Definitions ───────────────────────────────────────────
const TOOLS = [
  // --- Core T212 API ---
  { name: 'get_isa_summary',
    description: 'Get ISA account summary: cash, invested, total value, P&L, currency.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'get_isa_positions',
    description: 'Get all open ISA positions with ticker, quantity, avg price, current price, P&L.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'get_isa_dividends',
    description: 'Get full ISA dividend history. Auto-paginates all records.',
    inputSchema: { type: 'object', properties: {
      limit: { type: 'number', description: 'Records per page (default 50)' }
    }, required: [] } },

  { name: 'get_isa_orders',
    description: 'Get full ISA trade/order history. Auto-paginates.',
    inputSchema: { type: 'object', properties: {
      limit: { type: 'number', description: 'Records per page (default 50)' }
    }, required: [] } },

  { name: 'get_isa_transactions',
    description: 'Get ISA cash movements: deposits, withdrawals. Auto-paginates.',
    inputSchema: { type: 'object', properties: {
      limit: { type: 'number', description: 'Records per page (default 50)' }
    }, required: [] } },

  { name: 'get_isa_instruments',
    description: 'List all tradeable instruments on T212 (ticker, name, ISIN, currency, type).',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  // --- Composite Analytics ---
  { name: 'get_isa_income_analysis',
    description: 'Dividend income deep-dive: by ticker, month, year. Yield, YoY growth, frequency, payer count. FIRE income tracking.',
    inputSchema: { type: 'object', properties: {
      year: { type: 'number', description: 'Filter year (e.g. 2025). Omit for all-time.' }
    }, required: [] } },

  { name: 'get_isa_portfolio_performance',
    description: 'Per-position TOTAL RETURN = capital P&L + dividends received. Ranks by true Income Factory return. A stock down 5% but yielding 10% is winning.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'get_isa_portfolio_summary',
    description: 'Full snapshot: value, cash, P&L, top 10 holdings, allocation %, concentration risk.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'get_isa_fire_progress',
    description: 'FIRE tracker: MVL coverage ratio, income velocity, projected months to target, ISA utilisation, capital gap. Tailored to Metronome/Income Factory.',
    inputSchema: { type: 'object', properties: {
      mvlMonthly: { type: 'number', description: 'Minimum Viable Lifestyle monthly cost in GBP. Required.' },
      targetYield: { type: 'number', description: 'Target yield % (default 5.5).' },
      monthlyContribution: { type: 'number', description: 'Monthly ISA contribution in GBP (for projection).' },
    }, required: ['mvlMonthly'] } },

  { name: 'get_isa_recent_activity',
    description: 'Merged timeline: trades + dividends + transactions, newest first. Quick view of recent ISA activity.',
    inputSchema: { type: 'object', properties: {
      days: { type: 'number', description: 'Look back N days (default 30).' }
    }, required: [] } },
];

// ─── Tool Handlers ──────────────────────────────────────────────
async function handleTool(name, args) {
  switch (name) {

    // === Core ===
    case 'get_isa_summary':
      return JSON.stringify(await t212Fetch('/equity/account/summary'), null, 2);

    case 'get_isa_positions':
      return JSON.stringify(await t212Fetch('/equity/positions'), null, 2);

    case 'get_isa_dividends': {
      const items = await t212Paginated('/equity/history/dividends', args?.limit || 50);
      return JSON.stringify({ count: items.length, dividends: items }, null, 2);
    }

    case 'get_isa_orders': {
      const items = await t212Paginated('/equity/history/orders', args?.limit || 50);
      return JSON.stringify({ count: items.length, orders: items }, null, 2);
    }

    case 'get_isa_transactions': {
      const items = await t212Paginated('/equity/history/transactions', args?.limit || 50);
      return JSON.stringify({ count: items.length, transactions: items }, null, 2);
    }

    case 'get_isa_instruments':
      return JSON.stringify(await t212Fetch('/equity/metadata/instruments'), null, 2);

    // === Income Analysis ===
    case 'get_isa_income_analysis': {
      const [divs, summary] = await Promise.all([
        t212Paginated('/equity/history/dividends', 50),
        t212Fetch('/equity/account/summary'),
      ]);

      const byTicker = {}, byMonth = {}, byYear = {};

      for (const d of divs) {
        const dt = new Date(d.paidOn || d.reference);
        const y = dt.getFullYear(), m = dt.getMonth() + 1;
        const ym = `${y}-${String(m).padStart(2, '0')}`;
        const amt = d.amount || 0;
        if (args?.year && y !== args.year) continue;

        byTicker[d.ticker] = byTicker[d.ticker] || { total: 0, payments: 0 };
        byTicker[d.ticker].total += amt;
        byTicker[d.ticker].payments++;
        byMonth[ym] = (byMonth[ym] || 0) + amt;
        byYear[y] = (byYear[y] || 0) + amt;
      }

      const total = Object.values(byYear).reduce((a, b) => a + b, 0);
      const mKeys = Object.keys(byMonth).sort();
      const avgMo = mKeys.length ? total / mKeys.length : 0;
      const pv = summary?.totalValue || summary?.total || 0;
      const yld = pv > 0 ? ((avgMo * 12) / pv) * 100 : 0;

      const sorted = Object.entries(byTicker)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([t, d]) => ({ ticker: t, ...d, total: r2(d.total) }));

      const yrs = Object.keys(byYear).sort();
      const yoy = {};
      for (let i = 1; i < yrs.length; i++) {
        const prev = byYear[yrs[i - 1]], curr = byYear[yrs[i]];
        yoy[yrs[i]] = prev > 0 ? r2(((curr - prev) / prev) * 100) : null;
      }

      const withDivs = mKeys.filter(k => byMonth[k] > 0).length;

      return JSON.stringify({
        summary: {
          totalDividendIncome: r2(total),
          averageMonthlyIncome: r2(avgMo),
          projectedAnnualIncome: r2(avgMo * 12),
          currentPortfolioValue: r2(pv),
          estimatedYieldPct: r2(yld),
          dividendFrequencyPct: mKeys.length ? r2((withDivs / mKeys.length) * 100) : 0,
          totalPayments: divs.length,
          uniquePayers: Object.keys(byTicker).length,
          filterYear: args?.year || 'all-time',
        },
        incomeByYear: byYear, yearOverYearGrowth: yoy, incomeByMonth: byMonth,
        topPayersByIncome: sorted.slice(0, 20), allPayers: sorted,
      }, null, 2);
    }

    // === Portfolio Performance with Total Return ===
    case 'get_isa_portfolio_performance': {
      const [positions, divs, summary] = await Promise.all([
        t212Fetch('/equity/positions'),
        t212Paginated('/equity/history/dividends', 50),
        t212Fetch('/equity/account/summary'),
      ]);

      const divByTicker = {};
      for (const d of divs) {
        divByTicker[d.ticker] = (divByTicker[d.ticker] || 0) + (d.amount || 0);
      }

      const perf = (positions || []).map(p => {
        const val = p.currentPrice * p.quantity;
        const cost = p.averagePrice * p.quantity;
        const capPnL = p.ppl || (val - cost);
        const divRcvd = divByTicker[p.ticker] || 0;
        const totalRet = capPnL + divRcvd;
        return {
          ticker: p.ticker, quantity: p.quantity,
          avgPrice: r2(p.averagePrice), currentPrice: r2(p.currentPrice),
          currentValue: r2(val), costBasis: r2(cost),
          capitalPnL: r2(capPnL), capitalPnLPct: cost > 0 ? r2((capPnL / cost) * 100) : 0,
          dividendsReceived: r2(divRcvd),
          totalReturn: r2(totalRet), totalReturnPct: cost > 0 ? r2((totalRet / cost) * 100) : 0,
          yieldOnCost: cost > 0 ? r2((divRcvd / cost) * 100) : 0,
        };
      });

      perf.sort((a, b) => b.totalReturn - a.totalReturn);

      const totCap = perf.reduce((s, p) => s + p.capitalPnL, 0);
      const totDiv = perf.reduce((s, p) => s + p.dividendsReceived, 0);
      const pv = summary?.totalValue || summary?.total || 0;

      // Income Factory health: how many positions have positive total return despite negative capital P&L
      const incomeRescued = perf.filter(p => p.capitalPnL < 0 && p.totalReturn > 0);

      return JSON.stringify({
        summary: {
          portfolioValue: r2(pv), totalCapitalPnL: r2(totCap),
          totalDividendsReceived: r2(totDiv), totalCombinedReturn: r2(totCap + totDiv),
          positionCount: perf.length,
          incomeRescuedPositions: incomeRescued.length,
          incomeRescuedNote: `${incomeRescued.length} positions with negative price return but positive total return thanks to dividends`,
        },
        bestByTotalReturn: perf.slice(0, 5),
        worstByTotalReturn: perf.slice(-5).reverse(),
        incomeRescued,
        allPositions: perf,
      }, null, 2);
    }

    // === Portfolio Summary ===
    case 'get_isa_portfolio_summary': {
      const [positions, summary] = await Promise.all([
        t212Fetch('/equity/positions'),
        t212Fetch('/equity/account/summary'),
      ]);

      const pv = summary?.totalValue || summary?.total || 0;
      const cash = summary?.free || summary?.freeCash || 0;

      const holdings = (positions || []).map(p => {
        const val = p.currentPrice * p.quantity;
        return {
          ticker: p.ticker, quantity: p.quantity, currentValue: r2(val),
          allocationPct: pv > 0 ? r2((val / pv) * 100) : 0,
          pnl: r2(p.ppl || 0),
          pnlPct: r2(p.pplPct || ((p.currentPrice - p.averagePrice) / p.averagePrice) * 100),
        };
      }).sort((a, b) => b.currentValue - a.currentValue);

      const top5Val = holdings.slice(0, 5).reduce((s, h) => s + h.currentValue, 0);

      return JSON.stringify({
        account: {
          totalValue: r2(pv), invested: r2(summary?.invested || 0),
          cash: r2(cash), cashPct: pv > 0 ? r2((cash / pv) * 100) : 0,
          totalPnL: r2(summary?.ppl || 0), totalPnLPct: r2(summary?.pplPct || 0),
          positionCount: holdings.length,
        },
        concentration: {
          top5Pct: pv > 0 ? r2((top5Val / pv) * 100) : 0,
          largest: holdings[0] || null,
          smallest: holdings[holdings.length - 1] || null,
        },
        top10: holdings.slice(0, 10),
        allHoldings: holdings,
      }, null, 2);
    }

    // === FIRE Progress Tracker ===
    case 'get_isa_fire_progress': {
      const mvl = args?.mvlMonthly;
      if (!mvl || mvl <= 0) throw new Error('mvlMonthly required');
      const tgtYld = (args?.targetYield || 5.5) / 100;
      const moContrib = args?.monthlyContribution || 0;

      const [divs, summary, txns] = await Promise.all([
        t212Paginated('/equity/history/dividends', 50),
        t212Fetch('/equity/account/summary'),
        t212Paginated('/equity/history/transactions', 50),
      ]);

      const pv = summary?.totalValue || summary?.total || 0;
      const mvlAnnual = mvl * 12;
      const capitalNeeded = mvlAnnual / tgtYld;

      const now = new Date();
      const ago12 = new Date(now); ago12.setMonth(ago12.getMonth() - 12);
      const ago6 = new Date(now); ago6.setMonth(ago6.getMonth() - 6);

      let t12 = 0, t6 = 0;
      for (const d of divs) {
        const dt = new Date(d.paidOn || d.reference);
        const amt = d.amount || 0;
        if (dt >= ago12) t12 += amt;
        if (dt >= ago6) t6 += amt;
      }

      const prior6 = t12 - t6;
      const velocity = prior6 > 0 ? r2(((t6 - prior6) / prior6) * 100) : null;
      const annualised = t12 > 0 ? t12 : t6 * 2;
      const coverage = mvlAnnual > 0 ? r2((annualised / mvlAnnual) * 100) : 0;
      const actualYld = pv > 0 ? (annualised / pv) * 100 : 0;

      // Time-to-MVL projection
      const gap = capitalNeeded - pv;
      let monthsToMVL = null;
      if (gap <= 0) {
        monthsToMVL = 0;
      } else if (moContrib > 0) {
        const moRate = tgtYld / 12;
        let proj = pv, mo = 0;
        while (proj < capitalNeeded && mo < 600) {
          proj += moContrib + (proj * moRate);
          mo++;
        }
        monthsToMVL = mo < 600 ? mo : null;
      }

      // ISA utilisation
      const isaLimit = 20000;
      const tyStart = new Date(now.getFullYear(), 3, 6);
      if (now < tyStart) tyStart.setFullYear(tyStart.getFullYear() - 1);
      const deposits = txns
        .filter(t => {
          const dt = new Date(t.dateTime || t.reference);
          return dt >= tyStart && (t.type === 'DEPOSIT' || (t.amount && t.amount > 0));
        })
        .reduce((s, t) => s + Math.abs(t.amount || 0), 0);

      return JSON.stringify({
        fireStatus: {
          mvlMonthly: mvl, mvlAnnual, capitalRequired: r2(capitalNeeded),
          currentValue: r2(pv), capitalGap: r2(Math.max(0, gap)),
          progressPct: r2(Math.min(100, (pv / capitalNeeded) * 100)),
          mvlCovered: coverage >= 100,
        },
        income: {
          trailing12m: r2(t12), trailing6m: r2(t6),
          annualised: r2(annualised), mvlCoveragePct: coverage,
          actualYieldPct: r2(actualYld), targetYieldPct: r2(tgtYld * 100),
          velocityPct: velocity,
          velocityNote: velocity !== null ? (velocity > 0 ? 'Accelerating' : 'Decelerating') : 'Insufficient history',
        },
        projection: {
          monthlyContribution: moContrib,
          monthsToMVL, yearsToMVL: monthsToMVL != null ? r2(monthsToMVL / 12) : null,
          projectedDate: monthsToMVL === 0 ? 'ACHIEVED'
            : monthsToMVL ? new Date(Date.now() + monthsToMVL * 30.44 * 86400000).toISOString().split('T')[0]
            : 'Cannot project without monthly contribution',
          assumptions: `${r2(tgtYld * 100)}% yield, £${moContrib}/mo, dividends reinvested`,
        },
        isa: {
          allowance: isaLimit, deposited: r2(deposits),
          remaining: r2(isaLimit - deposits),
          usedPct: r2((deposits / isaLimit) * 100),
          taxYearStart: tyStart.toISOString().split('T')[0],
        },
      }, null, 2);
    }

    // === Recent Activity Timeline ===
    case 'get_isa_recent_activity': {
      const days = args?.days || 30;
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);

      const [orders, divs, txns] = await Promise.all([
        t212Paginated('/equity/history/orders', 50),
        t212Paginated('/equity/history/dividends', 50),
        t212Paginated('/equity/history/transactions', 50),
      ]);

      const events = [];

      for (const o of orders) {
        const dt = new Date(o.dateCreated || o.dateExecuted || o.reference);
        if (dt >= cutoff) events.push({
          type: 'TRADE', date: dt.toISOString(), ticker: o.ticker,
          action: o.type || (o.filledQuantity < 0 ? 'SELL' : 'BUY'),
          quantity: o.filledQuantity || o.quantity,
          price: o.filledPrice || o.limitPrice, value: o.filledValue, status: o.status,
        });
      }

      for (const d of divs) {
        const dt = new Date(d.paidOn || d.reference);
        if (dt >= cutoff) events.push({
          type: 'DIVIDEND', date: dt.toISOString(), ticker: d.ticker,
          amount: d.amount, quantity: d.quantity,
        });
      }

      for (const t of txns) {
        const dt = new Date(t.dateTime || t.reference);
        if (dt >= cutoff) events.push({
          type: t.type || 'TRANSACTION', date: dt.toISOString(),
          amount: t.amount, reference: t.reference,
        });
      }

      events.sort((a, b) => new Date(b.date) - new Date(a.date));

      return JSON.stringify({
        lookbackDays: days, totalEvents: events.length,
        trades: events.filter(e => e.type === 'TRADE').length,
        dividends: events.filter(e => e.type === 'DIVIDEND').length,
        otherTransactions: events.filter(e => e.type !== 'TRADE' && e.type !== 'DIVIDEND').length,
        timeline: events,
      }, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Auth ───────────────────────────────────────────────────
function auth(req) {
  const token = process.env.ISA_MCP_TOKEN;
  if (!token) return true;
  if (req.query?.token === token) return true;
  if (req.headers?.authorization === `Bearer ${token}`) return true;
  return false;
}

// ─── MCP Streamable HTTP ────────────────────────────────────────
app.post('/api/mcp/isa', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { jsonrpc, id, method, params } = req.body;
  if (jsonrpc !== '2.0') return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC' } });

  try {
    let result;
    switch (method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} },
          serverInfo: { name: 'Trading 212 ISA', version: '2.0.0' } };
        break;
      case 'notifications/initialized':
        return res.status(204).end();
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const { name, arguments: a } = params;
        try {
          result = { content: [{ type: 'text', text: await handleTool(name, a) }] };
        } catch (e) {
          result = { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
        }
        break;
      }
      case 'ping':
        result = {};
        break;
      default:
        return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
    }
    return res.json({ jsonrpc: '2.0', id, result });
  } catch (e) {
    return res.status(500).json({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
});

app.get('/api/mcp/isa', (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    name: 'Trading 212 ISA', version: '2.0.0',
    features: ['rate-limiting', 'auto-retry', 'caching', 'fire-tracking', 'total-return'],
    tools: TOOLS.map(t => t.name), status: 'ok',
  });
});

module.exports = app;
