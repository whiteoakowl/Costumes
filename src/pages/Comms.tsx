import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, Bell, CalendarClock, Copy, Eye, FileText, Inbox, Mail, MessageSquare, Newspaper, Paperclip, Plus, Save, Send, Trash2, Zap } from 'lucide-react';
import { useDb } from '../data/store';
import {
  deleteMessage,
  deleteTemplate,
  describeRecipients,
  duplicateMessage,
  inboxFor,
  markMessageRead,
  markNotificationsRead,
  notificationsFor,
  reminderLabels,
  runReminders,
  saveMessage,
  saveTemplate,
  scheduleMessage,
  sendManualNotification,
  sendMessage,
  SMS_LIMIT,
  unscheduleMessage,
  type MessageInput,
} from '../data/commsActions';
import { resolveRecipients, upcoming } from '../data/platform';
import { formatDate, formatDateTime, formatTime } from '../data/selectors';
import { fmtDate, fmtClock, nyNowLocal } from '../data/time';
import { newId, todayStr } from '../data/ids';
import { staffName } from '../data/studio';
import { Badge, Card, CheckList, DataTable, EmptyState, Field, PageHeader, SampleTag, StatCard, Tabs, type Option } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { FileChip, MediaPicker, StoredImage } from '../components/media';
import { classOptions } from '../components/studioUi';
import { useViewer } from '../lib/session';
import type { Channel, Database, ID, Message, NewsletterBlock, RecipientSpec } from '../data/types';

const channelLabel: Record<Channel, string> = { email: 'Email', sms: 'Text alert', newsletter: 'Newsletter' };
const channelIcon = (c: Channel, s = 16) => (c === 'sms' ? <MessageSquare size={s} /> : c === 'newsletter' ? <Newspaper size={s} /> : <Mail size={s} />);
const whenLabel = (local: string) => (local ? `${fmtDate(local.slice(0, 10))} ${fmtClock(local.slice(11, 16))}` : '');

const recipientKinds: { kind: RecipientSpec['kind']; label: string; needsIds: boolean }[] = [
  { kind: 'all_families', label: 'All active families', needsIds: false },
  { kind: 'classes', label: 'Families in classes', needsIds: true },
  { kind: 'teams', label: 'Families on teams', needsIds: true },
  { kind: 'families', label: 'Specific families', needsIds: true },
  { kind: 'dancers', label: "Specific dancers' families", needsIds: true },
  { kind: 'event', label: 'Families signed up for an event', needsIds: true },
  { kind: 'recital', label: 'Families in a recital', needsIds: true },
  { kind: 'performance', label: 'Families in a performance', needsIds: true },
  { kind: 'teachers', label: 'Specific teachers / staff', needsIds: true },
  { kind: 'all_staff', label: 'All staff', needsIds: false },
];

function optionsFor(db: Database, kind: RecipientSpec['kind']): Option[] {
  switch (kind) {
    case 'classes':
      return classOptions(db);
    case 'teams':
      return db.teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }));
    case 'families':
      return db.families.map((f) => ({ value: f.id, label: f.name }));
    case 'dancers':
      return db.dancers.map((d) => ({ value: d.id, label: `${d.firstName} ${d.lastName}` }));
    case 'event':
      return db.signupEvents.map((e) => ({ value: e.id, label: e.name, hint: formatDate(e.date) }));
    case 'recital':
      return db.recitals.map((r) => ({ value: r.id, label: r.name }));
    case 'performance':
      return db.performances.map((p) => ({ value: p.id, label: p.name, hint: formatDate(p.date) }));
    case 'teachers':
      return db.staff.filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: staffName(s), hint: s.title }));
    default:
      return [];
  }
}

/* ======================================================== communications */

