"""Export a verifiable, read-only DuckDB snapshot. Never executes dbt or writes its DB."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(connection, query):
    result = connection.execute(query)
    names = [column[0] for column in result.description]
    return [dict(zip(names, values)) for values in result.fetchall()]


def encode(value):
    if isinstance(value, Decimal):
        # Preserve decimal strings in the source; the server aggregates with BigInt.
        return format(value, 'f')
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / 'clube_do_valor.duckdb')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/data/analytics.json')
    args = parser.parse_args()
    database = args.database.resolve(strict=True)
    output = args.output.resolve()
    if output == database or output.is_relative_to(ROOT / 'seeds'):
        raise ValueError('Output must not overwrite the source database or seeds')
    source_paths = ['seeds/clients.csv', 'seeds/transactions.csv', 'docs/entrega/enunciado.html']
    paths = [database, *[ROOT / name for name in source_paths]]
    before = {str(path): digest(path) for path in paths}
    with duckdb.connect(str(database), read_only=True) as connection:
        transactions = rows(connection, 'SELECT f.*, c.client_name,c.city,c.state FROM fact_transactions f JOIN dim_clients c USING(client_id) ORDER BY transaction_date,transaction_id')
        clients = rows(connection, 'SELECT * FROM dim_clients ORDER BY client_id')
        portfolios = rows(connection, 'SELECT * FROM mart_client_portfolio ORDER BY client_id,asset_ticker')
        rejected = rows(connection, 'SELECT * FROM main_dbt_test__audit.audit_invalid_transactions ORDER BY transaction_id')
        duplicate = rows(connection, 'SELECT * FROM main_dbt_test__audit.audit_duplicate_transaction_payload ORDER BY transaction_id')
        original_transactions = connection.execute('SELECT count(*) FROM transactions').fetchone()[0]
        original_clients = connection.execute('SELECT count(*) FROM clients').fetchone()[0]
    evidence = json.loads((ROOT / 'scripts/validation_results.json').read_text(encoding='utf-8'))
    baseline = next(command for command in evidence['commands'] if command['command'] == 'dbt test --profiles-dir .')
    source_files = [{'path': name, 'sha256': before[str(ROOT / name)]} for name in source_paths]
    dates = [row['transaction_date'].isoformat() for row in transactions]
    snapshot = {
        'meta': {
            'dataset': 'Teste técnico Clube do Valor · dados de exemplo',
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'sourceHash': before[str(database)],
            'sourceFiles': source_files,
            'dateRange': {'from': min(dates), 'to': max(dates)},
            'originalTransactions': original_transactions, 'originalClients': original_clients,
            'validTransactions': len(transactions), 'canonicalClients': len(clients),
            'tests': {**baseline['statuses'], 'total': sum(baseline['statuses'].values()), 'executedAt': evidence['executed_at'], 'evidencePath': 'scripts/validation_results.json'},
            'warnings': [item['test'].split('.')[2] for item in baseline['nonpassing']],
            'semantics': 'Compras menos vendas no recorte. Não representa patrimônio, lucro ou valor de mercado. Não há cotações nem saldo anterior ao dataset.'
        },
        'transactions': transactions, 'clients': clients, 'portfolios': portfolios,
        'quality': {
            'rejectedTransactions': rejected,
            'duplicatePayloadIds': [row['transaction_id'] for row in duplicate],
            'testResults': [{'name': item['test'].split('.')[2], 'status': item['status'], 'failures': item['failures']} for item in baseline['nonpassing']],
        }
    }
    after = {str(path): digest(path) for path in paths}
    if before != after:
        raise RuntimeError('Source changed during export; no snapshot written')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, default=encode) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output), 'transactions':len(transactions), 'clients':len(clients), 'portfolios':len(portfolios), 'sha256':digest(output), 'sources_unchanged':True}))


if __name__ == '__main__':
    main()
