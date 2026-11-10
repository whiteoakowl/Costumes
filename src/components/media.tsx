import { useRef, useState } from 'react';
import { FileText, Film, Image as ImageIcon, Music, Paperclip, Upload } from 'lucide-react';
import { useDb } from '../data/store';
import { addMediaRecord } from '../data/mediaActions';
import { newId } from '../data/ids';
import { deleteFile, downloadStoredFile, formatBytes, MAX_FILE_BYTES, saveFile, useFileUrl } from '../lib/files';
import { useToast } from './feedback';
import { Modal } from './Modal';
import { SearchInput } from './ui';
import type { ID, MediaCategory, MediaFile, MediaLink } from '../data/types';

export const mediaCategoryLabels: Record<MediaCategory, string> = {
  costume_photo: 'Costume photos',
  class_video: 'Class videos',
  recital_photo: 'Recital photos',
  recital_music: 'Recital music',
  choreography_video: 'Choreography videos',
  policy: 'Studio policies',
  signed_agreement: 'Signed agreements',
  teacher_document: 'Teacher documents',
  performance_schedule: 'Performance schedules',
  event_flyer: 'Event flyers',
  newsletter: 'Newsletter images',
  website_image: 'Website images',
  fundraiser: 'Fundraiser materials',
  other: 'Other',
};

export function guessCategory(file: File, fallback: MediaCategory = 'other'): MediaCategory {
  if (fallback !== 'other') return fallback;
  if (file.type.startsWith('audio/')) return 'recital_music';
  if (file.type.startsWith('video/')) return 'class_video';
  if (file.type === 'application/pdf') return 'policy';
  if (file.type.startsWith('image/')) return 'website_image';
  return 'other';
}

/** Save files to the browser's file store and add them to the media library. */
export async function uploadFiles(files: FileList | File[], opts: { category?: MediaCategory; links?: MediaLink[]; visibility?: MediaFile['visibility']; accept?: string } = {}): Promise<ID[]> {
  const ids: ID[] = [];
  for (const f of Array.from(files)) {
    if (f.size > MAX_FILE_BYTES) throw new Error(`“${f.name}” is larger than ${formatBytes(MAX_FILE_BYTES)}.`);
    if (opts.accept && !opts.accept.split(',').some((a) => (a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a || f.name.toLowerCase().endsWith(a)))) throw new Error(`“${f.name}” isn't an accepted file type.`);
    const id = newId();
    await saveFile(id, f);
    try {
      addMediaRecord({ id, name: f.name, mime: f.type || 'application/octet-stream', size: f.size, category: guessCategory(f, opts.category), description: '', links: opts.links ?? [], visibility: opts.visibility ?? 'staff' });
    } catch (e) {
      await deleteFile(id);
      throw e;
    }
    ids.push(id);
  }
  return ids;
}

export function MediaIcon({ mime, size = 18 }: { mime: string; size?: number }) {
  if (mime.startsWith('image/')) return <ImageIcon size={size} />;
  if (mime.startsWith('audio/')) return <Music size={size} />;
  if (mime.startsWith('video/')) return <Film size={size} />;
  return <FileText size={size} />;
}

export function StoredImage({ id, alt, className }: { id: ID | null | undefined; alt: string; className?: string }) {
  const url = useFileUrl(id);
  if (!id) return null;
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`img-missing ${className ?? ''}`} aria-label={alt} />;
}

export function StoredMedia({ file }: { file: MediaFile }) {
  const url = useFileUrl(file.id);
  if (!url) return <p className="small faint">This file isn't stored on this device (files stay in the browser where they were uploaded).</p>;
  if (file.mime.startsWith('image/')) return <img src={url} alt={file.name} className="media-preview" />;
  if (file.mime.startsWith('audio/')) return <audio src={url} controls className="media-audio" />;
  if (file.mime.startsWith('video/')) return <video src={url} controls className="media-preview" />;
  if (file.mime === 'application/pdf') return <iframe src={url} title={file.name} className="media-pdf" />;
  return <p className="small">Preview not available — download to open.</p>;
}

export function FileChip({ id }: { id: ID }) {
  const db = useDb();
  const toast = useToast();
  const m = db.media.find((x) => x.id === id);
  if (!m) return null;
  return (
    <button type="button" className="file-chip" onClick={() => downloadStoredFile(m.id, m.name).catch((e) => toast.error(e.message))}>
      <Paperclip size={13} /> {m.name} <span className="faint">{formatBytes(m.size)}</span>
    </button>
  );
}

/** Pick files from the library (or upload new ones). */
export function MediaPicker({ open, onClose, onPick, accept, multiple, category, title = 'Choose from Media Library' }: { open: boolean; onClose: () => void; onPick: (ids: ID[]) => void; accept?: string; multiple?: boolean; category?: MediaCategory; title?: string }) {
  const db = useDb();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<ID>>(new Set());
  const [busy, setBusy] = useState(false);
  const match = (m: MediaFile) => !accept || accept.split(',').some((a) => (a.endsWith('/*') ? m.mime.startsWith(a.slice(0, -1)) : m.mime === a));
  const list = db.media.filter((m) => match(m) && (!q || m.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = (ids: ID[]) => {
    onPick(ids);
    setSel(new Set());
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={async (e) => {
            const files = e.target.files;
            if (!files?.length) return;
            setBusy(true);
            try {
              const ids = await uploadFiles(files, { category, accept });
              toast.success(`${ids.length} file(s) uploaded.`);
              done(ids);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Upload failed.');
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }} />
          <button className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={15} /> {busy ? 'Uploading…' : 'Upload new'}
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!sel.size} onClick={() => done([...sel])}>
            Use {sel.size || ''} selected
          </button>
        </>
      }
    >
      <SearchInput value={q} onChange={setQ} placeholder="Search files…" />
      {!list.length ? (
        <p className="faint pad">No matching files yet — upload one.</p>
      ) : (
        <div className="media-grid compact">
          {list.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`media-tile ${sel.has(m.id) ? 'sel' : ''}`}
              onClick={() => {
                const n = new Set(multiple ? sel : []);
                if (sel.has(m.id)) n.delete(m.id);
                else n.add(m.id);
                setSel(n);
              }}
              aria-pressed={sel.has(m.id)}
            >
              <MediaThumb file={m} />
              <span className="media-name">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function MediaThumb({ file }: { file: MediaFile }) {
  const url = useFileUrl(file.mime.startsWith('image/') ? file.id : null);
  return <span className="media-thumb">{url ? <img src={url} alt="" /> : <MediaIcon mime={file.mime} size={26} />}</span>;
}
