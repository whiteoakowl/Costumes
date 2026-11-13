import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from '../lib/router';
import { AlertTriangle, ArrowRightLeft, Ban, Copy, CreditCard, DollarSign, Download, FileText, Gift, Pencil, Plus, Printer, Receipt, RotateCcw, Send, Shirt, Trash2, Wallet } from 'lucide-react';
import { useDb } from '../data/store';
import {
  applyCredit,
  applyLateFees,
  batchInvoice,
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  generateTuition,
  issueCredit,
  issueRefund,
  payOnlineTest,
  recordPayment,
  removeCredit,
  sendInvoice,
  transferCredit,
  updateInvoice,
  voidInvoice,
} from '../data/financeActions';
import { familyBalance, familyCredit, invoiceBalance, invoicePaid, invoiceStatus, invoiceStatusLabels, invoiceSubtotal, invoiceTax, invoiceTotal, paymentNet, refundedFor, round2, type InvoiceStatus } from '../data/platform';
import { formatDate, formatDateTime, fullName } from '../data/selectors';
import { Badge, Card, CheckList, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, SearchSelect, StatCard, Tabs, type Column } from '../components/ui';
import { FormModal } from '../components/forms';
import { Modal } from '../components/Modal';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { BarChart, HBarChart } from '../components/charts';
import { download, money, toCsv, classOptions, currentYear } from '../components/studioUi';
import { openPrint } from './Print';
import { useViewer } from '../lib/session';
import { todayStr, newId } from '../data/ids';
import { addDays } from '../data/studio';
import type { Database, ID, Invoice, InvoiceLine, InvoiceSource, Payment, PaymentMethod } from '../data/types';

const statusTone: Record<InvoiceStatus, 'neutral' | 'ready' | 'progress' | 'danger' | 'info'> = { draft: 'neutral', void: 'neutral', paid: 'ready', partial: 'info', overdue: 'danger', unpaid: 'progress' };
export const methodLabels: Record<PaymentMethod, string> = { card: 'Card', cash: 'Cash', check: 'Check', ach: 'Bank transfer', other: 'Other' };
const sourceLabels: Record<InvoiceSource, string> = { tuition: 'Tuition', registration: 'Registration', costume: 'Costume', recital: 'Recital', competition: 'Competition', company: 'Company / team', event: 'Event', fundraiser: 'Fundraiser', private: 'Private lessons', ticket: 'Tickets', custom: 'Custom' };

export function InvoiceStatusBadge({ db, inv }: { db: Database; inv: Invoice }) {
  const s = invoiceStatus(db, inv);
  return <Badge tone={statusTone[s]}>{invoiceStatusLabels[s]}</Badge>;
}

/* ============================================================ dashboard */

