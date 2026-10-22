{% macro typed_transactions() -%}
select
    {{ clean_text('transaction_id') }} as transaction_id,
    {{ clean_text('client_id') }} as client_id,
    upper({{ clean_text('asset_ticker') }}) as asset_ticker,
    upper({{ clean_text('operation') }}) as operation,
    try_cast(quantity as decimal(18, 4)) as quantity,
    try_cast(unit_price as decimal(18, 4)) as unit_price,
    try_cast(transaction_date as date) as transaction_date
from {{ ref('transactions') }}
{%- endmacro %}
