const express = require('express');
const cors = require('cors');
const { sql } = require('@vercel/postgres');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Configuration ───────────────────────────────────────────────
const T212_BASE = 'https://live.trading212.com/api/v0';
const MAX_RETRIES = 5;
const SEED_MAX_PAGES = 2;      // ~100 records per seed; keeps under 45s timeout
const BACKFILL_PAGES = 2;      // Gradually fills history over multiple calls
const INMEM_TTL_MS = 5 * 60 * 1000;
const PAGE_DELAY_MS = 11000;   // 6 req/60s = 10s min; 11s for safety

function getAuthHeader() {
  const key = process.env.T212_ISA_API_KEY;
  const secret = process.env.T212_ISA_API_SECRET;
  if (!key || !secret) throw new Error('T212 ISA API credentials not configured');
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

// Detect Cloudflare WAF block (returns HTML 403 when rate limited hard)
function isCloudflareBlock(status, text) {
  return status === 403 && (text.includes('<!DOCTYPE') || text.includes('Cloudflare') || text.includes('<html'));
}

// ─── In-Memory Cache (positions/summary only) ────────────────────
const memCache = new Map();
function memGet(key) {
  const e = memCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > INMEM_TTL_MS) { memCache.delete(key); return null; }
  return e.data;
}
function memSet(key, data) { memCache.set(key, { data, ts: Date.now() }); }

// ─── T212 Single Fetch (with retry + CF 403 handling) ─────────────
async function t212Fetch(path) {
  const cached = memGet(`f:${path}`);
  if (cached) return cached;
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${T212_BASE}${path}`, {
      headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      const wait = reset ? Math.max(0, (parseInt(reset) * 1000) - Date.now()) + 500 : (attempt + 1) * 5000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      if (isCloudflareBlock(res.status, text)) {
        // CF WAF block = aggressive rate limit; wait longer and retry
        const wait = (attempt + 1) * 15000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      lastError = new Error(`T212 ${res.status}: ${text}`);
      if (res.status >= 500) { await new Promise(r => setTimeout(r, (attempt + 1) * 2000)); continue; }
      throw lastError;
    }
    const data = await res.json();
    memSet(`f:${path}`, data);
    return data;
  }
  throw lastError || new Error(`T212 failed after ${MAX_RETRIES} retries`);
}

// ─── T212 Single Page Fetch (with retry + CF 403 handling) ────────
async function t212FetchPage(pagePath) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${T212_BASE}${pagePath}`, {
      headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      const wait = reset ? Math.max(0, (parseInt(reset) * 1000) - Date.now()) + 500 : (attempt + 1) * 5000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      if (isCloudflareBlock(res.status, text)) {
        const wait = (attempt + 1) * 15000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      lastError = new Error(`T212 ${res.status}: ${text}`);
      if (res.status >= 500) { await new Promise(r => setTimeout(r, (attempt + 1) * 2000)); continue; }
      throw lastError;
    }
    const data = await res.json();
    const raw = data.nextPagePath || null;
    const nextPath = raw ? raw.replace(/^\/api\/v0/, '') : null;
    return { items: data.items || [], nextPath };
  }
  throw lastError || new Error('Page fetch failed');
}