export function FinancePage() {
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'overview' | 'invoices' | 'payments' | 'credits' | 'accounts') || 'overview';
  const [creating, setCreating] = useState(false);
  const [batch, setBatch] = useState(false);
  const [tuition, setTuition] = useState(false);
  const navigate = useNavigate();
  const v = useViewer();
  return (
    <>
      <PageHeader
        title="Invoices & Payments"
        subtitle="Tuition, costume and event billing, payments, refunds and family credits"
        actions={
          v.can('billing.edit') && <>
            <button className="btn btn-ghost" onClick={() => setTuition(true)}>
              <FileText size={16} /> Monthly tuition
            </button>
            <button className="btn btn-ghost" onClick={() => setBatch(true)}>
              <Shirt size={16} /> Costume invoicing
            </button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New invoice
            </button>
          </>
        }
      />
      <div className="hint-bar">
        <span>
          <CreditCard size={14} /> <strong>Payments are in test mode.</strong> Parents' online payments are simulated (no card is charged and no card details are collected). Cash, check and bank payments recorded by staff are real records.
        </span>
      </div>
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'overview', label: 'Financial dashboard' },
          { value: 'invoices', label: 'Invoices', count: db.invoices.length },
          { value: 'payments', label: 'Payments & refunds', count: db.payments.length },
          { value: 'credits', label: 'Credits', count: db.credits.length },
          { value: 'accounts', label: 'Family accounts', count: db.families.length },
        ]}
      />
      {tab === 'overview' && <FinanceDashboard />}
      {tab === 'invoices' && <InvoiceList />}
      {tab === 'payments' && <PaymentList />}
      {tab === 'credits' && <CreditList />}
      {tab === 'accounts' && <FamilyAccounts />}
      <InvoiceForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/invoices/${id}`)} />
      <BatchInvoiceDialog open={batch} onClose={() => setBatch(false)} />
      <TuitionDialog open={tuition} onClose={() => setTuition(false)} />
    </>
  );
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

function FinanceDashboard() {
  const db = useDb();
  const run = useRun();
  const today = todayStr();
  const month = today.slice(0, 7);
  const sent = db.invoices.filter((i) => i.state === 'sent');
  const netPayments = db.payments.map((p) => ({ p, net: round2(p.amount - refundedFor(db, p.id)) }));
  const received = (filter: (p: Payment) => boolean) => round2(netPayments.filter(({ p }) => filter(p)).reduce((s, x) => s + x.net, 0));
  const outstanding = round2(sent.reduce((s, i) => s + Math.max(0, invoiceBalance(db, i)), 0));
  const overdue = sent.filter((i) => invoiceStatus(db, i) === 'overdue');
  const refunds = round2(db.refunds.filter((r) => r.status === 'completed').reduce((s, r) => s + r.amount, 0));
  const creditsIssued = round2(db.credits.filter((c) => c.kind === 'issued').reduce((s, c) => s + c.amount, 0));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(`${month}-15T12:00:00`);
    d.setMonth(d.getMonth() - (11 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const byMonth = months.map((m) => ({ label: `${m.slice(5)}/${m.slice(2, 4)}`, value: received((p) => monthKey(p.date) === m) }));
  // revenue by category: payments allocated to invoice lines proportionally
  const byCategory = new Map<string, number>();
  for (const { p, net } of netPayments) {
    const inv = p.invoiceId ? db.invoices.find((i) => i.id === p.invoiceId) : undefined;
    if (!inv) {
      byCategory.set(p.note.startsWith('Tickets') ? 'Tickets' : 'Other', (byCategory.get(p.note.startsWith('Tickets') ? 'Tickets' : 'Other') ?? 0) + net);
      continue;
    }
    const sub = invoiceSubtotal(inv) || 1;
    for (const l of inv.lines) byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + (net * (l.quantity * l.unitPrice)) / sub);
  }
  const bySource = new Map<string, number>();
  for (const { p, net } of netPayments) {
    const inv = p.invoiceId ? db.invoices.find((i) => i.id === p.invoiceId) : undefined;
    let key = inv ? sourceLabels[inv.source] : p.note.startsWith('Tickets') ? 'Tickets' : 'Other';
    if (inv?.sourceId) {
      const name = db.signupEvents.find((e) => e.id === inv.sourceId)?.name ?? db.recitals.find((r) => r.id === inv.sourceId)?.name ?? db.fundraisers.find((f) => f.id === inv.sourceId)?.name ?? db.teams.find((t) => t.id === inv.sourceId)?.name;
      if (name) key = name;
    }
    bySource.set(key, (bySource.get(key) ?? 0) + net);
  }
  const byYear = db.schoolYears.map((y) => ({ label: y.name, value: received((p) => { const inv = db.invoices.find((i) => i.id === p.invoiceId); return inv ? inv.schoolYearId === y.id : p.date >= y.startDate && p.date <= y.endDate; }) }));
  const exportAll = () =>
    download(
      `invoices-${today}.csv`,
      toCsv(
        ['Invoice', 'Family', 'Title', 'Source', 'Issued', 'Due', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', 'Status'],
        db.invoices.map((i) => [i.number, db.families.find((f) => f.id === i.familyId)?.name, i.title, sourceLabels[i.source], formatDate(i.issueDate), formatDate(i.dueDate), invoiceSubtotal(i), i.discount, invoiceTax(i), invoiceTotal(i), invoicePaid(db, i.id), invoiceBalance(db, i), invoiceStatusLabels[invoiceStatus(db, i)]]),
      ),
      'text/csv;charset=utf-8',
    );
  return (
    <>
      <div className="stats">
        <StatCard label="Revenue this month" value={money(received((p) => monthKey(p.date) === month))} icon={<DollarSign size={20} />} tone="sage" hint="Payments minus refunds" />
        <StatCard label="Payments received (all time)" value={money(received(() => true))} icon={<Wallet size={20} />} tone="plum" />
        <StatCard label="Outstanding balances" value={money(outstanding)} icon={<FileText size={20} />} tone="amber" hint={`${sent.filter((i) => invoiceBalance(db, i) > 0).length} open invoices`} />
        <StatCard label="Overdue invoices" value={overdue.length} icon={<AlertTriangle size={20} />} tone="rose" hint={money(overdue.reduce((s, i) => s + invoiceBalance(db, i), 0))} />
        <StatCard label="Refunds" value={money(refunds)} icon={<RotateCcw size={20} />} tone="slate" />
        <StatCard label="Credits issued" value={money(creditsIssued)} icon={<Gift size={20} />} tone="sand" />
      </div>
      <div className="dash-grid">
        <Card title="Revenue by month" className="span-2" actions={<button className="btn btn-ghost btn-sm" onClick={exportAll}><Download size={14} /> Export invoices CSV</button>}>
          <BarChart data={byMonth} format={(n) => money(n).replace('.00', '')} />
        </Card>
        <Card title="Overdue" icon={<AlertTriangle size={18} />} actions={<button className="btn btn-ghost btn-sm" onClick={() => { const n = run(() => applyLateFees()); if (n !== undefined) run(() => 0, n ? `Late fee added to ${n} invoice(s).` : 'No invoices are past the grace period without a late fee.'); }}>Apply late fees</button>}>
          {!overdue.length ? (
            <p className="faint pad">Nothing overdue.</p>
          ) : (
            <ul className="mini-list">
              {overdue.map((i) => (
                <li key={i.id}>
                  <div>
                    <Link to={`/invoices/${i.id}`} className="link-strong">
                      {i.number}
                    </Link>{' '}
                    <span className="small faint">· {db.families.find((f) => f.id === i.familyId)?.name}</span>
                    <div className="small faint">Due {formatDate(i.dueDate)}</div>
                  </div>
                  <strong>{money(invoiceBalance(db, i))}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Revenue by category">
          <HBarChart data={[...byCategory].map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value)} format={(n) => money(n)} />
        </Card>
        <Card title="Revenue by event, recital & program">
          <HBarChart data={[...bySource].map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value)} format={(n) => money(n)} />
        </Card>
        <Card title="Revenue by school year">
          <HBarChart data={byYear} format={(n) => money(n)} />
        </Card>
      </div>
    </>
  );
}

/* ============================================================== invoices */

function InvoiceList() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const rows = db.invoices
    .filter((i) => (!status || invoiceStatus(db, i) === status) && (!source || i.source === source) && (!q || `${i.number} ${i.title} ${db.families.find((f) => f.id === i.familyId)?.name}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.number.localeCompare(a.number));
  const columns: Column<Invoice>[] = [
    {
      key: 'num',
      header: 'Invoice',
      render: (i) => (
        <>
          <Link to={`/invoices/${i.id}`} className="link-strong">
            {i.number}
          </Link>
          <SampleTag show={i.isSample} />
          <div className="small faint">{i.title}</div>
        </>
      ),
      sortValue: (i) => i.number,
    },
    { key: 'fam', header: 'Family', render: (i) => <Link to={`/families/${i.familyId}`}>{db.families.find((f) => f.id === i.familyId)?.name ?? 'Removed family'}</Link>, sortValue: (i) => db.families.find((f) => f.id === i.familyId)?.name ?? '' },
    { key: 'src', header: 'Type', render: (i) => sourceLabels[i.source], sortValue: (i) => i.source, minor: true },
    { key: 'due', header: 'Due', render: (i) => formatDate(i.dueDate) || '—', sortValue: (i) => i.dueDate },
    { key: 'total', header: 'Total', render: (i) => money(invoiceTotal(i)), sortValue: (i) => invoiceTotal(i) },
    { key: 'bal', header: 'Balance', render: (i) => <strong>{money(Math.max(0, invoiceBalance(db, i)))}</strong>, sortValue: (i) => invoiceBalance(db, i) },
    { key: 'st', header: 'Status', render: (i) => <InvoiceStatusBadge db={db} inv={i} />, sortValue: (i) => invoiceStatus(db, i) },
  ];
  return (
    <Card>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search invoice, family, title…" />
        <select className="input input-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map((s) => (
            <option key={s} value={s}>
              {invoiceStatusLabels[s]}
            </option>
          ))}
        </select>
        <select className="input input-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {(Object.keys(sourceLabels) as InvoiceSource[]).map((s) => (
            <option key={s} value={s}>
              {sourceLabels[s]}
            </option>
          ))}
        </select>
      </div>
      <DataTable rows={rows} columns={columns} getId={(i) => i.id} empty={<EmptyState icon={<FileText size={28} />} title="No invoices" message="Create an invoice, generate monthly tuition, or bill costume fees for a class." />} />
    </Card>
  );
}

