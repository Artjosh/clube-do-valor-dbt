with typed as (
    select
        {{ clean_text('client_id') }} as client_id,
        {{ clean_text('name') }} as client_name,
        {{ clean_text('city') }} as city,
        upper({{ clean_text('state') }}) as state,
        try_cast(created_at as date) as created_at
    from {{ ref('clients') }}
), ranked as (
    select *, row_number() over (
        partition by client_id
        order by
            ((client_name is not null)::int + (city is not null)::int
             + (state is not null)::int + (created_at is not null)::int) desc,
            created_at asc nulls last, client_name asc nulls last,
            city asc nulls last, state asc nulls last
    ) as preference
    from typed
    where client_id is not null
)
select client_id, client_name, city, state, created_at
from ranked
where preference = 1
