import { useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

/**
 * Single-series bar chart (one hue, so no legend — the card title names the
 * series). Thin bars with rounded data-ends on a recessive grid, a hover
 * tooltip on every bar, selective direct labels, and a table view.
 */
export interface Datum {
  label: string;
  value: number;
  hint?: string;
}

export function BarChart({ data, format = (n) => String(n), height = 180, emptyText = 'No data yet.' }: { data: Datum[]; format?: (n: number) => string; height?: number; emptyText?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (!data.length || data.every((d) => !d.value)) return <p className="faint pad">{emptyText}</p>;
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const nice = niceMax(max);
  const ticks = [0, nice / 2, nice];
  const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <div className="chart">
      <button className="icon-btn chart-toggle" onClick={() => setTable(!table)} aria-label={table ? 'Show chart' : 'Show as table'} title={table ? 'Show chart' : 'Show as table'}>
        {table ? <BarChart3 size={15} /> : <Table2 size={15} />}
      </button>
      {table ? (
        <table className="table chart-table">
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="num">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="bars" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${format(d.value)}`).join('; ')}>
          <div className="bars-grid">
            {ticks
              .slice()
              .reverse()
              .map((t) => (
                <div key={t} className="bars-tick">
                  <span>{format(t)}</span>
                </div>
              ))}
          </div>
          <div className="bars-plot">
            {data.map((d, i) => (
              <div key={d.label} className="bar-slot" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
                <div className={`bar ${hover === i ? 'hot' : ''}`} style={{ height: `${(Math.max(0, d.value) / nice) * 100}%` }}>
                  {(i === peak || i === data.length - 1) && d.value > 0 && <span className="bar-label">{format(d.value)}</span>}
                </div>
                <span className="bar-x">{d.label}</span>
                {hover === i && (
                  <div className="chart-tip" role="tooltip">
                    <strong>{d.label}</strong>
                    <span>{format(d.value)}</span>
                    {d.hint && <span className="faint">{d.hint}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for ranked categories with long names. */
export function HBarChart({ data, format = (n) => String(n), emptyText = 'No data yet.' }: { data: Datum[]; format?: (n: number) => string; emptyText?: string }) {
  if (!data.length || data.every((d) => !d.value)) return <p className="faint pad">{emptyText}</p>;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className="hbars" role="list">
      {data.map((d) => (
        <div key={d.label} className="hbar-row" role="listitem" title={`${d.label}: ${format(d.value)}${d.hint ? ` — ${d.hint}` : ''}`}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(Math.max(0, d.value) / max) * 100}%` }} />
          </span>
          <span className="hbar-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Goal progress (fundraisers, capacity). */
export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
      <em>{pct}%</em>
    </div>
  );
}

function niceMax(n: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}
