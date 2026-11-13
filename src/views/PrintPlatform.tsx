import { Link } from '../lib/router';
import type { ReactNode } from 'react';
import { Empty, PrintShell } from './Print';
import { formatDate, formatDateTime, formatTime, fullName } from '../data/selectors';
import {
  familyBalance,
  familyCredit,
  invoiceBalance,
  invoicePaid,
  invoiceStatus,
  invoiceStatusLabels,
  invoiceSubtotal,
  invoiceTax,
  invoiceTotal,
  isCheckoutOverdue,
  quickChanges,
  refundedFor,
  showLength,
  timedLineup,
  eventCounts,
  ticketsSold,
  currentVersion,
  policyStatusForFamily,
  fundraiserRaised,
} from '../data/platform';
import { checkInLabels } from '../data/productionActions';
import type { Database, ID } from '../data/types';

export const platformReports = ['invoice', 'receipt', 'statement', 'runningorder', 'program', 'backstage', 'quickchanges', 'checkouts', 'team', 'event', 'tickets', 'policy', 'fundraiser', 'roster'] as const;
export type PlatformReportKey = (typeof platformReports)[number];

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const methodLabel: Record<string, string> = { card: 'Card', cash: 'Cash', check: 'Check', ach: 'Bank transfer', other: 'Other' };
export const clockAt = (base: string, offsetMin: number) => {
  if (!/^\d{1,2}:\d{2}$/.test(base)) return `+${offsetMin} min`;
  const [h, m] = base.split(':').map(Number);
  const t = h * 60 + m + offsetMin;
  return formatTime(`${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
};

function StudioBlock({ db }: { db: Database }) {
  const s = db.settings;
  return (
    <div className="p-studio">
      <strong>{s.studioName}</strong>
      {s.studioAddress && <div>{s.studioAddress}</div>}
      <div>{[s.studioPhone, s.studioEmail].filter(Boolean).join(' · ')}</div>
    </div>
  );
}

function FamilyBlock({ db, familyId }: { db: Database; familyId: ID }) {
  const f = db.families.find((x) => x.id === familyId);
  const g = db.guardians.filter((x) => x.familyId === familyId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
  if (!f) return <div className="p-studio">Removed family</div>;
  return (
    <div className="p-studio">
      <div className="small faint">Bill to</div>
      <strong>{g ? `${g.firstName} ${g.lastName}` : f.name}</strong>
      <div>{f.name}</div>
      {f.address && <div>{f.address}</div>}
      {(f.city || f.state) && <div>{[f.city, f.state].filter(Boolean).join(', ')} {f.zip}</div>}
      {g?.email && <div>{g.email}</div>}
    </div>
  );
}

export function PlatformReport({ report, db, p }: { report: PlatformReportKey; db: Database; p: (k: string) => string }) {
  switch (report) {
    case 'invoice':
      return <InvoiceSheet db={db} id={p('id')} />;
    case 'receipt':
      return <ReceiptSheet db={db} id={p('id')} />;
    case 'statement':
      return <StatementSheet db={db} id={p('id')} />;
    case 'runningorder':
      return <RunningOrder db={db} id={p('id')} program={false} />;
    case 'program':
      return <RunningOrder db={db} id={p('id')} program />;
    case 'backstage':
      return <BackstageSheet db={db} id={p('id')} />;
    case 'quickchanges':
      return <QuickChangeSheet db={db} id={p('id')} />;
    case 'checkouts':
      return <CheckoutSheet db={db} />;
    case 'team':
      return <TeamSheet db={db} id={p('id')} />;
    case 'event':
      return <EventSheet db={db} id={p('id')} />;
    case 'tickets':
      return <TicketSheet db={db} id={p('id')} />;
    case 'policy':
      return <PolicySheet db={db} id={p('id')} />;
    case 'fundraiser':
      return <FundraiserSheet db={db} id={p('id')} />;
    case 'roster':
      return <RosterSheet db={db} id={p('id')} />;
  }
}

function Missing({ what }: { what: string }) {
  return (
    <PrintShell title={`${what} not found`}>
      <Empty>
        It may have been deleted. <Link to="/">Go to the dashboard</Link>
      </Empty>
    </PrintShell>
  );
}

/* ================================================================ money */

function InvoiceSheet({ db, id }: { db: Database; id: string }) {
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return <Missing what="Invoice" />;
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  return (
    <PrintShell title={`Invoice ${inv.number}`} subtitle={`${inv.title} · ${invoiceStatusLabels[invoiceStatus(db, inv)]}`}>
      <div className="p-cols">
        <StudioBlock db={db} />
        <FamilyBlock db={db} familyId={inv.familyId} />
        <div className="p-studio">
          <div>
            Issued <strong>{formatDate(inv.issueDate)}</strong>
          </div>
          <div>
            Due <strong>{formatDate(inv.dueDate) || 'On receipt'}</strong>
          </div>
        </div>
      </div>
      <table className="p-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Category</th>
            <th className="num">Qty</th>
            <th className="num">Price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td>{l.category}</td>
              <td className="num">{l.quantity}</td>
              <td className="num">{money(l.unitPrice)}</td>
              <td className="num">{money(l.quantity * l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <Tot label="Subtotal" v={money(invoiceSubtotal(inv))} />
          {inv.discount > 0 && <Tot label="Discount" v={`−${money(inv.discount)}`} />}
          {inv.taxRate > 0 && <Tot label={`Tax (${inv.taxRate}%)`} v={money(invoiceTax(inv))} />}
          <Tot label="Total" v={money(invoiceTotal(inv))} strong />
          <Tot label="Paid & credits" v={money(invoicePaid(db, inv.id))} />
          <Tot label="Balance due" v={money(Math.max(0, invoiceBalance(db, inv)))} strong />
        </tfoot>
      </table>
      {pays.length > 0 && (
        <>
          <h2>Payments</h2>
          <table className="p-table">
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td>{p.processor === 'test' ? 'Online payment (test mode)' : methodLabel[p.method]}</td>
                  <td>{p.reference}</td>
                  <td className="num">{money(p.amount)}</td>
                  <td className="num">{refundedFor(db, p.id) ? `Refunded ${money(refundedFor(db, p.id))}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {inv.notes && <p className="p-notes prewrap">{inv.notes}</p>}
      {db.settings.refundPolicy && <p className="p-notes small">Refund policy: {db.settings.refundPolicy}</p>}
    </PrintShell>
  );
}

