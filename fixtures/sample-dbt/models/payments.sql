select * from {{ source('finops', 'transactions') }}