type LineDraft = InvoiceLine & { key: string };

export function InvoiceForm({ open, onClose, id, familyId, onSaved }: { open: boolean; onClose: () => void; id?: ID; familyId?: ID; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const blankLine = (): LineDraft => ({ key: newId(), id: '', description: '', category: db.settings.invoiceCategories[0] ?? 'Other', quantity: 1, unitPrice: 0, dancerId: null });
  const [fam, setFam] = useState('');
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [issueDate, setIssueDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(addDays(todayStr(), 14));
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<InvoiceSource>('custom');
  const [send, setSend] = useState(true);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? id ?? `new:${familyId ?? ''}` : null;
  if (key !== last) {
    setLast(key);
    const inv = id ? db.invoices.find((i) => i.id === id) : undefined;
    if (open) {
      setFam(inv?.familyId ?? familyId ?? '');
      setTitle(inv?.title ?? '');
      setLines(inv ? inv.lines.map((l) => ({ ...l, key: l.id })) : [blankLine()]);
      setDiscount(inv?.discount ?? 0);
      setTaxRate(inv?.taxRate ?? db.settings.defaultTaxRate);
      setIssueDate(inv?.issueDate ?? todayStr());
      setDueDate(inv?.dueDate ?? addDays(todayStr(), 14));
      setNotes(inv?.notes ?? '');
      setSource(inv?.source ?? 'custom');
      setSend(true);
    }
  }
  const draft = { lines, discount, taxRate };
  const famDancers = db.dancers.filter((d) => d.familyId === fam);
  const setLine = (k: string, patch: Partial<LineDraft>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={id ? 'Edit Invoice' : 'New Invoice'}
      size="lg"
      saveLabel={id ? 'Save changes' : send ? 'Create & send' : 'Save as draft'}
      onSubmit={() => {
        const payload = { title, lines: lines.map(({ key: _k, ...l }) => (void _k, l)), discount, taxRate, issueDate, dueDate, notes };
        const saved = id ? run(() => (updateInvoice(id, payload), id), 'Invoice updated.') : run(() => createInvoice({ ...payload, familyId: fam, source, sourceId: null, schoolYearId: currentYear(db)?.id ?? null, send }), send ? 'Invoice sent to the family.' : 'Draft saved.');
        if (saved) {
          onClose();
          onSaved?.(saved);
        }
      }}
    >
      <div className="grid-2">
        <Field label="Family" required>
          <SearchSelect ariaLabel="Family" value={fam} onChange={setFam} options={db.families.map((f) => ({ value: f.id, label: f.name }))} placeholder="Choose a family…" />
        </Field>
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Competition fees — Regionals" />
        </Field>
        {!id && (
          <Field label="Type">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as InvoiceSource)}>
              {(Object.keys(sourceLabels) as InvoiceSource[]).map((s) => (
                <option key={s} value={s}>
                  {sourceLabels[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Issue date">
          <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label="Due date">
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Line items</span>
        <div className="line-items">
          {lines.map((l) => (
            <div key={l.key} className="line-row">
              <input className="input" placeholder="Description" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} aria-label="Line description" />
              <select className="input" value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value })} aria-label="Category">
                {[...new Set([...db.settings.invoiceCategories, l.category])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select className="input" value={l.dancerId ?? ''} onChange={(e) => setLine(l.key, { dancerId: e.target.value || null })} aria-label="Dancer">
                <option value="">Family</option>
                {famDancers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.firstName}
                  </option>
                ))}
              </select>
              <input className="input" type="number" min={1} step={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) })} aria-label="Quantity" />
              <input className="input" type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: Number(e.target.value) })} aria-label="Unit price" />
              <span className="line-total">{money(l.quantity * l.unitPrice)}</span>
              <button type="button" className="icon-btn" aria-label="Remove line" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, blankLine()])}>
            <Plus size={14} /> Add line
          </button>
        </div>
      </div>
      <div className="grid-2">
        <Field label="Discount ($)">
          <input className="input" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </Field>
        <Field label="Tax rate (%)">
          <input className="input" type="number" min={0} step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
        </Field>
      </div>
      <div className="totals">
        <span>Subtotal {money(invoiceSubtotal(draft))}</span>
        {discount > 0 && <span>Discount −{money(discount)}</span>}
        {taxRate > 0 && <span>Tax {money(invoiceTax(draft))}</span>}
        <strong>Total {money(invoiceTotal(draft))}</strong>
      </div>
      <Field label="Notes (shown on the invoice)">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {!id && (
        <label className="check-inline">
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send now (shows in the family's Parent Portal). Untick to save a draft.
        </label>
      )}
    </FormModal>
  );
}

function BatchInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const [yearId, setYearId] = useState('');
  const [recitalId, setRecitalId] = useState('');
  const [classId, setClassId] = useState('');
  const [dancers, setDancers] = useState<Set<ID>>(new Set());
  const [fees, setFees] = useState<{ description: string; category: string; unitPrice: number }[]>([{ description: 'Costume fee', category: 'Costume', unitPrice: 65 }]);
  const [dueDate, setDueDate] = useState(addDays(todayStr(), 21));
  const [sibling, setSibling] = useState(true);
  const [send, setSend] = useState(true);
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setYearId(currentYear(db)?.id ?? '');
      setRecitalId('');
      setClassId('');
      setDancers(new Set());
    }
  }
  const pickClass = (cid: string) => {
    setClassId(cid);
    const ids = db.enrollments.filter((e) => e.classId === cid && e.status === 'enrolled').map((e) => e.dancerId);
    setDancers(new Set(ids));
    const num = db.recitalNumbers.find((n) => n.classId === cid && (!recitalId || n.recitalId === recitalId));
    const c = num?.costumeId ? db.costumes.find((x) => x.id === num.costumeId) : undefined;
    const cls = db.classes.find((x) => x.id === cid);
    setFees([{ description: `${c ? c.name : 'Costume'} — ${cls?.name ?? ''}`, category: 'Costume', unitPrice: fees[0]?.unitPrice ?? 65 }]);
  };
  const recitalClasses = recitalId ? db.recitalNumbers.filter((n) => n.recitalId === recitalId && n.classId).map((n) => n.classId!) : undefined;
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Costume Invoicing"
      subtitle="Bill costume fees for a whole class or chosen dancers — one invoice per family"
      size="lg"
      saveLabel={`Create ${send ? '& send ' : ''}invoices`}
      onSubmit={() => {
        const r = run(() => batchInvoice({ title: fees[0]?.description ? `Costume fees${recitalId ? ` — ${db.recitals.find((x) => x.id === recitalId)?.name}` : ''}` : 'Costume fees', source: 'costume', sourceId: recitalId || null, schoolYearId: yearId || null, dancerIds: [...dancers], lines: fees, dueDate, notes: '', send, siblingDiscount: sibling }));
        if (r) {
          toast.success(`${r.invoices} invoice(s) created.${r.skipped.length ? ` Skipped (no family): ${r.skipped.join(', ')}.` : ''}`);
          onClose();
        }
      }}
    >
      <div className="grid-2">
        <Field label="School year">
          <select className="input" value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recital or show (optional)">
          <select className="input" value={recitalId} onChange={(e) => setRecitalId(e.target.value)}>
            <option value="">—</option>
            {db.recitals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Class" className="span-2">
          <SearchSelect ariaLabel="Class" value={classId} onChange={pickClass} options={classOptions(db, yearId || undefined, recitalClasses)} placeholder="Choose a class to select its dancers…" />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Dancers</span>
        <CheckList options={db.dancers.map((d) => ({ value: d.id, label: fullName(d), hint: d.familyId ? db.families.find((f) => f.id === d.familyId)?.name : 'No family — will be skipped' }))} selected={dancers} onChange={setDancers} height={180} />
      </div>
      <div className="field">
        <span className="field-label">Fees per dancer</span>
        {fees.map((f, i) => (
          <div key={i} className="line-row three">
            <input className="input" value={f.description} onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} aria-label="Fee description" />
            <select className="input" value={f.category} onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} aria-label="Fee category">
              {db.settings.invoiceCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input className="input" type="number" step="0.01" value={f.unitPrice} onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} aria-label="Fee amount" />
            <button type="button" className="icon-btn" aria-label="Remove fee" disabled={fees.length === 1} onClick={() => setFees(fees.filter((_, j) => j !== i))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFees([...fees, { description: 'Accessories', category: 'Costume', unitPrice: 15 }])}>
          <Plus size={14} /> Add fee
        </button>
      </div>
      <div className="grid-2">
        <Field label="Due date">
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <div className="stack-tight">
          <label className="check-inline">
            <input type="checkbox" checked={sibling} onChange={(e) => setSibling(e.target.checked)} /> Sibling discount ({db.settings.siblingDiscountPercent}% off additional dancers)
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send to families now
          </label>
        </div>
      </div>
      <p className="small faint">
        {dancers.size} dancer(s) · {new Set([...dancers].map((d) => db.dancers.find((x) => x.id === d)?.familyId).filter(Boolean)).size} famil{new Set([...dancers].map((d) => db.dancers.find((x) => x.id === d)?.familyId).filter(Boolean)).size === 1 ? 'y' : 'ies'} will be invoiced.
      </p>
    </FormModal>
  );
}

function TuitionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const [yearId, setYearId] = useState('');
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [due, setDue] = useState('');
  const [send, setSend] = useState(true);
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setYearId(currentYear(db)?.id ?? '');
      const d = new Date(`${todayStr().slice(0, 7)}-15T12:00:00`);
      d.setMonth(d.getMonth() + 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      setMonth(m);
      setDue(`${m}-${String(db.settings.tuitionDueDay || 1).padStart(2, '0')}`);
    }
  }
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Generate Monthly Tuition"
      subtitle="One invoice per family for every enrolled class — families already billed for the month are skipped"
      size="sm"
      saveLabel="Generate"
      onSubmit={() => {
        const n = run(() => generateTuition(yearId, month, due, send));
        if (n !== undefined) {
          toast.success(n ? `${n} tuition invoice(s) created.` : 'Every family is already invoiced for that month.');
          onClose();
        }
      }}
    >
      <Field label="School year">
        <select className="input" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {db.schoolYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Month">
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      <Field label="Due date">
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <p className="small faint">Sibling discount of {db.settings.siblingDiscountPercent}% applies to additional dancers in a family.</p>
      <label className="check-inline">
        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send to families now
      </label>
    </FormModal>
  );
}

/* ======================================================== invoice detail */

