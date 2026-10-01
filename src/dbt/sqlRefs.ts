/** Surgical discovery and rewriting of literal dbt ref calls in executable Jinja. */
export interface SqlRefOccurrence { start: number; end: number; package?: string; name: string }
export interface SqlSourceOccurrence { start: number; end: number; source: string; table: string }

interface Span { start: number; end: number }
const REF = /^ref\s*\(\s*(['"])([^'"]+)\1\s*(?:,\s*(['"])([^'"]+)\3\s*)?\)/;
const SOURCE = /^source\s*\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/;

export function findSqlRefs(text: string): SqlRefOccurrence[] {
  const result: SqlRefOccurrence[] = [];
  for (const span of jinjaSpans(text)) {
    const body = text.slice(span.start, span.end);
    let offset = 0; let quote: "'" | '"' | undefined;
    while (offset < body.length) {
      const char = body[offset];
      if (quote !== undefined) { if (char === quote && body[offset - 1] !== '\\') quote = undefined; offset += 1; continue; }
      if (char === "'" || char === '"') { quote = char; offset += 1; continue; }
      if (!body.startsWith('ref', offset) || (offset > 0 && /[\w]/.test(body[offset - 1] ?? ''))) { offset += 1; continue; }
      const match = REF.exec(body.slice(offset));
      if (match === null) { offset += 1; continue; }
      const first = match[2]; const second = match[4];
      if (first === undefined) { offset += match[0].length; continue; }
      const quoted = second === undefined ? match[1] : match[3];
      const name = second ?? first;
      if (quoted === undefined) continue;
      const relative = second === undefined
        ? match[0].indexOf(`${quoted}${name}${quoted}`)
        : match[0].lastIndexOf(`${quoted}${name}${quoted}`);
      const start = span.start + offset + relative + 1;
      result.push({ start, end: start + name.length, ...(second === undefined ? {} : { package: first }), name });
      offset += match[0].length;
    }
  }
  return result;
}

export function findSqlSources(text: string): SqlSourceOccurrence[] {
  const result: SqlSourceOccurrence[] = [];
  for (const span of jinjaSpans(text)) {
    const body = text.slice(span.start, span.end);
    let offset = 0; let quote: "'" | '"' | undefined;
    while (offset < body.length) {
      const char = body[offset];
      if (quote !== undefined) { if (char === quote && body[offset - 1] !== '\\') quote = undefined; offset += 1; continue; }
      if (char === "'" || char === '"') { quote = char; offset += 1; continue; }
      if (!body.startsWith('source', offset) || (offset > 0 && /[\w]/.test(body[offset - 1] ?? ''))) { offset += 1; continue; }
      const match = SOURCE.exec(body.slice(offset));
      if (match === null || match[2] === undefined || match[4] === undefined || match[2].length === 0 || match[4].length === 0) { offset += 1; continue; }
      const start = span.start + offset;
      result.push({ start, end: start + match[0].length, source: match[2], table: match[4] });
      offset += match[0].length;
    }
  }
  return result;
}

export function rewriteSqlRefs(
  text: string,
  shouldRename: (target: Readonly<{ package?: string; name: string }>) => boolean,
  newName: string,
): string {
  let result = text;
  for (const ref of findSqlRefs(text).filter(shouldRename).reverse()) {
    result = result.slice(0, ref.start) + newName + result.slice(ref.end);
  }
  return result;
}

function jinjaSpans(text: string): Span[] {
  const spans: Span[] = []; let index = 0; let quote: "'" | '"' | undefined;
  while (index < text.length) {
    if (quote !== undefined) { if (text[index] === quote && text[index - 1] !== '\\') quote = undefined; index += 1; continue; }
    if (text.startsWith('--', index)) { index = lineEnd(text, index + 2); continue; }
    if (text.startsWith('/*', index)) { index = blockEnd(text, index + 2, '*/'); continue; }
    if (text.startsWith('{#', index)) { index = blockEnd(text, index + 2, '#}'); continue; }
    const opener = text.slice(index, index + 2);
    if (opener === '{{' || opener === '{%') {
      const close = opener === '{{' ? '}}' : '%}'; const end = text.indexOf(close, index + 2);
      if (end < 0) break; spans.push({ start: index + 2, end }); index = end + 2; continue;
    }
    if (text[index] === "'" || text[index] === '"') quote = text[index] as "'" | '"';
    index += 1;
  }
  return spans;
}

function lineEnd(text: string, start: number): number { const end = text.indexOf('\n', start); return end < 0 ? text.length : end + 1; }
function blockEnd(text: string, start: number, close: string): number { const end = text.indexOf(close, start); return end < 0 ? text.length : end + close.length; }
