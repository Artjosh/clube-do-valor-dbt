{{ config(materialized='incremental', unique_key='transaction_id', incremental_strategy='delete+insert') }}
{% set lookback = var('incremental_lookback_days', 30) | int %}
{% if lookback < 0 %}
  {{ exceptions.raise_compiler_error('incremental_lookback_days must be nonnegative') }}
{% endif %}
select transaction_id, client_id, asset_ticker, operation, quantity, unit_price,
       transaction_date, transaction_amount, signed_quantity, signed_amount
from {{ ref('int_transactions') }}
{% if is_incremental() %}
where transaction_date >= (
    select coalesce(max(transaction_date), date '1900-01-01') - interval '{{ lookback }} days'
    from {{ this }}
)
{% endif %}
