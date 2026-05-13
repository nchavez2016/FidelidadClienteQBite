/**
 * Phase 4 — minimal CSV builder. Client-side, no deps.
 * Always prefixes a UTF-8 BOM so Excel opens it cleanly.
 */
export interface CsvOptions {
  /** Optional comment lines prepended (each starts with `#`). */
  notes?: string[];
}

function escapeCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
  opts: CsvOptions = {},
): string {
  const lines: string[] = [];
  for (const note of opts.notes ?? []) lines.push(`# ${note}`);
  lines.push(headers.map(escapeCell).join(','));
  for (const r of rows) lines.push(r.map(escapeCell).join(','));
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}