import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Field, SearchSelect, type Option } from './ui';
import { useRun } from './feedback';
import { useDb } from '../data/store';
import { todayStr } from '../data/ids';
import {
  progressReasonLabels,
  saveCostume,
  saveDancer,
  saveLocation,
  savePerformance,
  saveShow,
  setCostumeStatus,
  type AccessoryInput,
  type CostumeInput,
  type DancerInput,
  type LocationInput,
  type PerformanceInput,
  type ShowInput,
  saveVolunteer,
  type VolunteerInput,
} from '../data/actions';
import { accessoriesFor, sortedCategories, sortedLocations, WEEKDAYS } from '../data/selectors';
import type { AvailabilitySlot, CostumeStatus, ID, ItemKind, ProgressReason } from '../data/types';
import { itemLabels } from '../lib/labels';
import { useViewer } from '../lib/session';

interface EditorProps {
  open: boolean;
  onClose: () => void;
  id?: ID;
  onSaved?: (id: ID) => void;
}

export function FormModal({ open, onClose, title, subtitle, onSubmit, children, saveLabel = 'Save', size = 'md' }: { open: boolean; onClose: () => void; title: string; subtitle?: string; onSubmit: () => void; children: ReactNode; saveLabel?: string; size?: 'sm' | 'md' | 'lg' }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size={size}
      panel
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="editor-form" className="btn btn-primary">
            {saveLabel}
          </button>
        </>
      }
    >
      <form id="editor-form" className="form" onSubmit={submit} noValidate>
        {children}
      </form>
    </Modal>
  );
}

export function useCategoryOptions(): Option[] {
  const db = useDb();
  return sortedCategories(db).map((c) => ({ value: c.id, label: c.name }));
}

export function useLocationOptions(): Option[] {
  const db = useDb();
  return sortedLocations(db).map((l) => ({ value: l.id, label: l.name, hint: l.unitNumber || undefined }));
}

