"""Reproduce README core in a fresh allowlisted copy, using the existing venv."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
import duckdb

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / 'target/delivery-check' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
PROJECT = RUN / 'project'
REPORT = ROOT / 'scripts/qa/delivery_results.json'
baseline = json.loads((ROOT / 'docs/qa/web_dataset.json').read_text(encoding='utf-8'))['sha256']
result = {'started_at': datetime.now(timezone.utc).isoformat(), 'project': str(PROJECT), 'runtime': sys.executable, 'commands': [], 'checks': [], 'status': 'running'}
def verify_hashes():
    return all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == value for p, value in baseline.items())
def check(ok, label):
    result['checks'].append({'name': label, 'passed': bool(ok)})
    if not ok: raise AssertionError(label)
try:
    check(verify_hashes(), '23 original protected files match baseline before execution')
    PROJECT.mkdir(parents=True)
    for folder in ('models', 'macros', 'seeds', 'tests'):
        shutil.copytree(ROOT / folder, PROJECT / folder)
    for name in ('dbt_project.yml', 'profiles.yml', 'requirements.txt', 'requirements-lock.txt'):
        shutil.copy2(ROOT / name, PROJECT / name)
    env = {k:v for k,v in os.environ.items() if not k.startswith('DBT_')}
    env.update(DBT_SEND_ANONYMOUS_USAGE_STATS='false', PYTHONIOENCODING='utf-8')
    dbt = Path(sys.executable).parent / ('dbt.exe' if os.name == 'nt' else 'dbt')
    for label, args, expected in [('seed',['seed'],0),('run',['run'],0),('test',['test'],0),('docs',['docs','generate'],0),('strict',['--warn-error','test'],1)]:
        command = [str(dbt), *args, '--profiles-dir', '.']
        process = subprocess.run(command, cwd=PROJECT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
        (RUN / (label+'.log')).write_text(process.stdout+process.stderr, encoding='utf-8')
        record = {'command': command, 'label': label, 'exit_code': process.returncode, 'expected_exit': expected}
        artifact = PROJECT / 'target/run_results.json'
        if artifact.exists():
            rows = json.loads(artifact.read_text(encoding='utf-8'))['results']
            record['statuses'] = dict(Counter(row['status'] for row in rows))
            record['diagnostics'] = [{k:row.get(k) for k in ('unique_id','status','failures')} for row in rows if row['status'] in ('warn','fail','error')]
            shutil.copy2(artifact,RUN / (label+'_run_results.json'))
        result['commands'].append(record)
        print(label,process.returncode,record.get('statuses'),flush=True)
        check(process.returncode == expected,label+' expected exit')
    with duckdb.connect(str(PROJECT/'clube_do_valor.duckdb'),read_only=True) as conn:
        for table,count in [('fact_transactions',98),('dim_clients',25),('mart_client_portfolio',55)]:
            check(conn.execute('select count(*) from '+table).fetchone()[0]==count,table+' count '+str(count))
        rows=conn.execute('select client_id,asset_ticker,net_quantity,net_financial_amount from mart_client_portfolio').fetchall()
        actual={(a,b):(q,v) for a,b,q,v in rows}
        oracle=json.loads((ROOT/'docs/qa/oracle.json').read_text(encoding='utf-8'))
        expected={(r['client_id'],r['asset_ticker']):(Decimal(str(r['net_quantity'])),Decimal(str(r['net_financial_value']))) for r in oracle['portfolio']}
        check(actual==expected,'All 55 client/asset positions reconcile to independent Decimal oracle')
        check(sum(q<0 for q,v in actual.values())==6,'Six negative positions retained')
    manifest=json.loads((PROJECT/'target/manifest.json').read_text(encoding='utf-8'))
    nodes=[n for n in manifest['nodes'].values() if n['resource_type'] in ('model','seed')]
    check(len(nodes)==8 and all(n.get('description') and n['columns'] and all(c.get('description') for c in n['columns'].values()) for n in nodes),'Six models and two seeds have model and column descriptions')
    result['documented_columns']=sum(len(n['columns']) for n in nodes)
    check(all((PROJECT/'target'/name).exists() for name in ('index.html','catalog.json','manifest.json')),'Documentation artifacts generated')
    result['status']='passed'
except Exception as error:
    result['status']='failed';result['error']=str(error)
finally:
    result['original_hashes_unchanged']=verify_hashes()
    if not result['original_hashes_unchanged']: result['status']='failed'
    result['completed_at']=datetime.now(timezone.utc).isoformat()
    REPORT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(result['status'], 'original hashes unchanged:',result['original_hashes_unchanged'])
sys.exit(result['status']!='passed')
