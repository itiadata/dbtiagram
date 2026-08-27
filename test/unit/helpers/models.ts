/**
 * Shared fixtures for the `applyEdit` suites. Keeping the base model set and
 * the virtual-block reader here removes the duplicated inline setup that used
 * to be repeated across every edit suite (spec 17).
 */
import { readVirtualConstraints } from '../../../src/dbt/virtual';
import type { ModelDefinition } from '../../../src/dbt/types';

/** The virtual FK list of a model via the pure read API (or [] when absent). */
export function virtualFks(model: ModelDefinition): unknown[] {
  return readVirtualConstraints(model).foreignKeys ?? [];
}

/** The default two-model workspace most edit scenarios start from. */
export const models: ModelDefinition[] = [
  { name: 'orders', columns: [{ name: 'id' }, { name: 'customer_id' }] },
  { name: 'customers', columns: [{ name: 'id' }] },
];
