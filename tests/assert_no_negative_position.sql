{{ config(severity='warn', tags=['quality_alert']) }}
select * from {{ ref('mart_client_portfolio') }} where net_quantity < 0
