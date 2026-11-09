import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, CalendarHeart, Download, HandHeart, Mail, MessageSquare, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteVolunteers } from '../data/actions';
import { availableSlots, formatDate, formatTime, isUpcomingPerformance, slotLabel, sortedSlots, volunteerName } from '../data/selectors';
import { BulkBar, Card, DataTable, EmptyState, PageHeader, SampleTag, SearchInput, type Column } from '../components/ui';
import { useConfirm, useRun } from '../components/feedback';
import { useEditors } from '../components/editors';
import { exportVolunteers } from '../lib/export';
import { todayStr } from '../data/ids';
import type { ID, Volunteer } from '../data/types';

const CONTACT_LABEL = { email: 'Email', phone: 'Phone call', text: 'Text message', '': '' } as const;

function Skills({ skills }: { skills: string[] }) {
  if (!skills.length) return <span className="faint">—</span>;
  return (
    <div className="skill-chips">
      {skills.map((s) => (
        <span key={s} className="chip">
          {s}
        </span>
      ))}
    </div>
  );
}

export function VolunteersPage() {
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [selected, setSelected] = useState<Set<ID>>(new Set());

  const skills = [...new Set([...db.settings.skills, ...db.volunteers.flatMap((v) => v.skills)])];
  const today = todayStr();
  const rows = db.volunteers.filter((v) => {
    if (q && !`${v.firstName} ${v.lastName} ${v.email} ${v.phone} ${v.notes}`.toLowerCase().includes(q.toLowerCase().trim())) return false;
    if (skill && !v.skills.includes(skill)) return false;
    if (date && !availableSlots(v, date, time || undefined).length) return false;
    return true;
  });

  const columns: Column<Volunteer>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (v) => (
        <>
          <Link to={`/volunteers/${v.id}`} className="link-strong">
            {volunteerName(v)}
          </Link>
          <SampleTag show={v.isSample} />
        </>
      ),
      sortValue: (v) => `${v.lastName} ${v.firstName}`,
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (v) => (
        <div className="small">
          {v.email && <div>{v.email}</div>}
          {v.phone && <div>{v.phone}</div>}
          {v.preferredContact && <div className="faint">Prefers {CONTACT_LABEL[v.preferredContact].toLowerCase()}</div>}
          {!v.email && !v.phone && <span className="faint">—</span>}
        </div>
      ),
      sortValue: (v) => v.email || v.phone,
    },
    { key: 'skills', header: 'Skills', render: (v) => <Skills skills={v.skills} />, sortValue: (v) => v.skills.join(', ') },
    {
      key: 'avail',
      header: date ? `Available ${formatDate(date)}` : 'Availability',
      render: (v) => {
        const slots = date ? availableSlots(v, date, time || undefined) : sortedSlots(v, today).filter((s) => s.type === 'weekly' || s.date >= today);
        if (!slots.length) return <span className="faint">{v.availability.length ? 'No upcoming availability' : 'Not entered'}</span>;
        return (
          <div className="small">
            {slots.slice(0, 2).map((s) => (
              <div key={s.id}>{date ? `${s.start || s.end ? `${s.start ? formatTime(s.start) : '…'} – ${s.end ? formatTime(s.end) : '…'}` : 'All day'}${s.note ? ` · ${s.note}` : ''}` : slotLabel(s)}</div>
            ))}
            {slots.length > 2 && <div className="faint">+ {slots.length - 2} more</div>}
          </div>
        );
      },
    },
    { key: 'notes', header: 'Notes', render: (v) => <span className="truncate small">{v.notes}</span>, minor: true },
    {
      key: 'act',
      header: '',
      render: (v) => (
        <div className="row-actions">
          <button className="icon-btn" aria-label={`Edit ${volunteerName(v)}`} onClick={() => ed.editVolunteer(v.id)}>
            <Pencil size={16} />
          </button>
        </div>
      ),
    },
  ];

  const ids = [...selected].filter((id) => db.volunteers.some((v) => v.id === id));
  const removeSelected = async () => {
    if (await confirm({ title: `Delete ${ids.length} volunteer${ids.length === 1 ? '' : 's'}?`, message: 'Their contact details and availability will be permanently deleted.', confirmLabel: 'Delete', danger: true }))
      if (run(() => (deleteVolunteers(ids), true), `${ids.length} volunteer${ids.length === 1 ? '' : 's'} deleted.`)) setSelected(new Set());
  };
  const emails = rows.filter((v) => v.email).map((v) => v.email);

  return (
    <>
      <PageHeader
        title="Volunteers"
        subtitle={`${db.volunteers.length} volunteer${db.volunteers.length === 1 ? '' : 's'} helping your studio`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => exportVolunteers(db)} disabled={!db.volunteers.length}>
              <Download size={16} /> Export CSV
            </button>
            <button className="btn btn-primary" onClick={() => ed.editVolunteer()}>
              <Plus size={16} /> Add volunteer
            </button>
          </>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email, phone…" />
          <select className="input input-auto" value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Filter by skill">
            <option value="">All skills</option>
            {skills.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="age-filter">
            <span className="small faint">Available on</span>
            <input className="input input-auto" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Available on date" />
            <input className="input input-auto" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Available at time" disabled={!date} />
          </div>
          {(q || skill || date || time) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQ('');
                setSkill('');
                setDate('');
                setTime('');
              }}
            >
              Clear filters
            </button>
          )}
          {emails.length > 0 && (
            <a className="btn btn-ghost btn-sm" href={`mailto:?bcc=${encodeURIComponent(emails.join(','))}`} title="Opens your email app with these volunteers in BCC">
              <Mail size={14} /> Email {rows.length === db.volunteers.length ? 'all' : 'shown'} ({emails.length})
            </a>
          )}
        </div>
        <BulkBar count={ids.length} onClear={() => setSelected(new Set())}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportVolunteers(db, ids)}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={removeSelected}>
            <Trash2 size={14} /> Delete
          </button>
        </BulkBar>
        <DataTable
          rows={rows}
          columns={columns}
          getId={(v) => v.id}
          selected={selected}
          onSelectedChange={setSelected}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={
            db.volunteers.length ? (
              <EmptyState title="No volunteers match" message={date ? 'Nobody has entered availability for that date / time.' : 'Try clearing a filter.'} />
            ) : (
              <EmptyState
                icon={<HandHeart size={28} />}
                title="No volunteers yet"
                message="Add parents and helpers with their skills and when they're available."
                action={
                  <button className="btn btn-primary" onClick={() => ed.editVolunteer()}>
                    <Plus size={16} /> Add volunteer
                  </button>
                }
              />
            )
          }
        />
      </Card>
    </>
  );
}

