select * from {{ ref('fact_transactions') }}
where transaction_amount != quantity * unit_price
or signed_quantity != case when operation = 'BUY' then quantity else -quantity end
or signed_amount != case when operation = 'BUY' then transaction_amount else -transaction_amount end
