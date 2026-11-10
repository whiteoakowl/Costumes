import { commit, ValidationError } from './store';
import { newId, nowIso, todayStr } from './ids';
import { actorName } from '../lib/session';
import { logActivity, cancelSession } from './studioActions';
import { fmtDate } from './time';
import type { ClassNote, ClassVideo, ID, MediaFile, ScheduleRequest } from './types';

const stamp = () => {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t };
};

function find<T extends { id: ID }>(list: T[], id: ID, label: string): T {
  const r = list.find((x) => x.id === id);
  if (!r) throw new ValidationError(`${label} no longer exists.`);
  return r;
}

/* ---------------------------------------------------------------- media */

export function addMediaRecord(input: Omit<MediaFile, 'createdAt' | 'updatedAt' | 'isSample' | 'uploadedBy'>) {
  commit((db) => {
    db.media.push({ ...input, createdAt: nowIso(), updatedAt: nowIso(), uploadedBy: actorName() });
    logActivity(db, 'File uploaded', `${input.name} (${input.category.replace(/_/g, ' ')})`, '/media');
  });
}

export function updateMedia(id: ID, patch: Partial<Pick<MediaFile, 'name' | 'category' | 'description' | 'links' | 'visibility'>>) {
  commit((db) => {
    const m = find(db.media, id, 'This file');
    Object.assign(m, patch, { updatedAt: nowIso() });
  });
}

/** Remove a file record (the caller deletes the stored bytes). Detaches it from anything using it. */
export function deleteMediaRecord(id: ID) {
  commit((db) => {
    const m = find(db.media, id, 'This file');
    db.media = db.media.filter((x) => x.id !== id);
    for (const v of db.classVideos) if (v.fileId === id) v.fileId = null;
    for (const n of db.recitalNumbers) if (n.songFileId === id) n.songFileId = null;
    for (const p of db.policies) for (const ver of p.versions) if (ver.fileId === id) ver.fileId = null;
    for (const m2 of db.messages) m2.attachmentIds = m2.attachmentIds.filter((x) => x !== id);
    for (const pg of db.sitePages) for (const blocks of [pg.draft, pg.live]) for (const b of blocks) {
      if (b.imageId === id) b.imageId = null;
      if (b.bgImageId === id) b.bgImageId = null;
      b.imageIds = b.imageIds.filter((x) => x !== id);
    }
    if (db.settings.logoFileId === id) db.settings.logoFileId = null;
    logActivity(db, 'File deleted', m.name, '/media');
  });
}

/* ---------------------------------------------------------- class videos */

export type ClassVideoInput = Omit<ClassVideo, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>;

export function saveClassVideo(input: ClassVideoInput, id?: ID): ID {
  if (!input.title.trim()) throw new ValidationError('Give the video a title.');
  if (!input.fileId && !input.url.trim()) throw new ValidationError('Upload a video file or paste a private video link.');
  if (input.url.trim() && !/^https:\/\//i.test(input.url.trim())) throw new ValidationError('Video links must start with https://');
  return commit((db) => {
    const c = find(db.classes, input.classId, 'The class');
    const clean = { ...input, title: input.title.trim(), url: input.url.trim(), schoolYearId: input.schoolYearId ?? c.schoolYearId };
    if (id) {
      Object.assign(find(db.classVideos, id, 'This video'), clean, { updatedAt: nowIso() });
      return id;
    }
    const rec: ClassVideo = { ...clean, ...stamp() };
    db.classVideos.push(rec);
    if (input.fileId) {
      const m = db.media.find((x) => x.id === input.fileId);
      if (m && !m.links.some((l) => l.type === 'class' && l.id === c.id)) m.links.push({ type: 'class', id: c.id });
    }
    logActivity(db, 'Class video added', `${c.name}: ${clean.title}`, `/videos`);
    return rec.id;
  });
}

export function deleteClassVideo(id: ID) {
  commit((db) => {
    db.classVideos = db.classVideos.filter((v) => v.id !== id);
  });
}

/* ----------------------------------------------------------- class notes */

export function saveClassNote(input: Pick<ClassNote, 'classId' | 'date' | 'body' | 'shareWithFamilies'>, id?: ID): ID {
  if (!input.body.trim()) throw new ValidationError('Write a note.');
  return commit((db) => {
    find(db.classes, input.classId, 'The class');
    if (id) {
      Object.assign(find(db.classNotes, id, 'This note'), { ...input, body: input.body.trim() }, { updatedAt: nowIso() });
      return id;
    }
    const rec: ClassNote = { ...stamp(), ...input, date: input.date || todayStr(), body: input.body.trim(), author: actorName() };
    db.classNotes.push(rec);
    return rec.id;
  });
}

export function deleteClassNote(id: ID) {
  commit((db) => {
    db.classNotes = db.classNotes.filter((n) => n.id !== id);
  });
}

/* ------------------------------------------------- schedule change requests */

export function submitScheduleRequest(input: Pick<ScheduleRequest, 'staffId' | 'classId' | 'date' | 'kind' | 'details'>): ID {
  if (!input.details.trim()) throw new ValidationError('Describe what you need.');
  if (!input.date) throw new ValidationError('Choose the date.');
  return commit((db) => {
    find(db.staff, input.staffId, 'Your staff profile');
    const rec: ScheduleRequest = { ...stamp(), ...input, details: input.details.trim(), status: 'pending', response: '', respondedBy: '' };
    db.scheduleRequests.push(rec);
    logActivity(db, 'Schedule change requested', `${db.staff.find((s) => s.id === input.staffId)?.firstName}: ${input.kind.replace('_', ' ')} ${fmtDate(input.date)}`, '/requests');
    return rec.id;
  });
}

/** Approve or decline. Approving a cancellation also cancels that class date (and notifies families). */
export function respondScheduleRequest(id: ID, approve: boolean, response: string) {
  let cancel: { classId: ID; date: string; reason: string } | null = null;
  commit((db) => {
    const r = find(db.scheduleRequests, id, 'This request');
    if (r.status !== 'pending') throw new ValidationError('Already answered.');
    if (!approve && !response.trim()) throw new ValidationError('Add a short reply explaining the decision.');
    r.status = approve ? 'approved' : 'declined';
    r.response = response.trim();
    r.respondedBy = actorName();
    if (approve && r.kind === 'cancel' && r.classId) cancel = { classId: r.classId, date: r.date, reason: r.details };
    logActivity(db, approve ? 'Schedule request approved' : 'Schedule request declined', `${db.staff.find((s) => s.id === r.staffId)?.firstName}: ${r.details}`, '/requests');
  });
  if (cancel) {
    const c = cancel as { classId: ID; date: string; reason: string };
    cancelSession(c.classId, c.date, c.reason);
  }
}
