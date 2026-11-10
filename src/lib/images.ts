import { useEffect, useState } from 'react';

/**
 * Photo storage. Image bytes are kept in the browser's IndexedDB (which can
 * hold far more than localStorage); the photo's details live in the main
 * database (`db.photos`). Uploads are resized before saving: a large view
 * (max 1600 px) and a thumbnail (max 360 px), both JPEG.
 */

const DB_NAME = 'studio-costume-manager-images';
const STORE = 'images';

interface ImageRecord {
  id: string;
  full: Blob;
  thumb: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser cannot store photos.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open photo storage.'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error ?? new Error('Photo storage error.'));
        t.onabort = () => reject(t.error ?? new Error('Photo storage is full or unavailable.'));
      }),
  );
}

export function saveImage(id: string, full: Blob, thumb: Blob) {
  return tx('readwrite', (s) => s.put({ id, full, thumb } satisfies ImageRecord));
}

export async function getImage(id: string): Promise<ImageRecord | undefined> {
  return (await tx<ImageRecord>('readonly', (s) => s.get(id))) ?? undefined;
}

export function deleteImage(id: string) {
  urlCache.forEach((url, key) => {
    if (key.startsWith(id + ':')) {
      URL.revokeObjectURL(url);
      urlCache.delete(key);
    }
  });
  return tx('readwrite', (s) => s.delete(id));
}

export async function allImageIds(): Promise<string[]> {
  return ((await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? []).map(String);
}

export async function clearImages() {
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
  await tx('readwrite', (s) => s.clear());
}

/** Remove stored images that no photo record points to any more. */
export async function collectGarbage(validIds: Set<string>) {
  try {
    for (const id of await allImageIds()) if (!validIds.has(id)) await deleteImage(id);
  } catch {
    /* photo storage unavailable: nothing to clean */
  }
}

/* ------------------------------------------------------------ resizing */

async function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function resize(src: { source: CanvasImageSource; width: number; height: number }, max: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs become white, not black, as JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src.source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve({ blob: b, width, height }) : reject(new Error('Could not process this image.'))), 'image/jpeg', quality),
  );
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function processImageFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” is not an image.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`“${file.name}” is larger than 25 MB.`);
  let src;
  try {
    src = await loadBitmap(file);
  } catch {
    throw new Error(`“${file.name}” could not be read. Try a JPEG or PNG photo.`);
  }
  const full = await resize(src, 1600, 0.85);
  const thumb = await resize(src, 360, 0.8);
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}

/* ------------------------------------------------------- display (URLs) */

const urlCache = new Map<string, string>();

export async function imageUrl(id: string, size: 'thumb' | 'full'): Promise<string | null> {
  const key = `${id}:${size}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const rec = await getImage(id).catch(() => undefined);
  if (!rec) return null;
  const url = URL.createObjectURL(size === 'full' ? rec.full : rec.thumb);
  urlCache.set(key, url);
  return url;
}

/** React hook: object URL for a stored photo (null while loading or if missing). */
export function usePhotoUrl(id: string | null | undefined, size: 'thumb' | 'full' = 'thumb') {
  const [url, setUrl] = useState<string | null>(id ? urlCache.get(`${id}:${size}`) ?? null : null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    imageUrl(id, size).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id, size]);
  return url;
}

/* ------------------------------------------------------- backup / restore */

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function exportImages(ids: string[]): Promise<Record<string, { full: string; thumb: string }>> {
  const out: Record<string, { full: string; thumb: string }> = {};
  for (const id of ids) {
    const rec = await getImage(id).catch(() => undefined);
    if (rec) out[id] = { full: await blobToDataUrl(rec.full), thumb: await blobToDataUrl(rec.thumb) };
  }
  return out;
}

export async function importImages(map: Record<string, { full: string; thumb: string }> | undefined) {
  if (!map || typeof map !== 'object') return 0;
  let n = 0;
  for (const [id, v] of Object.entries(map)) {
    if (!v?.full?.startsWith('data:image/') || !v?.thumb?.startsWith('data:image/')) continue;
    await saveImage(id, await dataUrlToBlob(v.full), await dataUrlToBlob(v.thumb));
    n += 1;
  }
  return n;
}
