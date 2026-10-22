{{ config(severity='warn', tags=['quality_alert']) }}
select * from {{ ref('transactions') }}
qualify count(*) over (
    partition by client_id, asset_ticker, operation, quantity, unit_price, transaction_date
) > 1
