import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, ChevronsUpDown, Search, Sparkles, Wrench } from 'lucide-react';
import type { Costume } from '../data/types';
import { progressReasonLabels } from '../data/actions';

/* --------------------------------------------------------------- layout */

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-header">
      <div>
        {back && (
          <Link to={back.to} className="back-link">
            ← {back.label}
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', icon }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && (
            <h2 className="card-title">
              {icon}
              {title}
            </h2>
          )}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'rose', to, hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'rose' | 'sage' | 'amber' | 'plum' | 'sand' | 'slate'; to?: string; hint?: string }) {
  const inner = (
    <>
      <div className={`stat-icon tone-${tone}`}>{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </>
  );
  return to ? (
    <Link to={to} className="stat-card">
      {inner}
    </Link>
  ) : (
    <div className="stat-card">{inner}</div>
  );
}

export function SampleTag({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="sample-tag" title="Sample data — remove it from Settings → Data">
      <Sparkles size={11} /> Sample
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ready' | 'progress' | 'warn' | 'danger' | 'info' | 'rose' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ costume, compact }: { costume: Pick<Costume, 'status' | 'progressReason'>; compact?: boolean }) {
  if (costume.status === 'ready') {
    return (
      <span className="status status-ready">
        <CheckCircle2 size={13} /> READY
      </span>
    );
  }
  return (
    <span className="status status-progress" title={progressReasonLabels[costume.progressReason ?? 'repair']}>
      <Wrench size={13} /> IN PROGRESS{!compact && costume.progressReason ? ` · ${progressReasonLabels[costume.progressReason]}` : ''}
    </span>
  );
}

export function Field({ label, children, hint, required, className = '' }: { label: string; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Search size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressRing({ percent, size = 92 }: { percent: number | null; size?: number }) {
  const stroke = size < 60 ? 5 : 10;
  const r = (size - stroke - 2) / 2;
  const c = 2 * Math.PI * r;
  const p = percent ?? 0;
  const tone = percent === null ? 'var(--muted)' : p >= 90 ? 'var(--sage)' : p >= 60 ? 'var(--amber)' : 'var(--rose-deep)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" role="img" aria-label={percent === null ? 'No readiness data' : `${p}% ready`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--blush-2)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={tone}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * p) / 100}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-text">
        {percent === null ? '—' : `${p}%`}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------ DataTable */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  className?: string;
  /** Hidden on narrow screens to keep tables readable on phones. */
  minor?: boolean;
}

interface TableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getId: (row: T) => string;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({ rows, columns, getId, selected, onSelectedChange, initialSort, empty, rowClassName }: TableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const val = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === vb) return 0;
      if (va === null || va === '') return 1; // blanks last
      if (vb === null || vb === '') return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, sort]);

  const selectable = !!selected && !!onSelectedChange;
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected!.has(getId(r)));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) rows.forEach((r) => next.delete(getId(r)));
    else rows.forEach((r) => next.add(getId(r)));
    onSelectedChange!(next);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange!(next);
  };

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {selectable && (
              <th className="col-check">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} className={`${c.className ?? ''} ${c.minor ? 'minor' : ''}`}>
                  {c.sortValue ? (
                    <button
                      className={`th-sort ${active ? 'active' : ''}`}
                      onClick={() => setSort(active && sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' })}
                    >
                      {c.header}
                      {active ? sort!.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} /> : <ChevronsUpDown size={13} className="faint" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const id = getId(row);
            return (
              <tr key={id} className={`${selected?.has(id) ? 'selected' : ''} ${rowClassName?.(row) ?? ''}`}>
                {selectable && (
                  <td className="col-check">
                    <input type="checkbox" checked={selected!.has(id)} onChange={() => toggle(id)} aria-label="Select row" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={`${c.className ?? ''} ${c.minor ? 'minor' : ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------- searchable dropdowns */

export interface Option {
  value: string;
  label: string;
  hint?: string;
  group?: string;
}

/** A dropdown with a type-to-filter box. Empty string value means "none". */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  noneLabel,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  noneLabel?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const filtered = options.filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q.toLowerCase()));
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <div className="ss" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <button type="button" className="ss-trigger input" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={current ? '' : 'faint'}>{current ? current.label : value === '' && noneLabel ? noneLabel : placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="ss-menu">
          <input
            className="input ss-search"
            autoFocus
            placeholder="Type to search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[0]) pick(filtered[0].value);
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
          <ul role="listbox">
            {noneLabel !== undefined && (
              <li>
                <button type="button" className={`ss-opt ${value === '' ? 'active' : ''}`} onClick={() => pick('')}>
                  <em>{noneLabel}</em>
                </button>
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button type="button" role="option" aria-selected={o.value === value} className={`ss-opt ${o.value === value ? 'active' : ''}`} onClick={() => pick(o.value)}>
                  {o.label}
                  {o.hint && <span className="ss-hint">{o.hint}</span>}
                </button>
              </li>
            ))}
            {!filtered.length && <li className="ss-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Checklist with search — used to pick several dancers or costumes at once. */
export function CheckList({
  options,
  selected,
  onChange,
  height = 320,
  emptyText = 'Nothing to choose from yet.',
}: {
  options: Option[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  height?: number;
  emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const filtered = options.filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };
  const allFiltered = filtered.length > 0 && filtered.every((o) => selected.has(o.value));
  let lastGroup: string | undefined;
  return (
    <div className="checklist">
      <div className="checklist-top">
        <SearchInput value={q} onChange={setQ} placeholder="Search…" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const next = new Set(selected);
            filtered.forEach((o) => (allFiltered ? next.delete(o.value) : next.add(o.value)));
            onChange(next);
          }}
          disabled={!filtered.length}
        >
          {allFiltered ? 'Clear shown' : 'Select shown'}
        </button>
      </div>
      <div className="checklist-items" style={{ maxHeight: height }}>
        {!options.length && <p className="faint pad">{emptyText}</p>}
        {options.length > 0 && !filtered.length && <p className="faint pad">No matches.</p>}
        {filtered.map((o) => {
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          return (
            <div key={o.value}>
              {header && <div className="checklist-group">{header}</div>}
              <label className={`check-row ${selected.has(o.value) ? 'on' : ''}`}>
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
                {o.hint && <span className="faint small">{o.hint}</span>}
              </label>
            </div>
          );
        })}
      </div>
      <div className="small faint">{selected.size} selected</div>
    </div>
  );
}

/** Bar that appears when table rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (!count) return null;
  return (
    <div className="bulkbar">
      <strong>{count} selected</strong>
      <div className="bulkbar-actions">{children}</div>
      <button className="btn btn-ghost btn-sm" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