export function InvoiceDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [crediting, setCrediting] = useState<'apply' | 'transfer' | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const v = useViewer();
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return <EmptyState title="Invoice not found" action={<Link to="/invoices?tab=invoices" className="btn btn-primary">Back to invoices</Link>} />;
  const fam = db.families.find((f) => f.id === inv.familyId);
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  const credits = db.credits.filter((c) => c.invoiceId === inv.id);
  const bal = invoiceBalance(db, inv);
  const paid = invoicePaid(db, inv.id);
  return (
    <>
      <PageHeader
        back={{ to: '/invoices?tab=invoices', label: 'Invoices' }}
        title={
          <>
            {inv.number} <InvoiceStatusBadge db={db} inv={inv} /> <SampleTag show={inv.isSample} />
          </>
        }
        subtitle={`${inv.title} · ${fam?.name ?? 'Removed family'} · ${sourceLabels[inv.source]}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('invoice', { id: inv.id })}>
              <Printer size={16} /> Print / PDF
            </button>
            {v.can('billing.edit') && <>
            <button className="btn btn-ghost" onClick={() => { const nid = run(() => duplicateInvoice(inv.id), 'Duplicated as a draft.'); if (nid) navigate(`/invoices/${nid}`); }}>
              <Copy size={16} /> Duplicate
            </button>
            {inv.state === 'draft' && (
              <>
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: 'Delete draft?', message: 'This draft invoice will be deleted.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteInvoice(inv.id), true), 'Draft deleted.')) navigate('/invoices?tab=invoices'); }}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className="btn btn-primary" onClick={() => run(() => sendInvoice(inv.id), 'Invoice sent — the family can see and pay it in their portal.')}>
                  <Send size={16} /> Send to family
                </button>
              </>
            )}
            {inv.state === 'sent' && paid === 0 && (
              <button className="btn btn-ghost danger" onClick={() => (setReason(''), setVoiding(true))}>
                <Ban size={16} /> Void
              </button>
            )}
            {inv.state !== 'void' && paid === 0 && (
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit
              </button>
            )}
            {inv.state === 'sent' && bal > 0 && (
              <button className="btn btn-primary" onClick={() => setPaying(true)}>
                <DollarSign size={16} /> Record payment
              </button>
            )}
            </>}
          </>
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <Card title="Summary">
            <dl className="dl">
              <dt>Family</dt>
              <dd>{fam ? <Link to={`/families/${fam.id}`}>{fam.name}</Link> : '—'}</dd>
              <dt>Issued</dt>
              <dd>{formatDate(inv.issueDate)}</dd>
              <dt>Due</dt>
              <dd>{formatDate(inv.dueDate) || '—'}</dd>
              <dt>Total</dt>
              <dd>{money(invoiceTotal(inv))}</dd>
              <dt>Paid & credited</dt>
              <dd>{money(paid)}</dd>
              <dt>Balance</dt>
              <dd>
                <strong>{money(Math.max(0, bal))}</strong>
              </dd>
            </dl>
            {inv.state === 'sent' && bal > 0 && fam && familyCredit(db, fam.id) > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCrediting('apply')}>
                <Gift size={14} /> Apply family credit ({money(familyCredit(db, fam.id))} available)
              </button>
            )}
            {credits.some((c) => c.kind === 'applied') && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCrediting('transfer')}>
                <ArrowRightLeft size={14} /> Move credit to another invoice
              </button>
            )}
          </Card>
          <Card title="History">
            <ul className="log compact">
              {[...inv.history].reverse().map((h, i) => (
                <li key={i}>
                  <div className="log-meta">
                    {formatDateTime(h.at)} · {h.by}
                  </div>
                  <div>{h.change}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="stack">
          <Card title="Line items">
            <InvoiceLines db={db} inv={inv} />
            {inv.notes && <p className="small prewrap">{inv.notes}</p>}
          </Card>
          <Card title="Payments & credits">
            {!pays.length && !credits.length ? (
              <p className="faint pad">No payments yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th className="minor">Reference</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pays.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.date)}</td>
                      <td>
                        {p.processor === 'test' ? <Badge tone="info">Test online payment</Badge> : methodLabels[p.method]}
                        {refundedFor(db, p.id) > 0 && <div className="small bad-text">Refunded {money(refundedFor(db, p.id))}</div>}
                      </td>
                      <td>{money(p.amount)}</td>
                      <td className="minor small">{p.reference}</td>
                      <td className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openPrint('receipt', { id: p.id })}>
                          <Receipt size={13} /> Receipt
                        </button>
                        {paymentNet(db, p.id) > 0 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setRefunding(p)}>
                            <RotateCcw size={13} /> Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {credits.map((c) => (
                    <tr key={c.id}>
                      <td>{formatDate(c.createdAt)}</td>
                      <td>{c.kind === 'applied' ? 'Credit applied' : 'Credit moved off'}</td>
                      <td>{c.kind === 'applied' ? money(c.amount) : `−${money(c.amount)}`}</td>
                      <td className="minor small">{c.reason}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
      <InvoiceForm open={editing} id={inv.id} onClose={() => setEditing(false)} />
      <PaymentDialog open={paying} onClose={() => setPaying(false)} familyId={inv.familyId} invoiceId={inv.id} />
      <RefundDialog payment={refunding} onClose={() => setRefunding(null)} />
      <CreditDialog mode={crediting} familyId={inv.familyId} invoiceId={inv.id} onClose={() => setCrediting(null)} />
      <FormModal open={voiding} onClose={() => setVoiding(false)} title={`Void ${inv.number}`} size="sm" saveLabel="Void invoice" onSubmit={() => run(() => (voidInvoice(inv.id, reason), true), 'Invoice voided.') && setVoiding(false)}>
        <Field label="Reason (kept in the history)" required>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </FormModal>
    </>
  );
}

export function InvoiceLines({ db, inv }: { db: Database; inv: Invoice }) {
  return (
    <table className="table invoice-lines">
      <thead>
        <tr>
          <th>Description</th>
          <th className="minor">Category</th>
          <th className="num">Qty</th>
          <th className="num">Price</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {inv.lines.map((l) => (
          <tr key={l.id}>
            <td>
              {l.description}
              {l.dancerId && !l.description.includes(db.dancers.find((d) => d.id === l.dancerId)?.firstName ?? '~') && <div className="small faint">{db.dancers.find((d) => d.id === l.dancerId)?.firstName}</div>}
            </td>
            <td className="minor small">{l.category}</td>
            <td className="num">{l.quantity}</td>
            <td className="num">{money(l.unitPrice)}</td>
            <td className="num">{money(l.quantity * l.unitPrice)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="num">
            Subtotal
          </td>
          <td className="num">{money(invoiceSubtotal(inv))}</td>
        </tr>
        {inv.discount > 0 && (
          <tr>
            <td colSpan={4} className="num">
              Discount
            </td>
            <td className="num">−{money(inv.discount)}</td>
          </tr>
        )}
        {inv.taxRate > 0 && (
          <tr>
            <td colSpan={4} className="num">
              Tax ({inv.taxRate}%)
            </td>
            <td className="num">{money(invoiceTax(inv))}</td>
          </tr>
        )}
        <tr>
          <td colSpan={4} className="num">
            <strong>Total</strong>
          </td>
          <td className="num">
            <strong>{money(invoiceTotal(inv))}</strong>
          </td>
        </tr>
        <tr>
          <td colSpan={4} className="num">
            Balance due
          </td>
          <td className="num">
            <strong>{money(Math.max(0, invoiceBalance(db, inv)))}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/* ============================================================== dialogs */

export function PaymentDialog({ open, onClose, familyId, invoiceId }: { open: boolean; onClose: () => void; familyId: ID; invoiceId: ID | null }) {
  const db = useDb();
  const run = useRun();
  const inv = invoiceId ? db.invoices.find((i) => i.id === invoiceId) : undefined;
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setAmount(inv ? Math.max(0, invoiceBalance(db, inv)) : 0);
      setMethod('cash');
      setReference('');
      setDate(todayStr());
      setNote('');
    }
  }
  return (
    <FormModal open={open} onClose={onClose} title="Record Payment" subtitle={inv ? `${inv.number} · balance ${money(invoiceBalance(db, inv))}` : db.families.find((f) => f.id === familyId)?.name} size="sm" saveLabel="Record payment" onSubmit={() => run(() => recordPayment({ familyId, invoiceId, amount, method, processor: 'offline', reference, date, note }), 'Payment recorded.') && onClose()}>
      <Field label="Amount ($)" required>
        <input className="input" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
      </Field>
      <div className="grid-2">
        <Field label="Method">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {db.settings.paymentMethods.map((m) => (
              <option key={m} value={m}>
                {methodLabels[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label={method === 'check' ? 'Check number' : 'Reference'}>
        <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <Field label="Note">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="small faint">For a card taken at the front desk, record it as “Card” with the terminal's reference — this app doesn't process cards.</p>
    </FormModal>
  );
}

function RefundDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'processor' | 'offline'>('offline');
  const [last, setLast] = useState<string | null>(null);
  if ((payment?.id ?? null) !== last) {
    setLast(payment?.id ?? null);
    if (payment) {
      setAmount(paymentNet(db, payment.id));
      setReason('');
      setMethod(payment.processor === 'test' ? 'processor' : 'offline');
    }
  }
  if (!payment) return null;
  return (
    <FormModal open onClose={onClose} title="Issue Refund" subtitle={`${money(payment.amount)} ${payment.processor === 'test' ? 'test online payment' : methodLabels[payment.method]} on ${formatDate(payment.date)} · ${money(paymentNet(db, payment.id))} refundable`} size="sm" saveLabel="Issue refund" onSubmit={() => run(() => issueRefund(payment.id, amount, method, reason), method === 'processor' ? 'Refunded through the test processor (confirmed).' : 'Offline refund recorded.') && onClose()}>
      <Field label="Amount ($)" required>
        <input className="input" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      </Field>
      <Field label="How">
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as 'processor' | 'offline')}>
          {payment.processor === 'test' && <option value="processor">Refund through the payment processor (test mode)</option>}
          <option value="offline">Record an offline refund (cash / check given back)</option>
        </select>
      </Field>
      <Field label="Reason" required>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="small faint">Partial refunds are allowed. The refund is listed on the family's account and payment history.</p>
    </FormModal>
  );
}

export function CreditDialog({ mode, familyId, invoiceId, onClose }: { mode: 'issue' | 'apply' | 'remove' | 'transfer' | null; familyId: ID; invoiceId?: ID; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const openInvoices = db.invoices.filter((i) => i.familyId === familyId && i.state === 'sent' && invoiceBalance(db, i) > 0 && i.id !== (mode === 'transfer' ? invoiceId : ''));
  if (mode !== last) {
    setLast(mode);
    setReason('');
    setTarget(mode === 'apply' && invoiceId ? invoiceId : openInvoices[0]?.id ?? '');
    const inv = invoiceId ? db.invoices.find((i) => i.id === invoiceId) : undefined;
    setAmount(mode === 'apply' && inv ? Math.min(familyCredit(db, familyId), invoiceBalance(db, inv)) : mode === 'remove' ? familyCredit(db, familyId) : 0);
  }
  if (!mode) return null;
  const titles = { issue: 'Issue Account Credit', apply: 'Apply Credit to Invoice', remove: 'Remove Credit', transfer: 'Move Credit to Another Invoice' };
  const submit = () => {
    if (mode === 'issue') return run(() => (issueCredit(familyId, amount, reason), true), 'Credit added to the family account.');
    if (mode === 'remove') return run(() => (removeCredit(familyId, amount, reason), true), 'Credit removed (recorded in the audit trail).');
    if (mode === 'apply') return run(() => (applyCredit(familyId, target, amount), true), 'Credit applied.');
    return run(() => (transferCredit(invoiceId!, target, amount), true), 'Credit moved.');
  };
  return (
    <FormModal open onClose={onClose} title={titles[mode]} subtitle={`${db.families.find((f) => f.id === familyId)?.name} · ${money(familyCredit(db, familyId))} unused credit`} size="sm" onSubmit={() => submit() && onClose()}>
      {(mode === 'apply' || mode === 'transfer') && (
        <Field label={mode === 'apply' ? 'Invoice' : 'Move to invoice'}>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {(mode === 'apply' ? db.invoices.filter((i) => i.familyId === familyId && i.state === 'sent' && invoiceBalance(db, i) > 0) : openInvoices).map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {i.title} · owes {money(invoiceBalance(db, i))}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Amount ($)" required>
        <input className="input" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
      </Field>
      {(mode === 'issue' || mode === 'remove') && (
        <Field label="Reason (kept in the audit trail)" required>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
    </FormModal>
  );
}

/* ======================================================== payments list */

function PaymentList() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const rows = [...db.payments].filter((p) => !q || `${db.families.find((f) => f.id === p.familyId)?.name} ${p.reference} ${p.note}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const exportCsv = () =>
    download(
      `payments-${todayStr()}.csv`,
      toCsv(
        ['Date', 'Family', 'Invoice', 'Amount', 'Refunded', 'Method', 'Processor', 'Reference', 'Recorded by', 'Note'],
        rows.map((p) => [formatDate(p.date), db.families.find((f) => f.id === p.familyId)?.name, db.invoices.find((i) => i.id === p.invoiceId)?.number ?? '', p.amount, refundedFor(db, p.id), methodLabels[p.method], p.processor === 'test' ? 'Test online' : 'Offline', p.reference, p.recordedBy, p.note]),
      ),
      'text/csv;charset=utf-8',
    );
  return (
    <>
      <Card actions={<button className="btn btn-ghost btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>} title="Payments">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search family, reference…" />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Family</th>
                <th>For</th>
                <th>Amount</th>
                <th>Method</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const inv = db.invoices.find((i) => i.id === p.invoiceId);
                const ref = refundedFor(db, p.id);
                return (
                  <tr key={p.id}>
                    <td className="nowrap">{formatDate(p.date)}</td>
                    <td>{db.families.find((f) => f.id === p.familyId)?.name}</td>
                    <td>{inv ? <Link to={`/invoices/${inv.id}`}>{inv.number}</Link> : <span className="small">{p.note}</span>}</td>
                    <td>
                      {money(p.amount)}
                      {ref > 0 && <div className="small bad-text">−{money(ref)} refunded</div>}
                    </td>
                    <td>{p.processor === 'test' ? <Badge tone="info">Test online</Badge> : methodLabels[p.method]}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openPrint('receipt', { id: p.id })}>
                        <Receipt size={13} /> Receipt
                      </button>
                      {paymentNet(db, p.id) > 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setRefunding(p)}>
                          <RotateCcw size={13} /> Refund
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Refunds">
        {!db.refunds.length ? (
          <p className="faint pad">No refunds.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Family</th>
                <th>Amount</th>
                <th>How</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {[...db.refunds].reverse().map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{db.families.find((f) => f.id === r.familyId)?.name}</td>
                  <td>{money(r.amount)}</td>
                  <td>{r.method === 'processor' ? 'Through processor (test)' : 'Offline (recorded by staff)'}</td>
                  <td>
                    <Badge tone={r.status === 'completed' ? 'ready' : 'progress'}>{r.status === 'completed' ? 'Completed' : 'Pending confirmation'}</Badge>
                  </td>
                  <td className="small">
                    {r.reason} <span className="faint">· {r.recordedBy}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <RefundDialog payment={refunding} onClose={() => setRefunding(null)} />
    </>
  );
}

function CreditList() {
  const db = useDb();
  const [mode, setMode] = useState<'issue' | 'remove' | null>(null);
  const [fam, setFam] = useState('');
  return (
    <>
      <Card
        title="Family credits"
        actions={
          <div className="inline-form">
            <div className="attn-class">
              <SearchSelect ariaLabel="Family for credit" value={fam} onChange={setFam} options={db.families.map((f) => ({ value: f.id, label: f.name, hint: familyCredit(db, f.id) ? `${money(familyCredit(db, f.id))} credit` : undefined }))} placeholder="Choose a family…" />
            </div>
            <button className="btn btn-primary btn-sm" disabled={!fam} onClick={() => setMode('issue')}>
              <Gift size={14} /> Issue credit
            </button>
            <button className="btn btn-ghost btn-sm" disabled={!fam || familyCredit(db, fam) <= 0} onClick={() => setMode('remove')}>
              Remove credit
            </button>
          </div>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Family</th>
              <th>Entry</th>
              <th>Amount</th>
              <th>Reason</th>
              <th className="minor">By</th>
            </tr>
          </thead>
          <tbody>
            {[...db.credits].reverse().map((c) => (
              <tr key={c.id}>
                <td>{formatDate(c.createdAt)}</td>
                <td>{db.families.find((f) => f.id === c.familyId)?.name}</td>
                <td>{{ issued: 'Issued', applied: 'Applied to invoice', unapplied: 'Moved off invoice', removed: 'Removed' }[c.kind]}</td>
                <td>{c.kind === 'issued' || c.kind === 'unapplied' ? '+' : '−'}{money(c.amount)}</td>
                <td className="small">
                  {c.reason}
                  {c.invoiceId && <> · <Link to={`/invoices/${c.invoiceId}`}>{db.invoices.find((i) => i.id === c.invoiceId)?.number}</Link></>}
                </td>
                <td className="minor small faint">{c.recordedBy}</td>
              </tr>
            ))}
            {!db.credits.length && (
              <tr>
                <td colSpan={6} className="faint">
                  No credits yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {fam && <CreditDialog mode={mode} familyId={fam} onClose={() => setMode(null)} />}
    </>
  );
}

function FamilyAccounts() {
  const db = useDb();
  const rows = db.families.map((f) => ({ f, bal: familyBalance(db, f.id), credit: familyCredit(db, f.id), paid: round2(db.payments.filter((p) => p.familyId === f.id).reduce((s, p) => s + p.amount - refundedFor(db, p.id), 0)) }));
  return (
    <Card title="Family accounts">
      <DataTable
        rows={rows}
        getId={(r) => r.f.id}
        initialSort={{ key: 'bal', dir: 'desc' }}
        columns={[
          { key: 'name', header: 'Family', render: (r) => <Link to={`/families/${r.f.id}`} className="link-strong">{r.f.name}</Link>, sortValue: (r) => r.f.name },
          { key: 'bal', header: 'Balance owed', render: (r) => <strong className={r.bal > 0 ? 'warn-text inline' : ''}>{money(r.bal)}</strong>, sortValue: (r) => r.bal },
          { key: 'credit', header: 'Unused credit', render: (r) => money(r.credit), sortValue: (r) => r.credit },
          { key: 'paid', header: 'Paid (all time)', render: (r) => money(r.paid), sortValue: (r) => r.paid },
          { key: 'open', header: 'Open invoices', render: (r) => db.invoices.filter((i) => i.familyId === r.f.id && i.state === 'sent' && invoiceBalance(db, i) > 0).length },
        ]}
      />
    </Card>
  );
}

/* ================================================== family account card */

export function FamilyBillingCard({ familyId }: { familyId: ID }) {
  const db = useDb();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [credit, setCredit] = useState<'issue' | 'remove' | null>(null);
  const invoices = db.invoices.filter((i) => i.familyId === familyId).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return (
    <Card
      title="Account & Billing"
      icon={<Wallet size={18} />}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setCredit('issue')}>
            <Gift size={14} /> Credit
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPaying(true)}>
            <DollarSign size={14} /> Payment
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Invoice
          </button>
        </>
      }
    >
      <div className="mini-stats">
        <div>
          <strong>{money(familyBalance(db, familyId))}</strong>
          <span>Balance owed</span>
        </div>
        <div>
          <strong>{money(familyCredit(db, familyId))}</strong>
          <span>Unused credit</span>
        </div>
      </div>
      <ul className="mini-list">
        {invoices.slice(0, 8).map((i) => (
          <li key={i.id}>
            <div>
              <Link to={`/invoices/${i.id}`} className="link-strong">
                {i.number}
              </Link>{' '}
              <span className="small faint">· {i.title}</span>
              <div className="small faint">Due {formatDate(i.dueDate) || '—'}</div>
            </div>
            <span>
              {money(invoiceTotal(i))} <InvoiceStatusBadge db={db} inv={i} />
            </span>
          </li>
        ))}
        {!invoices.length && <li className="faint small">No invoices yet.</li>}
      </ul>
      <InvoiceForm open={creating} familyId={familyId} onClose={() => setCreating(false)} />
      <PaymentDialog open={paying} onClose={() => setPaying(false)} familyId={familyId} invoiceId={null} />
      <CreditDialog mode={credit} familyId={familyId} onClose={() => setCredit(null)} />
    </Card>
  );
}

/* ======================================================= parent billing */

export function ParentBillingPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [amount, setAmount] = useState(0);
  const key = useRef('');
  const familyId = v.familyId;
  if (!familyId) return <EmptyState title="No family linked" />;
  const invoices = db.invoices.filter((i) => i.familyId === familyId && i.state !== 'draft').sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const pays = db.payments.filter((p) => p.familyId === familyId).sort((a, b) => b.date.localeCompare(a.date));
  const credits = db.credits.filter((c) => c.familyId === familyId);
  const refunds = db.refunds.filter((r) => r.familyId === familyId);
  const open = (i: Invoice) => {
    key.current = `${i.id}:${Date.now()}`;
    setAmount(Math.max(0, invoiceBalance(db, i)));
    setPaying(i);
  };
  return (
    <>
      <PageHeader title="Invoices & Payments" subtitle="Your family's balance, invoices, receipts and credits" />
      <div className="stats stats-4">
        <StatCard label="Balance due" value={money(familyBalance(db, familyId))} icon={<Wallet size={20} />} tone="rose" />
        <StatCard label="Account credit" value={money(familyCredit(db, familyId))} icon={<Gift size={20} />} tone="sage" />
        <StatCard label="Open invoices" value={invoices.filter((i) => invoiceBalance(db, i) > 0).length} icon={<FileText size={20} />} tone="amber" />
        <StatCard label="Paid this year" value={money(pays.filter((p) => p.date.slice(0, 4) === todayStr().slice(0, 4)).reduce((s, p) => s + p.amount - refundedFor(db, p.id), 0))} icon={<DollarSign size={20} />} tone="plum" />
      </div>
      <Card title="Invoices">
        {!invoices.length ? (
          <p className="faint pad">No invoices.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Due</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.number}</strong>
                      <div className="small faint">{i.title}</div>
                    </td>
                    <td>{formatDate(i.dueDate) || '—'}</td>
                    <td>{money(invoiceTotal(i))}</td>
                    <td>
                      <strong>{money(Math.max(0, invoiceBalance(db, i)))}</strong>
                    </td>
                    <td>
                      <InvoiceStatusBadge db={db} inv={i} />
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openPrint('invoice', { id: i.id })}>
                        <Download size={13} /> Download
                      </button>
                      {i.state === 'sent' && invoiceBalance(db, i) > 0 && (
                        <button className="btn btn-primary btn-sm" onClick={() => open(i)}>
                          <CreditCard size={13} /> Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="detail-grid">
        <Card title="Payment history">
          {!pays.length ? (
            <p className="faint pad">No payments yet.</p>
          ) : (
            <ul className="mini-list">
              {pays.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{money(p.amount)}</strong> <span className="small faint">· {formatDate(p.date)} · {p.processor === 'test' ? 'Online (test)' : methodLabels[p.method]}</span>
                    <div className="small faint">{db.invoices.find((i) => i.id === p.invoiceId)?.number ?? p.note}</div>
                    {refundedFor(db, p.id) > 0 && <div className="small">Refunded {money(refundedFor(db, p.id))}</div>}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => openPrint('receipt', { id: p.id })}>
                    <Receipt size={13} /> Receipt
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Credits & refunds">
          <ul className="mini-list">
            {credits.map((c) => (
              <li key={c.id}>
                <span>
                  {{ issued: 'Credit added', applied: 'Credit used', unapplied: 'Credit returned', removed: 'Credit removed' }[c.kind]} · {c.reason}
                </span>
                <strong>
                  {c.kind === 'issued' || c.kind === 'unapplied' ? '+' : '−'}
                  {money(c.amount)}
                </strong>
              </li>
            ))}
            {refunds.map((r) => (
              <li key={r.id}>
                <span>
                  Refund · {formatDate(r.date)} · {r.reason}
                </span>
                <strong>{money(r.amount)}</strong>
              </li>
            ))}
            {!credits.length && !refunds.length && <li className="faint small">None.</li>}
          </ul>
          <p className="small faint">{db.settings.refundPolicy}</p>
        </Card>
      </div>
      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={`Pay ${paying?.number ?? ''}`}
        subtitle={paying ? `${paying.title} · balance ${money(invoiceBalance(db, paying))}` : ''}
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPaying(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => paying && run(() => payOnlineTest(familyId, paying.id, amount, key.current), `Test payment of ${money(amount)} completed — receipt available.`) && setPaying(null)}>
              <CreditCard size={15} /> Pay {money(amount)} (test)
            </button>
          </>
        }
      >
        <div className="test-mode">
          <strong>Test mode.</strong> No card will be charged and no card details are collected. When the studio connects a payment processor (such as Stripe), this button will open a secure checkout.
        </div>
        {db.settings.allowPartialPayments && paying && (
          <Field label="Amount ($)">
            <input className="input" type="number" min={1} max={invoiceBalance(db, paying)} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        )}
      </Modal>
    </>
  );
}