function Tot({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <tr>
      <td colSpan={4} className="num">
        {strong ? <strong>{label}</strong> : label}
      </td>
      <td className="num">{strong ? <strong>{v}</strong> : v}</td>
    </tr>
  );
}

function ReceiptSheet({ db, id }: { db: Database; id: string }) {
  const p = db.payments.find((x) => x.id === id);
  if (!p) return <Missing what="Payment" />;
  const inv = db.invoices.find((i) => i.id === p.invoiceId);
  const refunds = db.refunds.filter((r) => r.paymentId === p.id);
  return (
    <PrintShell title="Payment Receipt" subtitle={`Receipt ${p.id.slice(-8).toUpperCase()}`}>
      <div className="p-cols">
        <StudioBlock db={db} />
        <FamilyBlock db={db} familyId={p.familyId} />
      </div>
      <table className="p-table">
        <tbody>
          <tr>
            <th>Date</th>
            <td>{formatDate(p.date)}</td>
          </tr>
          <tr>
            <th>Amount</th>
            <td>
              <strong>{money(p.amount)}</strong>
            </td>
          </tr>
          <tr>
            <th>Method</th>
            <td>{p.processor === 'test' ? 'Online payment — TEST MODE (no card was charged)' : methodLabel[p.method]}</td>
          </tr>
          {p.reference && (
            <tr>
              <th>Reference</th>
              <td>{p.reference}</td>
            </tr>
          )}
          <tr>
            <th>Applied to</th>
            <td>{inv ? `${inv.number} — ${inv.title}` : p.note || 'Account'}</td>
          </tr>
          {inv && (
            <tr>
              <th>Remaining balance</th>
              <td>{money(Math.max(0, invoiceBalance(db, inv)))}</td>
            </tr>
          )}
          <tr>
            <th>Recorded by</th>
            <td>{p.recordedBy}</td>
          </tr>
          {refunds.map((r) => (
            <tr key={r.id}>
              <th>Refund</th>
              <td>
                {money(r.amount)} on {formatDate(r.date)} — {r.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-notes">Thank you!</p>
    </PrintShell>
  );
}

function StatementSheet({ db, id }: { db: Database; id: string }) {
  const f = db.families.find((x) => x.id === id);
  if (!f) return <Missing what="Family" />;
  const inv = db.invoices.filter((i) => i.familyId === id && i.state !== 'draft').sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const pays = db.payments.filter((p) => p.familyId === id).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <PrintShell title={`Account Statement — ${f.name}`} subtitle={`Balance ${money(familyBalance(db, id))} · Credit ${money(familyCredit(db, id))}`}>
      <div className="p-cols">
        <StudioBlock db={db} />
        <FamilyBlock db={db} familyId={id} />
      </div>
      <h2>Invoices</h2>
      <table className="p-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Issued</th>
            <th>Due</th>
            <th className="num">Total</th>
            <th className="num">Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {inv.map((i) => (
            <tr key={i.id}>
              <td>
                {i.number} — {i.title}
              </td>
              <td>{formatDate(i.issueDate)}</td>
              <td>{formatDate(i.dueDate)}</td>
              <td className="num">{money(invoiceTotal(i))}</td>
              <td className="num">{i.state === 'void' ? '—' : money(Math.max(0, invoiceBalance(db, i)))}</td>
              <td>{invoiceStatusLabels[invoiceStatus(db, i)]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Payments</h2>
      <table className="p-table">
        <tbody>
          {pays.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.date)}</td>
              <td>{p.processor === 'test' ? 'Online (test)' : methodLabel[p.method]}</td>
              <td>{db.invoices.find((i) => i.id === p.invoiceId)?.number ?? p.note}</td>
              <td className="num">{money(p.amount)}</td>
              <td className="num">{refundedFor(db, p.id) ? `−${money(refundedFor(db, p.id))} refunded` : ''}</td>
            </tr>
          ))}
          {!pays.length && (
            <tr>
              <td>No payments.</td>
            </tr>
          )}
        </tbody>
      </table>
    </PrintShell>
  );
}

/* =========================================================== production */

function perfTitle(db: Database, id: string) {
  const perf = db.performances.find((x) => x.id === id);
  return perf ? { perf, sub: [perf.name, formatDate(perf.date), formatTime(perf.time), perf.venue].filter(Boolean).join(' · ') } : null;
}

function RunningOrder({ db, id, program }: { db: Database; id: string; program: boolean }) {
  const t = perfTitle(db, id);
  if (!t) return <Missing what="Performance" />;
  const items = timedLineup(db, id);
  const name = (ids: ID[]) => ids.map((d) => db.dancers.find((x) => x.id === d)).filter(Boolean).map((d) => (program ? fullName(d!) : d!.firstName + ' ' + d!.lastName.charAt(0) + '.'));
  return (
    <PrintShell title={program ? `Program — ${t.perf.name}` : `Running Order — ${t.perf.name}`} subtitle={`${t.sub} · ${items.filter((i) => i.kind === 'number').length} numbers · about ${showLength(db, id)} min`}>
      {program ? (
        <ol className="p-program">
          {items.map((i) =>
            i.kind === 'number' ? (
              <li key={i.id}>
                <div className="p-prog-title">
                  <strong>
                    {i.number}. {i.title}
                  </strong>
                  {i.song && (
                    <span>
                      {' '}
                      — “{i.song}”{i.artist && ` by ${i.artist}`}
                    </span>
                  )}
                </div>
                {i.teacherId && <div className="small">Choreography: {db.staff.find((s) => s.id === i.teacherId) ? fullName(db.staff.find((s) => s.id === i.teacherId)!) : ''}</div>}
                <div className="small">{name(i.dancerIds).join(', ')}</div>
              </li>
            ) : (
              <li key={i.id} className="p-prog-break">
                <strong>{i.title || 'Intermission'}</strong>
              </li>
            ),
          )}
        </ol>
      ) : (
        <table className="p-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Number</th>
              <th>Song</th>
              <th>Costume</th>
              <th>Dancers</th>
              <th>Entrance / exit</th>
              <th>Backstage notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.kind !== 'number' ? 'p-break' : ''}>
                <td>{i.number || ''}</td>
                <td className="nowrap">{clockAt(t.perf.time, i.startMin)}</td>
                <td className="strong">
                  {i.title}
                  <div className="small">{i.durationMin} min</div>
                </td>
                <td>
                  {i.song}
                  {i.artist && <div className="small">{i.artist}</div>}
                </td>
                <td>{db.costumes.find((c) => c.id === i.costumeId)?.name ?? ''}</td>
                <td className="p-notes">{name(i.dancerIds).join(', ')}</td>
                <td>{i.entranceExit}</td>
                <td className="p-notes">{i.backstageNotes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}

function BackstageSheet({ db, id }: { db: Database; id: string }) {
  const t = perfTitle(db, id);
  if (!t) return <Missing what="Performance" />;
  const items = timedLineup(db, id);
  const dancerIds = [...new Set(items.flatMap((i) => i.dancerIds))];
  const dancers = dancerIds.map((d) => db.dancers.find((x) => x.id === d)).filter(Boolean).sort((a, b) => a!.lastName.localeCompare(b!.lastName));
  const ex = db.performanceExtras.find((e) => e.performanceId === id);
  const roles = db.backstageRoles.filter((r) => r.performanceId === id);
  return (
    <PrintShell title={`Backstage Check-in — ${t.perf.name}`} subtitle={`${t.sub}${ex?.warmUpTime ? ` · Warm-up ${formatTime(ex.warmUpTime)}` : ''}`}>
      {roles.length > 0 && (
        <>
          <h2>Backstage crew</h2>
          <table className="p-table">
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.role}</td>
                  <td>{r.person}</td>
                  <td>{r.area}</td>
                  <td className="p-notes">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Dancers</h2>
      <table className="p-table">
        <thead>
          <tr>
            <th>In</th>
            <th>Dancer</th>
            <th>Numbers</th>
            <th>Dressing room</th>
            <th>Status</th>
            <th>Guardian phone</th>
            <th>Out</th>
          </tr>
        </thead>
        <tbody>
          {dancers.map((d) => {
            const ci = db.checkIns.find((c) => c.performanceId === id && c.dancerId === d!.id);
            const g = db.guardians.find((x) => x.familyId === d!.familyId && x.isPrimary) ?? db.guardians.find((x) => x.familyId === d!.familyId);
            return (
              <tr key={d!.id}>
                <td className="p-box">☐</td>
                <td className="strong">{fullName(d!)}</td>
                <td>
                  {items
                    .filter((i) => i.dancerIds.includes(d!.id))
                    .map((i) => `#${i.number}`)
                    .join(', ')}
                </td>
                <td>{ci?.dressingRoom ?? ''}</td>
                <td>{ci ? checkInLabels[ci.status] : ''}</td>
                <td className="nowrap">{g?.phone ?? ''}</td>
                <td className="p-box">☐</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ex?.specialInstructions && <p className="p-notes prewrap">{ex.specialInstructions}</p>}
    </PrintShell>
  );
}

function QuickChangeSheet({ db, id }: { db: Database; id: string }) {
  const t = perfTitle(db, id);
  if (!t) return <Missing what="Performance" />;
  const qc = quickChanges(db, id);
  return (
    <PrintShell title={`Quick Changes — ${t.perf.name}`} subtitle={`${t.sub} · tight = under ${db.settings.quickChangeMinutes} min`}>
      {!qc.length ? (
        <Empty>No costume changes between numbers.</Empty>
      ) : (
        <table className="p-table">
          <thead>
            <tr>
              <th>Dancer</th>
              <th>From</th>
              <th>To</th>
              <th>Time</th>
              <th>Helper</th>
              <th>Location</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {qc.map((q) => {
              const a = db.quickChanges.find((x) => x.performanceId === id && x.dancerId === q.dancerId && x.toItemId === q.toItem.id);
              return (
                <tr key={`${q.dancerId}:${q.toItem.id}`} className={q.tight ? 'p-warn' : ''}>
                  <td className="strong">{q.dancerName}</td>
                  <td>
                    #{q.fromItem.number} {q.fromItem.title}
                    <div className="small">{db.costumes.find((c) => c.id === q.fromCostumeId)?.name}</div>
                  </td>
                  <td>
                    #{q.toItem.number} {q.toItem.title}
                    <div className="small">{db.costumes.find((c) => c.id === q.toCostumeId)?.name}</div>
                  </td>
                  <td className="strong">{q.minutes} min{q.tight ? ' ⚠' : ''}</td>
                  <td>{a?.helper}</td>
                  <td>{a?.location}</td>
                  <td className="p-notes">{a?.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PrintShell>
  );
}

function CheckoutSheet({ db }: { db: Database }) {
  const rows = db.checkouts.filter((c) => c.status !== 'returned').sort((a, b) => a.expectedReturn.localeCompare(b.expectedReturn));
  const statusLabel: Record<string, string> = { reserved: 'Reserved', checked_out: 'Checked out', needs_inspection: 'Needs inspection', needs_repair: 'Needs repair', returned: 'Returned' };
  return (
    <PrintShell title="Costume Checkouts" subtitle={`${rows.length} open · ${rows.filter((c) => isCheckoutOverdue(c)).length} overdue`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>Costume</th>
            <th>Dancer / family</th>
            <th>Status</th>
            <th>Out</th>
            <th>Due back</th>
            <th>Accessories</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const cos = db.costumes.find((x) => x.id === c.costumeId);
            const d = db.dancers.find((x) => x.id === c.dancerId);
            return (
              <tr key={c.id} className={isCheckoutOverdue(c) ? 'p-warn' : ''}>
                <td className="strong">
                  {cos?.inventoryNumber} {cos?.name}
                </td>
                <td>{d ? fullName(d) : db.families.find((f) => f.id === c.familyId)?.name ?? '—'}</td>
                <td>
                  {statusLabel[c.status]}
                  {isCheckoutOverdue(c) && ' — OVERDUE'}
                </td>
                <td>{c.checkedOutAt ? formatDateTime(c.checkedOutAt) : ''}</td>
                <td>{formatDate(c.expectedReturn)}</td>
                <td>{c.accessoriesIssued.join(', ')}</td>
                <td className="p-notes">{c.notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintShell>
  );
}

/* ============================================================ engagement */

function DancerTable({ db, ids, extra }: { db: Database; ids: ID[]; extra?: (id: ID) => ReactNode }) {
  const list = ids.map((d) => db.dancers.find((x) => x.id === d)).filter(Boolean).sort((a, b) => a!.lastName.localeCompare(b!.lastName));
  return (
    <table className="p-table">
      <thead>
        <tr>
          <th>Dancer</th>
          <th>Level</th>
          <th>Family</th>
          <th>Phone</th>
          {extra && <th>Details</th>}
        </tr>
      </thead>
      <tbody>
        {list.map((d) => {
          const g = db.guardians.find((x) => x.familyId === d!.familyId && x.isPrimary) ?? db.guardians.find((x) => x.familyId === d!.familyId);
          return (
            <tr key={d!.id}>
              <td className="strong">{fullName(d!)}</td>
              <td>{d!.level}</td>
              <td>{db.families.find((f) => f.id === d!.familyId)?.name ?? ''}</td>
              <td className="nowrap">{g?.phone ?? ''}</td>
              {extra && <td className="p-notes">{extra(d!.id)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TeamSheet({ db, id }: { db: Database; id: string }) {
  const t = db.teams.find((x) => x.id === id);
  if (!t) return <Missing what="Team" />;
  return (
    <PrintShell title={`${t.name} Roster`} subtitle={`${t.dancerIds.length} dancers${t.teacherIds.length ? ` · Coaches: ${t.teacherIds.map((s) => db.staff.find((x) => x.id === s)).filter(Boolean).map((s) => fullName(s!)).join(', ')}` : ''}`}>
      <DancerTable db={db} ids={t.dancerIds} />
      {t.rehearsalSchedule && (
        <>
          <h2>Rehearsals</h2>
          <p className="p-notes prewrap">{t.rehearsalSchedule}</p>
        </>
      )}
      {t.competitionSchedule && (
        <>
          <h2>Competitions</h2>
          <p className="p-notes prewrap">{t.competitionSchedule}</p>
        </>
      )}
      {t.requirements && (
        <>
          <h2>Requirements</h2>
          <p className="p-notes prewrap">{t.requirements}</p>
        </>
      )}
    </PrintShell>
  );
}

function EventSheet({ db, id }: { db: Database; id: string }) {
  const e = db.signupEvents.find((x) => x.id === id);
  if (!e) return <Missing what="Event" />;
  const c = eventCounts(db, id);
  const regs = db.eventRegistrations.filter((r) => r.eventId === id && (r.status === 'registered' || r.status === 'waitlist'));
  return (
    <PrintShell title={`${e.name} — Sign-ups`} subtitle={`${formatDate(e.date)}${e.startTime ? ` ${formatTime(e.startTime)}` : ''} · ${e.location} · ${c.registered} registered${c.waitlist ? ` · ${c.waitlist} waitlist` : ''}`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>Dancer</th>
            <th>Status</th>
            {e.questions.map((q) => (
              <th key={q.id}>{q.label}</th>
            ))}
            <th>Paid</th>
          </tr>
        </thead>
        <tbody>
          {regs.map((r) => {
            const d = db.dancers.find((x) => x.id === r.dancerId);
            const inv = db.invoices.find((i) => i.id === r.invoiceId);
            return (
              <tr key={r.id}>
                <td className="strong">{d ? fullName(d) : 'Removed dancer'}</td>
                <td>{r.status === 'waitlist' ? 'Waitlist' : 'Registered'}</td>
                {e.questions.map((q) => (
                  <td key={q.id}>{r.answers[q.id] ?? ''}</td>
                ))}
                <td>{inv ? invoiceStatusLabels[invoiceStatus(db, inv)] : e.cost ? '—' : 'Free'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintShell>
  );
}

function TicketSheet({ db, id }: { db: Database; id: string }) {
  const e = db.ticketEvents.find((x) => x.id === id);
  if (!e) return <Missing what="Ticketed event" />;
  const orders = db.ticketOrders.filter((o) => o.ticketEventId === id && o.status === 'paid').sort((a, b) => a.buyerName.localeCompare(b.buyerName));
  return (
    <PrintShell title={`${e.name} — Will Call / Attendee List`} subtitle={`${formatDate(e.date)} ${formatTime(e.time)} · ${e.venue} · ${ticketsSold(db, id)} tickets sold`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>✓</th>
            <th>Buyer</th>
            <th>Tickets</th>
            <th>Seats</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="p-box">☐</td>
              <td className="strong">{o.buyerName}</td>
              <td>{o.lines.map((l) => `${l.qty} × ${e.types.find((t) => t.id === l.typeId)?.name ?? 'Ticket'}`).join(', ')}</td>
              <td>{o.seats.join(', ')}</td>
              <td className="num">{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintShell>
  );
}

function PolicySheet({ db, id }: { db: Database; id: string }) {
  const pol = db.policies.find((x) => x.id === id);
  if (!pol) return <Missing what="Policy" />;
  const v = currentVersion(pol);
  const fams = db.families.filter((f) => f.status === 'active');
  return (
    <PrintShell title={pol.title} subtitle={`Version ${v?.version ?? 1}${pol.deadline ? ` · Sign by ${formatDate(pol.deadline)}` : ''}`}>
      <div className="p-notes prewrap">{v?.body}</div>
      {pol.requiresSignature && (
        <>
          <h2>Signature status</h2>
          <table className="p-table">
            <tbody>
              {fams.map((f) => {
                const st = policyStatusForFamily(db, pol, f.id);
                if (st === 'not_required') return null;
                const sig = db.policySignatures.filter((s) => s.policyId === pol.id && s.familyId === f.id).sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0];
                return (
                  <tr key={f.id}>
                    <td className="strong">{f.name}</td>
                    <td>{st === 'signed' ? 'Signed' : st === 'overdue' ? 'OVERDUE' : 'Not signed'}</td>
                    <td>{sig && st === 'signed' ? `${sig.signerName} · ${formatDateTime(sig.signedAt)} · v${sig.version}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </PrintShell>
  );
}

function FundraiserSheet({ db, id }: { db: Database; id: string }) {
  const f = db.fundraisers.find((x) => x.id === id);
  if (!f) return <Missing what="Fundraiser" />;
  const tx = db.fundraiserTransactions.filter((t) => t.fundraiserId === id);
  return (
    <PrintShell title={f.name} subtitle={`${money(fundraiserRaised(db, id))} raised${f.goal ? ` of ${money(f.goal)} goal` : ''} · ${formatDate(f.startDate)} – ${formatDate(f.endDate)}`}>
      <table className="p-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Dancer / family</th>
            <th>Supporter</th>
            <th>Items</th>
            <th className="num">Amount</th>
            <th>Delivered</th>
          </tr>
        </thead>
        <tbody>
          {tx.map((t) => {
            const d = db.dancers.find((x) => x.id === t.dancerId);
            return (
              <tr key={t.id}>
                <td>{formatDate(t.createdAt)}</td>
                <td>{d ? fullName(d) : db.families.find((x) => x.id === t.familyId)?.name ?? ''}</td>
                <td>{t.donorName}</td>
                <td>{t.kind === 'donation' ? 'Donation' : t.items.map((i) => `${i.qty} × ${f.items.find((x) => x.id === i.itemId)?.name ?? 'Item'}`).join(', ')}</td>
                <td className="num">{money(t.amount)}</td>
                <td className="p-box">{t.kind === 'order' ? (t.fulfilled ? '✓' : '☐') : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PrintShell>
  );
}

function RosterSheet({ db, id }: { db: Database; id: string }) {
  const c = db.classes.find((x) => x.id === id);
  if (!c) return <Missing what="Class" />;
  const ids = db.enrollments.filter((e) => e.classId === id && e.status === 'enrolled').map((e) => e.dancerId);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return (
    <PrintShell title={`${c.name} — Class Roster`} subtitle={`${days[c.dayOfWeek]} ${formatTime(c.startTime)}–${formatTime(c.endTime)} · ${ids.length} dancers`}>
      <DancerTable db={db} ids={ids} extra={(d) => db.dancers.find((x) => x.id === d)?.allergies ?? ''} />
    </PrintShell>
  );
}
