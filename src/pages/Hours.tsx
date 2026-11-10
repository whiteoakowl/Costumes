import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Clock, Download, History, Pencil, Plus, Trash2, Wand, X } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteTimeEntry, editTimeEntry, generateClassHours, reviewHours, submitHours, type TimeEntryInput } from '../data/studioActions';
import { formatDate, formatDateTime } from '../data/selectors';
import { addDays, entryPay, hoursKindLabels, payPeriodFor, payrollSummary, staffClassIds, staffName } from '../data/studio';
import { Badge, BulkBar, Card, EmptyState, Field, PageHeader, SearchSelect, StatCard } from '../components/ui';
import { FormModal } from '../components/forms';
import { Modal } from '../components/Modal';
import { useConfirm, useRun } from '../components/feedback';
import { classOptions, download, money, toCsv, useStaffOptions } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { todayStr } from '../data/ids';
import type { HoursKind, ID, TimeEntry } from '../data/types';

const statusTone = { pending: 'progress', approved: 'ready', rejected: 'danger' } as const;
const KINDS = Object.keys(hoursKindLabels) as HoursKind[];

function EntryForm({ open, onClose, staffId, lockStaff }: { open: boolean; onClose: () => void; staffId?: ID; lockStaff?: boolean }) {
  const db = useDb();
  const run = useRun();
  const staffOpts = useStaffOptions();
  const empty = (): TimeEntryInput => ({ staffId: staffId ?? '', date: todayStr(), kind: 'additional', classId: null, hours: 1, description: '' });
  const [v, setV] = useState<TimeEntryInput>(empty);
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) setV(empty());
  }
  const set = <K extends keyof TimeEntryInput>(k: K, val: TimeEntryInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const myClasses = v.staffId ? staffClassIds(db, v.staffId) : [];
  return (
    <FormModal open={open} onClose={onClose} title={lockStaff ? 'Submit Hours' : 'Add Hours'} subtitle="New hours are pending until approved" onSubmit={() => run(() => submitHours(v), 'Hours submitted for approval.') && onClose()}>
      {!lockStaff && (
        <Field label="Staff member" required>
          <SearchSelect ariaLabel="Staff member" value={v.staffId} onChange={(x) => set('staffId', x)} options={staffOpts} placeholder="Choose…" />
        </Field>
      )}
      <div className="grid-2">
        <Field label="Date worked" required>
          <input className="input" type="date" value={v.date} max={addDays(todayStr(), 0)} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Type">
          <select className="input" value={v.kind} onChange={(e) => set('kind', e.target.value as HoursKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {hoursKindLabels[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hours" required>
          <input className="input" type="number" min={0.25} step={0.25} value={v.hours} onChange={(e) => set('hours', Number(e.target.value))} />
        </Field>
        <Field label="Class (optional)">
          <SearchSelect ariaLabel="Class" value={v.classId ?? ''} onChange={(x) => set('classId', x || null)} options={classOptions(db, undefined, lockStaff ? myClasses : undefined)} noneLabel="No class" />
        </Field>
      </div>
      <Field label="Description" hint={v.kind === 'class' ? 'Use this for a correction to a class you taught' : undefined}>
        <textarea className="input" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Costume fittings, stayed 30 min late" />
      </Field>
    </FormModal>
  );
}

function EditEntry({ entry, onClose }: { entry: TimeEntry | null; onClose: () => void }) {
  const run = useRun();
  const v = useViewer();
  const [hours, setHours] = useState(0);
  const [rate, setRate] = useState(0);
  const [desc, setDesc] = useState('');
  const [reason, setReason] = useState('');
  const [last, setLast] = useState<string | null>(null);
  if ((entry?.id ?? null) !== last) {
    setLast(entry?.id ?? null);
    if (entry) {
      setHours(entry.hours);
      setRate(entry.rate);
      setDesc(entry.description);
      setReason('');
    }
  }
  return (
    <FormModal open={!!entry} onClose={onClose} title="Edit Hours" subtitle={entry ? `${formatDate(entry.date)} · ${hoursKindLabels[entry.kind]}` : ''} size="sm" onSubmit={() => run(() => (editTimeEntry(entry!.id, { hours, description: desc, ...(v.can('payroll.view') ? { rate } : {}) }, reason), true), 'Hours updated — change recorded.') && onClose()}>
      <Field label="Hours">
        <input className="input" type="number" min={0.25} step={0.25} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
      </Field>
      {v.can('payroll.view') && (
        <Field label="Hourly rate ($)">
          <input className="input" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
      )}
      <Field label="Description">
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      <Field label={entry?.status === 'approved' ? 'Reason for changing approved hours (required)' : 'Reason (optional)'}>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </FormModal>
  );
}

function HistoryDialog({ entry, onClose }: { entry: TimeEntry | null; onClose: () => void }) {
  return (
    <Modal open={!!entry} onClose={onClose} title="Audit trail" subtitle={entry ? `${formatDate(entry.date)} · ${entry.hours} h · ${hoursKindLabels[entry.kind]}` : ''} size="sm">
      <ul className="log compact">
        {entry?.history.map((h, i) => (
          <li key={i}>
            <div className="log-meta">
              {formatDateTime(h.at)} · {h.by}
            </div>
            <div>{h.change}</div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Table of time entries with review actions. */
function EntryTable({ entries, admin, showStaff = true }: { entries: TimeEntry[]; admin: boolean; showStaff?: boolean }) {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [hist, setHist] = useState<TimeEntry | null>(null);
  const [rejecting, setRejecting] = useState<ID[] | null>(null);
  const [reason, setReason] = useState('');
  const showPay = v.can('payroll.view') || !admin;
  const ids = [...selected].filter((id) => entries.some((e) => e.id === id));
  if (!entries.length) return <p className="faint pad">No hours for these filters.</p>;
  return (
    <>
      {admin && v.can('hours.approve') && (
        <BulkBar count={ids.length} onClear={() => setSelected(new Set())}>
          <button className="btn btn-ghost btn-sm" onClick={() => run(() => (reviewHours(ids, 'approved', ''), true), `${ids.length} approved.`) && setSelected(new Set())}>
            <Check size={14} /> Approve
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={() => (setRejecting(ids), setReason(''))}>
            <X size={14} /> Reject
          </button>
        </BulkBar>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {admin && (
                <th className="col-check">
                  <input type="checkbox" aria-label="Select all" checked={entries.every((e) => selected.has(e.id))} onChange={(e) => setSelected(e.target.checked ? new Set(entries.map((x) => x.id)) : new Set())} />
                </th>
              )}
              <th>Date</th>
              {showStaff && <th>Staff</th>}
              <th>Work</th>
              <th>Hours</th>
              {showPay && <th className="minor">Rate</th>}
              {showPay && <th>Pay</th>}
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const cls = db.classes.find((c) => c.id === e.classId);
              const diff = e.scheduledHours && e.hours !== e.scheduledHours;
              return (
                <tr key={e.id} className={selected.has(e.id) ? 'selected' : ''}>
                  {admin && (
                    <td className="col-check">
                      <input
                        type="checkbox"
                        aria-label="Select entry"
                        checked={selected.has(e.id)}
                        onChange={() => {
                          const n = new Set(selected);
                          if (n.has(e.id)) n.delete(e.id);
                          else n.add(e.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                  )}
                  <td className="nowrap">{formatDate(e.date)}</td>
                  {showStaff && <td>{staffName(db.staff.find((s) => s.id === e.staffId)) || 'Removed staff'}</td>}
                  <td>
                    <strong className="small">{hoursKindLabels[e.kind]}</strong>
                    <div className="small faint">{cls ? cls.name : e.description}</div>
                    {cls && e.description && e.description !== cls.name && <div className="small faint">{e.description}</div>}
                  </td>
                  <td>
                    {e.hours}
                    {diff ? <div className="small faint">sched. {e.scheduledHours}</div> : null}
                  </td>
                  {showPay && <td className="minor small">{money(e.rate)}</td>}
                  {showPay && <td>{money(entryPay(e))}</td>}
                  <td>
                    <Badge tone={statusTone[e.status]}>{e.status === 'pending' ? 'Pending' : e.status === 'approved' ? 'Approved' : 'Rejected'}</Badge>
                    {e.reviewNote && <div className="small faint">{e.reviewNote}</div>}
                  </td>
                  <td className="row-actions">
                    {admin && v.can('hours.approve') && e.status === 'pending' && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => run(() => reviewHours([e.id], 'approved', ''), 'Approved.')}>
                          <Check size={13} /> Approve
                        </button>
                        <button className="icon-btn danger" aria-label="Reject" title="Reject" onClick={() => (setRejecting([e.id]), setReason(''))}>
                          <X size={15} />
                        </button>
                      </>
                    )}
                    {(admin ? v.can('hours.approve') : e.status !== 'approved') && (
                      <button className="icon-btn" aria-label="Edit hours" title="Edit" onClick={() => setEditing(e)}>
                        <Pencil size={14} />
                      </button>
                    )}
                    <button className="icon-btn" aria-label="Audit trail" title="Audit trail" onClick={() => setHist(e)}>
                      <History size={14} />
                    </button>
                    {e.status !== 'approved' && (admin || e.status === 'pending') && (
                      <button
                        className="icon-btn danger"
                        aria-label="Delete entry"
                        onClick={async () => {
                          if (await confirm({ title: 'Delete these hours?', message: 'Only pending or rejected hours can be deleted.', confirmLabel: 'Delete', danger: true })) run(() => deleteTimeEntry(e.id), 'Deleted.');
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <EditEntry entry={editing} onClose={() => setEditing(null)} />
      <HistoryDialog entry={hist} onClose={() => setHist(null)} />
      <FormModal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject hours" size="sm" saveLabel="Reject" onSubmit={() => run(() => (reviewHours(rejecting!, 'rejected', reason), true), 'Rejected.') && (setRejecting(null), setSelected(new Set()))}>
        <Field label="Reason (shown to the teacher)" required>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </FormModal>
    </>
  );
}

export function HoursPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const [params] = useSearchParams();
  const period = payPeriodFor(db.settings.payPeriod, todayStr());
  const [from, setFrom] = useState(period.start);
  const [to, setTo] = useState(period.end);
  const [staffId, setStaffId] = useState(params.get('staff') ?? '');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const staffOpts = useStaffOptions();
  const entries = useMemo(
    () =>
      db.timeEntries
        .filter((e) => (!from || e.date >= from) && (!to || e.date <= to) && (!staffId || e.staffId === staffId) && (!classId || e.classId === classId) && (!status || e.status === status) && (!kind || e.kind === kind))
        .sort((a, b) => b.date.localeCompare(a.date) || staffName(db.staff.find((s) => s.id === a.staffId)).localeCompare(staffName(db.staff.find((s) => s.id === b.staffId)))),
    [db, from, to, staffId, classId, status, kind],
  );
  const summary = payrollSummary(db, entries);
  const showPay = v.can('payroll.view');
  const shiftPeriod = (dir: -1 | 1) => {
    const p = payPeriodFor(db.settings.payPeriod, addDays(dir < 0 ? from : to, dir));
    setFrom(p.start);
    setTo(p.end);
  };
  const exportSummary = () =>
    download(
      `payroll-summary-${from}-to-${to}.csv`,
      toCsv(
        ['Staff', 'Approved hours', 'Pending hours', ...KINDS.map((k) => `${hoursKindLabels[k]} (approved h)`), 'Approved pay'],
        summary.map((r) => [r.name, r.approvedHours.toFixed(2), r.pendingHours.toFixed(2), ...KINDS.map((k) => (r.byKind[k] ?? 0).toFixed(2)), r.pay.toFixed(2)]),
      ),
      'text/csv;charset=utf-8',
    );
  const exportDetail = () =>
    download(
      `hours-detail-${from}-to-${to}.csv`,
      toCsv(
        ['Date', 'Staff', 'Type', 'Class', 'Description', 'Scheduled hours', 'Hours', 'Rate', 'Pay', 'Status', 'Reviewed by', 'Review note'],
        entries.map((e) => [formatDate(e.date), staffName(db.staff.find((s) => s.id === e.staffId)), hoursKindLabels[e.kind], db.classes.find((c) => c.id === e.classId)?.name ?? '', e.description, e.scheduledHours, e.hours, e.rate, entryPay(e).toFixed(2), e.status, e.reviewedBy, e.reviewNote]),
      ),
      'text/csv;charset=utf-8',
    );
  const pending = entries.filter((e) => e.status === 'pending');
  return (
    <>
      <PageHeader
        title="Teacher Hours & Payroll"
        subtitle="Review hours, approve them, and export payroll summaries. Nothing is paid automatically."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setGenerating(true)}>
              <Wand size={16} /> Fill in class hours
            </button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add hours
            </button>
          </>
        }
      />
      <Card>
        <div className="toolbar">
          <button className="btn btn-ghost btn-sm" onClick={() => shiftPeriod(-1)} aria-label="Previous pay period">
            ‹
          </button>
          <div className="age-filter">
            <input className="input input-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="faint">–</span>
            <input className="input input-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftPeriod(1)} aria-label="Next pay period">
            ›
          </button>
          <span className="small faint">{db.settings.payPeriod} pay period</span>
          <div className="attn-class">
            <SearchSelect ariaLabel="Filter by staff" value={staffId} onChange={setStaffId} options={staffOpts} noneLabel="All staff" />
          </div>
          <div className="attn-class">
            <SearchSelect ariaLabel="Filter by class" value={classId} onChange={setClassId} options={classOptions(db)} noneLabel="All classes" />
          </div>
          <select className="input input-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">Approved & unapproved</option>
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="input input-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {hoursKindLabels[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="stats stats-4">
          <StatCard label="Approved hours" value={summary.reduce((s, r) => s + r.approvedHours, 0).toFixed(1)} icon={<Check size={20} />} tone="sage" />
          <StatCard label="Pending approval" value={pending.length} icon={<Clock size={20} />} tone="amber" hint={`${pending.reduce((s, e) => s + e.hours, 0).toFixed(1)} h`} />
          {showPay && <StatCard label="Approved pay" value={money(summary.reduce((s, r) => s + r.pay, 0))} icon={<Download size={20} />} tone="plum" />}
          <StatCard label="Staff with hours" value={summary.length} icon={<Clock size={20} />} tone="slate" />
        </div>
      </Card>
      {showPay && (
        <Card
          title="Payroll Summary"
          actions={
            <>
              <button className="btn btn-ghost btn-sm" onClick={exportSummary} disabled={!summary.length}>
                <Download size={14} /> Summary CSV
              </button>
              <button className="btn btn-ghost btn-sm" onClick={exportDetail} disabled={!entries.length}>
                <Download size={14} /> Detail CSV
              </button>
            </>
          }
        >
          {!summary.length ? (
            <p className="faint pad">No hours in this period.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Approved hours</th>
                    <th>Pending</th>
                    <th className="minor">Class / Sub / Rehearsal / Private / Other</th>
                    <th>Approved pay</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => (
                    <tr key={r.staffId}>
                      <td className="link-strong">{r.name}</td>
                      <td>{r.approvedHours.toFixed(2)}</td>
                      <td className={r.pendingHours ? 'warn-text' : 'faint'}>{r.pendingHours.toFixed(2)}</td>
                      <td className="minor small">{[r.byKind.class, r.byKind.substitute, r.byKind.rehearsal, r.byKind.private, (r.byKind.additional ?? 0) + (r.byKind.other ?? 0)].map((x) => (x ?? 0).toFixed(1)).join(' / ')}</td>
                      <td>
                        <strong>{money(r.pay)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small faint">Salaried staff show hours only. Review and process payroll in your payroll system — this app never sends payments.</p>
            </div>
          )}
        </Card>
      )}
      <Card title={`Hours (${entries.length})`}>
        {db.timeEntries.length ? <EntryTable entries={entries} admin /> : <EmptyState icon={<Clock size={28} />} title="No hours yet" message="Use “Fill in class hours” to create entries from the schedule, or add hours manually." />}
      </Card>
      <EntryForm open={adding} onClose={() => setAdding(false)} />
      <FormModal
        open={generating}
        onClose={() => setGenerating(false)}
        title="Fill in class hours from the schedule"
        subtitle="Creates pending entries for classes that met (not cancelled), skipping any already recorded"
        size="sm"
        saveLabel="Create entries"
        onSubmit={() => {
          const n = run(() => generateClassHours(from, to, staffId || undefined));
          if (n !== undefined) {
            run(() => 0, n ? `${n} class entries created for approval.` : 'Nothing new to add — every class in this range is already recorded.');
            setGenerating(false);
          }
        }}
      >
        <p>
          From <strong>{formatDate(from)}</strong> to <strong>{formatDate(to)}</strong>
          {staffId ? ` for ${staffName(db.staff.find((s) => s.id === staffId))}` : ' for all teachers and assistants'}. Change the dates and staff filter above to adjust.
        </p>
      </FormModal>
    </>
  );
}

/** Teacher portal: my hours. */
export function MyHoursPage() {
  const db = useDb();
  const v = useViewer();
  const [adding, setAdding] = useState(false);
  const me = db.staff.find((s) => s.id === v.staffId);
  if (!me) return <EmptyState title="No staff profile" message="This account isn't linked to a staff member yet. Ask the office to link it." />;
  const mine = db.timeEntries.filter((e) => e.staffId === me.id).sort((a, b) => b.date.localeCompare(a.date));
  const period = payPeriodFor(db.settings.payPeriod, todayStr());
  const inPeriod = mine.filter((e) => e.date >= period.start && e.date <= period.end);
  const sum = payrollSummary(db, inPeriod)[0];
  return (
    <>
      <PageHeader
        title="My Hours"
        subtitle={`Current pay period: ${formatDate(period.start)} – ${formatDate(period.end)}`}
        actions={
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Submit hours or a correction
          </button>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Approved this period" value={(sum?.approvedHours ?? 0).toFixed(2)} icon={<Check size={20} />} tone="sage" />
        <StatCard label="Pending approval" value={(sum?.pendingHours ?? 0).toFixed(2)} icon={<Clock size={20} />} tone="amber" />
        {me.payType === 'hourly' && <StatCard label="Estimated earnings" value={money(sum?.pay ?? 0)} icon={<Download size={20} />} tone="plum" hint="Approved hours only" />}
        <StatCard label="Rejected" value={mine.filter((e) => e.status === 'rejected').length} icon={<X size={20} />} tone="rose" />
      </div>
      <Card title="All my hours">
        <EntryTable entries={mine} admin={false} showStaff={false} />
      </Card>
      <EntryForm open={adding} onClose={() => setAdding(false)} staffId={me.id} lockStaff />
    </>
  );
}
