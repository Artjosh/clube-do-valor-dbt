"""Probe development filesystem denial; never print/store response bodies."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError

root = Path(__file__).resolve().parents[2]
base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3000'
paths = ['/data/analytics.json', '/data/analytics.json?raw', '/data/analytics.json?import',
         '/@fs/' + (root / 'web/data/analytics.json').as_posix(),
         '/@fs/' + (root / 'web/data/analytics.json').as_posix() + '?raw',
         '/.dev.vars', '/.dev.vars?raw', '/lib/auth/core.ts?raw',
         '/supabase/migrations/202610220002_private_analytics.sql?raw']
rows = []
for path in paths:
    try:
        response = urlopen(base + path, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        rows.append({'path': path, 'status': response.status, 'bytes': len(body),
                     'passed': response.status in (403, 404)})
result = {'at': datetime.now(timezone.utc).isoformat(), 'base': base, 'checks': rows}
(root / 'docs/qa/web_access_files.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(rows), 'failed': [r for r in rows if not r['passed']]}))
sys.exit(any(not r['passed'] for r in rows))