function SizeInput({ value, onChange, listId }: { value: string; onChange: (v: string) => void; listId: string }) {
  const db = useDb();
  return (
    <>
      <input className="input" list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Choose or type" />
      <datalist id={listId}>
        {db.settings.sizes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

/* --------------------------------------------------------------- dancer */

const emptyDancer: DancerInput = { firstName: '', lastName: '', birthday: '', clothingSize: '', costumeSize: '', shoeSize: '', level: '', pointe: false, notes: '' };

export function DancerForm({ open, onClose, id, onSaved, defaults }: EditorProps & { defaults?: Partial<DancerInput> }) {
  const db = useDb();
  const run = useRun();
  const viewer = useViewer();
  const [v, setV] = useState<DancerInput>(emptyDancer);
  useEffect(() => {
    if (!open) return;
    const d = id ? db.dancers.find((x) => x.id === id) : undefined;
    setV(
      d
        ? {
            firstName: d.firstName,
            lastName: d.lastName,
            birthday: d.birthday,
            clothingSize: d.clothingSize,
            costumeSize: d.costumeSize,
            shoeSize: d.shoeSize,
            level: d.level,
            pointe: d.pointe,
            notes: d.notes,
            familyId: d.familyId ?? null,
            enrollmentStatus: d.enrollmentStatus ?? 'active',
            enrollmentDate: d.enrollmentDate ?? '',
            medicalNotes: d.medicalNotes ?? '',
            allergies: d.allergies ?? '',
          }
        : { ...emptyDancer, familyId: null, enrollmentStatus: 'active', enrollmentDate: todayStr(), medicalNotes: '', allergies: '', ...defaults },
    );
  }, [open, id]);
  const familyOptions = [...db.families].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ value: f.id, label: f.name }));
  const set = <K extends keyof DancerInput>(k: K, val: DancerInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const submit = () => {
    const saved = run(() => saveDancer(v, id), id ? 'Dancer updated.' : `${v.firstName.trim() || 'Dancer'} added.`);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };
  const levels = db.settings.levels.includes(v.level) || !v.level ? db.settings.levels : [...db.settings.levels, v.level];
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Dancer' : 'Add Dancer'} onSubmit={submit}>
      <div className="grid-2">
        <Field label="First name" required>
          <input className="input" value={v.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        </Field>
        <Field label="Last name" required>
          <input className="input" value={v.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label="Birthday" hint="Age is calculated automatically">
          <input className="input" type="date" max={todayStr()} value={v.birthday} onChange={(e) => set('birthday', e.target.value)} />
        </Field>
        <Field label="Level">
          <select className="input" value={v.level} onChange={(e) => set('level', e.target.value)}>
            <option value="">— Not set —</option>
            {levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Clothing size">
          <SizeInput listId="sizes-clothing" value={v.clothingSize} onChange={(x) => set('clothingSize', x)} />
        </Field>
        <Field label="Costume size">
          <SizeInput listId="sizes-costume" value={v.costumeSize} onChange={(x) => set('costumeSize', x)} />
        </Field>
        <Field label="Shoe size">
          <input className="input" value={v.shoeSize} onChange={(e) => set('shoeSize', e.target.value)} />
        </Field>
        <Field label="Pointe">
          <div className="segmented">
            <button type="button" className={v.pointe ? 'on' : ''} onClick={() => set('pointe', true)}>
              Pointe
            </button>
            <button type="button" className={!v.pointe ? 'on' : ''} onClick={() => set('pointe', false)}>
              No Pointe
            </button>
          </div>
        </Field>
        <Field label="Family" hint="Links the dancer to their parents and account">
          <SearchSelect ariaLabel="Family" value={v.familyId ?? ''} onChange={(x) => set('familyId', x || null)} options={familyOptions} noneLabel="No family yet" />
        </Field>
        <Field label="Enrollment status">
          <select className="input" value={v.enrollmentStatus ?? 'active'} onChange={(e) => set('enrollmentStatus', e.target.value as DancerInput['enrollmentStatus'])}>
            <option value="active">Active</option>
            <option value="prospective">Prospective</option>
            <option value="inactive">Inactive</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </Field>
        <Field label="Enrollment date">
          <input className="input" type="date" value={v.enrollmentDate ?? ''} onChange={(e) => set('enrollmentDate', e.target.value)} />
        </Field>
      </div>
      {viewer.can('medical.view') ? (
        <div className="grid-2 restricted-box">
          <Field label="Allergies (restricted)">
            <input className="input" value={v.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} />
          </Field>
          <Field label="Medical notes (restricted)">
            <input className="input" value={v.medicalNotes ?? ''} onChange={(e) => set('medicalNotes', e.target.value)} />
          </Field>
        </div>
      ) : (
        <p className="small faint">Medical and allergy information is only visible to staff with permission.</p>
      )}
      <Field label="Notes">
        <textarea className="input" rows={3} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

/* -------------------------------------------------------------- costume */

type CostumeDraft = Omit<CostumeInput, 'accessories'> & { accessories: (AccessoryInput & { key: string })[] };

let accKey = 0;
const newAccessory = (name = '', quantity = 1) => ({ key: `a${++accKey}`, name, quantity });

export function CostumeForm({ open, onClose, id, onSaved, defaults }: EditorProps & { defaults?: Partial<CostumeInput> }) {
  const db = useDb();
  const run = useRun();
  const categories = useCategoryOptions();
  const locations = useLocationOptions();
  const [v, setV] = useState<CostumeDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    const c = id ? db.costumes.find((x) => x.id === id) : undefined;
    if (c) {
      setV({
        name: c.name,
        categoryId: c.categoryId,
        description: c.description,
        size: c.size,
        quantity: c.quantity,
        dateAdded: c.dateAdded,
        storageLocationId: c.storageLocationId,
        repairNotes: c.repairNotes,
        notes: c.notes,
        status: c.status,
        progressReason: c.progressReason,
        accessories: accessoriesFor(db, c.id).map((a) => ({ key: a.id, id: a.id, name: a.name, quantity: a.quantity })),
      });
    } else {
      setV({
        name: '',
        categoryId: null,
        description: '',
        size: '',
        quantity: 1,
        dateAdded: todayStr(),
        storageLocationId: null,
        repairNotes: '',
        notes: '',
        status: 'ready',
        progressReason: null,
        ...defaults,
        accessories: [],
      });
    }
  }, [open, id]);

  if (!v) return null;
  const set = <K extends keyof CostumeDraft>(k: K, val: CostumeDraft[K]) => setV((p) => (p ? { ...p, [k]: val } : p));
  const setAcc = (key: string, patch: Partial<AccessoryInput>) => set('accessories', v.accessories.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const existing = id ? db.costumes.find((x) => x.id === id) : undefined;
  const kind: ItemKind = existing ? existing.kind ?? 'costume' : v.kind ?? 'costume';
  const L = itemLabels[kind];

  const submit = () => {
    const saved = run(() => saveCostume({ ...v, kind }, id), id ? `${L.One} updated.` : `${v.name.trim() || L.One} added to inventory.`);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };

  return (
    <FormModal open={open} onClose={onClose} title={id ? `Edit ${L.One}` : `Add ${L.One}`} subtitle={existing ? `${existing.inventoryNumber} · ID is permanent` : `A ${L.one} ID is generated automatically`} onSubmit={submit} size="lg">
      <div className="grid-2">
        <Field label={`${L.One} name`} required className="span-2">
          <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Show type / category">
          <SearchSelect ariaLabel="Category" value={v.categoryId ?? ''} onChange={(x) => set('categoryId', x || null)} options={categories} noneLabel="Uncategorized" />
        </Field>
        <Field label="Storage location" hint={!db.storageLocations.length ? 'Add locations on the Storage Locations page' : undefined}>
          <SearchSelect ariaLabel="Storage location" value={v.storageLocationId ?? ''} onChange={(x) => set('storageLocationId', x || null)} options={locations} noneLabel="Unassigned" />
        </Field>
        {kind === 'costume' && (
          <Field label="Size">
            <SizeInput listId="sizes-costume-form" value={v.size} onChange={(x) => set('size', x)} />
          </Field>
        )}
        <Field label="Available quantity">
          <input className="input" type="number" min={0} step={1} value={v.quantity} onChange={(e) => set('quantity', e.target.value === '' ? 0 : Number(e.target.value))} />
        </Field>
        <Field label="Date created / added">
          <input className="input" type="date" value={v.dateAdded} onChange={(e) => set('dateAdded', e.target.value)} />
        </Field>
        <Field label="Status">
          <StatusPicker status={v.status} reason={v.progressReason} onChange={(s, r) => setV((p) => (p ? { ...p, status: s, progressReason: r } : p))} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="field">
        <span className="field-label">{L.parts} included</span>
        <div className="acc-list">
          {v.accessories.map((a) => (
            <div key={a.key} className="acc-row">
              <input className="input" placeholder={L.partExample} value={a.name} onChange={(e) => setAcc(a.key, { name: e.target.value })} aria-label="Accessory name" list={kind === 'costume' ? 'acc-suggestions' : undefined} />
              <input className="input acc-qty" type="number" min={0} value={a.quantity} onChange={(e) => setAcc(a.key, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })} aria-label="Accessory quantity" />
              <button type="button" className="icon-btn" aria-label="Remove accessory" onClick={() => set('accessories', v.accessories.filter((x) => x.key !== a.key))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <datalist id="acc-suggestions">
            {['Headpiece', 'Tights', 'Gloves', 'Shoes', 'Hair accessories', 'Jewelry', 'Skirt', 'Props', 'Tiara', 'Wings'].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('accessories', [...v.accessories, newAccessory()])}>
            <Plus size={15} /> Add {L.part}
          </button>
          <span className="field-hint">Set quantity to 0 to flag {kind === 'costume' ? 'an accessory' : 'a part'} as missing.</span>
        </div>
      </div>

      <div className="grid-2">
        <Field label="Repair notes">
          <textarea className="input" rows={2} value={v.repairNotes} onChange={(e) => set('repairNotes', e.target.value)} />
        </Field>
        <Field label="General notes">
          <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      {id && <p className="small faint">Changes to {kind === 'costume' ? 'size, ' : ''}location, category, quantity and {L.parts.toLowerCase()} are recorded automatically in the {L.one}'s notes log.</p>}
    </FormModal>
  );
}

export function StatusPicker({ status, reason, onChange }: { status: CostumeStatus; reason: ProgressReason | null; onChange: (s: CostumeStatus, r: ProgressReason | null) => void }) {
  return (
    <div className="status-picker">
      <div className="status-buttons">
        <button type="button" className={`status-btn ready ${status === 'ready' ? 'on' : ''}`} onClick={() => onChange('ready', null)}>
          READY
        </button>
        <button type="button" className={`status-btn progress ${status === 'in_progress' ? 'on' : ''}`} onClick={() => onChange('in_progress', reason ?? 'repair')}>
          IN PROGRESS
        </button>
      </div>
      {status === 'in_progress' && (
        <select className="input" value={reason ?? 'repair'} onChange={(e) => onChange('in_progress', e.target.value as ProgressReason)} aria-label="Reason">
          {Object.entries(progressReasonLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Dialog shown when staff click READY / IN PROGRESS, so a note can be recorded. */
export function StatusDialog({ open, onClose, costumeIds, initial }: { open: boolean; onClose: () => void; costumeIds: ID[]; initial: CostumeStatus }) {
  const run = useRun();
  const db = useDb();
  const [status, setStatus] = useState<CostumeStatus>(initial);
  const [reason, setReason] = useState<ProgressReason | null>(initial === 'in_progress' ? 'repair' : null);
  const [note, setNote] = useState('');
  const [volunteerId, setVolunteerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  useEffect(() => {
    if (open) {
      setStatus(initial);
      setReason(initial === 'in_progress' ? 'repair' : null);
      setNote('');
      setVolunteerId('');
      setScheduledAt('');
      setDueDate('');
    }
  }, [open, initial]);
  const volunteerOptions = [...db.volunteers]
    .sort((a, b) => a.firstName.localeCompare(b.firstName))
    .map((v) => ({ value: v.id, label: `${v.firstName} ${v.lastName}`.trim(), hint: v.skills.slice(0, 2).join(', ') || undefined }));
  const names = costumeIds.map((id) => db.costumes.find((c) => c.id === id)?.name).filter(Boolean);
  const submit = () => {
    const ok = run(
      () => {
        setCostumeStatus(costumeIds, status, reason, note, status === 'in_progress' ? { volunteerId: volunteerId || null, scheduledAt, dueDate } : {});
        return true;
      },
      `${costumeIds.length === 1 ? names[0] : `${costumeIds.length} items`} marked ${status === 'ready' ? 'READY' : 'IN PROGRESS'}.`,
    );
    if (ok) onClose();
  };
  return (
    <FormModal open={open} onClose={onClose} title="Update Status" subtitle={names.length === 1 ? names[0] : `${names.length} items selected`} onSubmit={submit} saveLabel="Update status" size="sm">
      <StatusPicker
        status={status}
        reason={reason}
        onChange={(s, r) => {
          setStatus(s);
          setReason(r);
        }}
      />
      <Field label={status === 'in_progress' ? 'What needs to be done?' : 'Completion note (optional)'} hint="Saved to the notes log with today's date">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'in_progress' ? (reason === 'cleaning' ? 'e.g. Dry clean, makeup on collar' : 'e.g. Hem is coming down on the left side') : 'e.g. Hem repaired and pressed'} />
      </Field>
      {status === 'in_progress' && (
        <>
          <Field label="Assign a volunteer" hint={!volunteerOptions.length ? 'Add volunteers on the Volunteers page' : 'Optional — shows on the Repair & Cleaning page'}>
            <SearchSelect ariaLabel="Assign a volunteer" value={volunteerId} onChange={setVolunteerId} options={volunteerOptions} noneLabel="Not assigned yet" />
          </Field>
          <div className="grid-2">
            <Field label="Scheduled date / time">
              <input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </Field>
            <Field label="Needed back by">
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        </>
      )}
      {status === 'ready' && <p className="small faint">Any open repair / cleaning work orders for {costumeIds.length === 1 ? 'this item' : 'these items'} will be marked complete.</p>}
    </FormModal>
  );
}

/* ------------------------------------------------------------- location */

const emptyLocation: LocationInput = { name: '', description: '', unitNumber: '', notes: '' };

export function LocationForm({ open, onClose, id, onSaved }: EditorProps) {
  const db = useDb();
  const run = useRun();
  const [v, setV] = useState<LocationInput>(emptyLocation);
  useEffect(() => {
    if (!open) return;
    const l = id ? db.storageLocations.find((x) => x.id === id) : undefined;
    setV(l ? { name: l.name, description: l.description, unitNumber: l.unitNumber, notes: l.notes } : emptyLocation);
  }, [open, id]);
  const set = <K extends keyof LocationInput>(k: K, val: string) => setV((p) => ({ ...p, [k]: val }));
  const submit = () => {
    const saved = run(() => saveLocation(v, id), id ? 'Location updated.' : `${v.name.trim()} added.`);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Storage Location' : 'Add Storage Location'} onSubmit={submit} size="sm">
      <Field label="Location name" required>
        <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Costume Closet A" autoFocus />
      </Field>
      <Field label="Room / rack / bin number" hint="Optional">
        <input className="input" value={v.unitNumber} onChange={(e) => set('unitNumber', e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className="input" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

/* ----------------------------------------------------------------- show */

const emptyShow: ShowInput = { name: '', categoryId: null, description: '', startDate: '', endDate: '', venue: '', notes: '', status: 'planning' };

export function ShowForm({ open, onClose, id, onSaved }: EditorProps) {
  const db = useDb();
  const run = useRun();
  const categories = useCategoryOptions();
  const [v, setV] = useState<ShowInput>(emptyShow);
  useEffect(() => {
    if (!open) return;
    const s = id ? db.shows.find((x) => x.id === id) : undefined;
    setV(s ? { name: s.name, categoryId: s.categoryId, description: s.description, startDate: s.startDate, endDate: s.endDate, venue: s.venue, notes: s.notes, status: s.status } : emptyShow);
  }, [open, id]);
  const set = <K extends keyof ShowInput>(k: K, val: ShowInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const submit = () => {
    const saved = run(() => saveShow(v, id), id ? 'Show updated.' : `${v.name.trim()} created.`);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Show' : 'Create Show'} onSubmit={submit}>
      <Field label="Show name" required>
        <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </Field>
      <div className="grid-2">
        <Field label="Show type">
          <SearchSelect ariaLabel="Show type" value={v.categoryId ?? ''} onChange={(x) => set('categoryId', x || null)} options={categories} noneLabel="Not set" />
        </Field>
        <Field label="Status">
          <select className="input" value={v.status} onChange={(e) => set('status', e.target.value as ShowInput['status'])}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <Field label="First show date">
          <input className="input" type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Last show date" hint="Leave blank for a single date">
          <input className="input" type="date" min={v.startDate || undefined} value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Location / venue">
        <input className="input" value={v.venue} onChange={(e) => set('venue', e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className="input" rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Show notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}

/* ---------------------------------------------------------- performance */

const emptyPerformance: PerformanceInput = { name: '', showId: null, date: '', time: '', venue: '', address: '', callTime: '', dressRehearsal: '', notes: '', details: '' };

export function PerformanceForm({ open, onClose, id, onSaved, defaultShowId }: EditorProps & { defaultShowId?: ID }) {
  const db = useDb();
  const run = useRun();
  const [v, setV] = useState<PerformanceInput>(emptyPerformance);
  const [copy, setCopy] = useState(true);
  useEffect(() => {
    if (!open) return;
    const p = id ? db.performances.find((x) => x.id === id) : undefined;
    if (p) {
      setV({ name: p.name, showId: p.showId, date: p.date, time: p.time, venue: p.venue, address: p.address, callTime: p.callTime, dressRehearsal: p.dressRehearsal, notes: p.notes, details: p.details });
    } else {
      const show = defaultShowId ? db.shows.find((s) => s.id === defaultShowId) : undefined;
      setV({ ...emptyPerformance, showId: show?.id ?? null, venue: show?.venue ?? '', date: show?.startDate ?? '' });
    }
    setCopy(true);
  }, [open, id]);
  const set = <K extends keyof PerformanceInput>(k: K, val: PerformanceInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const showOptions = [...db.shows].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name }));
  const showHasCasts = !!v.showId && db.casts.some((c) => c.ownerType === 'show' && c.ownerId === v.showId);
  const submit = () => {
    const saved = run(() => savePerformance(v, id, { copyFromShow: !id && copy && showHasCasts }), id ? 'Performance plan updated.' : `${v.name.trim()} created.`);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Performance Plan' : 'Create Performance Plan'} onSubmit={submit} size="lg">
      <div className="grid-2">
        <Field label="Performance name" required className="span-2">
          <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nutcracker — Saturday Evening" autoFocus />
        </Field>
        <Field label="Associated show">
          <SearchSelect
            ariaLabel="Associated show"
            value={v.showId ?? ''}
            onChange={(x) => {
              const s = db.shows.find((sh) => sh.id === x);
              setV((p) => ({ ...p, showId: x || null, venue: p.venue || s?.venue || '', date: p.date || s?.startDate || '' }));
            }}
            options={showOptions}
            noneLabel="No show"
          />
        </Field>
        <Field label="Venue">
          <input className="input" value={v.venue} onChange={(e) => set('venue', e.target.value)} />
        </Field>
        <Field label="Performance date">
          <input className="input" type="date" value={v.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Performance time">
          <input className="input" type="time" value={v.time} onChange={(e) => set('time', e.target.value)} />
        </Field>
        <Field label="Call time">
          <input className="input" type="time" value={v.callTime} onChange={(e) => set('callTime', e.target.value)} />
        </Field>
        <Field label="Dress rehearsal date / time">
          <input className="input" type="datetime-local" value={v.dressRehearsal} onChange={(e) => set('dressRehearsal', e.target.value)} />
        </Field>
        <Field label="Address" className="span-2">
          <input className="input" value={v.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>
      <Field label="Performance notes">
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <Field label="Additional details">
        <textarea className="input" rows={2} value={v.details} onChange={(e) => set('details', e.target.value)} />
      </Field>
      {!id && showHasCasts && (
        <label className="check-inline">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Start with this show's cast lists and costume assignments
        </label>
      )}
    </FormModal>
  );
}

/* ------------------------------------------------------------ volunteer */

const emptyVolunteer: VolunteerInput = { firstName: '', lastName: '', email: '', phone: '', preferredContact: '', skills: [], availability: [], notes: '' };
let slotKey = 0;
const newSlot = (): AvailabilitySlot => ({ id: `new-${++slotKey}`, type: 'date', date: '', weekday: 6, start: '', end: '', note: '' });

export function VolunteerForm({ open, onClose, id, onSaved }: EditorProps) {
  const db = useDb();
  const run = useRun();
  const [v, setV] = useState<VolunteerInput>(emptyVolunteer);
  const [customSkill, setCustomSkill] = useState('');
  useEffect(() => {
    if (!open) return;
    const x = id ? db.volunteers.find((r) => r.id === id) : undefined;
    setV(
      x
        ? { firstName: x.firstName, lastName: x.lastName, email: x.email, phone: x.phone, preferredContact: x.preferredContact, skills: [...x.skills], availability: x.availability.map((s) => ({ ...s })), notes: x.notes }
        : { ...emptyVolunteer, availability: [newSlot()] },
    );
    setCustomSkill('');
  }, [open, id]);
  const set = <K extends keyof VolunteerInput>(k: K, val: VolunteerInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const setSlot = (sid: string, patch: Partial<AvailabilitySlot>) => set('availability', v.availability.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const toggleSkill = (skill: string) => set('skills', v.skills.includes(skill) ? v.skills.filter((x) => x !== skill) : [...v.skills, skill]);
  const skillOptions = [...new Set([...db.settings.skills, ...v.skills])];
  const addCustom = () => {
    const sk = customSkill.trim();
    if (sk && !v.skills.some((x) => x.toLowerCase() === sk.toLowerCase())) set('skills', [...v.skills, sk]);
    setCustomSkill('');
  };
  const submit = () => {
    // Untouched blank rows are ignored rather than rejected.
    const availability = v.availability
      .filter((s) => !(s.type === 'date' && !s.date && !s.start && !s.end && !s.note))
      .map((s) => (s.id.startsWith('new-') ? { ...s, id: '' } : s));
    const saved = run(() => saveVolunteer({ ...v, availability }, id), id ? 'Volunteer updated.' : `${v.firstName.trim() || 'Volunteer'} added.`);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };
  return (
    <FormModal open={open} onClose={onClose} title={id ? 'Edit Volunteer' : 'Add Volunteer'} onSubmit={submit} size="lg">
      <div className="grid-2">
        <Field label="First name" required>
          <input className="input" value={v.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <input className="input" value={v.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Phone">
          <input className="input" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Preferred contact">
          <select className="input" value={v.preferredContact} onChange={(e) => set('preferredContact', e.target.value as VolunteerInput['preferredContact'])}>
            <option value="">No preference</option>
            <option value="email">Email</option>
            <option value="phone">Phone call</option>
            <option value="text">Text message</option>
          </select>
        </Field>
      </div>

      <div className="field">
        <span className="field-label">Skills</span>
        <div className="chips">
          {skillOptions.map((sk) => (
            <button key={sk} type="button" className={`chip chip-btn ${v.skills.includes(sk) ? 'on' : ''}`} aria-pressed={v.skills.includes(sk)} onClick={() => toggleSkill(sk)}>
              {sk}
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input
            className="input"
            value={customSkill}
            onChange={(e) => setCustomSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Other skill…"
            aria-label="Other skill"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addCustom}>
            <Plus size={15} /> Add skill
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Availability</span>
        <div className="slot-list">
          {v.availability.map((s, i) => (
            <div key={s.id} className="slot-row">
              <select className="input" value={s.type} onChange={(e) => setSlot(s.id, { type: e.target.value as AvailabilitySlot['type'] })} aria-label={`Availability ${i + 1} type`}>
                <option value="date">On a date</option>
                <option value="weekly">Every week</option>
              </select>
              {s.type === 'date' ? (
                <input className="input" type="date" value={s.date} onChange={(e) => setSlot(s.id, { date: e.target.value })} aria-label={`Availability ${i + 1} date`} />
              ) : (
                <select className="input" value={s.weekday} onChange={(e) => setSlot(s.id, { weekday: Number(e.target.value) })} aria-label={`Availability ${i + 1} day`}>
                  {WEEKDAYS.map((d, n) => (
                    <option key={d} value={n}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              <input className="input" type="time" value={s.start} onChange={(e) => setSlot(s.id, { start: e.target.value })} aria-label={`Availability ${i + 1} from`} />
              <span className="faint">to</span>
              <input className="input" type="time" value={s.end} onChange={(e) => setSlot(s.id, { end: e.target.value })} aria-label={`Availability ${i + 1} until`} />
              <input className="input slot-note" value={s.note} onChange={(e) => setSlot(s.id, { note: e.target.value })} placeholder="Note" aria-label={`Availability ${i + 1} note`} />
              <button type="button" className="icon-btn" aria-label={`Remove availability ${i + 1}`} onClick={() => set('availability', v.availability.filter((x) => x.id !== s.id))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('availability', [...v.availability, newSlot()])}>
            <Plus size={15} /> Add availability
          </button>
          <span className="field-hint">Leave the times blank for all day.</span>
        </div>
      </div>

      <Field label="Notes">
        <textarea className="input" rows={3} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormModal>
  );
}
