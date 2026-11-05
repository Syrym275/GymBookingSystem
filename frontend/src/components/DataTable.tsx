import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  busy?: boolean;
}

export function DataTable<T>({ rows, columns, rowKey, pageSize = 10, initialSort, onRowClick, empty, busy }: Props<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * pageSize, cur * pageSize);

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    setSort((s) => (s && s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
  };

  if (!rows.length) return <>{empty}</>;

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-white shadow-hard transition-opacity ${busy ? 'opacity-60' : ''}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-sun-soft text-xs uppercase tracking-wide text-ink/70">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-bold ${c.className ?? ''}`}>
                  {c.sort ? (
                    <button onClick={() => toggle(c)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      ) : null}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {slice.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-brand-soft/40' : ''}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-ink/10 px-4 py-2 text-xs text-ink/70">
          <span>
            {(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button className="btn-ghost btn-sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Previous page">
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="px-2 font-bold">
              {cur} / {pages}
            </span>
            <button className="btn-ghost btn-sm" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Next page">
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
