import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Database as DbIcon, Download, Plus, RotateCcw, Sparkles, Tags, Trash2, Upload, X } from 'lucide-react';
import { useDb } from '../data/store';
import { countSampleRecords, eraseAllData, loadSampleData, removeSampleData, restoreBackup, updateSettings } from '../data/actions';
import { Card, Field, PageHeader } from '../components/ui';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { CategoryManager } from './Costumes';
import { clearImages, importImages } from '../lib/images';
import { exportAllPerformanceAssignments, exportBackup, exportCostumeInventory, exportDancers, exportVolunteers } from '../lib/export';
import { sortedCategories } from '../data/selectors';

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  const [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (!v || items.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setValue('');
  };
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="list-editor">
      <span className="field-label">{label}</span>
      <ul>
        {items.map((it, i) => (
          <li key={it}>
            <span>{it}</span>
            <div className="row-actions">
              <button className="icon-btn" aria-label={`Move ${it} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn" aria-label={`Move ${it} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={14} />
              </button>
              <button className="icon-btn danger" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}>
                <X size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="inline-form">
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={placeholder} aria-label={`Add to ${label}`} />
        <button className="btn btn-ghost" onClick={add}>
          <Plus size={15} /> Add
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(db.settings.studioName);
  const [prefix, setPrefix] = useState(db.settings.costumeIdPrefix);
  const [propPrefix, setPropPrefix] = useState(db.settings.propIdPrefix);
  const [catsOpen, setCatsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [backingUp, setBackingUp] = useState(false);
  const samples = countSampleRecords(db);

  const onRestore = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error('That file could not be read. Choose a .json backup made by this app.');
      return;
    }
    if (await confirm({ title: 'Restore from backup?', message: 'This replaces ALL current data with the contents of the backup file. Consider downloading a backup of the current data first.', confirmLabel: 'Restore backup', danger: true }))
    {
      if (!run(() => (restoreBackup(parsed), true))) return;
      try {
        await clearImages();
        const n = await importImages((parsed as { images?: Record<string, { full: string; thumb: string }> }).images);
        toast.success(`Backup restored${n ? ` with ${n} photo${n === 1 ? '' : 's'}` : ''}.`);
      } catch {
        toast.error('Data restored, but the photos could not be restored in this browser.');
      }
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Studio preferences, dropdown options and data management" />
      <div className="settings-grid">
        <Card title="Studio">
          <Field label="Studio name" hint="Shown in the sidebar under the app name">
            <div className="inline-form">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary" disabled={name === db.settings.studioName} onClick={() => run(() => updateSettings({ studioName: name.trim() }), 'Studio name saved.')}>
                Save
              </button>
            </div>
          </Field>
          <Field label="Costume ID prefix" hint={`New costumes are numbered like ${prefix || 'COS'}-0001. Existing IDs never change.`}>
            <div className="inline-form">
              <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={8} />
              <button className="btn btn-primary" disabled={prefix === db.settings.costumeIdPrefix} onClick={() => run(() => updateSettings({ costumeIdPrefix: prefix.trim() }), 'Prefix saved.')}>
                Save
              </button>
            </div>
          </Field>
          <Field label="Prop ID prefix" hint={`New props are numbered like ${propPrefix || 'PROP'}-0001.`}>
            <div className="inline-form">
              <input className="input" value={propPrefix} onChange={(e) => setPropPrefix(e.target.value.toUpperCase())} maxLength={8} />
              <button className="btn btn-primary" disabled={propPrefix === db.settings.propIdPrefix} onClick={() => run(() => updateSettings({ propIdPrefix: propPrefix.trim() }), 'Prefix saved.')}>
                Save
              </button>
            </div>
          </Field>
        </Card>

        <Card title="Categories / Show Types" icon={<Tags size={18} />} actions={<button className="btn btn-primary btn-sm" onClick={() => setCatsOpen(true)}>Manage</button>}>
          <div className="chips">
            {sortedCategories(db).map((c) => (
              <span key={c.id} className="chip">
                {c.name}
              </span>
            ))}
            {!db.categories.length && <span className="faint">No categories yet.</span>}
          </div>
        </Card>

        <Card title="Dancer Levels">
          <ListEditor label="Levels (in order)" items={db.settings.levels} onChange={(levels) => run(() => updateSettings({ levels }))} placeholder="e.g. Level 6" />
        </Card>

        <Card title="Size Options">
          <ListEditor label="Sizes suggested in size fields" items={db.settings.sizes} onChange={(sizes) => run(() => updateSettings({ sizes }))} placeholder="e.g. Adult XXL" />
          <p className="small faint">Size fields also accept any custom value.</p>
        </Card>

        <Card title="Volunteer Skills">
          <ListEditor label="Skills offered when adding a volunteer" items={db.settings.skills} onChange={(skills) => run(() => updateSettings({ skills }))} placeholder="e.g. Lighting" />
        </Card>

        <Card title="Export" icon={<Download size={18} />}>
          <p className="small faint">CSV files open directly in Excel, Numbers and Google Sheets.</p>
          <div className="btn-col">
            <button className="btn btn-ghost" onClick={() => exportCostumeInventory(db)}>
              <Download size={16} /> Costume inventory (CSV)
            </button>
            <button className="btn btn-ghost" onClick={() => exportCostumeInventory(db, undefined, 'prop')}>
              <Download size={16} /> Prop inventory (CSV)
            </button>
            <button className="btn btn-ghost" onClick={() => exportAllPerformanceAssignments(db)}>
              <Download size={16} /> Performance assignments (CSV)
            </button>
            <button className="btn btn-ghost" onClick={() => exportDancers(db)}>
              <Download size={16} /> Dancers (CSV)
            </button>
            <button className="btn btn-ghost" onClick={() => exportVolunteers(db)}>
              <Download size={16} /> Volunteers (CSV)
            </button>
          </div>
        </Card>

        <Card title="Backup & Restore" icon={<DbIcon size={18} />}>
          <p className="small">
            Your data and photos are saved automatically in this browser on this device. Download a backup regularly (it includes photos), and use it to move your data to another computer.
          </p>
          <div className="btn-col">
            <button
              className="btn btn-primary"
              disabled={backingUp}
              onClick={async () => {
                setBackingUp(true);
                try {
                  const n = await exportBackup(db);
                  toast.success(`Backup downloaded${n ? ` (includes ${n} photo${n === 1 ? '' : 's'})` : ''}.`);
                } catch {
                  toast.error('The backup could not be created.');
                } finally {
                  setBackingUp(false);
                }
              }}
            >
              <Download size={16} /> Download full backup (.json)
            </button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Restore from backup…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onRestore(f);
              }}
            />
          </div>
        </Card>

        <Card title="Sample Data" icon={<Sparkles size={18} />}>
          {samples > 0 ? (
            <>
              <p className="small">
                {samples} sample records are loaded and marked with a <span className="sample-tag"><Sparkles size={11} /> Sample</span> tag. Removing them keeps everything you've entered yourself.
              </p>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (await confirm({ title: 'Remove sample data?', message: 'All sample dancers, costumes, props, volunteers, shows, locations and performance plans will be deleted. Your own records are kept.', confirmLabel: 'Remove sample data', danger: true }))
                    run(() => removeSampleData(), 'Sample data removed.');
                }}
              >
                <Trash2 size={16} /> Remove sample data
              </button>
            </>
          ) : (
            <>
              <p className="small">No sample data is loaded.</p>
              <button className="btn btn-ghost" onClick={() => run(() => loadSampleData(), 'Sample data added.')}>
                <RotateCcw size={16} /> Load sample data
              </button>
            </>
          )}
        </Card>

        <Card title="Danger Zone" className="danger-card">
          <p className="small">Permanently erase every dancer, costume, prop, volunteer, show, location and performance plan in this browser. Settings are kept.</p>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (await confirm({ title: 'Erase ALL data?', message: 'This cannot be undone. Download a backup first if you might need this data again.', confirmLabel: 'Erase everything', danger: true }))
                if (run(() => (eraseAllData(), true), 'All data erased.')) clearImages().catch(() => undefined);
            }}
          >
            <Trash2 size={16} /> Erase all data
          </button>
        </Card>
      </div>
      <CategoryManager open={catsOpen} onClose={() => setCatsOpen(false)} />
    </>
  );
}
