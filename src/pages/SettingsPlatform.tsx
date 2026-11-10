import { useState } from 'react';
import { Bell, Building2, CreditCard, GraduationCap, Upload } from 'lucide-react';
import { useDb } from '../data/store';
import { renameOption, updateSettings, type OptionList } from '../data/actions';
import { reminderLabels } from '../data/commsActions';
import { Card, Field } from '../components/ui';
import { useRun, useToast } from '../components/feedback';
import { MediaPicker, StoredImage } from '../components/media';
import { ListEditor } from './Settings';
import type { PaymentMethod, ReminderRule, Settings } from '../data/types';

const methodNames: Record<PaymentMethod, string> = { card: 'Card', cash: 'Cash', check: 'Check', ach: 'Bank transfer', other: 'Other' };

function useDraft<K extends keyof Settings>(keys: K[]) {
  const db = useDb();
  const pick = () => Object.fromEntries(keys.map((k) => [k, db.settings[k]])) as Pick<Settings, K>;
  const [f, setF] = useState<Pick<Settings, K>>(pick);
  const changed = keys.some((k) => JSON.stringify(f[k]) !== JSON.stringify(db.settings[k]));
  return { f, setF, changed, reset: () => setF(pick()) };
}

export function PlatformSettings({ tab }: { tab: 'studio' | 'billing' | 'programs' | 'reminders' }) {
  if (tab === 'studio') return <StudioInfo />;
  if (tab === 'billing') return <BillingSettings />;
  if (tab === 'programs') return <ProgramSettings />;
  return <ReminderSettings />;
}

function SaveBar({ changed, onSave, onReset }: { changed: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="save-bar">
      <button className="btn btn-ghost" disabled={!changed} onClick={onReset}>
        Undo changes
      </button>
      <button className="btn btn-primary" disabled={!changed} onClick={onSave}>
        Save
      </button>
    </div>
  );
}

