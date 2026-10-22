select
    t.transaction_id, t.client_id, t.asset_ticker, t.operation,
    t.quantity, t.unit_price, t.transaction_date,
    cast(t.quantity * t.unit_price as decimal(28, 8)) as transaction_amount,
    case when t.operation = 'BUY' then t.quantity else -t.quantity end as signed_quantity,
    cast(case when t.operation = 'BUY' then t.quantity * t.unit_price
         else -t.quantity * t.unit_price end as decimal(28, 8)) as signed_amount
from {{ ref('stg_transactions') }} t
inner join {{ ref('stg_clients') }} c on t.client_id = c.client_id
