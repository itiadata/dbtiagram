select order_id, count(*) as item_count
from {{ ref('order_items') }}
group by order_id

-- Terminal lineage examples used by manual verification:
-- {{ ref('finance_pkg', 'dim_currency') }} is intentionally commented out.
{% set external_relation = ref('finance_pkg', 'dim_currency') %}
{% set unknown_relation = ref('missing_parent') %}
