import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Download, DollarSign, GraduationCap, Shirt, Ticket, TrendingUp, Users } from 'lucide-react';
import { useDb } from '../data/store';
import { ageFromBirthday } from '../data/selectors';
import { attendanceRate, staffName } from '../data/studio';
import { availability, eventCounts, fundraiserRaised, invoiceBalance, refundedFor, round2, ticketsSold } from '../data/platform';
import { todayStr } from '../data/ids';
import { Card, PageHeader, StatCard } from '../components/ui';
import { BarChart, HBarChart, Progress, type Datum } from '../components/charts';
import { download, money, toCsv } from '../components/studioUi';
import type { Database, ID } from '../data/types';

function csv(name: string, rows: Datum[], valueLabel: string) {
  download(`${name}-${todayStr()}.csv`, toCsv(['Item', valueLabel], rows.map((r) => [r.label, r.value])), 'text/csv;charset=utf-8');
}

function ChartCard({ title, rows, kind = 'h', format, valueLabel = 'Value', className, children }: { title: string; rows: Datum[]; kind?: 'h' | 'v'; format?: (n: number) => string; valueLabel?: string; className?: string; children?: React.ReactNode }) {
  return (
    <Card
      title={title}
      className={className}
      actions={
        <button className="icon-btn" aria-label={`Download ${title} as CSV`} title="Download CSV" onClick={() => csv(title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), rows, valueLabel)}>
          <Download size={15} />
        </button>
      }
    >
      {kind === 'h' ? <HBarChart data={rows} format={format} /> : <BarChart data={rows} format={format} />}
      {children}
    </Card>
  );
}

const pct = (n: number) => `${Math.round(n)}%`;

function enrolledIds(db: Database, yearId: ID | '') {
  const classIds = new Set(db.classes.filter((c) => !yearId || c.schoolYearId === yearId).map((c) => c.id));
  return db.enrollments.filter((e) => e.status === 'enrolled' && classIds.has(e.classId));
}

