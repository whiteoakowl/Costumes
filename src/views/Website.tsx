import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link, useNavigate, useParams, appHref } from '../lib/router';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Globe, GripVertical, Laptop, Monitor, Palette, Plus, Smartphone, Tablet, Trash2, Undo2, Upload } from 'lucide-react';
import { useDb } from '../data/store';
import { addPage, blockLabels, deletePage, discardDraft, hasUnpublished, newBlock, pageTemplates, publishPage, reorderPages, saveSiteStyle, setDraftBlocks, unpublishPage, updatePageMeta } from '../data/website';
import { formatDate, formatDateTime, formatTime } from '../data/selectors';
import { staffName, WEEKDAY_NAMES } from '../data/studio';
import { newId, todayStr } from '../data/ids';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun } from '../components/feedback';
import { MediaPicker, StoredImage } from '../components/media';
import { currentYear, money } from '../components/studioUi';
import { embedUrl } from './Media';
import { useViewer } from '../lib/session';
import { updateSettings } from '../data/actions';
import { fileUrl } from '../lib/files';
import type { Database, ID, SiteBlock, SiteBlockType, SitePage } from '../data/types';

const FONTS = ['Cormorant Garamond', 'DM Sans', 'Georgia', 'Helvetica'];
const fontStack = (f: string) => (f === 'DM Sans' || f === 'Helvetica' ? `'${f}', system-ui, sans-serif` : `'${f}', Georgia, serif`);

/* ============================================================ page list */

