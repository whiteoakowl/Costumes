import { useState, type ReactNode } from 'react';
import { CalendarHeart, ClipboardList, FileText, HandHeart, History, Printer, Shirt, Theater, Users, Wand2, Warehouse, Wrench } from 'lucide-react';
import { useDb } from '../data/store';
import { fullName, sortedCategories, sortedDancers, sortedLocations } from '../data/selectors';
import { Card, PageHeader } from '../components/ui';
import { openPrint, type ReportKey } from './Print';

function Report({ icon, title, description, children, onPrint }: { icon: ReactNode; title: string; description: string; children?: ReactNode; onPrint: () => void }) {
  return (
    <Card className="report-card">
      <div className="report-head">
        <div className="report-icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          <p className="small faint">{description}</p>
        </div>
      </div>
      {children && <div className="report-options">{children}</div>}
      <button className="btn btn-primary btn-sm" onClick={onPrint}>
        <Printer size={14} /> Print / PDF
      </button>
    </Card>
  );
}

function Pick({ label, value, onChange, options, none }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; none?: string }) {
  return (
    <select className="input input-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {none !== undefined && <option value="">{none}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ReportsPage() {
  const db = useDb();
  const [level, setLevel] = useState('');
  const [dancer, setDancer] = useState('');
  const [kind, setKind] = useState('costume');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('category');
  const [show, setShow] = useState('');
  const [perf, setPerf] = useState('');
  const [castOwner, setCastOwner] = useState('');
  const [loc, setLoc] = useState('');
  const [workStatus, setWorkStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pick, setPick] = useState({ cls: '', team: '', ro: '', prog: false, bs: '', qc: false, fam: '', ev: '', pol: '', tix: '', fund: '' });

  const go = (r: ReportKey, params: Record<string, string> = {}) => openPrint(r, params);
  const ownerOptions = [
    ...db.shows.map((s) => ({ value: `show:${s.id}`, label: `Show: ${s.name}` })),
    ...db.performances.map((p) => ({ value: `performance:${p.id}`, label: `Performance: ${p.name}` })),
  ];
  const cOwner = castOwner || ownerOptions[0]?.value || '';

  return (
    <>
      <PageHeader title="Reports & Printing" subtitle="Print any list, or choose “Save as PDF” in the print window to make a PDF" />
      <div className="report-grid">
        <Report icon={<Users size={20} />} title="Dancer List" description="All dancers with ages, sizes, levels and notes." onPrint={() => go('dancers', { level })}>
          <Pick label="Level" value={level} onChange={setLevel} none="All levels" options={db.settings.levels.map((l) => ({ value: l, label: l }))} />
        </Report>
        <Report icon={<FileText size={20} />} title="Dancer Sheet" description="One dancer: details, photos, every costume and prop, with a check-off column." onPrint={() => dancer && go('dancer', { id: dancer })}>
          <Pick label="Dancer" value={dancer} onChange={setDancer} none="Choose a dancer…" options={sortedDancers(db).map((d) => ({ value: d.id, label: fullName(d) }))} />
        </Report>
        <Report icon={kind === 'prop' ? <Wand2 size={20} /> : <Shirt size={20} />} title="Costume / Prop Inventory" description="Inventory list with parts, location and status, grouped by show type or storage." onPrint={() => go('costumes', { kind, category: cat, status, group })}>
          <Pick label="Costumes or props" value={kind} onChange={setKind} options={[{ value: 'costume', label: 'Costumes' }, { value: 'prop', label: 'Props' }]} />
          <Pick label="Category" value={cat} onChange={setCat} none="All show types" options={sortedCategories(db).map((c) => ({ value: c.id, label: c.name }))} />
          <Pick label="Status" value={status} onChange={setStatus} none="Any status" options={[{ value: 'ready', label: 'Ready' }, { value: 'in_progress', label: 'In progress' }]} />
          <Pick label="Group by" value={group} onChange={setGroup} options={[{ value: 'category', label: 'Group by show type' }, { value: 'location', label: 'Group by storage' }]} />
        </Report>
        <Report icon={<Wrench size={20} />} title="Repair & Cleaning List" description="Open (or completed) jobs with volunteer, phone, dates and descriptions." onPrint={() => go('repairs', { status: workStatus })}>
          <Pick label="Work status" value={workStatus} onChange={setWorkStatus} options={[{ value: '', label: 'Open work' }, { value: 'done', label: 'Completed & cancelled' }]} />
        </Report>
        <Report icon={<History size={20} />} title="Activity Log" description="Every logged change, repair, cleaning, move and note for a date range." onPrint={() => go('log', { from, to })}>
          <input className="input input-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input className="input input-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </Report>
        <Report icon={<Theater size={20} />} title="Show List" description="All shows with dates, venues, status and counts." onPrint={() => go('shows')} />
        <Report icon={<ClipboardList size={20} />} title="Show Sheet" description="A show's cast lists with costumes & props per dancer, costume list and props." onPrint={() => show && go('show', { id: show })}>
          <Pick label="Show" value={show} onChange={setShow} none="Choose a show…" options={db.shows.map((s) => ({ value: s.id, label: s.name }))} />
        </Report>
        <Report icon={<Users size={20} />} title="Cast Lists" description="One page per cast: dancers, roles, sizes, costumes, props and a check-off column." onPrint={() => cOwner && go('casts', { owner: cOwner.split(':')[0], id: cOwner.split(':')[1] })}>
          <Pick label="Show or performance" value={cOwner} onChange={setCastOwner} options={ownerOptions} />
        </Report>
        <Report icon={<CalendarHeart size={20} />} title="Performance Schedule" description="All performance plans with call times, dress rehearsals and readiness." onPrint={() => go('performances')} />
        <Report icon={<CalendarHeart size={20} />} title="Performance Sheet" description="Call sheet for one performance: times, casts, costumes, props and available volunteers." onPrint={() => perf && go('performance', { id: perf })}>
          <Pick label="Performance" value={perf} onChange={setPerf} none="Choose a performance…" options={db.performances.map((p) => ({ value: p.id, label: p.name }))} />
        </Report>
        <Report icon={<Warehouse size={20} />} title="Storage Inventory" description="What's in each closet, rack and bin, with a check-off column." onPrint={() => go('storage', { id: loc })}>
          <Pick label="Location" value={loc} onChange={setLoc} none="All locations" options={sortedLocations(db).map((l) => ({ value: l.id, label: l.name }))} />
        </Report>
        <Report icon={<HandHeart size={20} />} title="Volunteer Contact List" description="Names, phone numbers, emails, skills, availability and open jobs." onPrint={() => go('volunteers')} />
      </div>
      <h2 className="section-head">Studio reports</h2>
      <div className="report-grid">
        <Report icon={<Users size={20} />} title="Class Roster" description="Enrolled dancers with level, family, phone and allergies." onPrint={() => pick.cls && go('roster', { id: pick.cls })}>
          <Pick label="Class" value={pick.cls} onChange={(v) => setPick({ ...pick, cls: v })} none="Choose a class…" options={db.classes.map((c) => ({ value: c.id, label: c.name }))} />
        </Report>
        <Report icon={<Users size={20} />} title="Team Roster" description="Team members, coaches, rehearsal and competition schedules." onPrint={() => pick.team && go('team', { id: pick.team })}>
          <Pick label="Team" value={pick.team} onChange={(v) => setPick({ ...pick, team: v })} none="Choose a team…" options={db.teams.map((t) => ({ value: t.id, label: t.name }))} />
        </Report>
        <Report icon={<ClipboardList size={20} />} title="Running Order / Program" description="Numbered running order with times, costumes and backstage notes — or a printable program." onPrint={() => pick.ro && go(pick.prog ? 'program' : 'runningorder', { id: pick.ro })}>
          <Pick label="Performance" value={pick.ro} onChange={(v) => setPick({ ...pick, ro: v })} none="Choose a performance…" options={db.performances.filter((p) => db.lineup.some((l) => l.performanceId === p.id)).map((p) => ({ value: p.id, label: p.name }))} />
          <label className="check-inline small">
            <input type="checkbox" checked={pick.prog} onChange={(e) => setPick({ ...pick, prog: e.target.checked })} /> Audience program
          </label>
        </Report>
        <Report icon={<ClipboardList size={20} />} title="Backstage Check-in & Quick Changes" description="Check-in sheet with crew, dressing rooms and guardian phones, or the quick-change plan." onPrint={() => pick.bs && go(pick.qc ? 'quickchanges' : 'backstage', { id: pick.bs })}>
          <Pick label="Performance" value={pick.bs} onChange={(v) => setPick({ ...pick, bs: v })} none="Choose a performance…" options={db.performances.filter((p) => db.lineup.some((l) => l.performanceId === p.id)).map((p) => ({ value: p.id, label: p.name }))} />
          <label className="check-inline small">
            <input type="checkbox" checked={pick.qc} onChange={(e) => setPick({ ...pick, qc: e.target.checked })} /> Quick changes instead
          </label>
        </Report>
        <Report icon={<Shirt size={20} />} title="Costume Checkouts" description="Everything checked out or reserved, with due dates and overdue items." onPrint={() => go('checkouts')} />
        <Report icon={<FileText size={20} />} title="Family Statement" description="A family's invoices, payments, credits and balance." onPrint={() => pick.fam && go('statement', { id: pick.fam })}>
          <Pick label="Family" value={pick.fam} onChange={(v) => setPick({ ...pick, fam: v })} none="Choose a family…" options={db.families.map((f) => ({ value: f.id, label: f.name }))} />
        </Report>
        <Report icon={<CalendarHeart size={20} />} title="Event Sign-ups" description="Registered and waiting-list dancers with their answers and payment status." onPrint={() => pick.ev && go('event', { id: pick.ev })}>
          <Pick label="Event" value={pick.ev} onChange={(v) => setPick({ ...pick, ev: v })} none="Choose an event…" options={db.signupEvents.map((e) => ({ value: e.id, label: e.name }))} />
        </Report>
        <Report icon={<FileText size={20} />} title="Policy Signatures" description="Policy text with every family's signature status." onPrint={() => pick.pol && go('policy', { id: pick.pol })}>
          <Pick label="Policy" value={pick.pol} onChange={(v) => setPick({ ...pick, pol: v })} none="Choose a policy…" options={db.policies.map((p) => ({ value: p.id, label: p.title }))} />
        </Report>
        <Report icon={<Theater size={20} />} title="Will Call / Ticket List" description="Ticket buyers, ticket types and seats for the door." onPrint={() => pick.tix && go('tickets', { id: pick.tix })}>
          <Pick label="Show" value={pick.tix} onChange={(v) => setPick({ ...pick, tix: v })} none="Choose a show…" options={db.ticketEvents.map((e) => ({ value: e.id, label: e.name }))} />
        </Report>
        <Report icon={<HandHeart size={20} />} title="Fundraiser Report" description="Donations and orders by dancer, with a delivery check-off column." onPrint={() => pick.fund && go('fundraiser', { id: pick.fund })}>
          <Pick label="Fundraiser" value={pick.fund} onChange={(v) => setPick({ ...pick, fund: v })} none="Choose a fundraiser…" options={db.fundraisers.map((f) => ({ value: f.id, label: f.name }))} />
        </Report>
      </div>
    </>
  );
}