export function CommunicationsPage() {
  const db = useDb();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'sent' | 'scheduled' | 'drafts' | 'templates') || 'sent';
  const status = tab === 'drafts' ? 'draft' : tab;
  const list = db.messages.filter((m) => m.status === status).sort((a, b) => (b.sentAt || b.scheduledFor || b.updatedAt).localeCompare(a.sentAt || a.scheduledFor || a.updatedAt));
  const sent = db.messages.filter((m) => m.status === 'sent');
  return (
    <>
      <PageHeader
        title="Communications"
        subtitle="Emails, text alerts and newsletters to families and staff"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => navigate('/communications/compose/new?channel=sms')}>
              <MessageSquare size={16} /> Text alert
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/communications/compose/new?channel=newsletter')}>
              <Newspaper size={16} /> Newsletter
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/communications/compose/new?channel=email')}>
              <Mail size={16} /> New email
            </button>
          </>
        }
      />
      <div className="hint-bar">
        <span>
          <AlertTriangle size={14} /> <strong>Email and SMS providers are not connected yet.</strong> Messages are delivered to each recipient's Parent / Teacher Portal inbox, and every message shows which people it would have reached by email or text (respecting their consent).
        </span>
      </div>
      <div className="stats stats-4">
        <StatCard label="Sent this month" value={sent.filter((m) => m.sentAt.slice(0, 7) === todayStr().slice(0, 7)).length} icon={<Send size={20} />} tone="sage" />
        <StatCard label="Scheduled" value={db.messages.filter((m) => m.status === 'scheduled').length} icon={<CalendarClock size={20} />} tone="plum" />
        <StatCard label="Drafts" value={db.messages.filter((m) => m.status === 'draft').length} icon={<FileText size={20} />} tone="amber" />
        <StatCard label="Templates" value={db.messageTemplates.length} icon={<Copy size={20} />} tone="slate" />
      </div>
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'sent' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'sent', label: 'Sent', count: sent.length },
          { value: 'scheduled', label: 'Scheduled', count: db.messages.filter((m) => m.status === 'scheduled').length },
          { value: 'drafts', label: 'Drafts', count: db.messages.filter((m) => m.status === 'draft').length },
          { value: 'templates', label: 'Templates', count: db.messageTemplates.length },
        ]}
      />
      {tab === 'templates' ? (
        <TemplateList />
      ) : (
        <Card>
          <DataTable
            rows={list}
            getId={(m) => m.id}
            empty={<EmptyState icon={<Mail size={28} />} title="Nothing here yet" />}
            columns={[
              { key: 'c', header: 'Type', render: (m) => <span className="inline-icon">{channelIcon(m.channel)} {channelLabel[m.channel]}</span>, sortValue: (m) => m.channel },
              { key: 's', header: 'Subject', render: (m) => <><Link to={m.status === 'sent' ? `/communications/${m.id}` : `/communications/compose/${m.id}`} className="link-strong">{m.subject || m.body.slice(0, 60) || '(untitled)'}</Link> <SampleTag show={m.isSample} /><div className="small faint">{describeRecipients(db, m.recipients)}</div></>, sortValue: (m) => m.subject },
              { key: 'w', header: m0(tab), render: (m) => (m.status === 'sent' ? formatDateTime(m.sentAt) : m.status === 'scheduled' ? whenLabel(m.scheduledFor) : formatDateTime(m.updatedAt)), sortValue: (m) => m.sentAt || m.scheduledFor || m.updatedAt },
              { key: 'r', header: 'Reached', render: (m) => (m.status === 'sent' ? `${m.deliveries.filter((d) => d.status === 'in_app').length} · ${m.readBy.length} read` : '—'), minor: true },
              { key: 'b', header: 'By', render: (m) => m.sender, minor: true },
            ]}
          />
        </Card>
      )}
    </>
  );
}
const m0 = (tab: string) => (tab === 'sent' ? 'Sent' : tab === 'scheduled' ? 'Sends at (Eastern)' : 'Last edited');

