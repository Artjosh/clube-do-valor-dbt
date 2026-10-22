select client_id, asset_ticker, count(*) as row_count
from {{ ref('mart_client_portfolio') }}
group by client_id, asset_ticker having count(*) > 1
