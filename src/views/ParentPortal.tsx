import { FamilyTodoCard } from './FamilyEngagement';
import { FamilyRecitalCard } from './Productions';
import { useState } from 'react';
import { CalendarDays, ClipboardCheck, HeartPulse, Mail, Pencil, Phone, Plus, School, Shirt, ShieldAlert, Theater, UserRound } from 'lucide-react';
import { useDb } from '../data/store';
import { saveEmergencyContact, saveGuardian } from '../data/studioActions';
import { ageFromBirthday, dancerCostumes, dancerParticipation, formatDate, formatTime, fullName, isUpcomingPerformance } from '../data/selectors';
import { addDays, attendanceLabels, attendanceRate, dancerClassIds, occurrencesBetween, staffName, WEEKDAY_NAMES } from '../data/studio';
import { Card, EmptyState, Field, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { FormModal } from '../components/forms';
import { useRun } from '../components/feedback';
import { AnnouncementsCard, NoticesCard, announcementsFor } from '../components/notices';
import { Avatar, PhotoGallery } from '../components/photos';
import { classWhen } from '../components/studioUi';
import { useViewer } from '../lib/session';
import { StudioCalendar } from './Calendar';
import { todayStr } from '../data/ids';
import type { Database, ID } from '../data/types';

/** Everything a parent may see: strictly their own family. */
function useFamily() {
  const db = useDb();
  const v = useViewer();
  const family = db.families.find((f) => f.id === v.familyId);
  const dancers = family ? db.dancers.filter((d) => d.familyId === family.id).sort((a, b) => a.firstName.localeCompare(b.firstName)) : [];
  // A dancer login only sees themself.
  const visible = v.account?.role === 'dancer' ? dancers.filter((d) => d.id === v.account?.dancerId) : dancers;
  const classIds = [...new Set(visible.flatMap((d) => dancerClassIds(db, d.id)))];
  return { db, v, family, dancers: visible, classIds };
}

function NoFamily() {
  return <EmptyState icon={<UserRound size={28} />} title="No family linked" message="This login isn't connected to a family yet. Please contact the studio office." />;
}

function nextClasses(db: Database, classIds: ID[], days: number) {
  const today = todayStr();
  return occurrencesBetween(db, today, addDays(today, days), { includeCancelled: true, classIds: new Set(classIds) });
}

export function FamilyDashboard() {
  const { db, v, family, dancers, classIds } = useFamily();
  if (!family) return <NoFamily />;
  const upcoming = nextClasses(db, classIds, 13);
  const notices = db.notices.filter((n) => n.familyIds.includes(family.id));
  const recentAtt = db.attendance.filter((a) => dancers.some((d) => d.id === a.dancerId)).sort((a, b) => b.date.localeCompare(a.date));
  const items = dancers.flatMap((d) => dancerCostumes(db, d.id).map((x) => ({ ...x, dancer: d })));
  const perfIds = new Set(items.filter((x) => x.ownerType === 'performance').map((x) => x.ownerId));
  const perfs = db.performances.filter((p) => perfIds.has(p.id) && isUpcomingPerformance(p));
  const events = db.studioEvents.filter((e) => e.startDate >= todayStr() && e.startDate <= addDays(todayStr(), 45)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <>
      <PageHeader title={family.name} subtitle={`Welcome, ${v.name.split(' ')[0]}`} />
      <div className="stats stats-4">
        <StatCard label="Dancers" value={dancers.length} icon={<UserRound size={20} />} tone="rose" to="/family/dancers" />
        <StatCard label="Classes" value={classIds.length} icon={<School size={20} />} tone="plum" to="/family/schedule" />
        <StatCard label="Attendance rate" value={attendanceRate(recentAtt) === null ? '—' : `${attendanceRate(recentAtt)}%`} icon={<ClipboardCheck size={20} />} tone="sage" to="/family/attendance" />
        <StatCard label="Upcoming performances" value={perfs.length} icon={<Theater size={20} />} tone="amber" to="/family/costumes" />
      </div>
      <FamilyTodoCard db={db} familyId={family.id} />
      <div className="dash-grid">
        <Card title="Next Two Weeks" icon={<CalendarDays size={18} />} className="span-2">
          {!upcoming.length ? (
            <p className="faint pad">No classes scheduled.</p>
          ) : (
            <ul className="mini-list">
              {upcoming.map((o) => {
                const who = dancers.filter((d) => dancerClassIds(db, d.id).includes(o.classId)).map((d) => d.firstName);
                return (
                  <li key={o.key} className={o.cancelled ? 'muted' : ''}>
                    <div>
                      <strong>
                        {WEEKDAY_NAMES[new Date(o.date + 'T12:00').getDay()].slice(0, 3)} {formatDate(o.date)}
                      </strong>{' '}
                      · {o.cls.name} <span className="small faint">{formatTime(o.start)}–{formatTime(o.end)} · {who.join(', ')}</span>
                      {o.cancelled && <div className="small bad-text">Cancelled: {o.cancelReason}</div>}
                      {o.moved && !o.cancelled && <div className="small">Time/place changed</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <NoticesCard notices={notices} />
        <Card title="My Dancers" icon={<UserRound size={18} />} className="span-2">
          {dancers.map((d) => (
            <div key={d.id} className="family-dancer">
              <div className="with-avatar">
                <Avatar ownerType="dancer" ownerId={d.id} size={44} round />
                <div>
                  <strong>{fullName(d)}</strong>
                  <div className="small faint">{[ageFromBirthday(d.birthday) !== null && `Age ${ageFromBirthday(d.birthday)}`, d.level].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div className="small">
                {dancerClassIds(db, d.id)
                  .map((cid) => db.classes.find((c) => c.id === cid))
                  .filter(Boolean)
                  .map((c) => (
                    <div key={c!.id}>
                      {c!.name} <span className="faint">· {classWhen(c!)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </Card>
        <AnnouncementsCard items={announcementsFor(db.announcements, 'families', classIds)} />
        <Card title="Upcoming Studio Dates" className="span-2">
          <ul className="mini-list">
            {perfs.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong> <span className="small faint">· {formatDate(p.date)}{p.callTime ? ` · call time ${formatTime(p.callTime)}` : ''}{p.venue ? ` · ${p.venue}` : ''}</span>
                </span>
              </li>
            ))}
            {events.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{e.title}</strong> <span className="small faint">· {formatDate(e.startDate)}{e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}</span>
                </span>
                {e.cancelsClasses && <span className="badge badge-neutral">No classes</span>}
              </li>
            ))}
            {!perfs.length && !events.length && <li className="faint small">Nothing coming up.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

export function FamilyDancersPage() {
  const { db, dancers } = useFamily();
  if (!dancers.length) return <NoFamily />;
  return (
    <>
      <PageHeader title="My Dancers" subtitle="Classes, teachers, sizes and notes the studio has on file" />
      {dancers.map((d) => {
        const classes = dancerClassIds(db, d.id).map((cid) => db.classes.find((c) => c.id === cid)!).filter(Boolean);
        const waiting = dancerClassIds(db, d.id, 'waitlist').map((cid) => db.classes.find((c) => c.id === cid)!).filter(Boolean);
        const parts = dancerParticipation(db, d.id);
        return (
          <div key={d.id} className="detail-grid">
            <Card
              title={
                <>
                  <Avatar ownerType="dancer" ownerId={d.id} size={36} round /> {fullName(d)}
                </>
              }
            >
              <dl className="dl">
                <dt>Birthday</dt>
                <dd>{formatDate(d.birthday) || '—'}</dd>
                <dt>Age</dt>
                <dd>{ageFromBirthday(d.birthday) ?? '—'}</dd>
                <dt>Level</dt>
                <dd>{d.level || '—'}</dd>
                <dt>Sizes</dt>
                <dd>
                  Clothing {d.clothingSize || '—'} · Costume {d.costumeSize || '—'} · Shoe {d.shoeSize || '—'}
                </dd>
                <dt>Pointe</dt>
                <dd>{d.pointe ? 'Yes' : 'No'}</dd>
                <dt>
                  <HeartPulse size={13} /> Allergies
                </dt>
                <dd>{d.allergies || 'None on file'}</dd>
                <dt>Medical notes</dt>
                <dd>{d.medicalNotes || 'None on file'}</dd>
              </dl>
              <p className="small faint">To change sizes or medical information, please contact the office.</p>
            </Card>
            <div className="stack">
              <Card title="Classes">
                <ul className="mini-list">
                  {classes.map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>{c.name}</strong>
                        <div className="small faint">
                          {classWhen(c)} · {db.classrooms.find((r) => r.id === c.classroomId)?.name ?? ''} · {staffName(db.staff.find((s) => s.id === c.teacherId)) || 'Teacher TBA'}
                        </div>
                      </div>
                    </li>
                  ))}
                  {waiting.map((c) => (
                    <li key={c.id}>
                      <span className="faint">{c.name} — on the waiting list</span>
                    </li>
                  ))}
                  {!classes.length && !waiting.length && <li className="faint small">Not enrolled in classes.</li>}
                </ul>
              </Card>
              <Card title="Shows & Performances">
                <ul className="mini-list">
                  {parts.map((p) => (
                    <li key={p.membership.id}>
                      <span>
                        {p.ownerName} <span className="small faint">· {p.cast.name}{p.membership.role ? ` · ${p.membership.role}` : ''}</span>
                      </span>
                    </li>
                  ))}
                  {!parts.length && <li className="faint small">Not cast in any shows yet.</li>}
                </ul>
              </Card>
              <PhotoGallery ownerType="dancer" ownerId={d.id} name={d.firstName} />
            </div>
          </div>
        );
      })}
    </>
  );
}

export function FamilySchedulePage() {
  const { classIds, family } = useFamily();
  if (!family) return <NoFamily />;
  return <StudioCalendar classIds={new Set(classIds)} readOnly title="Class Schedule" subtitle="Your dancers' classes, cancellations, closures and performances" />;
}

export function FamilyAttendancePage() {
  const { db, dancers } = useFamily();
  if (!dancers.length) return <NoFamily />;
  return (
    <>
      <PageHeader title="Attendance" subtitle="Recorded by teachers. Contact the office if something looks wrong." />
      {dancers.map((d) => {
        const recs = db.attendance.filter((a) => a.dancerId === d.id).sort((a, b) => b.date.localeCompare(a.date));
        const rate = attendanceRate(recs);
        return (
          <Card key={d.id} title={`${fullName(d)}${rate !== null ? ` · ${rate}% attendance` : ''}`}>
            {!recs.length ? (
              <p className="faint pad">No attendance recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th className="minor">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recs.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{formatDate(r.date)}</td>
                        <td>{db.classes.find((c) => c.id === r.classId)?.name ?? 'Class'}</td>
                        <td>
                          <span className={`attn-pill ${r.status}`}>{attendanceLabels[r.status]}</span>
                        </td>
                        <td className="minor small">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

export function FamilyCostumesPage() {
  const { db, dancers } = useFamily();
  if (!dancers.length) return <NoFamily />;
  return (
    <>
      <PageHeader title="Recitals & Costumes" subtitle="What each dancer is wearing and carrying in upcoming shows" />
      <FamilyRecitalCard dancerIds={dancers.map((d) => d.id)} />
      {dancers.map((d) => {
        const items = dancerCostumes(db, d.id);
        return (
          <Card key={d.id} title={fullName(d)} icon={<Shirt size={18} />}>
            {!items.length ? (
              <p className="faint pad">No costumes or props assigned yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Show / Performance</th>
                      <th>Cast & role</th>
                      <th className="minor">Size</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x, i) => {
                      const perf = x.ownerType === 'performance' ? db.performances.find((p) => p.id === x.ownerId) : undefined;
                      return (
                        <tr key={i}>
                          <td>
                            <div className="with-avatar">
                              <Avatar ownerType="item" ownerId={x.costume.id} size={40} fallback={<Shirt size={16} />} />
                              <div>
                                <strong>{x.costume.name}</strong>
                                <div className="small faint">{x.costume.kind === 'prop' ? 'Prop' : 'Costume'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {x.ownerName}
                            {perf?.date && <div className="small faint">{formatDate(perf.date)}{perf.callTime ? ` · call ${formatTime(perf.callTime)}` : ''}</div>}
                          </td>
                          <td className="small">
                            {x.castName}
                            {x.role && ` · ${x.role}`}
                          </td>
                          <td className="minor">{x.costume.kind === 'prop' ? '' : x.costume.size}</td>
                          <td>
                            <StatusBadge costume={x.costume} compact />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

export function FamilyAccountPage() {
  const { db, v, family } = useFamily();
  const run = useRun();
  const [editMe, setEditMe] = useState(false);
  const [contact, setContact] = useState<{ id?: ID } | null>(null);
  const [mine, setMine] = useState({ phone: '', email: '', smsConsent: false, emailConsent: true });
  const [ec, setEc] = useState({ name: '', relationship: '', phone: '', notes: '' });
  if (!family) return <NoFamily />;
  const guardians = db.guardians.filter((g) => g.familyId === family.id);
  const contacts = db.emergencyContacts.filter((c) => c.familyId === family.id);
  const me = guardians.find((g) => g.id === v.account?.guardianId);
  return (
    <>
      <PageHeader title="Family Account" subtitle="Your contact details and emergency contacts" />
      <div className="detail-grid">
        <Card title="Family">
          <dl className="dl">
            <dt>Family</dt>
            <dd>{family.name}</dd>
            <dt>Address</dt>
            <dd>{[family.address, family.city, family.state, family.zip].filter(Boolean).join(', ') || '—'}</dd>
          </dl>
          <p className="small faint">To change your address or family details, please contact the office.</p>
        </Card>
        <div className="stack">
          <Card title="Parents & Guardians" icon={<UserRound size={18} />}>
            <ul className="mini-list">
              {guardians.map((g) => (
                <li key={g.id}>
                  <div>
                    <strong>
                      {g.firstName} {g.lastName}
                    </strong>{' '}
                    <span className="small faint">· {g.relationship}</span>
                    <div className="small contact-links">
                      {g.phone && (
                        <span>
                          <Phone size={12} /> {g.phone}
                        </span>
                      )}
                      {g.email && (
                        <span>
                          <Mail size={12} /> {g.email}
                        </span>
                      )}
                    </div>
                    <div className="small faint">
                      {g.emailConsent ? 'Emails on' : 'Emails off'} · {g.smsConsent ? 'Text alerts on' : 'Text alerts off'}
                    </div>
                  </div>
                  {g.id === me?.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => (setMine({ phone: g.phone, email: g.email, smsConsent: g.smsConsent, emailConsent: g.emailConsent }), setEditMe(true))}>
                      <Pencil size={13} /> Update my contact info
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Emergency Contacts" icon={<ShieldAlert size={18} />} actions={<button className="btn btn-ghost btn-sm" onClick={() => (setEc({ name: '', relationship: '', phone: '', notes: '' }), setContact({}))}><Plus size={14} /> Add</button>}>
            <ul className="mini-list">
              {contacts.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.name}</strong> <span className="small faint">· {c.relationship}</span>
                    <div className="small">{c.phone}</div>
                  </div>
                  <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => (setEc({ name: c.name, relationship: c.relationship, phone: c.phone, notes: c.notes }), setContact({ id: c.id }))}>
                    <Pencil size={14} />
                  </button>
                </li>
              ))}
              {!contacts.length && <li className="faint small">Please add at least one emergency contact.</li>}
            </ul>
          </Card>
        </div>
      </div>
      {me && (
        <FormModal open={editMe} onClose={() => setEditMe(false)} title="My Contact Information" size="sm" onSubmit={() => run(() => saveGuardian({ ...me, ...mine }, me.id), 'Contact information updated.') && setEditMe(false)}>
          <Field label="Phone">
            <input className="input" type="tel" value={mine.phone} onChange={(e) => setMine({ ...mine, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={mine.email} onChange={(e) => setMine({ ...mine, email: e.target.value })} />
          </Field>
          <label className="check-inline">
            <input type="checkbox" checked={mine.emailConsent} onChange={(e) => setMine({ ...mine, emailConsent: e.target.checked })} /> Send me studio emails
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={mine.smsConsent} onChange={(e) => setMine({ ...mine, smsConsent: e.target.checked })} /> Send me text alerts (closures, schedule changes, reminders). Reply STOP any time.
          </label>
        </FormModal>
      )}
      <FormModal open={!!contact} onClose={() => setContact(null)} title={contact?.id ? 'Edit Emergency Contact' : 'Add Emergency Contact'} size="sm" onSubmit={() => run(() => saveEmergencyContact({ ...ec, familyId: family.id }, contact?.id), 'Emergency contact saved.') && setContact(null)}>
        <Field label="Name" required>
          <input className="input" value={ec.name} onChange={(e) => setEc({ ...ec, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Relationship">
          <input className="input" value={ec.relationship} onChange={(e) => setEc({ ...ec, relationship: e.target.value })} />
        </Field>
        <Field label="Phone" required>
          <input className="input" type="tel" value={ec.phone} onChange={(e) => setEc({ ...ec, phone: e.target.value })} />
        </Field>
      </FormModal>
    </>
  );
}