export function AnalyticsPage() {
  const db = useDb();
  const years = [...db.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const [yearId, setYearId] = useState<ID | ''>(years.find((y) => y.status === 'current')?.id ?? years[0]?.id ?? '');
  const year = db.schoolYears.find((y) => y.id === yearId);
  const enr = enrolledIds(db, yearId);
  const classes = db.classes.filter((c) => !yearId || c.schoolYearId === yearId);
  const dancerIds = new Set(enr.map((e) => e.dancerId));
  const inRange = (d: string) => !year || (d >= year.startDate && d <= year.endDate);

  // enrollment
  const byClass: Datum[] = classes.map((c) => ({ label: c.name, value: enr.filter((e) => e.classId === c.id).length, hint: `${c.maxEnrollment} spots` })).sort((a, b) => b.value - a.value);
  const fill = classes.length ? (enr.length / classes.reduce((s, c) => s + c.maxEnrollment, 0)) * 100 : 0;
  const byLevel: Datum[] = db.settings.levels.map((l) => ({ label: l, value: [...dancerIds].filter((d) => db.dancers.find((x) => x.id === d)?.level === l).length })).filter((d) => d.value);
  const ages = new Map<string, number>();
  for (const d of dancerIds) {
    const a = ageFromBirthday(db.dancers.find((x) => x.id === d)?.birthday ?? '');
    const k = a === null ? 'Unknown' : a < 6 ? '3–5' : a < 9 ? '6–8' : a < 12 ? '9–11' : a < 15 ? '12–14' : a < 19 ? '15–18' : 'Adult';
    ages.set(k, (ages.get(k) ?? 0) + 1);
  }
  const byAge: Datum[] = ['3–5', '6–8', '9–11', '12–14', '15–18', 'Adult', 'Unknown'].filter((k) => ages.has(k)).map((k) => ({ label: k, value: ages.get(k)! }));
  const byStyle = new Map<string, number>();
  for (const e of enr) {
    const s = db.classes.find((c) => c.id === e.classId)?.style || 'Other';
    byStyle.set(s, (byStyle.get(s) ?? 0) + 1);
  }
  // retention: dancers enrolled in the previous year who are enrolled this year
  const idx = years.findIndex((y) => y.id === yearId);
  const prev = idx >= 0 ? years[idx + 1] : undefined;
  const prevIds = prev ? new Set(enrolledIds(db, prev.id).map((e) => e.dancerId)) : new Set<ID>();
  const returning = [...dancerIds].filter((d) => prevIds.has(d)).length;
  const retention = prevIds.size ? (returning / prevIds.size) * 100 : null;
  const newDancers = [...dancerIds].filter((d) => !prevIds.has(d)).length;

  // attendance
  const att = db.attendance.filter((a) => inRange(a.date));
  const attRate = attendanceRate(att);
  const attByClass: Datum[] = classes.map((c) => ({ label: c.name, value: attendanceRate(att.filter((a) => a.classId === c.id)) ?? 0, hint: `${att.filter((a) => a.classId === c.id).length} records` })).filter((d) => d.value).sort((a, b) => b.value - a.value);
  const months = new Map<string, typeof att>();
  for (const a of att) months.set(a.date.slice(0, 7), [...(months.get(a.date.slice(0, 7)) ?? []), a]);
  const attByMonth: Datum[] = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([m, r]) => ({ label: `${m.slice(5)}/${m.slice(2, 4)}`, value: attendanceRate(r) ?? 0 }));

  // revenue
  const pays = db.payments.filter((p) => inRange(p.date));
  const revenue = round2(pays.reduce((s, p) => s + p.amount - refundedFor(db, p.id), 0));
  const outstanding = round2(db.invoices.filter((i) => i.state === 'sent' && (!yearId || i.schoolYearId === yearId || !i.schoolYearId)).reduce((s, i) => s + Math.max(0, invoiceBalance(db, i)), 0));
  const revMonths = new Map<string, number>();
  for (const p of pays) revMonths.set(p.date.slice(0, 7), (revMonths.get(p.date.slice(0, 7)) ?? 0) + p.amount - refundedFor(db, p.id));
  const revByMonth: Datum[] = [...revMonths].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ label: `${m.slice(5)}/${m.slice(2, 4)}`, value: round2(v) }));

  // teachers
  const hours = db.timeEntries.filter((t) => t.status === 'approved' && inRange(t.date));
  const byTeacher: Datum[] = db.staff.map((s) => ({ label: staffName(s), value: round2(hours.filter((h) => h.staffId === s.id).reduce((a, h) => a + h.hours, 0)) })).filter((d) => d.value).sort((a, b) => b.value - a.value);
  const teacherLoad: Datum[] = db.staff.map((s) => ({ label: staffName(s), value: classes.filter((c) => c.teacherId === s.id).length })).filter((d) => d.value).sort((a, b) => b.value - a.value);

  // costumes
  const costumes = db.costumes.filter((c) => c.kind !== 'prop');
  const avail = new Map<string, number>();
  for (const c of costumes) {
    const a = availability(db, c.id);
    avail.set(a, (avail.get(a) ?? 0) + 1);
  }
  const availLabels: Record<string, string> = { available: 'Available', partly_available: 'Partly available', reserved: 'Reserved', checked_out: 'Checked out', in_repair: 'In repair', unavailable: 'Unavailable' };
  const usage: Datum[] = costumes.map((c) => ({ label: c.name, value: db.assignments.filter((a) => a.costumeId === c.id).length + db.checkouts.filter((x) => x.costumeId === c.id).length })).filter((d) => d.value).sort((a, b) => b.value - a.value).slice(0, 10);
  const repairs = db.workOrders.filter((w) => inRange(w.createdAt.slice(0, 10)));

  // events, tickets, fundraisers
  const evs: Datum[] = db.signupEvents.filter((e) => inRange(e.date)).map((e) => ({ label: e.name, value: eventCounts(db, e.id).registered, hint: e.capacity ? `of ${e.capacity}` : undefined })).sort((a, b) => b.value - a.value);
  const tix: Datum[] = db.ticketEvents.map((e) => ({ label: e.name, value: ticketsSold(db, e.id), hint: `of ${e.types.reduce((s, t) => s + t.quantity, 0)}` }));
  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Enrollment, retention, attendance, revenue, teachers, costumes, events and fundraising"
        actions={
          <select className="input input-auto" value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="School year">
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        }
      />
      <div className="stats">
        <StatCard label="Enrolled dancers" value={dancerIds.size} icon={<Users size={20} />} tone="plum" hint={`${enr.length} class enrollments`} />
        <StatCard label="Class fill rate" value={pct(fill)} icon={<GraduationCap size={20} />} tone="sage" />
        <StatCard label="Retention" value={retention === null ? '—' : pct(retention)} icon={<TrendingUp size={20} />} tone="amber" hint={prev ? `${returning} returning · ${newDancers} new vs ${prev.name}` : 'No previous year to compare'} />
        <StatCard label="Attendance rate" value={attRate === null ? '—' : `${attRate}%`} icon={<BarChart3 size={20} />} tone="rose" hint={`${att.length} records`} />
        <StatCard label="Revenue collected" value={money(revenue)} icon={<DollarSign size={20} />} tone="sage" to="/invoices" />
        <StatCard label="Outstanding" value={money(outstanding)} icon={<DollarSign size={20} />} tone="slate" to="/invoices?tab=accounts" />
      </div>
      <h2 className="section-head">Enrollment</h2>
      <div className="dash-grid">
        <ChartCard title="Enrollment by class" rows={byClass} valueLabel="Dancers" className="span-2" />
        <ChartCard title="Dancers by age" rows={byAge} kind="v" valueLabel="Dancers" />
        <ChartCard title="Dancers by level" rows={byLevel} valueLabel="Dancers" />
        <ChartCard title="Enrollments by style" rows={[...byStyle].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} valueLabel="Enrollments" />
        <Card title="Class capacity">
          <ul className="mini-list">
            {classes
              .map((c) => ({ c, n: enr.filter((e) => e.classId === c.id).length }))
              .sort((a, b) => b.n / b.c.maxEnrollment - a.n / a.c.maxEnrollment)
              .slice(0, 8)
              .map(({ c, n }) => (
                <li key={c.id} className="cap-row">
                  <Link to={`/classes/${c.id}`}>{c.name}</Link>
                  <Progress value={n} max={c.maxEnrollment} label={`${c.name} capacity`} />
                  <span className="small">
                    {n}/{c.maxEnrollment}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      </div>
      <h2 className="section-head">Attendance & teachers</h2>
      <div className="dash-grid">
        <ChartCard title="Attendance by month" rows={attByMonth} kind="v" format={pct} valueLabel="Attendance %" className="span-2" />
        <ChartCard title="Attendance by class" rows={attByClass} format={pct} valueLabel="Attendance %" />
        <ChartCard title="Approved teacher hours" rows={byTeacher} format={(n) => `${n} h`} valueLabel="Hours" />
        <ChartCard title="Classes per teacher" rows={teacherLoad} valueLabel="Classes" />
      </div>
      <h2 className="section-head">Revenue</h2>
      <div className="dash-grid">
        <ChartCard title="Revenue by month" rows={revByMonth} kind="v" format={(n) => money(n).replace('.00', '')} valueLabel="Revenue" className="span-2">
          <p className="small faint">
            Category, event and program breakdowns are on the <Link to="/invoices">financial dashboard</Link>.
          </p>
        </ChartCard>
        <ChartCard title="Fundraising" rows={db.fundraisers.map((f) => ({ label: f.name, value: fundraiserRaised(db, f.id), hint: f.goal ? `goal ${money(f.goal)}` : undefined }))} format={money} valueLabel="Raised" />
      </div>
      <h2 className="section-head">Costumes, events & tickets</h2>
      <div className="dash-grid">
        <ChartCard title="Costume availability" rows={[...avail].map(([k, v]) => ({ label: availLabels[k], value: v }))} valueLabel="Costumes">
          <p className="small faint">
            {repairs.length} repair / cleaning jobs this period · <Link to="/checkout?tab=conflicts">costume conflicts</Link>
          </p>
        </ChartCard>
        <ChartCard title="Most-used costumes" rows={usage} valueLabel="Assignments & checkouts" />
        <ChartCard title="Event participation" rows={evs} valueLabel="Registered" />
        <ChartCard title="Tickets sold" rows={tix} valueLabel="Tickets">
          <p className="small faint">
            <Ticket size={12} /> Ticket revenue is included in revenue above.
          </p>
        </ChartCard>
        <Card title="Inventory">
          <div className="mini-stats">
            <div>
              <strong>{costumes.length}</strong>
              <span>Costumes</span>
            </div>
            <div>
              <strong>{db.costumes.length - costumes.length}</strong>
              <span>Props</span>
            </div>
            <div>
              <strong>{db.costumes.filter((c) => c.status === 'in_progress').length}</strong>
              <span>In progress</span>
            </div>
            <div>
              <strong>{db.checkouts.filter((c) => c.status === 'checked_out').length}</strong>
              <span>Checked out</span>
            </div>
          </div>
          <Link to="/reports" className="btn btn-ghost btn-sm">
            <Shirt size={14} /> Printable reports
          </Link>
        </Card>
      </div>
    </>
  );
}
