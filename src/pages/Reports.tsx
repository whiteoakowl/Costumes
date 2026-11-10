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
    </>
  );
}
