import { commit, ValidationError } from './store';
import { newId, nowIso } from './ids';
import type { Database, ID, SiteBlock, SiteBlockType, SitePage } from './types';

/*
 * Website pages are lists of blocks. Editing changes the draft; Publish
 * copies the draft to the live version that visitors see. Dynamic blocks
 * (classes, faculty, events…) read only public, non-private information.
 */

export const blockLabels: Record<SiteBlockType, string> = {
  hero: 'Hero banner',
  text: 'Text',
  image: 'Image',
  gallery: 'Photo gallery',
  video: 'Video',
  button: 'Button',
  columns: 'Columns',
  classes: 'Class list',
  faculty: 'Faculty',
  events: 'Upcoming events',
  schedule: 'Weekly schedule',
  contact: 'Contact info',
  announcements: 'Announcements',
  recitals: 'Recitals',
  teams: 'Competition teams',
  portal_login: 'Parent Portal login',
  spacer: 'Spacer',
  cta: 'Call to action',
  registration: 'Registration info',
};

export function newBlock(type: SiteBlockType, over: Partial<SiteBlock> = {}): SiteBlock {
  const defaults: Partial<Record<SiteBlockType, Partial<SiteBlock>>> = {
    hero: { heading: 'Welcome to our studio', text: 'Ballet, jazz, tap, contemporary and more for dancers of every age.', buttonLabel: 'Register now', buttonLink: '/site/registration', bg: '#f7e7e3', padding: 'lg', align: 'center' },
    text: { heading: 'About us', text: 'Tell visitors about your studio.' },
    image: { text: '' },
    gallery: { heading: 'Gallery' },
    video: { heading: 'Watch', videoUrl: '' },
    button: { buttonLabel: 'Learn more', buttonLink: '/site/classes', align: 'center' },
    columns: { heading: 'Why dance with us', columns: [{ heading: 'Caring teachers', text: 'Experienced, certified faculty.' }, { heading: 'Every level', text: 'From first steps to pre-professional.' }, { heading: 'Performances', text: 'Recitals, competitions and community shows.' }] },
    classes: { heading: 'Classes' },
    faculty: { heading: 'Our faculty' },
    events: { heading: 'Upcoming events' },
    schedule: { heading: 'Weekly schedule' },
    contact: { heading: 'Contact us' },
    announcements: { heading: 'News' },
    recitals: { heading: 'Recitals' },
    teams: { heading: 'Competition teams' },
    portal_login: { heading: 'Parent Portal', text: 'Families can see schedules, attendance, costumes, invoices and more.', buttonLabel: 'Open the Parent Portal', buttonLink: '/portals' },
    spacer: { padding: 'md' },
    cta: { heading: 'Ready to dance?', text: 'Registration for the new season is open.', buttonLabel: 'Register', buttonLink: '/site/registration', bg: '#a8676d', color: '#ffffff', align: 'center', padding: 'lg' },
    registration: { heading: 'Registration', text: 'New families can register online — the office will confirm your classes by email. Current families can register in the Parent Portal.', buttonLabel: 'Register online', buttonLink: '/register' },
  };
  return {
    id: newId(),
    type,
    heading: '',
    text: '',
    buttonLabel: '',
    buttonLink: '',
    imageId: null,
    imageIds: [],
    videoUrl: '',
    columns: [],
    bg: '',
    color: '',
    align: 'left',
    padding: 'md',
    bgImageId: null,
    ...defaults[type],
    ...over,
  };
}

function templates(): { title: string; slug: string; blocks: SiteBlockType[] }[] {
  return [
  { title: 'Home', slug: 'home', blocks: ['hero', 'columns', 'announcements', 'events', 'cta'] },
  { title: 'About Us', slug: 'about', blocks: ['text', 'image', 'columns'] },
  { title: 'Classes', slug: 'classes', blocks: ['text', 'classes'] },
  { title: 'Faculty', slug: 'faculty', blocks: ['faculty'] },
  { title: 'Registration', slug: 'registration', blocks: ['registration', 'portal_login'] },
  { title: 'Schedule', slug: 'schedule', blocks: ['schedule'] },
  { title: 'Events', slug: 'events', blocks: ['events'] },
  { title: 'Recitals', slug: 'recitals', blocks: ['recitals'] },
  { title: 'Competition Teams', slug: 'teams', blocks: ['teams'] },
  { title: 'Contact', slug: 'contact', blocks: ['contact'] },
  { title: 'Parent Portal Login', slug: 'login', blocks: ['portal_login'] },
  ];
}

