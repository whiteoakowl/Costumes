import { useRef, useState, type ReactNode } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Star, Trash2, User } from 'lucide-react';
import { useDb } from '../data/store';
import { addPhotoRecord, deletePhotoRecord, setPhotoCaption, setPrimaryPhoto } from '../data/actions';
import { newId } from '../data/ids';
import { deleteImage, processImageFile, saveImage, usePhotoUrl } from '../lib/images';
import { Card } from './ui';
import { Modal } from './Modal';
import { useConfirm, useRun, useToast } from './feedback';
import type { ID, Photo } from '../data/types';

type OwnerType = Photo['ownerType'];

export function photosFor(photos: Photo[], ownerType: OwnerType, ownerId: ID) {
  return photos.filter((p) => p.ownerType === ownerType && p.ownerId === ownerId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.localeCompare(b.createdAt));
}

export function primaryPhotoId(photos: Photo[], ownerType: OwnerType, ownerId: ID): ID | null {
  return photosFor(photos, ownerType, ownerId)[0]?.id ?? null;
}

function Img({ id, size, alt, className }: { id: ID; size: 'thumb' | 'full'; alt: string; className?: string }) {
  const url = usePhotoUrl(id, size);
  if (!url) return <div className={`img-loading ${className ?? ''}`} aria-label={alt} />;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

/** Small round/square thumbnail of a record's main photo, with an icon fallback. */
export function Avatar({ ownerType, ownerId, size = 36, fallback, round }: { ownerType: OwnerType; ownerId: ID; size?: number; fallback?: ReactNode; round?: boolean }) {
  const db = useDb();
  const id = primaryPhotoId(db.photos ?? [], ownerType, ownerId);
  const url = usePhotoUrl(id, 'thumb');
  return (
    <span className={`avatar ${round ? 'round' : ''}`} style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : fallback ?? <User size={size * 0.5} />}
    </span>
  );
}

export function PhotoGallery({ ownerType, ownerId, name }: { ownerType: OwnerType; ownerId: ID; name: string }) {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const photos = photosFor(db.photos ?? [], ownerType, ownerId);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      const id = newId();
      try {
        const img = await processImageFile(file);
        await saveImage(id, img.full, img.thumb);
        const ok = run(() => (addPhotoRecord({ id, ownerType, ownerId, caption: '', width: img.width, height: img.height }), true));
        if (ok) added += 1;
        else await deleteImage(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save this photo.');
        await deleteImage(id).catch(() => undefined);
      }
    }
    setBusy(false);
    if (added) toast.success(`${added} photo${added === 1 ? '' : 's'} added.`);
  };

  const current = viewing !== null ? photos[viewing] : undefined;
  const remove = async (p: Photo) => {
    if (!(await confirm({ title: 'Delete photo?', message: 'This photo will be permanently removed.', confirmLabel: 'Delete photo', danger: true }))) return;
    if (run(() => (deletePhotoRecord(p.id), true), 'Photo deleted.')) {
      await deleteImage(p.id).catch(() => undefined);
      setViewing(null);
    }
  };

  return (
    <Card
      title={`Photos (${photos.length})`}
      icon={<Camera size={18} />}
      actions={
        <>
          <button className="btn btn-ghost btn-sm camera-btn" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <Camera size={15} /> Take photo
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus size={15} /> {busy ? 'Saving…' : 'Upload photos'}
          </button>
        </>
      }
    >
      <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label="Upload photos" onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden aria-label="Take photo" onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
      {!photos.length ? (
        <button className="photo-drop" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImagePlus size={26} />
          <span>Add photos of {name}</span>
          <span className="small faint">JPEG or PNG · resized automatically</span>
        </button>
      ) : (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <button key={p.id} className="photo-tile" onClick={() => setViewing(i)} aria-label={`View photo ${i + 1}${p.caption ? `: ${p.caption}` : ''}`}>
              <Img id={p.id} size="thumb" alt={p.caption || name} />
              {p.isPrimary && (
                <span className="photo-star" title="Main photo">
                  <Star size={12} fill="currentColor" />
                </span>
              )}
              {p.caption && <span className="photo-caption">{p.caption}</span>}
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!current}
        onClose={() => setViewing(null)}
        title={name}
        subtitle={current ? `Photo ${viewing! + 1} of ${photos.length}` : ''}
        size="xl"
        footer={
          current && (
            <>
              <button className="btn btn-ghost danger" onClick={() => remove(current)}>
                <Trash2 size={15} /> Delete
              </button>
              <span className="spacer" />
              {!current.isPrimary && (
                <button className="btn btn-ghost" onClick={() => run(() => setPrimaryPhoto(current.id), 'Main photo updated.')}>
                  <Star size={15} /> Make main photo
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setViewing(null)}>
                Done
              </button>
            </>
          )
        }
      >
        {current && (
          <div className="lightbox">
            <div className="lightbox-stage">
              {photos.length > 1 && (
                <button className="icon-btn lb-nav prev" aria-label="Previous photo" onClick={() => setViewing((viewing! - 1 + photos.length) % photos.length)}>
                  <ChevronLeft size={22} />
                </button>
              )}
              <Img id={current.id} size="full" alt={current.caption || name} className="lightbox-img" />
              {photos.length > 1 && (
                <button className="icon-btn lb-nav next" aria-label="Next photo" onClick={() => setViewing((viewing! + 1) % photos.length)}>
                  <ChevronRight size={22} />
                </button>
              )}
            </div>
            <input
              key={current.id}
              className="input"
              defaultValue={current.caption}
              placeholder="Add a caption (e.g. Front view, Headpiece detail)…"
              aria-label="Photo caption"
              onBlur={(e) => e.target.value.trim() !== current.caption && run(() => setPhotoCaption(current.id, e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}
