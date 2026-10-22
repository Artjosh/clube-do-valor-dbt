import snapshot from '../data/analytics.json' with { type: 'json' };

export type Filters = { client?: string; asset?: string; from?: string; to?: string; operation?: 'BUY' | 'SELL'; q?: string };
const SCALE = 100000000n;
function fixed(value: string | number): bigint {
  const text = String(value);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  return (negative ? -1n : 1n) * (BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0').slice(0, 8)));
}
function numeric(value: bigint): number { return Number(value) / Number(SCALE); }
function decimal(value: bigint, places = 8): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / SCALE}.${String(absolute % SCALE).padStart(8, '0').slice(0, places)}`;
}
function textMatch(value: string, query: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'));
}

export function parseFilters(params: URLSearchParams): Filters {
  const filters: Filters = {};
  for (const key of ['client', 'asset', 'from', 'to', 'operation', 'q'] as const) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (value.length > (key === 'q' ? 120 : 32)) throw new Error(`Filtro ${key} muito longo.`);
    if ((key === 'from' || key === 'to') && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error('Data inválida. Use AAAA-MM-DD.');
    if (key === 'operation' && !['BUY', 'SELL'].includes(value)) throw new Error('Operação inválida.');
    if ((key === 'client' || key === 'asset') && !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Filtro ${key} inválido.`);
    Object.assign(filters, { [key]: value });
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('A data inicial deve ser anterior à final.');
  return filters;
}

function selected(filters: Filters) {
  return snapshot.transactions.filter(row =>
    (!filters.client || row.client_id === filters.client) &&
    (!filters.asset || row.asset_ticker === filters.asset) &&
    (!filters.from || row.transaction_date >= filters.from) &&
    (!filters.to || row.transaction_date <= filters.to) &&
    (!filters.operation || row.operation === filters.operation) &&
    (!filters.q || textMatch(`${row.transaction_id} ${row.client_id} ${row.client_name} ${row.asset_ticker} ${row.city} ${row.state}`, filters.q))
  );
}
type RawTransaction = (typeof snapshot.transactions)[number];
function totals(rows: RawTransaction[]) {
  const buy = rows.reduce((sum, row) => sum + (row.operation === 'BUY' ? fixed(row.transaction_amount) : 0n), 0n);
  const sell = rows.reduce((sum, row) => sum + (row.operation === 'SELL' ? fixed(row.transaction_amount) : 0n), 0n);
  return { buyAmount: numeric(buy), sellAmount: numeric(sell), netAmount: numeric(buy - sell), grossAmount: numeric(buy + sell), transactionCount: rows.length };
}
function portfolioRows(rows: RawTransaction[]) {
  const groups = new Map<string, { client_id: string; client_name: string; asset_ticker: string; quantity: bigint; amount: bigint; transaction_count: number; last_transaction_date: string }>();
  for (const row of rows) {
    const key = `${row.client_id}:${row.asset_ticker}`;
    const group = groups.get(key) ?? { client_id: row.client_id, client_name: row.client_name, asset_ticker: row.asset_ticker, quantity: 0n, amount: 0n, transaction_count: 0, last_transaction_date: row.transaction_date };
    group.quantity += fixed(row.signed_quantity);
    group.amount += fixed(row.signed_amount);
    group.transaction_count++;
    if (row.transaction_date > group.last_transaction_date) group.last_transaction_date = row.transaction_date;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.client_id.localeCompare(b.client_id, 'pt-BR', { numeric: true }) || a.asset_ticker.localeCompare(b.asset_ticker));
}

/** Versioned snapshot from a read-only DuckDB connection; never writes analytical data. */
export function getSnapshot() { return snapshot; }