function StudioInfo() {
  const db = useDb();
  const run = useRun();
  const [picking, setPicking] = useState(false);
  const { f, setF, changed, reset } = useDraft(['studioName', 'studioPhone', 'studioEmail', 'studioAddress', 'studioWebsite', 'socialLinks', 'businessHours']);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  return (
    <div className="settings-grid">
      <Card title="Studio information" icon={<Building2 size={18} />} className="span-2">
        <p className="small faint">Used on invoices, receipts, printed reports, newsletters and the website.</p>
        <div className="grid-2">
          <Field label="Studio name" required>
            <input className="input" value={f.studioName} onChange={(e) => set({ studioName: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" type="tel" value={f.studioPhone} onChange={(e) => set({ studioPhone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={f.studioEmail} onChange={(e) => set({ studioEmail: e.target.value })} />
          </Field>
          <Field label="Website">
            <input className="input" value={f.studioWebsite} onChange={(e) => set({ studioWebsite: e.target.value })} placeholder="https://" />
          </Field>
          <Field label="Address" className="span-2">
            <input className="input" value={f.studioAddress} onChange={(e) => set({ studioAddress: e.target.value })} />
          </Field>
          <Field label="Business hours">
            <input className="input" value={f.businessHours} onChange={(e) => set({ businessHours: e.target.value })} />
          </Field>
          <Field label="Social media">
            <input className="input" value={f.socialLinks} onChange={(e) => set({ socialLinks: e.target.value })} placeholder="Instagram @yourstudio · facebook.com/yourstudio" />
          </Field>
        </div>
        <SaveBar changed={changed} onReset={reset} onSave={() => run(() => updateSettings({ ...f, studioName: f.studioName.trim() }), 'Studio information saved.')} />
      </Card>
      <Card title="Logo">
        <div className="logo-box">{db.settings.logoFileId ? <StoredImage id={db.settings.logoFileId} alt="Studio logo" className="logo-large" /> : <span className="faint small">No logo yet</span>}</div>
        <div className="inline-form">
          <button className="btn btn-ghost btn-sm" onClick={() => setPicking(true)}>
            <Upload size={14} /> {db.settings.logoFileId ? 'Change logo' : 'Upload logo'}
          </button>
          {db.settings.logoFileId && (
            <button className="btn btn-ghost btn-sm" onClick={() => run(() => updateSettings({ logoFileId: null }), 'Logo removed.')}>
              Remove
            </button>
          )}
        </div>
        <p className="small faint">Shown on the website header.</p>
        <MediaPicker open={picking} onClose={() => setPicking(false)} accept="image/*" category="website_image" title="Choose Logo" onPick={(ids) => run(() => updateSettings({ logoFileId: ids[0] ?? null }), 'Logo saved.')} />
      </Card>
      <Card title="Time zone & formats">
        <p className="small">
          All dates are shown as <strong>MM/DD/YYYY</strong> and all times in <strong>Eastern Time (New York)</strong>, including daylight saving time.
        </p>
      </Card>
    </div>
  );
}

function BillingSettings() {
  const run = useRun();
  const { f, setF, changed, reset } = useDraft(['defaultTaxRate', 'tuitionDueDay', 'lateFee', 'lateFeeGraceDays', 'siblingDiscountPercent', 'registrationFee', 'allowPartialPayments', 'refundPolicy', 'paymentMethods']);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const db = useDb();
  const toast = useToast();
  const rename = (list: OptionList, a: string, b: string) => {
    const n = run(() => renameOption(list, a, b));
    if (n !== undefined) toast.success(`Renamed${n ? ` — ${n} invoice line(s) updated` : ''}.`);
  };
  return (
    <div className="settings-grid">
      <Card title="Billing rules" icon={<CreditCard size={18} />} className="span-2">
        <div className="grid-3">
          <Field label="Tuition due day of month">
            <input className="input" type="number" min={1} max={28} value={f.tuitionDueDay} onChange={(e) => set({ tuitionDueDay: Number(e.target.value) })} />
          </Field>
          <Field label="Default tax rate (%)">
            <input className="input" type="number" min={0} step="0.01" value={f.defaultTaxRate} onChange={(e) => set({ defaultTaxRate: Number(e.target.value) })} />
          </Field>
          <Field label="Sibling discount (%)" hint="Off additional dancers in a family">
            <input className="input" type="number" min={0} max={100} value={f.siblingDiscountPercent} onChange={(e) => set({ siblingDiscountPercent: Number(e.target.value) })} />
          </Field>
          <Field label="Late fee ($)">
            <input className="input" type="number" min={0} step="0.01" value={f.lateFee} onChange={(e) => set({ lateFee: Number(e.target.value) })} />
          </Field>
          <Field label="Grace period (days)">
            <input className="input" type="number" min={0} value={f.lateFeeGraceDays} onChange={(e) => set({ lateFeeGraceDays: Number(e.target.value) })} />
          </Field>
          <Field label="Registration fee ($)" hint="Per new dancer">
            <input className="input" type="number" min={0} step="0.01" value={f.registrationFee} onChange={(e) => set({ registrationFee: Number(e.target.value) })} />
          </Field>
        </div>
        <label className="check-inline">
          <input type="checkbox" checked={f.allowPartialPayments} onChange={(e) => set({ allowPartialPayments: e.target.checked })} /> Parents can pay part of an invoice online
        </label>
        <div className="field">
          <span className="field-label">Payment methods recorded at the front desk</span>
          <div className="chip-row">
            {(Object.keys(methodNames) as PaymentMethod[]).map((m) => (
              <label key={m} className="check-inline">
                <input type="checkbox" checked={f.paymentMethods.includes(m)} onChange={(e) => set({ paymentMethods: e.target.checked ? [...f.paymentMethods, m] : f.paymentMethods.filter((x) => x !== m) })} /> {methodNames[m]}
              </label>
            ))}
          </div>
        </div>
        <Field label="Refund policy (shown to families)">
          <textarea className="input" rows={3} value={f.refundPolicy} onChange={(e) => set({ refundPolicy: e.target.value })} />
        </Field>
        <SaveBar changed={changed} onReset={reset} onSave={() => run(() => updateSettings(f), 'Billing settings saved.')} />
      </Card>
      <Card title="Invoice categories">
        <ListEditor label="Categories for invoice lines" items={db.settings.invoiceCategories} onChange={(invoiceCategories) => run(() => updateSettings({ invoiceCategories }))} placeholder="e.g. Shoes" onRename={(a, b) => rename('invoiceCategories', a, b)} />
      </Card>
      <Card title="Online payments">
        <p className="small">
          <strong>Test mode.</strong> Online payments are simulated: no card is charged and no card numbers are collected or stored. Connecting a real processor (such as Stripe) requires a secure server, which this browser-only version doesn't have yet.
        </p>
      </Card>
    </div>
  );
}

function ProgramSettings() {
  const db = useDb();
  const run = useRun();
  const toast = useToast();
  const [qc, setQc] = useState(db.settings.quickChangeMinutes);
  const rename = (list: OptionList, a: string, b: string) => {
    const n = run(() => renameOption(list, a, b));
    if (n !== undefined) toast.success(`Renamed to “${b.trim()}”${n ? ` — ${n} record(s) updated` : ''}.`);
  };
  return (
    <div className="settings-grid">
      <Card title="Dance styles" icon={<GraduationCap size={18} />}>
        <ListEditor label="Styles for classes, teachers and recital numbers" items={db.settings.danceStyles} onChange={(danceStyles) => run(() => updateSettings({ danceStyles }))} placeholder="e.g. Hip Hop" onRename={(a, b) => rename('danceStyles', a, b)} />
      </Card>
      <Card title="Age groups">
        <ListEditor label="Age groups" items={db.settings.ageGroups} onChange={(ageGroups) => run(() => updateSettings({ ageGroups }))} placeholder="e.g. Teens (13–18)" onRename={(a, b) => rename('ageGroups', a, b)} />
      </Card>
      <Card title="Accessory categories">
        <ListEditor label="Accessory types" items={db.settings.accessoryCategories} onChange={(accessoryCategories) => run(() => updateSettings({ accessoryCategories }))} placeholder="e.g. Gloves" onRename={(a, b) => rename('accessoryCategories', a, b)} />
      </Card>
      <Card title="Show day">
        <Field label="Flag quick changes shorter than (minutes)">
          <div className="inline-form">
            <input className="input" type="number" min={0} max={60} value={qc} onChange={(e) => setQc(Number(e.target.value))} />
            <button className="btn btn-primary" disabled={qc === db.settings.quickChangeMinutes} onClick={() => run(() => updateSettings({ quickChangeMinutes: qc }), 'Saved.')}>
              Save
            </button>
          </div>
        </Field>
      </Card>
      <Card title="Levels, sizes & skills">
        <p className="small">Dancer levels, size options and volunteer skills are on the “Inventory & data” tab. Use the pencil to rename an option everywhere it is used.</p>
      </Card>
    </div>
  );
}

function ReminderSettings() {
  const db = useDb();
  const run = useRun();
  const [rules, setRules] = useState<ReminderRule[]>(db.settings.reminders.map((r) => ({ ...r, channels: [...r.channels] })));
  const changed = JSON.stringify(rules) !== JSON.stringify(db.settings.reminders);
  const set = (i: number, p: Partial<ReminderRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Card title="Automatic reminders" icon={<Bell size={18} />}>
      <p className="small faint">Reminders are checked whenever the app is open (and every 15 minutes). Each reminder is sent once. Email and SMS need a provider to be connected — until then everything is delivered in the Parent / Teacher Portal and the office notification center.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Reminder</th>
            <th>On</th>
            <th>Days before</th>
            <th>In app</th>
            <th>Email</th>
            <th>SMS</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={r.kind}>
              <td>{reminderLabels[r.kind]}</td>
              <td>
                <input type="checkbox" checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} aria-label={`${reminderLabels[r.kind]} on`} />
              </td>
              <td>
                <input className="input input-qty" type="number" min={0} max={60} value={r.daysBefore} onChange={(e) => set(i, { daysBefore: Number(e.target.value) })} aria-label={`${reminderLabels[r.kind]} days before`} />
              </td>
              {(['inapp', 'email', 'sms'] as const).map((c) => (
                <td key={c}>
                  <input type="checkbox" disabled={c === 'inapp'} checked={r.channels.includes(c)} onChange={(e) => set(i, { channels: e.target.checked ? [...r.channels, c] : r.channels.filter((x) => x !== c) })} aria-label={`${reminderLabels[r.kind]} ${c}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <SaveBar changed={changed} onReset={() => setRules(db.settings.reminders.map((r) => ({ ...r, channels: [...r.channels] })))} onSave={() => run(() => updateSettings({ reminders: rules }), 'Reminder settings saved.')} />
    </Card>
  );
}
