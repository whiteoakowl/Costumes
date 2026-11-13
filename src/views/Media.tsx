import { useRef, useState } from 'react';
import { Link } from '../lib/router';
import { CalendarX2, Check, Download, Film, FolderOpen, NotebookPen, Pencil, Plus, Trash2, Upload, Video, X } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteClassNote, deleteClassVideo, deleteMediaRecord, respondScheduleRequest, saveClassNote, saveClassVideo, submitScheduleRequest, updateMedia, type ClassVideoInput } from '../data/mediaActions';
import { formatDate, formatDateTime } from '../data/selectors';
import { staffName } from '../data/studio';
import { todayStr } from '../data/ids';
import { deleteFile, downloadStoredFile, formatBytes } from '../lib/files';
import { Badge, Card, DataTable, EmptyState, Field, PageHeader, SampleTag, SearchInput, StatCard, Tabs } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { MediaPicker, MediaThumb, mediaCategoryLabels, StoredMedia, uploadFiles } from '../components/media';
import { classOptions, classWhen } from '../components/studioUi';
import { useViewer } from '../lib/session';
import type { ClassNote, ClassVideo, Database, ID, MediaCategory, MediaFile, MediaLink, ScheduleRequest } from '../data/types';

const visibilityLabels: Record<MediaFile['visibility'], string> = { management: 'Management only', staff: 'All staff', parents: 'Staff & parents', public: 'Public (website)' };
const linkTypeLabels: Record<MediaLink['type'], string> = { costume: 'Costume', class: 'Class', recitalNumber: 'Recital number', recital: 'Recital', family: 'Family', performance: 'Performance', event: 'Event', fundraiser: 'Fundraiser', policy: 'Policy', website: 'Website', staff: 'Staff member' };

function linkTargets(db: Database, type: MediaLink['type']): { value: ID; label: string }[] {
  switch (type) {
    case 'costume':
      return db.costumes.map((c) => ({ value: c.id, label: `${c.inventoryNumber} ${c.name}` }));
    case 'class':
      return db.classes.map((c) => ({ value: c.id, label: c.name }));
    case 'recitalNumber':
      return db.recitalNumbers.map((n) => ({ value: n.id, label: n.title }));
    case 'recital':
      return db.recitals.map((r) => ({ value: r.id, label: r.name }));
    case 'family':
      return db.families.map((f) => ({ value: f.id, label: f.name }));
    case 'performance':
      return db.performances.map((p) => ({ value: p.id, label: p.name }));
    case 'event':
      return db.signupEvents.map((e) => ({ value: e.id, label: e.name }));
    case 'fundraiser':
      return db.fundraisers.map((f) => ({ value: f.id, label: f.name }));
    case 'policy':
      return db.policies.map((p) => ({ value: p.id, label: p.title }));
    case 'staff':
      return db.staff.map((s) => ({ value: s.id, label: staffName(s) }));
    default:
      return [{ value: 'site', label: 'Website' }];
  }
}
const linkName = (db: Database, l: MediaLink) => linkTargets(db, l.type).find((x) => x.value === l.id)?.label ?? 'Removed';

/* ========================================================= media library */

