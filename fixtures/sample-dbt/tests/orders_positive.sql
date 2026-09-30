select * from {{ ref('orders') }} where total_amount < 0
