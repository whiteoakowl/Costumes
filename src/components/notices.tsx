import { useState } from 'react';
import { Bell, Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { deleteAnnouncement, markNoticesRead, saveAnnouncement, type AnnouncementInput } from '../data/studioActions';
import { formatDateTime } from '../data/selectors';
import { Card, Field } from './ui';
import { FormModal } from './forms';
import { useRun } from './feedback';
import { classOptions } from './studioUi';
import { useViewer } from '../lib/session';
import type { Announcement, ID, Notice } from '../data/types';

/** Schedule-change / cancellation notices addressed to this teacher or family. */
export function NoticesCard({ notices, limit = 6 }: { notices: Notice[]; limit?: number }) {
  const v = useViewer();
  const run = useRun();
  const me = v.account?.id ?? '';
  const sorted = [...notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  const unread = notices.filter((n) => !n.readBy.includes(me));
  return (
    <Card
      title={`Notices${unread.length ? ` (${unread.length} new)` : ''}`}
      icon={<Bell size={18} />}
      actions={
        unread.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => run(() => markNoticesRead(unread.map((n) => n.id), me))}>
            Mark all read
          </button>
        )
      }
    >
      {!sorted.length ? (
        <p className="faint pad">No schedule changes or cancellations.</p>
      ) : (
        <ul className="notice-list">
          {sorted.map((n) => (
            <li key={n.id} className={`notice ${n.kind} ${n.readBy.includes(me) ? 'read' : 'unread'}`}>
              <div className="notice-title">{n.title}</div>
              <div className="small">{n.body}</div>
              <div className="small faint">{formatDateTime(n.createdAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function announcementsFor(list: Announcement[], audience: 'staff' | 'families', classIds: ID[] = []) {
  return list
    .filter((a) => a.audience === 'everyone' || a.audience === audience || (a.audience === 'class' && a.classId && classIds.includes(a.classId)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export function AnnouncementsCard({ items, canPost, postClassIds }: { items: Announcement[]; canPost?: boolean; postClassIds?: ID[] }) {
  const db = useDb();
  const v = useViewer();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const empty = (): AnnouncementInput => ({ title: '', body: '', audience: postClassIds ? 'class' : 'everyone', classId: postClassIds?.[0] ?? null, pinned: false });
  const [a, setA] = useState<AnnouncementInput>(empty);
  return (
    <Card
      title="Announcements"
      icon={<Megaphone size={18} />}
      actions={
        canPost && (
          <button className="btn btn-ghost btn-sm" onClick={() => (setA(empty()), setOpen(true))}>
            <Plus size={14} /> Post
          </button>
        )
      }
    >
      {!items.length ? (
        <p className="faint pad">No announcements.</p>
      ) : (
        <ul className="notice-list">
          {items.slice(0, 6).map((x) => (
            <li key={x.id} className="notice announcement">
              <div className="notice-title">
                {x.pinned && <Pin size={12} />} {x.title}
                {x.audience === 'class' && <span className="small faint"> · {db.classes.find((c) => c.id === x.classId)?.name}</span>}
                {x.audience === 'staff' && <span className="small faint"> · staff only</span>}
              </div>
              <div className="small prewrap">{x.body}</div>
              <div className="small faint">
                {x.author} · {formatDateTime(x.createdAt)}
                {(v.isStaffAdmin || x.author === v.name) && (
                  <button className="linkish danger small" onClick={() => run(() => deleteAnnouncement(x.id), 'Announcement removed.')}>
                    <Trash2 size={11} /> Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="Post Announcement" onSubmit={() => run(() => saveAnnouncement(a), 'Announcement posted.') && setOpen(false)}>
        <Field label="Title" required>
          <input className="input" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} autoFocus />
        </Field>
        <Field label="Message" required>
          <textarea className="input" rows={4} value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} />
        </Field>
        <div className="grid-2">
          <Field label="Who sees it">
            <select className="input" value={a.audience} onChange={(e) => setA({ ...a, audience: e.target.value as Announcement['audience'] })}>
              {!postClassIds && <option value="everyone">Everyone</option>}
              {!postClassIds && <option value="staff">Staff only</option>}
              {!postClassIds && <option value="families">Families</option>}
              <option value="class">One class (its teachers & families)</option>
            </select>
          </Field>
          {a.audience === 'class' && (
            <Field label="Class">
              <select className="input" value={a.classId ?? ''} onChange={(e) => setA({ ...a, classId: e.target.value || null })}>
                <option value="">Choose…</option>
                {classOptions(db, undefined, postClassIds).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.hint})
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!postClassIds && (
          <label className="check-inline">
            <input type="checkbox" checked={a.pinned} onChange={(e) => setA({ ...a, pinned: e.target.checked })} /> Pin to the top
          </label>
        )}
      </FormModal>
    </Card>
  );
}
