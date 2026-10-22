select client_id, client_name, city, state, created_at
from {{ ref('stg_clients') }}
