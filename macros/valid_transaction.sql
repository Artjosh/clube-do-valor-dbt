{% macro valid_transaction(alias) -%}
{{ alias }}.transaction_id is not null
and {{ alias }}.client_id is not null
and {{ alias }}.asset_ticker is not null
and {{ alias }}.operation in ('BUY', 'SELL')
and {{ alias }}.quantity > 0
and {{ alias }}.unit_price > 0
and {{ alias }}.transaction_date is not null
and exists (select 1 from {{ ref('stg_clients') }} c where c.client_id = {{ alias }}.client_id)
{%- endmacro %}