export function WebsitePage() {
  const db = useDb();
  const run = useRun();
  const navigate = useNavigate();
  const [adding, setAdding] = useState<{ title: string; template: string } | null>(null);
  const [style, setStyle] = useState<Database['settings']['site'] | null>(null);
  const [picking, setPicking] = useState(false);
  const pages = [...db.sitePages].sort((a, b) => a.order - b.order);
  const ids = pages.map((p) => p.id);
  const move = (id: ID, d: number) => {
    const i = ids.indexOf(id);
    const next = [...ids];
    next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, id);
    run(() => reorderPages(next));
  };
  const s = db.settings.site;
  return (
    <>
      <PageHeader
        title="Website"
        subtitle="Build and publish your studio's public website — classes, schedules and events stay in sync automatically"
        actions={
          <>
            <a className="btn btn-ghost" href="/site" target="_blank" rel="noreferrer">
              <Globe size={16} /> View live site
            </a>
            <button className="btn btn-ghost" onClick={() => setStyle({ ...s })}>
              <Palette size={16} /> Site style
            </button>
            <button className="btn btn-primary" onClick={() => setAdding({ title: '', template: '' })}>
              <Plus size={16} /> New page
            </button>
          </>
        }
      />
      <div className="hint-bar">
        <span>
          <Globe size={14} /> The public site lives at <code>/site</code> of this app. Only public information is shown (class names, times, ages, teacher names & bios, events, recitals). Rosters, contacts, medical and billing details are never on the website.
        </span>
      </div>
      <Card title="Pages">
        <ul className="mini-list">
          {pages.map((p, i) => (
            <li key={p.id}>
              <div className="inline-form">
                <span className="move-btns">
                  <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(p.id, -1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button className="icon-btn" aria-label="Move down" disabled={i === pages.length - 1} onClick={() => move(p.id, 1)}>
                    <ArrowDown size={14} />
                  </button>
                </span>
                <div>
                  <Link to={`/website/${p.id}`} className="link-strong">
                    {p.title}
                  </Link>{' '}
                  <span className="small faint">/{p.slug}</span>
                  <div className="small faint">
                    {p.draft.length} section{p.draft.length === 1 ? '' : 's'}
                    {p.publishedAt && ` · published ${formatDateTime(p.publishedAt)}`}
                  </div>
                </div>
              </div>
              <span className="row-actions">
                {hasUnpublished(p) && <Badge tone="warn">Unpublished changes</Badge>}
                <Badge tone={p.published ? 'ready' : 'neutral'}>{p.published ? 'Live' : 'Hidden'}</Badge>
                <label className="check-inline small">
                  <input type="checkbox" checked={p.inNav} onChange={(e) => run(() => updatePageMeta(p.id, { inNav: e.target.checked }))} /> In menu
                </label>
                <Link className="btn btn-ghost btn-sm" to={`/website/${p.id}`}>
                  Edit
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {adding && (
        <FormModal open onClose={() => setAdding(null)} title="New Page" size="sm" onSubmit={() => { const id = run(() => addPage(adding.title, adding.template || undefined)); if (id) { setAdding(null); navigate(`/website/${id}`); } }}>
          <Field label="Page title" required>
            <input className="input" value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} autoFocus />
          </Field>
          <Field label="Start from a template">
            <select className="input" value={adding.template} onChange={(e) => setAdding({ ...adding, template: e.target.value, title: adding.title || pageTemplates().find((t) => t.slug === e.target.value)?.title || '' })}>
              <option value="">Blank page</option>
              {pageTemplates().map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </FormModal>
      )}
      {style && (
        <FormModal open onClose={() => setStyle(null)} title="Site Style" onSubmit={() => run(() => (saveSiteStyle(style), true), 'Site style saved.') && setStyle(null)}>
          <Field label="Tagline">
            <input className="input" value={style.tagline} onChange={(e) => setStyle({ ...style, tagline: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Heading font">
              <select className="input" value={style.font} onChange={(e) => setStyle({ ...style, font: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Logo">
              <div className="inline-form">
                {db.settings.logoFileId && <StoredImage id={db.settings.logoFileId} alt="Logo" className="logo-thumb" />}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)}>
                  <Upload size={14} /> {db.settings.logoFileId ? 'Change' : 'Choose logo'}
                </button>
              </div>
            </Field>
            {(['primary', 'accent', 'background', 'text'] as const).map((k) => (
              <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} color`}>
                <div className="inline-form">
                  <input type="color" value={style[k]} onChange={(e) => setStyle({ ...style, [k]: e.target.value })} aria-label={`${k} color`} />
                  <input className="input" value={style[k]} onChange={(e) => setStyle({ ...style, [k]: e.target.value })} />
                </div>
              </Field>
            ))}
          </div>
          <div className="style-preview" style={{ background: style.background, color: style.text }}>
            <h3 style={{ fontFamily: fontStack(style.font), color: style.text }}>{db.settings.studioName}</h3>
            <p>{style.tagline}</p>
            <span className="site-btn" style={{ background: style.primary }}>
              Register now
            </span>
          </div>
          <MediaPicker open={picking} onClose={() => setPicking(false)} accept="image/*" category="website_image" title="Choose Logo" onPick={(ids) => run(() => (saveLogo(ids[0] ?? null), true))} />
        </FormModal>
      )}
    </>
  );
}

function saveLogo(id: ID | null) {
  updateSettings({ logoFileId: id });
}

/* ============================================================== editor */

export function WebsiteEditorPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const page = db.sitePages.find((p) => p.id === id);
  const [blocks, setBlocks] = useState<SiteBlock[]>(page?.draft ?? []);
  const [sel, setSel] = useState<ID | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [meta, setMeta] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<ID | null>(null);
  const [picking, setPicking] = useState<'image' | 'gallery' | 'bg' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pageId = page?.id;
  // Load once per page; then autosave the draft shortly after each change.
  const [loaded, setLoaded] = useState<string | undefined>(pageId);
  if (pageId !== loaded) {
    setLoaded(pageId);
    setBlocks(page?.draft ?? []);
    setSel(null);
  }
  useEffect(() => {
    if (!dirty || !pageId) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setDraftBlocks(pageId, blocks);
      setDirty(false);
    }, 600);
    return () => window.clearTimeout(timer.current);
  }, [blocks, dirty, pageId]);
  if (!page) return <EmptyState title="Page not found" action={<Link to="/website" className="btn btn-primary">All pages</Link>} />;
  const update = (next: SiteBlock[]) => {
    setBlocks(next);
    setDirty(true);
  };
  const flush = () => {
    window.clearTimeout(timer.current);
    if (dirty) setDraftBlocks(page.id, blocks);
    setDirty(false);
  };
  const b = blocks.find((x) => x.id === sel);
  const setB = (patch: Partial<SiteBlock>) => b && update(blocks.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
  const add = (type: SiteBlockType) => {
    const nb = newBlock(type);
    const i = sel ? blocks.findIndex((x) => x.id === sel) + 1 : blocks.length;
    const next = [...blocks];
    next.splice(i, 0, nb);
    update(next);
    setSel(nb.id);
  };
  const move = (bid: ID, to: number) => {
    const next = blocks.filter((x) => x.id !== bid);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, blocks.find((x) => x.id === bid)!);
    update(next);
  };
  const unpublished = dirty || JSON.stringify(blocks) !== JSON.stringify(page.live);
  return (
    <>
      <PageHeader
        back={{ to: '/website', label: 'Website' }}
        title={
          <>
            {page.title} <Badge tone={page.published ? 'ready' : 'neutral'}>{page.published ? 'Live' : 'Hidden'}</Badge> {unpublished && <Badge tone="warn">Draft changes</Badge>}
          </>
        }
        subtitle={`/${page.slug} · ${dirty ? 'Saving…' : 'Draft saved'}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setMeta(true)}>
              Page settings
            </button>
            <a className="btn btn-ghost" href={`/site/${page.slug}?preview=1`} target="_blank" rel="noreferrer" onClick={flush}>
              <Eye size={16} /> Preview draft
            </a>
            {unpublished && page.live.length > 0 && (
              <button className="btn btn-ghost" onClick={async () => { if (await confirm({ title: 'Discard draft changes?', message: 'The page goes back to what is live now.', confirmLabel: 'Discard' })) { window.clearTimeout(timer.current); setDirty(false); run(() => discardDraft(page.id)); setBlocks(page.live.map((x) => ({ ...x }))); } }}>
                <Undo2 size={16} /> Discard changes
              </button>
            )}
            {page.published && (
              <button className="btn btn-ghost" onClick={() => run(() => unpublishPage(page.id), 'Page hidden from the website.')}>
                <EyeOff size={16} /> Unpublish
              </button>
            )}
            <button className="btn btn-primary" onClick={() => { flush(); run(() => publishPage(page.id), 'Published — the page is live.'); }}>
              <Globe size={16} /> Publish
            </button>
          </>
        }
      />
      <div className="builder">
        <aside className="builder-side">
          <Card title="Sections">
            <ul className="block-list">
              {blocks.map((x, i) => (
                <li
                  key={x.id}
                  draggable
                  onDragStart={(e: DragEvent) => (setDrag(x.id), (e.dataTransfer.effectAllowed = 'move'))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag && drag !== x.id) move(drag, i);
                    setDrag(null);
                  }}
                  className={`${sel === x.id ? 'active' : ''} ${drag === x.id ? 'dragging' : ''}`}
                >
                  <GripVertical size={14} className="grip" />
                  <button className="block-pick" onClick={() => setSel(x.id)}>
                    <strong>{blockLabels[x.type]}</strong>
                    <span className="small faint">{x.heading || x.text.slice(0, 30)}</span>
                  </button>
                  <span className="move-btns">
                    <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(x.id, i - 1)}>
                      <ArrowUp size={13} />
                    </button>
                    <button className="icon-btn" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(x.id, i + 1)}>
                      <ArrowDown size={13} />
                    </button>
                  </span>
                </li>
              ))}
              {!blocks.length && <li className="faint small">Empty page — add a section below.</li>}
            </ul>
            <span className="field-label">Add a section</span>
            <div className="nl-add">
              {(Object.keys(blockLabels) as SiteBlockType[]).map((t) => (
                <button key={t} className="chip" onClick={() => add(t)}>
                  <Plus size={12} /> {blockLabels[t]}
                </button>
              ))}
            </div>
          </Card>
          {b && (
            <Card
              title={blockLabels[b.type]}
              actions={
                <span className="row-actions">
                  <button className="icon-btn" aria-label="Duplicate section" onClick={() => { const c = { ...b, id: newId(), columns: b.columns.map((x) => ({ ...x })), imageIds: [...b.imageIds] }; const i = blocks.findIndex((x) => x.id === b.id); const next = [...blocks]; next.splice(i + 1, 0, c); update(next); setSel(c.id); }}>
                    <Copy size={14} />
                  </button>
                  <button className="icon-btn" aria-label="Delete section" onClick={() => { update(blocks.filter((x) => x.id !== b.id)); setSel(null); }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              }
            >
              <BlockSettings b={b} setB={setB} onPick={setPicking} />
            </Card>
          )}
        </aside>
        <section className="builder-main">
          <div className="device-bar" role="group" aria-label="Preview size">
            {(
              [
                ['desktop', Monitor],
                ['tablet', Tablet],
                ['mobile', Smartphone],
              ] as const
            ).map(([d, Icon]) => (
              <button key={d} className={`chip ${device === d ? 'active' : ''}`} onClick={() => setDevice(d)} aria-pressed={device === d}>
                <Icon size={13} /> {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div className={`device-frame ${device}`}>
            <SiteChrome db={db} current={page.slug}>
              {blocks.map((x) => (
                <div key={x.id} className={`editable ${sel === x.id ? 'selected' : ''}`} onClick={() => setSel(x.id)}>
                  <SiteBlockView db={db} b={x} />
                </div>
              ))}
            </SiteChrome>
          </div>
        </section>
      </div>
      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        accept="image/*"
        multiple={picking === 'gallery'}
        category="website_image"
        title="Choose Image"
        onPick={(ids) => {
          if (picking === 'image') setB({ imageId: ids[0] ?? null });
          else if (picking === 'bg') setB({ bgImageId: ids[0] ?? null });
          else if (picking === 'gallery' && b) setB({ imageIds: [...b.imageIds, ...ids] });
        }}
      />
      {meta && <PageMeta page={page} onClose={() => setMeta(false)} onDeleted={() => navigate('/website')} />}
    </>
  );
}

function PageMeta({ page, onClose, onDeleted }: { page: SitePage; onClose: () => void; onDeleted: () => void }) {
  const run = useRun();
  const confirm = useConfirm();
  const [f, setF] = useState({ title: page.title, slug: page.slug, inNav: page.inNav, description: page.description });
  return (
    <FormModal open onClose={onClose} title="Page Settings" size="sm" onSubmit={() => run(() => (updatePageMeta(page.id, f), true), 'Saved.') && onClose()}>
      <Field label="Title" required>
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label="Address" hint={`/site/${f.slug}`}>
        <input className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} disabled={page.slug === 'home'} />
      </Field>
      <Field label="Description (for search engines & sharing)">
        <textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <label className="check-inline">
        <input type="checkbox" checked={f.inNav} onChange={(e) => setF({ ...f, inNav: e.target.checked })} /> Show in the site menu
      </label>
      {page.slug !== 'home' && (
        <button type="button" className="btn btn-ghost danger btn-sm" onClick={async () => { if (await confirm({ title: `Delete ${page.title}?`, message: 'The page is removed from the website.', confirmLabel: 'Delete', danger: true })) if (run(() => (deletePage(page.id), true), 'Page deleted.')) onDeleted(); }}>
          <Trash2 size={14} /> Delete page
        </button>
      )}
    </FormModal>
  );
}

function BlockSettings({ b, setB, onPick }: { b: SiteBlock; setB: (p: Partial<SiteBlock>) => void; onPick: (k: 'image' | 'gallery' | 'bg') => void }) {
  const hasHeading = !['spacer', 'button', 'image'].includes(b.type);
  const hasText = ['hero', 'text', 'cta', 'registration', 'portal_login', 'image', 'classes', 'events', 'faculty', 'contact'].includes(b.type);
  const hasButton = ['hero', 'button', 'cta', 'registration', 'portal_login'].includes(b.type);
  return (
    <div className="stack-tight">
      {hasHeading && (
        <Field label="Heading">
          <input className="input" value={b.heading} onChange={(e) => setB({ heading: e.target.value })} />
        </Field>
      )}
      {hasText && (
        <Field label={b.type === 'image' ? 'Caption' : 'Text'}>
          <textarea className="input" rows={4} value={b.text} onChange={(e) => setB({ text: e.target.value })} />
        </Field>
      )}
      {hasButton && (
        <div className="grid-2">
          <Field label="Button label">
            <input className="input" value={b.buttonLabel} onChange={(e) => setB({ buttonLabel: e.target.value })} />
          </Field>
          <Field label="Button link" hint="/site/page, /register or https://…">
            <input className="input" value={b.buttonLink} onChange={(e) => setB({ buttonLink: e.target.value })} />
          </Field>
        </div>
      )}
      {b.type === 'image' && (
        <button className="btn btn-ghost btn-sm" onClick={() => onPick('image')}>
          <Upload size={14} /> {b.imageId ? 'Change image' : 'Choose image'}
        </button>
      )}
      {b.type === 'gallery' && (
        <>
          <div className="chip-row">
            {b.imageIds.map((iid) => (
              <span key={iid} className="gallery-thumb">
                <StoredImage id={iid} alt="" />
                <button className="chip-x" aria-label="Remove image" onClick={() => setB({ imageIds: b.imageIds.filter((x) => x !== iid) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onPick('gallery')}>
            <Plus size={14} /> Add photos
          </button>
        </>
      )}
      {b.type === 'video' && (
        <Field label="YouTube or Vimeo link">
          <input className="input" value={b.videoUrl} onChange={(e) => setB({ videoUrl: e.target.value })} />
        </Field>
      )}
      {b.type === 'columns' && (
        <>
          {b.columns.map((c, i) => (
            <div key={i} className="col-edit">
              <input className="input" value={c.heading} onChange={(e) => setB({ columns: b.columns.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })} aria-label="Column heading" />
              <textarea className="input" rows={2} value={c.text} onChange={(e) => setB({ columns: b.columns.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label="Column text" />
              <button className="btn btn-ghost btn-sm" onClick={() => setB({ columns: b.columns.filter((_, j) => j !== i) })}>
                Remove column
              </button>
            </div>
          ))}
          {b.columns.length < 4 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setB({ columns: [...b.columns, { heading: 'Heading', text: 'Text' }] })}>
              <Plus size={14} /> Add column
            </button>
          )}
        </>
      )}
      <div className="grid-2">
        <Field label="Alignment">
          <select className="input" value={b.align} onChange={(e) => setB({ align: e.target.value as SiteBlock['align'] })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
        <Field label="Spacing">
          <select className="input" value={b.padding} onChange={(e) => setB({ padding: e.target.value as SiteBlock['padding'] })}>
            <option value="sm">Compact</option>
            <option value="md">Normal</option>
            <option value="lg">Roomy</option>
          </select>
        </Field>
        <Field label="Background">
          <div className="inline-form">
            <input type="color" value={b.bg || '#ffffff'} onChange={(e) => setB({ bg: e.target.value })} aria-label="Background color" />
            <button className="btn btn-ghost btn-sm" onClick={() => setB({ bg: '' })}>
              None
            </button>
          </div>
        </Field>
        <Field label="Text color">
          <div className="inline-form">
            <input type="color" value={b.color || '#2f2a2c'} onChange={(e) => setB({ color: e.target.value })} aria-label="Text color" />
            <button className="btn btn-ghost btn-sm" onClick={() => setB({ color: '' })}>
              Default
            </button>
          </div>
        </Field>
      </div>
      {(b.type === 'hero' || b.type === 'cta') && (
        <div className="inline-form">
          <button className="btn btn-ghost btn-sm" onClick={() => onPick('bg')}>
            <Upload size={14} /> {b.bgImageId ? 'Change background photo' : 'Background photo'}
          </button>
          {b.bgImageId && (
            <button className="btn btn-ghost btn-sm" onClick={() => setB({ bgImageId: null })}>
              Remove photo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================= rendering */

function SiteChrome({ db, current, children }: { db: Database; current: string; children: React.ReactNode }) {
  const s = db.settings.site;
  const nav = db.sitePages.filter((p) => p.published && p.inNav).sort((a, b) => a.order - b.order);
  const vars = { '--site-primary': s.primary, '--site-accent': s.accent, '--site-bg': s.background, '--site-text': s.text, '--site-font': fontStack(s.font) } as CSSProperties;
  return (
    <div className="site" style={vars}>
      <header className="site-header">
        <a href="/site" className="site-logo">
          {db.settings.logoFileId && <StoredImage id={db.settings.logoFileId} alt="" className="site-logo-img" />}
          <span>
            <strong>{db.settings.studioName}</strong>
            {s.tagline && <em>{s.tagline}</em>}
          </span>
        </a>
        <nav className="site-nav">
          {nav.map((p) => (
            <a key={p.id} href={p.slug === 'home' ? '/site' : `/site/${p.slug}`} className={current === p.slug ? 'active' : ''}>
              {p.title}
            </a>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div>
          <strong>{db.settings.studioName}</strong>
          <div>{db.settings.studioAddress}</div>
          <div>{[db.settings.studioPhone, db.settings.studioEmail].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="small">
          {db.settings.businessHours}
          {db.settings.socialLinks && <div>{db.settings.socialLinks}</div>}
          <div>
            <a href="/portals">Parent & staff portal</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const pad = { sm: '20px', md: '44px', lg: '84px' };

function SiteBlockView({ db, b }: { db: Database; b: SiteBlock }) {
  const style: CSSProperties = { background: b.bg || undefined, color: b.color || undefined, textAlign: b.align, paddingTop: pad[b.padding], paddingBottom: pad[b.padding] };
  const bg = useBgImage(b.bgImageId);
  if (bg) Object.assign(style, { backgroundImage: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center', color: b.color || '#fff' });
  const btn = b.buttonLabel && b.buttonLink && (
    <a className="site-btn" href={appHref(b.buttonLink)} target={b.buttonLink.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {b.buttonLabel}
    </a>
  );
  const H = b.heading ? <h2>{b.heading}</h2> : null;
  const today = todayStr();
  const year = currentYear(db);
  let body: React.ReactNode = null;
  switch (b.type) {
    case 'hero':
      body = (
        <div className="site-hero">
          {b.heading && <h1>{b.heading}</h1>}
          {b.text && <p className="lead">{b.text}</p>}
          {btn}
        </div>
      );
      break;
    case 'text':
    case 'registration':
    case 'portal_login':
    case 'cta':
      body = (
        <>
          {H}
          {b.text && <p className="prewrap">{b.text}</p>}
          {btn}
        </>
      );
      break;
    case 'button':
      body = btn;
      break;
    case 'image':
      body = (
        <figure>
          {b.imageId ? <StoredImage id={b.imageId} alt={b.text || 'Studio photo'} className="site-img" /> : <div className="site-placeholder">Choose an image</div>}
          {b.text && <figcaption>{b.text}</figcaption>}
        </figure>
      );
      break;
    case 'gallery':
      body = (
        <>
          {H}
          <div className="site-gallery">
            {b.imageIds.map((i) => (
              <StoredImage key={i} id={i} alt="" className="site-img" />
            ))}
            {!b.imageIds.length && <div className="site-placeholder">Add photos to the gallery</div>}
          </div>
        </>
      );
      break;
    case 'video': {
      const e = embedUrl(b.videoUrl);
      body = (
        <>
          {H}
          {e ? <iframe className="video-embed" src={e} title={b.heading || 'Video'} allowFullScreen loading="lazy" /> : <div className="site-placeholder">Paste a YouTube or Vimeo link</div>}
        </>
      );
      break;
    }
    case 'columns':
      body = (
        <>
          {H}
          <div className="site-cols" style={{ gridTemplateColumns: `repeat(${Math.max(1, b.columns.length)}, minmax(0, 1fr))` }}>
            {b.columns.map((c, i) => (
              <div key={i}>
                <h3>{c.heading}</h3>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </>
      );
      break;
    case 'classes': {
      const classes = db.classes.filter((c) => !year || c.schoolYearId === year.id).sort((a, c) => a.dayOfWeek - c.dayOfWeek || a.startTime.localeCompare(c.startTime));
      body = (
        <>
          {H}
          {b.text && <p>{b.text}</p>}
          <div className="site-cards">
            {classes.map((c) => (
              <div key={c.id} className="site-card">
                <h3>{c.name}</h3>
                <p className="small">
                  {[c.style, c.level, c.ageMin || c.ageMax ? `Ages ${c.ageMin ?? ''}–${c.ageMax ?? ''}` : ''].filter(Boolean).join(' · ')}
                </p>
                <p>
                  {WEEKDAY_NAMES[c.dayOfWeek]} {formatTime(c.startTime)}–{formatTime(c.endTime)}
                </p>
                {c.teacherId && <p className="small">with {staffName(db.staff.find((s) => s.id === c.teacherId))}</p>}
                {c.tuition > 0 && <p className="small">{money(c.tuition)} / month</p>}
              </div>
            ))}
          </div>
        </>
      );
      break;
    }
    case 'schedule': {
      const classes = db.classes.filter((c) => !year || c.schoolYearId === year.id);
      const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => classes.some((c) => c.dayOfWeek === d));
      body = (
        <>
          {H}
          <div className="site-schedule">
            {days.map((d) => (
              <div key={d}>
                <h3>{WEEKDAY_NAMES[d]}</h3>
                <ul>
                  {classes
                    .filter((c) => c.dayOfWeek === d)
                    .sort((a, c) => a.startTime.localeCompare(c.startTime))
                    .map((c) => (
                      <li key={c.id}>
                        <strong>{formatTime(c.startTime)}</strong> {c.name}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      );
      break;
    }
    case 'faculty': {
      const staff = db.staff.filter((s) => s.status === 'active' && (s.position === 'teacher' || s.position === 'assistant'));
      body = (
        <>
          {H}
          <div className="site-cards">
            {staff.map((s) => (
              <div key={s.id} className="site-card">
                <h3>{staffName(s)}</h3>
                {s.title && <p className="small">{s.title}</p>}
                {s.styles.length > 0 && <p className="small">{s.styles.join(' · ')}</p>}
                {s.qualifications && <p>{s.qualifications}</p>}
              </div>
            ))}
          </div>
        </>
      );
      break;
    }
    case 'events': {
      const ev = db.signupEvents.filter((e) => (e.endDate || e.date) >= today).sort((a, c) => a.date.localeCompare(c.date)).slice(0, 8);
      const cal = db.studioEvents.filter((e) => e.endDate >= today && ['event', 'master_class', 'workshop', 'guest', 'important'].includes(e.type)).slice(0, 6);
      body = (
        <>
          {H}
          <ul className="site-list">
            {ev.map((e) => (
              <li key={e.id}>
                <strong>{e.name}</strong> — {formatDate(e.date)}
                {e.startTime && ` ${formatTime(e.startTime)}`}
                {e.location && ` · ${e.location}`}
                {e.description && <div className="small">{e.description}</div>}
              </li>
            ))}
            {cal.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong> — {formatDate(e.startDate)}
                {!e.allDay && e.startTime && ` ${formatTime(e.startTime)}`}
              </li>
            ))}
            {!ev.length && !cal.length && <li>Check back soon for upcoming events.</li>}
          </ul>
        </>
      );
      break;
    }
    case 'announcements': {
      const list = db.announcements.filter((a) => a.audience === 'everyone').sort((a, c) => Number(c.pinned) - Number(a.pinned) || c.createdAt.localeCompare(a.createdAt)).slice(0, 4);
      body = list.length ? (
        <>
          {H}
          <div className="site-cards">
            {list.map((a) => (
              <div key={a.id} className="site-card">
                <h3>{a.title}</h3>
                <p className="prewrap">{a.body}</p>
              </div>
            ))}
          </div>
        </>
      ) : null;
      break;
    }
    case 'recitals': {
      const list = db.recitals.filter((r) => r.status !== 'completed');
      body = (
        <>
          {H}
          {list.map((r) => (
            <div key={r.id} className="site-card">
              <h3>{r.name}</h3>
              {r.theme && <p className="small">{r.theme}</p>}
              <p>
                {formatDate(r.startDate)}
                {r.endDate && r.endDate !== r.startDate && ` – ${formatDate(r.endDate)}`} · {r.venue}
              </p>
              {r.performanceTimes && <p className="prewrap">{r.performanceTimes}</p>}
              {r.ticketInfo && <p className="prewrap small">{r.ticketInfo}</p>}
            </div>
          ))}
          {!list.length && <p>Recital details coming soon.</p>}
        </>
      );
      break;
    }
    case 'teams': {
      const list = db.teams.filter((t) => !t.archived);
      body = (
        <>
          {H}
          <div className="site-cards">
            {list.map((t) => (
              <div key={t.id} className="site-card">
                <h3>{t.name}</h3>
                <p>{t.description}</p>
              </div>
            ))}
          </div>
        </>
      );
      break;
    }
    case 'contact':
      body = (
        <>
          {H}
          {b.text && <p>{b.text}</p>}
          <div className="site-contact">
            {db.settings.studioAddress && <p>{db.settings.studioAddress}</p>}
            {db.settings.studioPhone && (
              <p>
                <a href={`tel:${db.settings.studioPhone}`}>{db.settings.studioPhone}</a>
              </p>
            )}
            {db.settings.studioEmail && (
              <p>
                <a href={`mailto:${db.settings.studioEmail}`}>{db.settings.studioEmail}</a>
              </p>
            )}
            {db.settings.businessHours && <p>{db.settings.businessHours}</p>}
          </div>
        </>
      );
      break;
    case 'spacer':
      body = null;
      break;
  }
  return (
    <section className={`site-block sb-${b.type}`} style={style}>
      <div className="site-inner">{body}</div>
    </section>
  );
}

function useBgImage(id: ID | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    fileUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** Public website (no app chrome). */
export function PublicSitePage() {
  const { slug } = useParams();
  const db = useDb();
  const v = useViewer();
  const preview = new URLSearchParams(window.location.search).get('preview') === '1' && v.can('website.edit');
  const page = db.sitePages.find((p) => p.slug === (slug ?? 'home'));
  useEffect(() => {
    document.title = page ? `${page.title === 'Home' ? '' : `${page.title} — `}${db.settings.studioName}` : db.settings.studioName;
    const meta = document.querySelector('meta[name="description"]') ?? Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'description' });
    meta.setAttribute('content', page?.description || db.settings.site.tagline);
  }, [page, db.settings.studioName, db.settings.site.tagline]);
  const blocks = page ? (preview ? page.draft : page.published ? page.live : null) : null;
  return (
    <div className="public-site">
      {preview && (
        <div className="preview-strip">
          <Laptop size={14} /> Draft preview — visitors see the published version. <Link to={`/website/${page?.id}`}>Back to editor</Link>
        </div>
      )}
      <SiteChrome db={db} current={page?.slug ?? ''}>
        {blocks ? (
          blocks.map((b) => <SiteBlockView key={b.id} db={db} b={b} />)
        ) : (
          <section className="site-block">
            <div className="site-inner">
              <h2>Page not found</h2>
              <p>
                <a href="/site">Go to the home page</a>
              </p>
            </div>
          </section>
        )}
      </SiteChrome>
    </div>
  );
}
