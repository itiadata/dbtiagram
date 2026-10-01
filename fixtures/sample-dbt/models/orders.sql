select * from {{ source('finops', 'staging_orders') }}