export function getAnalytics(input: Filters = {}) {
  const filters = parseFilters(new URLSearchParams(Object.entries(input).filter(([, v]) => v != null) as [string, string][]));
  const raw = selected(filters);
  const transactions = raw.map(row => ({ ...row, quantity: Number(row.quantity), unit_price: Number(row.unit_price), transaction_amount: Number(row.transaction_amount), signed_quantity: Number(row.signed_quantity), signed_amount: Number(row.signed_amount) }));
  const portfolios = portfolioRows(raw).map(({ quantity, amount, ...group }) => ({ ...group, net_quantity: numeric(quantity), net_financial_amount: numeric(amount) }));
  const clientRows = snapshot.clients.filter(client => (!filters.client || client.client_id === filters.client) && (!filters.q || raw.some(t => t.client_id === client.client_id) || textMatch(`${client.client_id} ${client.client_name} ${client.city} ${client.state}`, filters.q)));
  const clients = clientRows.map(client => ({ ...client, ...totals(raw.filter(t => t.client_id === client.client_id)) }));
  const assets = [...new Set(raw.map(row => row.asset_ticker))].sort().map(asset_ticker => ({ asset_ticker, ...totals(raw.filter(t => t.asset_ticker === asset_ticker)) }));
  let cumulative = 0n;
  const daily = [...new Set(raw.map(row => row.transaction_date))].sort().map(date => {
    const day = raw.filter(row => row.transaction_date === date);
    cumulative += day.reduce((sum, row) => sum + fixed(row.signed_amount), 0n);
    return { date, ...totals(day), cumulativeNet: numeric(cumulative) };
  });
  const negativePositions = portfolios.filter(row => row.net_quantity < 0);
  return {
    meta: snapshot.meta,
    filters,
    options: { clients: snapshot.clients.map(({ client_id, client_name }) => ({ client_id, client_name })), assets: [...new Set(snapshot.transactions.map(row => row.asset_ticker))].sort(), dateRange: snapshot.meta.dateRange },
    summary: { ...totals(raw), activeClients: new Set(raw.map(row => row.client_id)).size, registeredClients: snapshot.clients.length, assetCount: assets.length, buyCount: raw.filter(row => row.operation === 'BUY').length, sellCount: raw.filter(row => row.operation === 'SELL').length, portfolioCount: portfolios.length, negativePositions: negativePositions.length },
    transactions, clients, portfolios, daily, assets,
    quality: { ...snapshot.quality, rejectedTransactions: snapshot.quality.rejectedTransactions.map(row => ({ ...row, reason: row.rejection_reason ?? 'Registro rejeitado no staging; consulte a auditoria.' })), negativePositions },
  };
}
export type AnalyticsData = ReturnType<typeof getAnalytics>;

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Prevent spreadsheet formula injection in text fields while preserving decimals.
  if (/^[=+@\t\r]/.test(text) || (/^-/.test(text) && !/^-\d+(\.\d+)?$/.test(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function analyticsCsv(kind: string, filters: Filters = {}): string {
  const clean = parseFilters(new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null) as [string, string][]));
  let data: Record<string, unknown>[];
  let columns: string[];
  if (kind === 'transactions') {
    data = selected(clean);
    columns = ['transaction_id','client_id','client_name','asset_ticker','operation','quantity','unit_price','transaction_date','transaction_amount','signed_quantity','signed_amount'];
  } else if (kind === 'portfolios') {
    data = portfolioRows(selected(clean)).map(({quantity,amount,...row}) => ({...row, net_quantity:decimal(quantity,4),net_financial_amount:decimal(amount)}));
    columns = ['client_id','client_name','asset_ticker','net_quantity','net_financial_amount','transaction_count','last_transaction_date'];
  } else if (kind === 'clients') {
    data = getAnalytics(clean).clients;
    columns = ['client_id','client_name','city','state','created_at','transactionCount','buyAmount','sellAmount','netAmount'];
  } else throw new Error('Exportação inválida. Use transactions, portfolios ou clients.');
  return '\uFEFF' + [columns.join(','), ...data.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\r\n') + '\r\n';
}
