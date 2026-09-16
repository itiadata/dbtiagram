import { STATIC_SITE_SCHEMA_VERSION, type StaticSiteData } from '../src/shared/staticSite';

export function readStaticSiteData(document: Document): StaticSiteData {
  const element = document.getElementById('dbtiagram-data');
  if (element === null || element.textContent === null) throw new Error('Static diagram data is missing');
  const value: unknown = JSON.parse(element.textContent);
  if (!isRecord(value) || value.schemaVersion !== STATIC_SITE_SCHEMA_VERSION || !Array.isArray(value.layouts)) {
    throw new Error('Static diagram data has an unsupported schema');
  }
  return value as unknown as StaticSiteData;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