export function MediaLibraryPage() {
  const db = useDb();
  const v = useViewer();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState<ID | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const canSee = (m: MediaFile) => v.isStaffAdmin || m.visibility !== 'management';
  const list = db.media
    .filter(canSee)
    .filter((m) => (!cat || m.category === cat) && (!type || m.mime.startsWith(type) || (type === 'doc' && !/^(image|audio|video)\//.test(m.mime))) && (!q || `${m.name} ${m.description}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ids = await uploadFiles(files, { category: (cat as MediaCategory) || undefined });
      toast.success(`${ids.length} file(s) added to the library.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };
  const total = db.media.reduce((s, m) => s + m.size, 0);
  return (
    <>
      <PageHeader
        title="Media Library"
        subtitle="Photos, music, videos, flyers, policies and documents — organized and linked to classes, costumes, recitals and more"
        actions={
          <>
            <input ref={input} type="file" hidden multiple onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
            <button className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
              <Upload size={16} /> {busy ? 'Uploading…' : 'Upload files'}
            </button>
          </>
        }
      />
      <div className="hint-bar">
        <span>
          <FolderOpen size={14} /> Files are stored in this browser ({formatBytes(total)} used). Files up to 8 MB are included in the backup download; larger videos stay on this device until cloud storage is connected.
        </span>
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search files…" />
          <select className="input input-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(mediaCategoryLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l} ({db.media.filter((m) => m.category === k).length})
              </option>
            ))}
          </select>
          <select className="input input-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="File type">
            <option value="">All types</option>
            <option value="image/">Images</option>
            <option value="audio/">Music & audio</option>
            <option value="video/">Video</option>
            <option value="doc">Documents</option>
          </select>
        </div>
        <div
          className={`dropzone ${drag ? 'over' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
        >
          {!list.length ? (
            <EmptyState icon={<FolderOpen size={28} />} title="No files yet" message="Drag files here or use Upload files." />
          ) : (
            <div className="media-grid">
              {list.map((m) => (
                <button key={m.id} className="media-tile" onClick={() => setOpen(m.id)}>
                  <MediaThumb file={m} />
                  <span className="media-name">{m.name}</span>
                  <span className="small faint">
                    {mediaCategoryLabels[m.category]} · {formatBytes(m.size)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="small faint center">Drop files anywhere in this box to upload.</p>
        </div>
      </Card>
      <MediaDetail id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function MediaDetail({ id, onClose }: { id: ID | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const m = db.media.find((x) => x.id === id);
  const [f, setF] = useState<Pick<MediaFile, 'name' | 'category' | 'description' | 'visibility' | 'links'> | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<MediaLink['type']>('class');
  const [linkId, setLinkId] = useState('');
  if ((id ?? null) !== last) {
    setLast(id ?? null);
    setF(m ? { name: m.name, category: m.category, description: m.description, visibility: m.visibility, links: [...m.links] } : null);
  }
  if (!m || !f) return null;
  return (
    <FormModal open onClose={onClose} title={m.name} subtitle={`${formatBytes(m.size)} · uploaded ${formatDateTime(m.createdAt)} by ${m.uploadedBy}`} size="lg" onSubmit={() => run(() => (updateMedia(m.id, f), true), 'Saved.') && onClose()}>
      <StoredMedia file={m} />
      <div className="inline-form">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadStoredFile(m.id, m.name).catch((e) => toast.error(e.message))}>
          <Download size={14} /> Download
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm danger"
          onClick={async () => {
            if (await confirm({ title: `Delete ${m.name}?`, message: 'It is removed from anything that uses it (newsletters, website, policies, recital music…).', confirmLabel: 'Delete', danger: true }))
              if (run(() => (deleteMediaRecord(m.id), true), 'File deleted.')) {
                deleteFile(m.id).catch(() => undefined);
                onClose();
              }
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <div className="grid-2">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as MediaCategory })}>
            {Object.entries(mediaCategoryLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who can see it">
          <select className="input" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as MediaFile['visibility'] })}>
            {Object.entries(visibilityLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="field">
        <span className="field-label">Linked to</span>
        <div className="chip-row">
          {f.links.map((l, i) => (
            <span key={i} className="chip">
              {linkTypeLabels[l.type]}: {linkName(db, l)}{' '}
              <button type="button" className="chip-x" aria-label="Remove link" onClick={() => setF({ ...f, links: f.links.filter((_, j) => j !== i) })}>
                <X size={11} />
              </button>
            </span>
          ))}
          {!f.links.length && <span className="small faint">Not linked to anything yet.</span>}
        </div>
        <div className="inline-form">
          <select className="input input-auto" value={linkType} onChange={(e) => (setLinkType(e.target.value as MediaLink['type']), setLinkId(''))} aria-label="Link type">
            {Object.entries(linkTypeLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select className="input" value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label="Link to">
            <option value="">Choose…</option>
            {linkTargets(db, linkType).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!linkId} onClick={() => (setF({ ...f, links: [...f.links.filter((l) => !(l.type === linkType && l.id === linkId)), { type: linkType, id: linkId }] }), setLinkId(''))}>
            <Plus size={14} /> Link
          </button>
        </div>
      </div>
    </FormModal>
  );
}

/* ============================================================ class videos */

const videoKinds: Record<ClassVideo['kind'], string> = { combination: 'Combination', choreography: 'Choreography', practice: 'Practice', rehearsal: 'Rehearsal', instructions: 'Instructions' };
const videoVis: Record<ClassVideo['visibility'], string> = { teacher: 'Teachers only', management: 'Management only', parents: 'Parents', dancers: 'Parents & dancers' };

export function embedUrl(url: string) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export function VideoPlayer({ v }: { v: ClassVideo }) {
  const db = useDb();
  const file = v.fileId ? db.media.find((m) => m.id === v.fileId) : undefined;
  if (file) return <StoredMedia file={file} />;
  const e = v.url ? embedUrl(v.url) : null;
  if (e) return <iframe className="video-embed" src={e} title={v.title} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />;
  return v.url ? (
    <a href={v.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
      <Film size={15} /> Open video
    </a>
  ) : null;
}

function teacherClassIds(db: Database, staffId: ID | null) {
  return db.classes.filter((c) => staffId && (c.teacherId === staffId || c.assistantId === staffId)).map((c) => c.id);
}

/** Admin + teacher: class videos and class notes. */
export function ClassVideosPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'videos' | 'notes'>('videos');
  const [classId, setClassId] = useState('');
  const [editing, setEditing] = useState<ID | 'new' | null>(null);
  const [note, setNote] = useState<{ id?: ID; classId: ID; date: string; body: string; shareWithFamilies: boolean } | null>(null);
  const [watch, setWatch] = useState<ClassVideo | null>(null);
  const mine = v.portal === 'teacher' ? teacherClassIds(db, v.staffId) : db.classes.map((c) => c.id);
  const opts = classOptions(db, undefined, mine);
  const videos = db.classVideos.filter((x) => mine.includes(x.classId) && (!classId || x.classId === classId) && (v.isStaffAdmin || x.visibility !== 'management')).sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));
  const notes = db.classNotes.filter((x) => mine.includes(x.classId) && (!classId || x.classId === classId)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader
        title="Class Videos & Notes"
        subtitle={v.portal === 'teacher' ? 'Upload combinations, choreography and practice videos for your classes, and keep class notes' : 'Videos and teaching notes for every class'}
        actions={
          tab === 'videos' ? (
            <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!mine.length}>
              <Video size={16} /> Add video
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setNote({ classId: classId || mine[0] || '', date: todayStr(), body: '', shareWithFamilies: false })} disabled={!mine.length}>
              <NotebookPen size={16} /> Add class note
            </button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'videos', label: 'Videos', count: videos.length },
          { value: 'notes', label: 'Class notes', count: notes.length },
        ]}
      />
      <div className="toolbar">
        <select className="input input-auto" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
          <option value="">All {v.portal === 'teacher' ? 'my ' : ''}classes</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} · {o.hint}
            </option>
          ))}
        </select>
      </div>
      {tab === 'videos' ? (
        !videos.length ? (
          <EmptyState icon={<Video size={28} />} title="No class videos yet" message="Upload a video file or paste a private (unlisted) YouTube or Vimeo link." />
        ) : (
          <div className="card-grid">
            {videos.map((x) => (
              <Card key={x.id}>
                <button className="video-tile" onClick={() => setWatch(x)}>
                  <Film size={28} />
                  <span>Play</span>
                </button>
                <h3 className="tile-title">
                  {x.title} <SampleTag show={x.isSample} />
                </h3>
                <p className="small faint">
                  {db.classes.find((c) => c.id === x.classId)?.name} · {videoKinds[x.kind]} · {formatDate(x.lessonDate)}
                </p>
                {x.description && <p className="small">{x.description}</p>}
                <div className="row-actions">
                  <Badge tone={x.visibility === 'parents' || x.visibility === 'dancers' ? 'ready' : 'neutral'}>{videoVis[x.visibility]}</Badge>
                  <span className="spacer" />
                  <button className="icon-btn" aria-label={`Edit ${x.title}`} onClick={() => setEditing(x.id)}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn" aria-label={`Delete ${x.title}`} onClick={async () => { if (await confirm({ title: 'Delete video?', message: x.title, confirmLabel: 'Delete', danger: true })) run(() => deleteClassVideo(x.id), 'Deleted.'); }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          {!notes.length ? (
            <p className="faint pad">No class notes yet.</p>
          ) : (
            <ul className="note-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <div className="small faint">
                    {formatDate(n.date)} · {db.classes.find((c) => c.id === n.classId)?.name} · {n.author} {n.shareWithFamilies && <Badge tone="info">Shared with families</Badge>}
                  </div>
                  <div className="prewrap">{n.body}</div>
                  <div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setNote({ id: n.id, classId: n.classId, date: n.date, body: n.body, shareWithFamilies: n.shareWithFamilies })}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Delete note?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) run(() => deleteClassNote(n.id)); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <VideoForm id={editing} classIds={mine} onClose={() => setEditing(null)} defaultClass={classId} />
      {note && (
        <FormModal open onClose={() => setNote(null)} title={note.id ? 'Edit Class Note' : 'Class Note'} onSubmit={() => run(() => saveClassNote(note, note.id), 'Note saved.') && setNote(null)}>
          <div className="grid-2">
            <Field label="Class">
              <select className="input" value={note.classId} onChange={(e) => setNote({ ...note, classId: e.target.value })}>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input className="input" type="date" value={note.date} onChange={(e) => setNote({ ...note, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Note">
            <textarea className="input" rows={5} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} autoFocus placeholder="What you worked on, what to practice, reminders…" />
          </Field>
          <label className="check-inline">
            <input type="checkbox" checked={note.shareWithFamilies} onChange={(e) => setNote({ ...note, shareWithFamilies: e.target.checked })} /> Share with families (shows in the Parent Portal)
          </label>
        </FormModal>
      )}
      {watch && (
        <FormModal open onClose={() => setWatch(null)} title={watch.title} subtitle={`${db.classes.find((c) => c.id === watch.classId)?.name} · ${formatDate(watch.lessonDate)}`} size="lg" saveLabel="Close" onSubmit={() => setWatch(null)}>
          <VideoPlayer v={watch} />
          {watch.description && <p className="prewrap">{watch.description}</p>}
          {watch.notes && <p className="small faint prewrap">{watch.notes}</p>}
        </FormModal>
      )}
    </>
  );
}

function VideoForm({ id, classIds, onClose, defaultClass }: { id: ID | 'new' | null; classIds: ID[]; onClose: () => void; defaultClass: string }) {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const blank = (): ClassVideoInput => ({ classId: defaultClass || classIds[0] || '', schoolYearId: null, teacherId: v.staffId, title: '', description: '', lessonDate: todayStr(), fileId: null, url: '', kind: 'combination', visibility: 'parents', notes: '' });
  const [f, setF] = useState<ClassVideoInput>(blank);
  const [last, setLast] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  if (id !== last) {
    setLast(id);
    if (id) {
      const x = id === 'new' ? undefined : db.classVideos.find((y) => y.id === id);
      setF(x ? { ...x } : blank());
    }
  }
  if (!id) return null;
  const set = (p: Partial<ClassVideoInput>) => setF({ ...f, ...p });
  const file = f.fileId ? db.media.find((m) => m.id === f.fileId) : undefined;
  return (
    <FormModal open onClose={onClose} title={id === 'new' ? 'Add Class Video' : 'Edit Class Video'} size="lg" onSubmit={() => run(() => saveClassVideo(f, id === 'new' ? undefined : id), 'Video saved.') && onClose()}>
      <div className="grid-2">
        <Field label="Class" required>
          <select className="input" value={f.classId} onChange={(e) => set({ classId: e.target.value })}>
            {db.classes.filter((c) => classIds.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {classWhen(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" required>
          <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Week 6 across-the-floor combo" />
        </Field>
        <Field label="Lesson date">
          <input className="input" type="date" value={f.lessonDate} onChange={(e) => set({ lessonDate: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value as ClassVideo['kind'] })}>
            {Object.entries(videoKinds).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who can watch">
          <select className="input" value={f.visibility} onChange={(e) => set({ visibility: e.target.value as ClassVideo['visibility'] })}>
            {Object.entries(videoVis).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Video</span>
        <div className="inline-form">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)}>
            <Upload size={14} /> {file ? 'Change uploaded video' : 'Upload / choose a video file'}
          </button>
          {file && (
            <span className="small">
              {file.name} ({formatBytes(file.size)}){' '}
              <button type="button" className="icon-btn" aria-label="Remove video file" onClick={() => set({ fileId: null })}>
                <X size={13} />
              </button>
            </span>
          )}
        </div>
        <input className="input" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="…or a private link: https://youtu.be/… or https://vimeo.com/…" aria-label="Video link" />
        <span className="field-hint">Use unlisted/private links — only families of dancers in this class can see videos shared with parents.</span>
      </div>
      <Field label="Description (shown with the video)">
        <textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Teacher notes">
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <MediaPicker open={picking} onClose={() => setPicking(false)} accept="video/*" category="class_video" title="Choose a Video" onPick={(ids) => set({ fileId: ids[0] ?? null })} />
    </FormModal>
  );
}

/** Parent portal: videos and shared notes for their dancers' classes. */
export function ParentVideosPage() {
  const db = useDb();
  const v = useViewer();
  const [watch, setWatch] = useState<ClassVideo | null>(null);
  if (!v.familyId) return <EmptyState title="No family linked" />;
  const dancerIds = db.dancers.filter((d) => d.familyId === v.familyId).map((d) => d.id);
  const classIds = new Set(db.enrollments.filter((e) => dancerIds.includes(e.dancerId) && e.status === 'enrolled').map((e) => e.classId));
  const videos = db.classVideos.filter((x) => classIds.has(x.classId) && (x.visibility === 'parents' || x.visibility === 'dancers')).sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));
  const notes: ClassNote[] = db.classNotes.filter((n) => classIds.has(n.classId) && n.shareWithFamilies).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader title="Class Videos & Notes" subtitle="Practice videos and notes from your dancers' teachers" />
      {!videos.length && !notes.length && <EmptyState icon={<Video size={28} />} title="Nothing shared yet" />}
      {videos.length > 0 && (
        <div className="card-grid">
          {videos.map((x) => (
            <Card key={x.id}>
              <button className="video-tile" onClick={() => setWatch(x)}>
                <Film size={28} />
                <span>Play</span>
              </button>
              <h3 className="tile-title">{x.title}</h3>
              <p className="small faint">
                {db.classes.find((c) => c.id === x.classId)?.name} · {videoKinds[x.kind]} · {formatDate(x.lessonDate)}
              </p>
              {x.description && <p className="small">{x.description}</p>}
            </Card>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <Card title="Notes from teachers" icon={<NotebookPen size={18} />}>
          <ul className="note-list">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="small faint">
                  {formatDate(n.date)} · {db.classes.find((c) => c.id === n.classId)?.name} · {n.author}
                </div>
                <div className="prewrap">{n.body}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {watch && (
        <FormModal open onClose={() => setWatch(null)} title={watch.title} size="lg" saveLabel="Close" onSubmit={() => setWatch(null)}>
          <VideoPlayer v={watch} />
          {watch.description && <p className="prewrap">{watch.description}</p>}
        </FormModal>
      )}
    </>
  );
}

/* ================================================ schedule change requests */

const reqKinds: Record<ScheduleRequest['kind'], string> = { cancel: 'Cancel a class', substitute: 'Need a substitute', move: 'Move / reschedule', time_off: 'Time off', other: 'Other' };
const reqTone = { pending: 'progress', approved: 'ready', declined: 'danger' } as const;

export function TeacherRequestsPage() {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const [f, setF] = useState<{ classId: string; date: string; kind: ScheduleRequest['kind']; details: string } | null>(null);
  if (!v.staffId) return <EmptyState title="No staff profile linked" />;
  const mine = db.scheduleRequests.filter((r) => r.staffId === v.staffId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const classes = classOptions(db, undefined, teacherClassIds(db, v.staffId));
  return (
    <>
      <PageHeader
        title="Schedule Change Requests"
        subtitle="Ask the office to cancel, move or cover a class, or request time off"
        actions={
          <button className="btn btn-primary" onClick={() => setF({ classId: '', date: todayStr(), kind: 'substitute', details: '' })}>
            <Plus size={16} /> New request
          </button>
        }
      />
      <Card>
        {!mine.length ? (
          <p className="faint pad">No requests yet.</p>
        ) : (
          <ul className="mini-list">
            {mine.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{reqKinds[r.kind]}</strong> <span className="small faint">· {formatDate(r.date)}{r.classId && ` · ${db.classes.find((c) => c.id === r.classId)?.name}`}</span>
                  <div className="small">{r.details}</div>
                  {r.response && (
                    <div className="small faint">
                      {r.respondedBy}: {r.response}
                    </div>
                  )}
                </div>
                <Badge tone={reqTone[r.status]}>{{ pending: 'Waiting', approved: 'Approved', declined: 'Declined' }[r.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {f && (
        <FormModal open onClose={() => setF(null)} title="Schedule Change Request" onSubmit={() => run(() => submitScheduleRequest({ staffId: v.staffId!, classId: f.classId || null, date: f.date, kind: f.kind, details: f.details }), 'Request sent to the office.') && setF(null)}>
          <div className="grid-2">
            <Field label="Type">
              <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ScheduleRequest['kind'] })}>
                {Object.entries(reqKinds).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Class (if it's about one class)">
            <select className="input" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
              <option value="">—</option>
              {classes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} · {o.hint}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Details" required>
            <textarea className="input" rows={3} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </Field>
        </FormModal>
      )}
    </>
  );
}

export function ScheduleRequestsPage() {
  const db = useDb();
  const run = useRun();
  const [answer, setAnswer] = useState<{ r: ScheduleRequest; approve: boolean; text: string } | null>(null);
  const pending = db.scheduleRequests.filter((r) => r.status === 'pending');
  return (
    <>
      <PageHeader title="Schedule Requests" subtitle="Teacher requests to cancel, move or cover classes and take time off" />
      <div className="stats stats-4">
        <StatCard label="Waiting" value={pending.length} icon={<CalendarX2 size={20} />} tone="amber" />
        <StatCard label="Approved" value={db.scheduleRequests.filter((r) => r.status === 'approved').length} icon={<Check size={20} />} tone="sage" />
      </div>
      <Card>
        <DataTable
          rows={[...db.scheduleRequests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt.localeCompare(a.createdAt))}
          getId={(r) => r.id}
          empty={<EmptyState icon={<CalendarX2 size={28} />} title="No requests" />}
          columns={[
            { key: 't', header: 'Teacher', render: (r) => <Link to={`/staff/${r.staffId}`}>{staffName(db.staff.find((s) => s.id === r.staffId))}</Link> },
            { key: 'k', header: 'Request', render: (r) => <><strong>{reqKinds[r.kind]}</strong> <SampleTag show={r.isSample} /><div className="small">{r.details}</div></> },
            { key: 'd', header: 'Date', render: (r) => <>{formatDate(r.date)}{r.classId && <div className="small faint">{db.classes.find((c) => c.id === r.classId)?.name}</div>}</>, sortValue: (r) => r.date },
            { key: 's', header: 'Status', render: (r) => <><Badge tone={reqTone[r.status]}>{{ pending: 'Waiting', approved: 'Approved', declined: 'Declined' }[r.status]}</Badge>{r.response && <div className="small faint">{r.response}</div>}</> },
            {
              key: 'a',
              header: '',
              render: (r) =>
                r.status === 'pending' && (
                  <span className="row-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => setAnswer({ r, approve: true, text: '' })}>
                      Approve
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAnswer({ r, approve: false, text: '' })}>
                      Decline
                    </button>
                  </span>
                ),
            },
          ]}
        />
      </Card>
      {answer && (
        <FormModal open onClose={() => setAnswer(null)} title={answer.approve ? 'Approve Request' : 'Decline Request'} size="sm" saveLabel={answer.approve ? 'Approve' : 'Decline'} onSubmit={() => run(() => (respondScheduleRequest(answer.r.id, answer.approve, answer.text), true), answer.approve ? (answer.r.kind === 'cancel' && answer.r.classId ? 'Approved — the class date was cancelled and families were notified.' : 'Approved.') : 'Declined.') && setAnswer(null)}>
          {answer.approve && answer.r.kind === 'cancel' && answer.r.classId && <p className="small">Approving cancels {db.classes.find((c) => c.id === answer.r.classId)?.name} on {formatDate(answer.r.date)} and notifies families.</p>}
          {answer.approve && answer.r.kind === 'substitute' && <p className="small">After approving, assign the substitute from the class calendar.</p>}
          <Field label={answer.approve ? 'Reply (optional)' : 'Reason'} required={!answer.approve}>
            <textarea className="input" rows={3} value={answer.text} onChange={(e) => setAnswer({ ...answer, text: e.target.value })} autoFocus />
          </Field>
        </FormModal>
      )}
    </>
  );
}