export function VolunteerDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const ed = useEditors();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const v = db.volunteers.find((x) => x.id === id);
  if (!v) {
    return (
      <>
        <PageHeader title="Volunteer not found" back={{ to: '/volunteers', label: 'Volunteers' }} />
        <EmptyState title="This volunteer no longer exists" action={<Link to="/volunteers" className="btn btn-primary">Back to volunteers</Link>} />
      </>
    );
  }
  const today = todayStr();
  const slots = sortedSlots(v, today);
  const matches = db.performances
    .filter((p) => p.date && isUpcomingPerformance(p))
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((p) => {
      const out: { key: string; perfId: ID; name: string; when: string; label: string }[] = [];
      if (availableSlots(v, p.date, p.callTime || p.time || undefined).length)
        out.push({ key: `${p.id}:perf`, perfId: p.id, name: p.name, when: `${formatDate(p.date)}${p.callTime ? ` · call ${formatTime(p.callTime)}` : p.time ? ` · ${formatTime(p.time)}` : ''}`, label: 'Performance' });
      const dr = p.dressRehearsal;
      if (dr && dr.slice(0, 10) >= today && availableSlots(v, dr.slice(0, 10), dr.slice(11, 16) || undefined).length)
        out.push({ key: `${p.id}:dress`, perfId: p.id, name: p.name, when: `${formatDate(dr.slice(0, 10))}${dr.slice(11, 16) ? ` · ${formatTime(dr.slice(11, 16))}` : ''}`, label: 'Dress rehearsal' });
      return out;
    });

  const del = async () => {
    if (await confirm({ title: 'Delete volunteer?', message: `Delete ${volunteerName(v)} with their contact details and availability?`, confirmLabel: 'Delete volunteer', danger: true }))
      if (run(() => (deleteVolunteers([v.id]), true), 'Volunteer deleted.')) navigate('/volunteers');
  };
  const digits = v.phone.replace(/[^\d+]/g, '');

  return (
    <>
      <PageHeader
        back={{ to: '/volunteers', label: 'Volunteers' }}
        title={
          <>
            {volunteerName(v)} <SampleTag show={v.isSample} />
          </>
        }
        subtitle={v.skills.join(' · ') || 'Volunteer'}
        actions={
          <>
            <button className="btn btn-ghost danger" onClick={del}>
              <Trash2 size={16} /> Delete
            </button>
            <button className="btn btn-primary" onClick={() => ed.editVolunteer(v.id)}>
              <Pencil size={16} /> Edit volunteer
            </button>
          </>
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <Card title="Contact">
            <div className="contact-links">
              {v.email && (
                <a href={`mailto:${v.email}`}>
                  <Mail size={15} /> {v.email}
                </a>
              )}
              {v.phone && (
                <a href={`tel:${digits}`}>
                  <Phone size={15} /> {v.phone}
                </a>
              )}
              {v.phone && (
                <a href={`sms:${digits}`}>
                  <MessageSquare size={15} /> Send a text
                </a>
              )}
              {!v.email && !v.phone && <span className="faint">No contact details yet.</span>}
            </div>
            {v.preferredContact && <p className="small faint">Prefers: {CONTACT_LABEL[v.preferredContact]}</p>}
          </Card>
          <Card title="Skills">
            <Skills skills={v.skills} />
          </Card>
          <Card title="Notes">
            <p className="prewrap">{v.notes || <span className="faint">No notes.</span>}</p>
          </Card>
        </div>
        <div className="stack">
          <Card title="Availability" icon={<CalendarClock size={18} />} actions={<button className="btn btn-ghost btn-sm" onClick={() => ed.editVolunteer(v.id)}>Edit</button>}>
            {!slots.length ? (
              <p className="faint pad">No availability entered yet.</p>
            ) : (
              <ul className="avail-list">
                {slots.map((s) => (
                  <li key={s.id} className={s.type === 'date' && s.date < today ? 'past' : ''}>
                    <CalendarClock size={14} className="faint" />
                    <span>{slotLabel(s)}</span>
                    {s.note && <span className="small faint">· {s.note}</span>}
                    {s.type === 'date' && s.date < today && <span className="small faint">(past)</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Available For Upcoming Performances" icon={<CalendarHeart size={18} />}>
            {!matches.length ? (
              <p className="faint pad">Their availability doesn't match any upcoming performance or dress rehearsal yet.</p>
            ) : (
              <ul className="mini-list">
                {matches.map((m) => (
                  <li key={m.key}>
                    <div>
                      <Link to={`/performances/${m.perfId}`} className="link-strong">
                        {m.name}
                      </Link>
                      <div className="small faint">{m.when}</div>
                    </div>
                    <span className="badge badge-info">{m.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Card for a performance page: who can help on the day and at dress rehearsal. */
export function AvailableVolunteersCard({ date, time, dressRehearsal }: { date: string; time: string; dressRehearsal: string }) {
  const db = useDb();
  const ed = useEditors();
  const groups = [
    { label: 'Performance day', date, time },
    ...(dressRehearsal ? [{ label: 'Dress rehearsal', date: dressRehearsal.slice(0, 10), time: dressRehearsal.slice(11, 16) }] : []),
  ].filter((g) => g.date);
  return (
    <Card title="Volunteers Available" icon={<HandHeart size={18} />} actions={<button className="btn btn-ghost btn-sm" onClick={() => ed.editVolunteer()}><Plus size={14} /> Add volunteer</button>}>
      {!groups.length ? (
        <p className="faint pad">Set a performance date to see which volunteers are available.</p>
      ) : (
        <div className="attention">
          {groups.map((g) => {
            const list = db.volunteers
              .map((v) => ({ v, slots: availableSlots(v, g.date, g.time || undefined) }))
              .filter((x) => x.slots.length)
              .sort((a, b) => volunteerName(a.v).localeCompare(volunteerName(b.v)));
            return (
              <div key={g.label}>
                <h4 className="mini-title">
                  {g.label} · {formatDate(g.date)}
                  {g.time && ` · ${formatTime(g.time)}`}
                </h4>
                {!list.length ? (
                  <p className="small faint">Nobody has marked themselves available.</p>
                ) : (
                  <ul>
                    {list.map(({ v, slots }) => (
                      <li key={v.id}>
                        <Link to={`/volunteers/${v.id}`}>{volunteerName(v)}</Link>
                        <span className="faint small"> · {slots.map((s) => (s.start || s.end ? `${s.start ? formatTime(s.start) : '…'}–${s.end ? formatTime(s.end) : '…'}` : 'all day')).join(', ')}</span>
                        {v.skills.length > 0 && <div className="small faint">{v.skills.join(', ')}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