// ─── Postgres Cache Layer ────────────────────────────────────────
let dbReady = false;
async function ensureIsaCache() {
  if (dbReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS isa_cache (
      type VARCHAR(50) PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '[]'::jsonb,
      newest_ref VARCHAR(255),
      continuation_path TEXT,
      last_synced TIMESTAMPTZ,
      record_count INTEGER DEFAULT 0,
      fully_synced BOOLEAN DEFAULT false
    )
  `;
  dbReady = true;
}

async function dbGet(type) {
  await ensureIsaCache();
  const { rows } = await sql`SELECT * FROM isa_cache WHERE type = ${type}`;
  return rows[0] || null;
}

async function dbSave(type, data, newestRef, continuationPath, fullySynced) {
  await ensureIsaCache();
  await sql`
    INSERT INTO isa_cache (type, data, newest_ref, continuation_path, last_synced, record_count, fully_synced)
    VALUES (${type}, ${JSON.stringify(data)}, ${newestRef}, ${continuationPath}, NOW(), ${data.length}, ${fullySynced})
    ON CONFLICT (type) DO UPDATE SET
      data = ${JSON.stringify(data)},
      newest_ref = ${newestRef},
      continuation_path = ${continuationPath},
      last_synced = NOW(),
      record_count = ${data.length},
      fully_synced = ${fullySynced}
  `;
}

// ─── Incremental History Fetch ───────────────────────────────────
function getRef(item, type) {
  if (type === 'orders') return item.order?.id?.toString() || item.fill?.id?.toString() || item.reference;
  return item.reference;
}

async function getCachedHistory(type, apiPath) {
  const cached = await dbGet(type);

  if (!cached) {
    // === SEED: First-ever fetch ===
    let items = [];
    let nextPath = `${apiPath}?limit=50`;
    let pages = 0;
    while (nextPath && pages < SEED_MAX_PAGES) {
      if (pages > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
      const page = await t212FetchPage(nextPath);
      items = items.concat(page.items);
      nextPath = page.nextPath;
      pages++;
    }
    const newestRef = items.length > 0 ? getRef(items[0], type) : null;
    const fullySynced = !nextPath;
    await dbSave(type, items, newestRef, nextPath, fullySynced);
    return { items, synced: fullySynced, count: items.length, newRecords: items.length, backfilled: 0 };
  }

  // === INCREMENTAL: Fetch new records from the top ===
  const existingData = cached.data || [];
  const knownRefs = new Set(existingData.map(item => getRef(item, type)).filter(Boolean));
  let newItems = [];
  let nextPath = `${apiPath}?limit=50`;
  let foundOverlap = false;
  let incPages = 0;

  while (nextPath && !foundOverlap) {
    if (incPages > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
    const page = await t212FetchPage(nextPath);
    for (const item of page.items) {
      if (knownRefs.has(getRef(item, type))) {
        foundOverlap = true;
        break;
      }
      newItems.push(item);
    }
    nextPath = foundOverlap ? null : page.nextPath;
    incPages++;
  }

  // === BACKFILL: Continue loading older pages if not fully synced ===
  let continuationPath = cached.continuation_path;
  let backfillItems = [];
  if (continuationPath && !cached.fully_synced) {
    let pages = 0;
    while (continuationPath && pages < BACKFILL_PAGES) {
      if (pages > 0 || incPages > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
      const page = await t212FetchPage(continuationPath);
      backfillItems = backfillItems.concat(page.items);
      continuationPath = page.nextPath;
      pages++;
    }
  }

  // Merge: new (prepend) + existing + backfill (append)
  const merged = [...newItems, ...existingData, ...backfillItems];
  const newestRef = merged.length > 0 ? getRef(merged[0], type) : cached.newest_ref;
  const fullySynced = !continuationPath;

  if (newItems.length > 0 || backfillItems.length > 0) {
    await dbSave(type, merged, newestRef, continuationPath, fullySynced);
  }

  return {
    items: merged, synced: fullySynced, count: merged.length,
    newRecords: newItems.length, backfilled: backfillItems.length,
  };
}

function r2(n) { return Math.round(n * 100) / 100; }

// ─── T212 CSV Export Parser ─────────────────────────────────────
function parseT212Csv(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { dividends: [], orders: [], transactions: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV fields
    const vals = [];
    let current = '';
    let inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }
  // Classify rows by Action field — T212 CSV uses "Action" column
  const dividends = [];
  const orders = [];
  const transactions = [];
  for (const row of rows) {
    const action = (row['Action'] || '').toUpperCase();
    const time = row['Time'] || row['Date'] || '';
    const ticker = row['Ticker'] || '';
    const amount = parseFloat(row['Total'] || row['Amount'] || '0') || 0;
    const shares = parseFloat(row['No. of shares'] || row['Shares'] || '0') || 0;
    const price = parseFloat(row['Price / share'] || row['Price'] || '0') || 0;
    const currency = row['Currency (Total)'] || row['Currency'] || 'GBP';
    const ref = row['ID'] || row['Order ID'] || `csv-${time}-${ticker}-${action}`;
    if (action.includes('DIVIDEND') || action.includes('INTEREST') || action === 'LENDING INTEREST') {
      dividends.push({
        type: action.includes('INTEREST') ? 'INTEREST' : 'DIVIDEND',
        amount: Math.abs(amount),
        paidOn: time,
        ticker: ticker,
        currency: currency,
        quantity: shares,
        reference: ref,
        instrument: { name: row['Name'] || '', ticker },
      });
    } else if (action.includes('BUY') || action.includes('SELL') || action === 'MARKET ORDER'
               || action.includes('LIMIT') || action.includes('STOP')) {
      orders.push({
        order: {
          id: ref,
          createdAt: time,
          side: action.includes('SELL') ? 'SELL' : 'BUY',
          status: 'FILLED',
          filledQuantity: shares,
          filledValue: Math.abs(amount),
          instrument: { ticker, name: row['Name'] || '' },
        },
        fill: { price, filledAt: time },
        reference: ref,
      });
    } else if (action.includes('DEPOSIT') || action.includes('WITHDRAW') || action.includes('TRANSFER')
               || action.includes('CONVERSION') || action === 'CASH COLLECTION') {
      transactions.push({
        type: action.includes('WITHDRAW') ? 'WITHDRAWAL' : 'DEPOSIT',
        dateTime: time,
        amount: amount,
        reference: ref,
      });
    }
    // Skip unknown action types silently
  }
  // Sort newest first (matching T212 API pagination order)
  const byDate = (a, b) => new Date(b.paidOn || b.order?.createdAt || b.dateTime || 0) - new Date(a.paidOn || a.order?.createdAt || a.dateTime || 0);
  dividends.sort(byDate);
  orders.sort(byDate);
  transactions.sort(byDate);
  return { dividends, orders, transactions };
}

// ─── Tool Definitions ───────────────────────────────────────────
const TOOLS = [
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
  { name: 'seed_isa_cache',
    description: 'ONE-TIME SETUP: Request a CSV export from T212 containing ALL dividends, orders, and transactions. Returns a reportId. Then call seed_isa_status to check progress and import. Only needed once — after seeding, all tools work instantly.',
    inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: 'seed_isa_status',
    description: 'Check the status of a CSV export seed. When Finished, downloads and imports ALL history into cache. Call this after seed_isa_cache. May need to call a few times while T212 generates the report.',
    inputSchema: { type: 'object', properties: {
      reportId: { type: 'number', description: 'The reportId from seed_isa_cache. If omitted, checks the most recent report.' }
    }, required: [] } },
];

// ─── Tool Handlers ──────────────────────────────────────────────
async function handleTool(name, args) {
  switch (name) {
    case 'get_isa_summary':
      return JSON.stringify(await t212Fetch('/equity/account/summary'), null, 2);

    case 'get_isa_positions':
      return JSON.stringify(await t212Fetch('/equity/positions'), null, 2);

    case 'get_isa_instruments':
      return JSON.stringify(await t212Fetch('/equity/metadata/instruments'), null, 2);

    case 'get_isa_dividends': {
      const result = await getCachedHistory('dividends', '/equity/history/dividends');
      return JSON.stringify({ count: result.count, synced: result.synced,
        newRecords: result.newRecords, backfilled: result.backfilled,
        dividends: result.items }, null, 2);
    }

    case 'get_isa_orders': {
      const result = await getCachedHistory('orders', '/equity/history/orders');
      return JSON.stringify({ count: result.count, synced: result.synced,
        newRecords: result.newRecords, backfilled: result.backfilled,
        orders: result.items }, null, 2);
    }

    case 'get_isa_transactions': {
      const result = await getCachedHistory('transactions', '/equity/history/transactions');
      return JSON.stringify({ count: result.count, synced: result.synced,
        newRecords: result.newRecords, backfilled: result.backfilled,
        transactions: result.items }, null, 2);
    }

    case 'get_isa_income_analysis': {
      const divResult = await getCachedHistory('dividends', '/equity/history/dividends');
      const summary = await t212Fetch('/equity/account/summary');
      const divs = divResult.items;
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
      const pv = summary?.totalValue || 0;
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
        sync: { records: divResult.count, fullySynced: divResult.synced,
          newRecords: divResult.newRecords, backfilled: divResult.backfilled },
        summary: {
          totalDividendIncome: r2(total), averageMonthlyIncome: r2(avgMo),
          projectedAnnualIncome: r2(avgMo * 12), currentPortfolioValue: r2(pv),
          estimatedYieldPct: r2(yld),
          dividendFrequencyPct: mKeys.length ? r2((withDivs / mKeys.length) * 100) : 0,
          totalPayments: divs.length, uniquePayers: Object.keys(byTicker).length,
          filterYear: args?.year || 'all-time',
        },
        incomeByYear: byYear, yearOverYearGrowth: yoy, incomeByMonth: byMonth,
        topPayersByIncome: sorted.slice(0, 20), allPayers: sorted,
      }, null, 2);
    }

    case 'get_isa_portfolio_performance': {
      const positions = await t212Fetch('/equity/positions');
      const divResult = await getCachedHistory('dividends', '/equity/history/dividends');
      const summary = await t212Fetch('/equity/account/summary');
      const divByTicker = {};
      for (const d of divResult.items) {
        const tk = d.ticker || d.instrument?.ticker;
        if (tk) divByTicker[tk] = (divByTicker[tk] || 0) + (d.amount || 0);
      }
      const perf = (positions || []).map(p => {
        const ticker = p.instrument?.ticker || p.ticker || 'UNKNOWN';
        const name = p.instrument?.name || '';
        const val = p.walletImpact?.currentValue || 0;
        const cost = p.walletImpact?.totalCost || 0;
        const capPnL = p.walletImpact?.unrealizedProfitLoss || 0;
        const divRcvd = divByTicker[ticker] || 0;
        const totalRet = capPnL + divRcvd;
        return {
          ticker, name, quantity: p.quantity,
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
      const pv = summary?.totalValue || 0;
      const incomeRescued = perf.filter(p => p.capitalPnL < 0 && p.totalReturn > 0);
      return JSON.stringify({
        sync: { dividendRecords: divResult.count, fullySynced: divResult.synced },
        summary: {
          portfolioValue: r2(pv), totalCapitalPnL: r2(totCap),
          totalDividendsReceived: r2(totDiv), totalCombinedReturn: r2(totCap + totDiv),
          positionCount: perf.length, incomeRescuedPositions: incomeRescued.length,
          incomeRescuedNote: `${incomeRescued.length} positions rescued by dividends`,
        },
        bestByTotalReturn: perf.slice(0, 5),
        worstByTotalReturn: perf.slice(-5).reverse(),
        incomeRescued, allPositions: perf,
      }, null, 2);
    }

    case 'get_isa_portfolio_summary': {
      const [positions, summary] = await Promise.all([
        t212Fetch('/equity/positions'),
        t212Fetch('/equity/account/summary'),
      ]);
      const pv = summary?.totalValue || 0;
      const cash = summary?.cash?.availableToTrade || 0;
      const invested = summary?.investments?.totalCost || 0;
      const unrealPnL = summary?.investments?.unrealizedProfitLoss || 0;
      const realPnL = summary?.investments?.realizedProfitLoss || 0;
      const holdings = (positions || []).map(p => {
        const val = p.walletImpact?.currentValue || 0;
        const cost = p.walletImpact?.totalCost || 0;
        const pnl = p.walletImpact?.unrealizedProfitLoss || 0;
        const ticker = p.instrument?.ticker || p.ticker || 'UNKNOWN';
        const name = p.instrument?.name || '';
        return {
          ticker, name, quantity: p.quantity, currentValue: r2(val),
          allocationPct: pv > 0 ? r2((val / pv) * 100) : 0,
          pnl: r2(pnl), pnlPct: cost > 0 ? r2((pnl / cost) * 100) : 0,
        };
      }).sort((a, b) => b.currentValue - a.currentValue);
      const top5Val = holdings.slice(0, 5).reduce((s, h) => s + h.currentValue, 0);
      return JSON.stringify({
        account: {
          totalValue: r2(pv), invested: r2(invested),
          cash: r2(cash), cashPct: pv > 0 ? r2((cash / pv) * 100) : 0,
          unrealizedPnL: r2(unrealPnL), realizedPnL: r2(realPnL),
          unrealizedPnLPct: invested > 0 ? r2((unrealPnL / invested) * 100) : 0,
          positionCount: holdings.length,
        },
        concentration: {
          top5Pct: pv > 0 ? r2((top5Val / pv) * 100) : 0,
          largest: holdings[0] || null, smallest: holdings[holdings.length - 1] || null,
        },
        top10: holdings.slice(0, 10), allHoldings: holdings,
      }, null, 2);
    }

    case 'get_isa_fire_progress': {
      const mvl = args?.mvlMonthly;
      if (!mvl || mvl <= 0) throw new Error('mvlMonthly required');
      const tgtYld = (args?.targetYield || 5.5) / 100;
      const moContrib = args?.monthlyContribution || 0;
      // Serialise: history endpoints share a 6 req/60s rate limit
      const summary = await t212Fetch('/equity/account/summary');
      const divResult = await getCachedHistory('dividends', '/equity/history/dividends');
      const txnResult = await getCachedHistory('transactions', '/equity/history/transactions');
      const divs = divResult.items;
      const txns = txnResult.items;
      const pv = summary?.totalValue || 0;
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
      const gap = capitalNeeded - pv;
      let monthsToMVL = null;
      if (gap <= 0) { monthsToMVL = 0; }
      else if (moContrib > 0) {
        const moRate = tgtYld / 12;
        let proj = pv, mo = 0;
        while (proj < capitalNeeded && mo < 600) { proj += moContrib + (proj * moRate); mo++; }
        monthsToMVL = mo < 600 ? mo : null;
      }
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
        sync: { dividends: divResult.count, transactions: txnResult.count,
          divsSynced: divResult.synced, txnsSynced: txnResult.synced },
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
          assumptions: `${r2(tgtYld * 100)}% yield, GBP${moContrib}/mo, dividends reinvested`,
        },
        isa: {
          allowance: isaLimit, deposited: r2(deposits),
          remaining: r2(isaLimit - deposits),
          usedPct: r2((deposits / isaLimit) * 100),
          taxYearStart: tyStart.toISOString().split('T')[0],
        },
      }, null, 2);
    }

    case 'get_isa_recent_activity': {
      const days = args?.days || 30;
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      // Serialise: history endpoints share a 6 req/60s rate limit
      const orderResult = await getCachedHistory('orders', '/equity/history/orders');
      const divResult = await getCachedHistory('dividends', '/equity/history/dividends');
      const txnResult = await getCachedHistory('transactions', '/equity/history/transactions');
      const events = [];
      for (const o of orderResult.items) {
        const ord = o.order || o;
        const fill = o.fill || {};
        const dt = new Date(ord.createdAt || fill.filledAt || ord.reference || o.reference);
        if (dt >= cutoff) events.push({
          type: 'TRADE', date: dt.toISOString(),
          ticker: ord.instrument?.ticker || ord.ticker,
          action: ord.side || (ord.filledQuantity < 0 ? 'SELL' : 'BUY'),
          quantity: ord.filledQuantity || ord.quantity,
          price: fill.price || ord.limitPrice, value: ord.filledValue, status: ord.status,
        });
      }
      for (const d of divResult.items) {
        const dt = new Date(d.paidOn || d.reference);
        if (dt >= cutoff) events.push({
          type: 'DIVIDEND', date: dt.toISOString(), ticker: d.ticker,
          amount: d.amount, quantity: d.quantity,
        });
      }
      for (const t of txnResult.items) {
        const dt = new Date(t.dateTime || t.reference);
        if (dt >= cutoff) events.push({
          type: t.type || 'TRANSACTION', date: dt.toISOString(),
          amount: t.amount, reference: t.reference,
        });
      }
      events.sort((a, b) => new Date(b.date) - new Date(a.date));
      return JSON.stringify({
        sync: {
          orders: `${orderResult.count} (synced: ${orderResult.synced})`,
          dividends: `${divResult.count} (synced: ${divResult.synced})`,
          transactions: `${txnResult.count} (synced: ${txnResult.synced})`,
        },
        lookbackDays: days, totalEvents: events.length,
        trades: events.filter(e => e.type === 'TRADE').length,
        dividends: events.filter(e => e.type === 'DIVIDEND').length,
        otherTransactions: events.filter(e => e.type !== 'TRADE' && e.type !== 'DIVIDEND').length,
        timeline: events,
      }, null, 2);
    }

    case 'seed_isa_cache': {
      // Request a CSV export containing all history from T212
      const timeFrom = '2020-01-01T00:00:00Z';
      const timeTo = new Date().toISOString();
      const res = await fetch(`${T212_BASE}/equity/history/exports`, {
        method: 'POST',
        headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataIncluded: {
            includeDividends: true,
            includeInterest: true,
            includeOrders: true,
            includeTransactions: true,
          },
          timeFrom,
          timeTo,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`T212 export request failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      return JSON.stringify({
        status: 'EXPORT_REQUESTED',
        reportId: data.reportId,
        message: 'CSV export requested from T212. Call seed_isa_status to check progress — T212 usually takes 10-30 seconds to generate. Once Finished, it will auto-import into cache.',
        timeFrom,
        timeTo,
      }, null, 2);
    }

    case 'seed_isa_status': {
      // Check export status and import when ready
      const reports = await t212Fetch('/equity/history/exports');
      if (!reports || !Array.isArray(reports) || reports.length === 0) {
        return JSON.stringify({ status: 'NO_REPORTS', message: 'No export reports found. Call seed_isa_cache first.' }, null, 2);
      }
      const targetId = args?.reportId;
      const report = targetId
        ? reports.find(r => r.reportId === targetId)
        : reports[reports.length - 1]; // most recent
      if (!report) {
        return JSON.stringify({ status: 'NOT_FOUND', reportId: targetId, available: reports.map(r => r.reportId) }, null, 2);
      }
      if (report.status !== 'Finished') {
        return JSON.stringify({
          status: report.status,
          reportId: report.reportId,
          message: `Report is ${report.status}. Call seed_isa_status again in a few seconds.`,
        }, null, 2);
      }
      // Download and parse the CSV
      const csvRes = await fetch(report.downloadLink);
      if (!csvRes.ok) throw new Error(`Failed to download CSV: ${csvRes.status}`);
      const csvText = await csvRes.text();
      const parsed = parseT212Csv(csvText);
      // Save each type to Postgres
      const results = {};
      for (const type of ['dividends', 'orders', 'transactions']) {
        const items = parsed[type] || [];
        if (items.length > 0) {
          const newestRef = getRef(items[0], type);
          await dbSave(type, items, newestRef, null, true);
          results[type] = { count: items.length, fullySynced: true };
        } else {
          results[type] = { count: 0, note: 'No records in CSV for this type' };
        }
      }
      return JSON.stringify({
        status: 'SEEDED',
        reportId: report.reportId,
        message: 'All history imported from CSV into Postgres cache. All tools should now work instantly.',
        results,
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
          serverInfo: { name: 'Trading 212 ISA', version: '3.2.0' } };
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
    name: 'Trading 212 ISA', version: '3.2.0',
    features: ['incremental-sync', 'postgres-cache', 'rate-limiting', 'auto-retry', 'fire-tracking', 'total-return'],
    tools: TOOLS.map(t => t.name), status: 'ok',
  });
});

module.exports = app;
