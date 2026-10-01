select order_id, count(*) as item_count
from {{ ref('order_items') }}
group by order_id

-- External-package lineage example used by manual verification.
cross join {{ ref('finance_pkg', 'dim_currency') }}