function TemplateList() {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  return (
    <Card>
      {!db.messageTemplates.length ? (
        <p className="faint pad">No templates yet. Write a message and choose “Save as template”.</p>
      ) : (
        <ul className="mini-list">
          {db.messageTemplates.map((t) => (
            <li key={t.id}>
              <div>
                <span className="inline-icon">
                  {channelIcon(t.channel, 14)} <strong>{t.name}</strong>
                </span>
                <div className="small faint">{t.subject || t.body.slice(0, 80)}</div>
              </div>
              <span className="row-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/communications/compose/new?template=${t.id}`)}>
                  Use
                </button>
                <button className="icon-btn" aria-label={`Delete ${t.name}`} onClick={async () => { if (await confirm({ title: 'Delete template?', message: t.name, confirmLabel: 'Delete', danger: true })) run(() => deleteTemplate(t.id)); }}>
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ============================================================ composer */

export function ComposePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const existing = id && id !== 'new' ? db.messages.find((m) => m.id === id) : undefined;
  const tpl = db.messageTemplates.find((t) => t.id === params.get('template'));
  const initial = (): MessageInput => {
    if (existing) return { channel: existing.channel, subject: existing.subject, body: existing.body, blocks: existing.blocks, recipients: existing.recipients, attachmentIds: existing.attachmentIds, related: existing.related };
    const channel = (tpl?.channel ?? (params.get('channel') as Channel)) || 'email';
    return { channel, subject: tpl?.subject ?? '', body: tpl?.body ?? '', blocks: tpl?.blocks.map((b) => ({ ...b, id: newId() })) ?? (channel === 'newsletter' ? [{ id: newId(), type: 'heading', text: `${db.settings.studioName} News`, url: '', fileId: null }, { id: newId(), type: 'text', text: '', url: '', fileId: null }] : []), recipients: [{ kind: 'all_families', ids: [] }], attachmentIds: [], related: null };
  };
  const [f, setF] = useState<MessageInput>(initial);
  const [savedId, setSavedId] = useState<ID | null>(existing?.id ?? null);
  const [kind, setKind] = useState<RecipientSpec['kind']>('classes');
  const [ids, setIds] = useState<Set<ID>>(new Set());
  const [picking, setPicking] = useState<'attach' | ID | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState('');
  const [tplName, setTplName] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  if (existing && existing.status === 'sent') return <EmptyState title="Already sent" action={<Link className="btn btn-primary" to={`/communications/${existing.id}`}>View message</Link>} />;
  const set = (p: Partial<MessageInput>) => setF({ ...f, ...p });
  const deliveries = f.recipients.length ? resolveRecipients(db, f.recipients, f.channel) : [];
  const reach = deliveries.filter((d) => d.status === 'in_app').length;
  const skipped = deliveries.filter((d) => d.status !== 'in_app');
  const save = () => {
    const sid = run(() => saveMessage(f, savedId ?? undefined));
    if (sid) setSavedId(sid);
    return sid;
  };
  const setBlock = (bid: ID, p: Partial<NewsletterBlock>) => set({ blocks: f.blocks.map((b) => (b.id === bid ? { ...b, ...p } : b)) });
  const moveBlock = (bid: ID, d: number) => {
    const i = f.blocks.findIndex((b) => b.id === bid);
    const next = [...f.blocks];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    set({ blocks: next });
  };
  const addRecipients = () => {
    const def = recipientKinds.find((k) => k.kind === kind)!;
    if (def.needsIds && !ids.size) return toast.error('Choose at least one.');
    const others = f.recipients.filter((r) => r.kind !== kind);
    const cur = f.recipients.find((r) => r.kind === kind);
    set({ recipients: [...others, { kind, ids: [...new Set([...(cur?.ids ?? []), ...ids])] }] });
    setIds(new Set());
  };
  return (
    <>
      <PageHeader back={{ to: '/communications', label: 'Communications' }} title={`${existing ? 'Edit' : 'New'} ${channelLabel[f.channel]}`} subtitle={existing?.status === 'scheduled' ? `Scheduled for ${whenLabel(existing.scheduledFor)} Eastern` : 'Draft'} />
      <div className="compose-grid">
        <div className="stack">
          <Card title="Message">
            <div className="grid-2">
              <Field label="Type">
                <select className="input" value={f.channel} onChange={(e) => set({ channel: e.target.value as Channel, blocks: e.target.value === 'newsletter' && !f.blocks.length ? [{ id: newId(), type: 'text', text: f.body, url: '', fileId: null }] : f.blocks })}>
                  <option value="email">Email</option>
                  <option value="sms">Text alert (SMS)</option>
                  <option value="newsletter">Newsletter</option>
                </select>
              </Field>
              <Field label="Use a template">
                <select className="input" value="" onChange={(e) => { const t = db.messageTemplates.find((x) => x.id === e.target.value); if (t) set({ channel: t.channel, subject: t.subject, body: t.body, blocks: t.blocks.map((b) => ({ ...b, id: newId() })) }); }}>
                  <option value="">—</option>
                  {db.messageTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {f.channel !== 'sms' && (
              <Field label="Subject" required>
                <input className="input" value={f.subject} onChange={(e) => set({ subject: e.target.value })} />
              </Field>
            )}
            {f.channel !== 'newsletter' ? (
              <Field label={f.channel === 'sms' ? 'Text message' : 'Message'} hint={f.channel === 'sms' ? <span className={f.body.length > SMS_LIMIT ? 'bad-text' : ''}>{f.body.length}/{SMS_LIMIT} characters · sent only to guardians who agreed to texts</span> : 'Plain text — line breaks are kept.'}>
                <textarea className="input" rows={f.channel === 'sms' ? 4 : 10} value={f.body} onChange={(e) => set({ body: e.target.value })} />
              </Field>
            ) : (
              <div className="field">
                <span className="field-label">Newsletter sections</span>
                <div className="nl-editor">
                  {f.blocks.map((b, i) => (
                    <div key={b.id} className="nl-block">
                      <div className="nl-block-head">
                        <strong className="small">{blockNames[b.type]}</strong>
                        <span className="row-actions">
                          <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveBlock(b.id, -1)}>
                            <ArrowUp size={14} />
                          </button>
                          <button type="button" className="icon-btn" aria-label="Move down" disabled={i === f.blocks.length - 1} onClick={() => moveBlock(b.id, 1)}>
                            <ArrowDown size={14} />
                          </button>
                          <button type="button" className="icon-btn" aria-label="Remove section" onClick={() => set({ blocks: f.blocks.filter((x) => x.id !== b.id) })}>
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </div>
                      {(b.type === 'heading' || b.type === 'button') && <input className="input" value={b.text} onChange={(e) => setBlock(b.id, { text: e.target.value })} placeholder={b.type === 'button' ? 'Button label' : 'Heading'} aria-label="Text" />}
                      {(b.type === 'text' || b.type === 'announcement') && <textarea className="input" rows={4} value={b.text} onChange={(e) => setBlock(b.id, { text: e.target.value })} aria-label="Text" />}
                      {b.type === 'button' && <input className="input" value={b.url} onChange={(e) => setBlock(b.id, { url: e.target.value })} placeholder="https://… link" aria-label="Link" />}
                      {b.type === 'image' && (
                        <div className="inline-form">
                          {b.fileId && <StoredImage id={b.fileId} alt="" className="nl-thumb" />}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(b.id)}>
                            {b.fileId ? 'Change image' : 'Choose image'}
                          </button>
                          <input className="input" value={b.text} onChange={(e) => setBlock(b.id, { text: e.target.value })} placeholder="Caption (optional)" aria-label="Caption" />
                        </div>
                      )}
                      {(b.type === 'events' || b.type === 'dates') && <p className="small faint">Filled in automatically with {b.type === 'events' ? 'events open for sign-up' : 'studio dates in the next 30 days'} when sent.</p>}
                    </div>
                  ))}
                  <div className="nl-add">
                    {(Object.keys(blockNames) as NewsletterBlock['type'][]).map((t) => (
                      <button key={t} type="button" className="chip" onClick={() => set({ blocks: [...f.blocks, { id: newId(), type: t, text: t === 'button' ? 'Learn more' : '', url: '', fileId: null }] })}>
                        <Plus size={12} /> {blockNames[t]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {f.channel !== 'sms' && (
              <div className="field">
                <span className="field-label">Attachments</span>
                <div className="chip-row">
                  {f.attachmentIds.map((a) => (
                    <span key={a} className="attach">
                      <FileChip id={a} />
                      <button type="button" className="icon-btn" aria-label="Remove attachment" onClick={() => set({ attachmentIds: f.attachmentIds.filter((x) => x !== a) })}>
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking('attach')}>
                    <Paperclip size={14} /> Attach file
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Recipients">
            <ul className="mini-list">
              {f.recipients.map((r) => (
                <li key={r.kind}>
                  <span>
                    <strong>{recipientKinds.find((k) => k.kind === r.kind)?.label}</strong>
                    {r.ids.length > 0 && <div className="small faint">{describeRecipients(db, [r])}</div>}
                  </span>
                  <button type="button" className="icon-btn" aria-label="Remove recipients" onClick={() => set({ recipients: f.recipients.filter((x) => x.kind !== r.kind) })}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
              {!f.recipients.length && <li className="faint small">No recipients yet.</li>}
            </ul>
            <div className="field">
              <span className="field-label">Add recipients</span>
              <select className="input" value={kind} onChange={(e) => (setKind(e.target.value as RecipientSpec['kind']), setIds(new Set()))} aria-label="Recipient group">
                {recipientKinds.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            {recipientKinds.find((k) => k.kind === kind)?.needsIds && <CheckList options={optionsFor(db, kind)} selected={ids} onChange={setIds} height={160} />}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRecipients}>
              <Plus size={14} /> Add
            </button>
            <div className="reach">
              <strong>{reach}</strong> {reach === 1 ? 'person' : 'people'} will receive this in their portal inbox.
              {skipped.length > 0 && (
                <details>
                  <summary className="small">{skipped.length} skipped (no consent or no {f.channel === 'sms' ? 'mobile number' : 'email'})</summary>
                  <ul className="small">
                    {skipped.map((d, i) => (
                      <li key={i}>
                        {d.name} — {d.status === 'skipped_no_consent' ? 'has not agreed to ' + (f.channel === 'sms' ? 'texts' : 'emails') : 'no contact on file'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Card>
          <Card title="Send">
            <div className="stack-tight">
              <button className="btn btn-primary" onClick={async () => { const sid = save(); if (!sid) return; if (await confirm({ title: `Send to ${reach} ${reach === 1 ? 'person' : 'people'}?`, message: 'It will appear in their portal inbox right away. Email/SMS delivery needs a provider to be connected.', confirmLabel: 'Send now' })) if (run(() => (sendMessage(sid), true), 'Sent — delivered to portal inboxes.')) navigate(`/communications/${sid}`); }}>
                <Send size={15} /> Send now
              </button>
              <button className="btn btn-ghost" onClick={() => { const n = nyNowLocal(); setWhen(existing?.scheduledFor || `${n.slice(0, 10)}T${String(Math.min(23, Number(n.slice(11, 13)) + 1)).padStart(2, '0')}:00`); setScheduling(true); }}>
                <CalendarClock size={15} /> Schedule…
              </button>
              {existing?.status === 'scheduled' && (
                <button className="btn btn-ghost" onClick={() => run(() => unscheduleMessage(existing.id), 'Unscheduled — saved as a draft.')}>
                  Cancel schedule
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => save() && toast.success('Draft saved.')}>
                <Save size={15} /> Save draft
              </button>
              <button className="btn btn-ghost" onClick={() => setPreview(true)}>
                <Eye size={15} /> Preview
              </button>
              <button className="btn btn-ghost" onClick={() => setTplName(f.subject || '')}>
                <Copy size={15} /> Save as template
              </button>
              {savedId && (
                <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: 'Delete this draft?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) if (run(() => (deleteMessage(savedId), true), 'Deleted.')) navigate('/communications?tab=drafts'); }}>
                  <Trash2 size={15} /> Delete draft
                </button>
              )}
            </div>
          </Card>
        </div>
      </div>
      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        accept={picking === 'attach' ? undefined : 'image/*'}
        multiple={picking === 'attach'}
        category={picking === 'attach' ? 'other' : 'newsletter'}
        onPick={(picked) => {
          if (picking === 'attach') set({ attachmentIds: [...new Set([...f.attachmentIds, ...picked])] });
          else if (picking) setBlock(picking, { fileId: picked[0] ?? null });
        }}
      />
      <FormModal open={scheduling} onClose={() => setScheduling(false)} title="Schedule" size="sm" saveLabel="Schedule" onSubmit={() => { const sid = save(); if (sid && run(() => (scheduleMessage(sid, when), true), `Scheduled for ${whenLabel(when)} Eastern.`)) { setScheduling(false); navigate('/communications?tab=scheduled'); } }}>
        <Field label="Send on (New York / Eastern time)">
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <p className="small faint">Scheduled messages go out automatically the next time anyone opens the app at or after that time (this browser-only version has no background server).</p>
      </FormModal>
      <FormModal open={tplName !== null} onClose={() => setTplName(null)} title="Save as Template" size="sm" onSubmit={() => run(() => saveTemplate({ name: tplName ?? '', channel: f.channel, subject: f.subject, body: f.body, blocks: f.blocks }), 'Template saved.') && setTplName(null)}>
        <Field label="Template name" required>
          <input className="input" value={tplName ?? ''} onChange={(e) => setTplName(e.target.value)} autoFocus />
        </Field>
      </FormModal>
      {preview && (
        <FormModal open onClose={() => setPreview(false)} title="Preview" size="lg" saveLabel="Close" onSubmit={() => setPreview(false)}>
          <MessageView db={db} m={{ ...f, sentAt: new Date().toISOString(), sender: '' }} />
        </FormModal>
      )}
    </>
  );
}

const blockNames: Record<NewsletterBlock['type'], string> = { heading: 'Heading', text: 'Text', image: 'Image', button: 'Button', announcement: 'Announcement', events: 'Upcoming events', dates: 'Important dates', divider: 'Divider' };

/** Renders an email/text/newsletter the way recipients see it. */
export function MessageView({ db, m }: { db: Database; m: Pick<Message, 'channel' | 'subject' | 'body' | 'blocks' | 'attachmentIds' | 'sentAt' | 'sender'> }) {
  const today = todayStr();
  return (
    <article className={`msg-view msg-${m.channel}`}>
      {m.channel === 'sms' ? (
        <div className="sms-bubble">{m.body}</div>
      ) : (
        <>
          <header>
            <div className="small faint">
              {db.settings.studioName}
              {m.sender && ` · ${m.sender}`}
              {m.sentAt && ` · ${formatDateTime(m.sentAt)}`}
            </div>
            <h2>{m.subject}</h2>
          </header>
          {m.channel === 'email' ? (
            <div className="prewrap">{m.body}</div>
          ) : (
            m.blocks.map((b) => {
              switch (b.type) {
                case 'heading':
                  return <h3 key={b.id}>{b.text}</h3>;
                case 'text':
                  return (
                    <p key={b.id} className="prewrap">
                      {b.text}
                    </p>
                  );
                case 'announcement':
                  return (
                    <div key={b.id} className="nl-announce prewrap">
                      {b.text}
                    </div>
                  );
                case 'image':
                  return (
                    <figure key={b.id}>
                      <StoredImage id={b.fileId} alt={b.text || 'Newsletter image'} className="nl-img" />
                      {b.text && <figcaption className="small faint">{b.text}</figcaption>}
                    </figure>
                  );
                case 'button':
                  return b.url ? (
                    <a key={b.id} className="btn btn-primary" href={b.url} target="_blank" rel="noreferrer">
                      {b.text || 'Learn more'}
                    </a>
                  ) : null;
                case 'divider':
                  return <hr key={b.id} />;
                case 'events': {
                  const ev = db.signupEvents.filter((e) => e.signupsOpen && e.date >= today).sort((a, c) => a.date.localeCompare(c.date)).slice(0, 6);
                  return (
                    <div key={b.id}>
                      <h4>Upcoming events</h4>
                      <ul>
                        {ev.map((e) => (
                          <li key={e.id}>
                            <strong>{e.name}</strong> — {formatDate(e.date)}
                            {e.startTime && ` ${formatTime(e.startTime)}`}
                            {e.registrationDeadline && ` (sign up by ${formatDate(e.registrationDeadline)})`}
                          </li>
                        ))}
                        {!ev.length && <li>No events open right now.</li>}
                      </ul>
                    </div>
                  );
                }
                case 'dates': {
                  const ds = db.studioEvents.filter((e) => upcoming(e.startDate, 30, today)).sort((a, c) => a.startDate.localeCompare(c.startDate));
                  return (
                    <div key={b.id}>
                      <h4>Important dates</h4>
                      <ul>
                        {ds.map((e) => (
                          <li key={e.id}>
                            <strong>{formatDate(e.startDate)}</strong>
                            {e.endDate && e.endDate !== e.startDate && ` – ${formatDate(e.endDate)}`} · {e.title}
                          </li>
                        ))}
                        {!ds.length && <li>Nothing in the next 30 days.</li>}
                      </ul>
                    </div>
                  );
                }
              }
            })
          )}
          {m.attachmentIds.length > 0 && (
            <div className="chip-row">
              {m.attachmentIds.map((a) => (
                <FileChip key={a} id={a} />
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function MessageDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const navigate = useNavigate();
  const m = db.messages.find((x) => x.id === id);
  if (!m) return <EmptyState title="Message not found" action={<Link className="btn btn-primary" to="/communications">Communications</Link>} />;
  if (m.status !== 'sent') return <EmptyState title="Not sent yet" action={<Link className="btn btn-primary" to={`/communications/compose/${m.id}`}>Open in editor</Link>} />;
  const delivered = m.deliveries.filter((d) => d.status === 'in_app');
  return (
    <>
      <PageHeader
        back={{ to: '/communications', label: 'Communications' }}
        title={m.subject || 'Text alert'}
        subtitle={`${channelLabel[m.channel]} · sent ${formatDateTime(m.sentAt)} by ${m.sender}`}
        actions={
          <button className="btn btn-ghost" onClick={() => { const nid = run(() => duplicateMessage(m.id), 'Copied to a new draft.'); if (nid) navigate(`/communications/compose/${nid}`); }}>
            <Copy size={16} /> Duplicate
          </button>
        }
      />
      <div className="detail-grid">
        <Card title="Message">
          <MessageView db={db} m={m} />
        </Card>
        <Card title={`Delivery (${delivered.length} delivered · ${m.readBy.length} read)`}>
          <p className="small faint">{describeRecipients(db, m.recipients)}</p>
          <table className="table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Portal inbox</th>
                <th>{m.channel === 'sms' ? 'SMS' : 'Email'}</th>
              </tr>
            </thead>
            <tbody>
              {m.deliveries.map((d, i) => (
                <tr key={i}>
                  <td>
                    {d.name}
                    <div className="small faint">{d.contact}</div>
                  </td>
                  <td>{d.status === 'in_app' ? <Badge tone="ready">Delivered</Badge> : <Badge>{d.status === 'skipped_no_consent' ? 'Skipped — no consent' : 'Skipped — no contact'}</Badge>}</td>
                  <td>{d.status === 'in_app' ? <Badge tone="warn">Not sent — provider not connected</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

/* =============================================================== inbox */

export function InboxPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const [open, setOpen] = useState<ID | null>(null);
  const [tab, setTab] = useState<'messages' | 'notices'>('messages');
  const who = { familyId: v.familyId, staffId: v.staffId, admin: v.isStaffAdmin };
  const msgs = inboxFor(db, who);
  const notes = notificationsFor(db, who);
  const accountId = v.account?.id ?? 'anon';
  const unreadMsgs = msgs.filter((m) => !m.readBy.includes(accountId)).length;
  const unreadNotes = notes.filter((n) => !n.readBy.includes(accountId));
  const m = msgs.find((x) => x.id === open);
  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Messages, newsletters and reminders from the studio"
        actions={
          tab === 'notices' &&
          unreadNotes.length > 0 && (
            <button className="btn btn-ghost" onClick={() => run(() => markNotificationsRead(unreadNotes.map((n) => n.id), accountId))}>
              Mark all read
            </button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'messages', label: 'Messages', count: unreadMsgs || undefined },
          { value: 'notices', label: 'Reminders & notices', count: unreadNotes.length || undefined },
        ]}
      />
      {tab === 'messages' ? (
        <div className="inbox-grid">
          <Card>
            {!msgs.length ? (
              <p className="faint pad">No messages yet.</p>
            ) : (
              <ul className="inbox-list">
                {msgs.map((x) => (
                  <li key={x.id}>
                    <button className={`inbox-item ${open === x.id ? 'active' : ''} ${x.readBy.includes(accountId) ? '' : 'unread'}`} onClick={() => { setOpen(x.id); if (!x.readBy.includes(accountId)) run(() => markMessageRead(x.id, accountId)); }}>
                      <span className="inline-icon">{channelIcon(x.channel, 14)}</span>
                      <span className="inbox-text">
                        <strong>{x.subject || x.body.slice(0, 50)}</strong>
                        <span className="small faint">
                          {x.sender} · {formatDateTime(x.sentAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>{m ? <MessageView db={db} m={m} /> : <p className="faint pad">Choose a message to read it.</p>}</Card>
        </div>
      ) : (
        <Card>
          {!notes.length ? (
            <p className="faint pad">No reminders.</p>
          ) : (
            <ul className="notice-list">
              {notes.map((n) => (
                <li key={n.id} className={n.readBy.includes(accountId) ? '' : 'unread'}>
                  <Bell size={16} />
                  <div>
                    <strong>{n.title}</strong>
                    <div className="small">{n.body}</div>
                    <div className="small faint">{formatDateTime(n.sentAt || n.createdAt)}</div>
                  </div>
                  <span className="row-actions">
                    {n.link && (
                      <Link to={n.link} className="btn btn-ghost btn-sm" onClick={() => run(() => markNotificationsRead([n.id], accountId))}>
                        Open
                      </Link>
                    )}
                    {!n.readBy.includes(accountId) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => run(() => markNotificationsRead([n.id], accountId))}>
                        Mark read
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

/* ======================================================= notifications */

export function NotificationsPage() {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const [kind, setKind] = useState('');
  const [manual, setManual] = useState(false);
  const [f, setF] = useState({ title: '', body: '', familyIds: new Set<ID>(), staffIds: new Set<ID>(), channels: new Set<'email' | 'sms' | 'inapp'>(['inapp']), sendOn: todayStr(), all: true });
  const list = [...db.notifications].filter((n) => !kind || n.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = db.notifications.filter((n) => n.status === 'pending');
  const failures = db.notifications.filter((n) => n.failure);
  return (
    <>
      <PageHeader
        title="Notifications & Reminders"
        subtitle="Automatic reminders for tuition, policies, events, recitals, costume returns, call times and more"
        actions={
          <>
            <Link to="/settings?tab=reminders" className="btn btn-ghost">
              Reminder settings
            </Link>
            <button className="btn btn-ghost" onClick={() => { const n = run(() => runReminders()); if (n !== undefined) toast.success(n ? `${n} new reminder(s) created.` : 'Everything is up to date — no new reminders due.'); }}>
              <Zap size={16} /> Check reminders now
            </button>
            <button className="btn btn-primary" onClick={() => setManual(true)}>
              <Plus size={16} /> Send notification
            </button>
          </>
        }
      />
      <div className="stats stats-4">
        <StatCard label="Sent" value={db.notifications.filter((n) => n.status === 'sent').length} icon={<Bell size={20} />} tone="sage" />
        <StatCard label="Scheduled" value={pending.length} icon={<CalendarClock size={20} />} tone="plum" />
        <StatCard label="Email/SMS not delivered" value={failures.length} icon={<AlertTriangle size={20} />} tone="amber" hint="No provider connected" />
        <StatCard label="Reminder types on" value={db.settings.reminders.filter((r) => r.enabled).length} icon={<Zap size={20} />} tone="slate" hint={`of ${db.settings.reminders.length}`} />
      </div>
      <Card>
        <div className="toolbar">
          <select className="input input-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            <option value="manual">Manual</option>
            {Object.entries(reminderLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <DataTable
          rows={list}
          getId={(n) => n.id}
          empty={<EmptyState icon={<Bell size={28} />} title="No notifications yet" message="Reminders are checked automatically whenever the app is opened." />}
          columns={[
            { key: 't', header: 'Notification', render: (n) => <><strong>{n.title}</strong><div className="small faint">{n.body}</div></>, sortValue: (n) => n.title },
            { key: 'k', header: 'Type', render: (n) => (n.kind === 'manual' ? 'Manual' : reminderLabels[n.kind]), minor: true },
            { key: 'w', header: 'To', render: (n) => <span className="small">{[n.familyIds.length && `${n.familyIds.length} famil${n.familyIds.length === 1 ? 'y' : 'ies'}`, n.staffIds.length && `${n.staffIds.length} staff`, n.admin && 'Office'].filter(Boolean).join(' · ')}</span> },
            { key: 's', header: 'Status', render: (n) => <>{n.status === 'pending' ? <Badge tone="info">Sends {formatDate(n.sendOn)}</Badge> : <Badge tone="ready">In app {formatDateTime(n.sentAt)}</Badge>}{n.failure && <div className="small warn-text inline">{n.failure}</div>}</>, sortValue: (n) => n.sentAt || n.sendOn },
          ]}
        />
      </Card>
      <FormModal
        open={manual}
        onClose={() => setManual(false)}
        title="Send Notification"
        onSubmit={() => run(() => (sendManualNotification({ title: f.title, body: f.body, familyIds: f.all ? db.families.filter((x) => x.status === 'active').map((x) => x.id) : [...f.familyIds], staffIds: [...f.staffIds], channels: [...f.channels], sendOn: f.sendOn }), true), f.sendOn > todayStr() ? 'Scheduled.' : 'Sent to portal inboxes.') && setManual(false)}
      >
        <Field label="Title" required>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        </Field>
        <Field label="Message">
          <textarea className="input" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <label className="check-inline">
          <input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> All active families
        </label>
        {!f.all && <CheckList options={db.families.map((x) => ({ value: x.id, label: x.name }))} selected={f.familyIds} onChange={(s) => setF({ ...f, familyIds: s })} height={140} />}
        <div className="field">
          <span className="field-label">Staff</span>
          <CheckList options={db.staff.map((s) => ({ value: s.id, label: staffName(s) }))} selected={f.staffIds} onChange={(s) => setF({ ...f, staffIds: s })} height={120} />
        </div>
        <div className="grid-2">
          <Field label="Send on">
            <input className="input" type="date" value={f.sendOn} onChange={(e) => setF({ ...f, sendOn: e.target.value })} />
          </Field>
          <div className="stack-tight">
            {(['inapp', 'email', 'sms'] as const).map((c) => (
              <label key={c} className="check-inline">
                <input type="checkbox" checked={f.channels.has(c)} disabled={c === 'inapp'} onChange={(e) => { const n = new Set(f.channels); if (e.target.checked) n.add(c); else n.delete(c); setF({ ...f, channels: n }); }} /> {c === 'inapp' ? 'In the app' : c === 'email' ? 'Email (not connected)' : 'SMS (not connected)'}
              </label>
            ))}
          </div>
        </div>
      </FormModal>
    </>
  );
}

/** Unread counts for the sidebar. */
export function useUnread() {
  const db = useDb();
  const v = useViewer();
  const who = { familyId: v.familyId, staffId: v.staffId, admin: v.isStaffAdmin };
  const id = v.account?.id ?? 'anon';
  return inboxFor(db, who).filter((m) => !m.readBy.includes(id)).length + notificationsFor(db, who).filter((n) => !n.readBy.includes(id)).length;
}

export { Inbox };
