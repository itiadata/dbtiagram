{% snapshot orders_snapshot %}
  {{ config(unique_key='order_id', strategy='check', check_cols='all') }}
  select * from {{ ref('orders') }}
{% endsnapshot %}
