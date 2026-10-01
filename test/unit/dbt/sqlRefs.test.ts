import { describe, expect, it } from 'vitest';
import { findSqlRefs, findSqlSources, rewriteSqlRefs } from '../../../src/dbt/sqlRefs';

describe('SQL refs', () => {
  it('finds literal refs in Jinja expressions and statements', () => {
    const refs = findSqlRefs(`{{ ref('orders') }} {% set x = ref("sample", "orders") %}`);
    expect(refs.map(({ package: pkg, name }) => ({ ...(pkg === undefined ? {} : { package: pkg }), name }))).toEqual([
      { name: 'orders' }, { package: 'sample', name: 'orders' },
    ]);
  });

  it('ignores comments and SQL strings', () => {
    const text = `-- {{ ref('orders') }}\n/* {{ ref('orders') }} */\n{# {{ ref('orders') }} #}\nselect '{{ ref('orders') }}', {% set x = "ref('orders')" %}, {{ ref('orders') }}`;
    expect(findSqlRefs(text).map((ref) => ref.name)).toEqual(['orders']);
  });

  it('rewrites only the name argument without reformatting', () => {
    const text = `{{  ref( "sample" , 'orders' )  }}`;
    expect(rewriteSqlRefs(text, (ref) => ref.package === 'sample', 'sales_orders')).toBe(
      `{{  ref( "sample" , 'sales_orders' )  }}`,
    );
  });

  it('finds a literal source call', () => {
    expect(findSqlSources("select * from {{ source('finops', 'transactions') }}")).toMatchObject([{ source: 'finops', table: 'transactions' }]);
  });

  it('ignores source calls in comments and SQL strings', () => {
    const text = `-- {{ source('a', 'b') }}\nselect '{{ source("c", "d") }}', * from {{ source('finops', 'transactions') }}`;
    expect(findSqlSources(text)).toMatchObject([{ source: 'finops', table: 'transactions' }]);
  });
});
