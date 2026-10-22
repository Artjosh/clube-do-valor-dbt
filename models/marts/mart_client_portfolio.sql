select
    client_id,
    asset_ticker,
    sum(signed_quantity) as net_quantity,
    sum(signed_amount) as net_financial_amount,
    count(*) as transaction_count,
    max(transaction_date) as last_transaction_date
from {{ ref('fact_transactions') }}
group by client_id, asset_ticker
