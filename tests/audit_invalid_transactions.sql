{{ config(severity='warn', tags=['quality_alert']) }}
with typed as ({{ typed_transactions() }})
select t.*,
    case when client_id is null then 'missing_client_id'
         when quantity <= 0 then 'nonpositive_quantity'
         else 'invalid_required_field_or_unknown_client' end as rejection_reason
from typed t
where not coalesce(({{ valid_transaction('t') }}), false)
