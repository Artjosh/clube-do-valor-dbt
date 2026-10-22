select * from {{ ref('fact_transactions') }} where quantity <= 0 or unit_price <= 0