function pageFrom(t: { title: string; slug: string; blocks: SiteBlockType[] }, order: number, sample: boolean): SitePage {
  const blocks = t.blocks.map((b) => newBlock(b, b === 'text' && t.slug === 'classes' ? { heading: 'Find your class', text: 'Classes for ages 3 to adult. All schedules below come straight from our class list.' } : b === 'text' && t.slug === 'about' ? { heading: 'Our story', text: 'We are a family-run dance studio dedicated to joyful, high-quality dance education.' } : {}));
  const now = nowIso();
  return { id: newId(), createdAt: now, updatedAt: now, isSample: sample || undefined, title: t.title, slug: t.slug, inNav: t.slug !== 'login', order, published: true, draft: blocks, live: blocks.map((b) => ({ ...b })), publishedAt: now, description: '' };
}

/** Give a studio the standard page templates (once). */
export function ensureWebsite(db: Database) {
  if (!Array.isArray(db.sitePages)) db.sitePages = [];
  if (db.sitePages.length) return;
  templates().forEach((t, i) => db.sitePages.push(pageFrom(t, i + 1, false)));
}

/* -------------------------------------------------------------- actions */

function find(db: Database, id: ID) {
  const p = db.sitePages.find((x) => x.id === id);
  if (!p) throw new ValidationError('This page no longer exists.');
  return p;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';

export function addPage(title: string, template?: string): ID {
  if (!title.trim()) throw new ValidationError('Give the page a title.');
  return commit((db) => {
    let slug = slugify(title);
    let i = 2;
    while (db.sitePages.some((p) => p.slug === slug)) slug = `${slugify(title)}-${i++}`;
    const t = templates().find((x) => x.slug === template) ?? { title, slug, blocks: ['text'] as SiteBlockType[] };
    const page = pageFrom({ ...t, title: title.trim(), slug }, db.sitePages.reduce((m, p) => Math.max(m, p.order), 0) + 1, false);
    page.published = false;
    page.live = [];
    page.publishedAt = '';
    db.sitePages.push(page);
    return page.id;
  });
}

export function updatePageMeta(id: ID, patch: Partial<Pick<SitePage, 'title' | 'slug' | 'inNav' | 'description'>>) {
  commit((db) => {
    const p = find(db, id);
    if (patch.slug !== undefined) {
      const s = slugify(patch.slug);
      if (db.sitePages.some((x) => x.id !== id && x.slug === s)) throw new ValidationError('Another page already uses that address.');
      patch.slug = s;
    }
    if (patch.title !== undefined && !patch.title.trim()) throw new ValidationError('The page needs a title.');
    Object.assign(p, patch, { updatedAt: nowIso() });
  });
}

export function setDraftBlocks(id: ID, blocks: SiteBlock[]) {
  commit((db) => {
    const p = find(db, id);
    p.draft = blocks;
    p.updatedAt = nowIso();
  });
}

export function publishPage(id: ID) {
  commit((db) => {
    const p = find(db, id);
    p.live = p.draft.map((b) => ({ ...b, columns: b.columns.map((c) => ({ ...c })), imageIds: [...b.imageIds] }));
    p.published = true;
    p.publishedAt = nowIso();
  });
}

export function unpublishPage(id: ID) {
  commit((db) => {
    find(db, id).published = false;
  });
}

export function discardDraft(id: ID) {
  commit((db) => {
    const p = find(db, id);
    p.draft = p.live.map((b) => ({ ...b }));
  });
}

export function deletePage(id: ID) {
  commit((db) => {
    const p = find(db, id);
    if (p.slug === 'home') throw new ValidationError('The home page can be edited or hidden from the menu, but not deleted.');
    db.sitePages = db.sitePages.filter((x) => x.id !== id);
  });
}

export function reorderPages(ids: ID[]) {
  commit((db) => {
    ids.forEach((id, i) => {
      const p = db.sitePages.find((x) => x.id === id);
      if (p) p.order = i + 1;
    });
  });
}

export function saveSiteStyle(patch: Partial<Database['settings']['site']>) {
  commit((db) => {
    db.settings.site = { ...db.settings.site, ...patch };
  });
}

export function hasUnpublished(p: SitePage) {
  return JSON.stringify(p.draft) !== JSON.stringify(p.live);
}

export const pageTemplates = () => templates().map((t) => ({ slug: t.slug, title: t.title }));
