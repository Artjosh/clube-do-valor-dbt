with typed as ({{ typed_transactions() }})
select * from typed t
where {{ valid_transaction('t') }}
