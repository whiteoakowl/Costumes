import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Pencil, Play, RotateCcw, X } from 'lucide-react';
import { Modal } from './Modal';
import { Badge, CheckList, Field, SearchSelect, type Option } from './ui';
import { useConfirm, useRun } from './feedback';
import { Avatar } from './photos';
import { useDb } from '../data/store';
import { cancelWorkOrder, completeWorkOrder, createWorkOrders, reopenWorkOrder, startWorkOrder, updateWorkOrder, type WorkOrderInput } from '../data/actions';
import { formatDate, formatDateTime, kindOf, volunteerName } from '../data/selectors';
import { isOpenOrder, localNow, workStatusLabels, workTypeLabels } from '../data/workflow';
import { itemLabels } from '../lib/labels';
import { todayStr } from '../data/ids';
import type { Database, ID, ProgressReason, WorkOrder } from '../data/types';

export function useVolunteerOptions(): Option[] {
  const db = useDb();
  return [...db.volunteers]
    .sort((a, b) => volunteerName(a).localeCompare(volunteerName(b)))
    .map((v) => ({ value: v.id, label: volunteerName(v), hint: v.skills.slice(0, 2).join(', ') || undefined }));
}

/** Local date/time string ('YYYY-MM-DDTHH:MM' or date) for display. */
export function formatLocal(dt: string) {
  if (!dt) return '';
  return dt.length > 10 ? formatDateTime(dt) : formatDate(dt);
}

export function isOverdue(w: WorkOrder) {
  return isOpenOrder(w) && !!w.dueDate && w.dueDate < todayStr();
}

function itemOptions(db: Database): Option[] {
  return [...db.costumes]
    .sort((a, b) => kindOf(a).localeCompare(kindOf(b)) || a.name.localeCompare(b.name))
    .map((c) => ({
      value: c.id,
      label: c.name,
      hint: `${c.inventoryNumber}${c.status === 'in_progress' ? ' · IN PROGRESS' : ''}`,
      group: itemLabels[kindOf(c)].Many,
    }));
}

const emptyInput = (type: ProgressReason): WorkOrderInput => ({ type, description: '', pieces: 1, volunteerId: null, scheduledAt: '', dueDate: '' });

/** Create a work order for one or more items, or edit an existing one. */
export function WorkOrderDialog({ open, onClose, costumeIds, workOrderId, defaultType = 'cleaning' }: { open: boolean; onClose: () => void; costumeIds?: ID[]; workOrderId?: ID; defaultType?: ProgressReason }) {
  const db = useDb();
  const run = useRun();
  const volunteers = useVolunteerOptions();
  const [v, setV] = useState<WorkOrderInput>(emptyInput(defaultType));
  const [items, setItems] = useState<Set<ID>>(new Set());
  const [lastOpen, setLastOpen] = useState(false);
  const existing = workOrderId ? db.workOrders.find((w) => w.id === workOrderId) : undefined;
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      if (existing) setV({ type: existing.type, description: existing.description, pieces: existing.pieces, volunteerId: existing.volunteerId, scheduledAt: existing.scheduledAt, dueDate: existing.dueDate });
      else {
        const one = costumeIds?.length === 1 ? db.costumes.find((c) => c.id === costumeIds[0]) : undefined;
        setV({ ...emptyInput(defaultType), pieces: one ? Math.max(1, one.quantity) : 1 });
      }
      setItems(new Set(costumeIds ?? []));
    }
  }
  const set = <K extends keyof WorkOrderInput>(k: K, val: WorkOrderInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const presetItems = (costumeIds ?? []).map((id) => db.costumes.find((c) => c.id === id)).filter(Boolean);
  const target = existing ? db.costumes.find((c) => c.id === existing.costumeId) : undefined;

  const save = () => {
    const ok = existing
      ? run(() => (updateWorkOrder(existing.id, v), true), 'Work order updated.')
      : run(() => createWorkOrders([...items], v), `${workTypeLabels[v.type]} logged for ${items.size} item${items.size === 1 ? '' : 's'} — marked IN PROGRESS.`);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit Work Order' : 'Send for Repair / Cleaning'}
      subtitle={existing ? `${target?.name ?? ''} · ${target?.inventoryNumber ?? ''}` : presetItems.length ? presetItems.map((c) => c!.name).join(', ') : 'Choose items, what needs doing, and who will do it'}
      size="lg"
      panel
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!existing && !items.size}>
            {existing ? 'Save changes' : 'Create work order'}
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="What needs doing?">
          <div className="segmented wrap">
            {(Object.keys(workTypeLabels) as ProgressReason[]).map((t) => (
              <button key={t} type="button" className={v.type === t ? 'on' : ''} onClick={() => set('type', t)}>
                {workTypeLabels[t]}
              </button>
            ))}
          </div>
        </Field>
        {!existing && !costumeIds?.length && (
          <div className="field">
            <span className="field-label">Costumes / props</span>
            <CheckList options={itemOptions(db)} selected={items} onChange={setItems} height={220} emptyText="No costumes or props yet." />
          </div>
        )}
        <Field label="Description" hint="Saved to each item's log">
          <textarea className="input" rows={3} value={v.description} onChange={(e) => set('description', e.target.value)} placeholder={v.type === 'cleaning' ? 'e.g. Dry clean, spot clean makeup on collar' : 'e.g. Re-sew hook and eye at back'} autoFocus />
        </Field>
        <div className="grid-2">
          <Field label="Assigned volunteer" hint={!volunteers.length ? 'Add volunteers on the Volunteers page' : undefined}>
            <SearchSelect ariaLabel="Assigned volunteer" value={v.volunteerId ?? ''} onChange={(x) => set('volunteerId', x || null)} options={volunteers} noneLabel="Not assigned yet" />
          </Field>
          {(existing || (costumeIds?.length ?? 0) <= 1) && (
            <Field label="Pieces involved" hint={target || presetItems[0] ? `of ${(target ?? presetItems[0])!.quantity} on hand` : undefined}>
              <input className="input" type="number" min={1} value={v.pieces} onChange={(e) => set('pieces', Number(e.target.value) || 1)} />
            </Field>
          )}
          <Field label="Scheduled date / time" hint="When the volunteer will pick up or do the work">
            <input className="input" type="datetime-local" value={v.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
          </Field>
          <Field label="Needed back by">
            <input className="input" type="date" value={v.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function CompleteWorkDialog({ workOrder, onClose }: { workOrder: WorkOrder | null; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const [at, setAt] = useState(localNow());
  const [note, setNote] = useState('');
  const [markReady, setMarkReady] = useState(true);
  const [last, setLast] = useState<ID | null>(null);
  if ((workOrder?.id ?? null) !== last) {
    setLast(workOrder?.id ?? null);
    setAt(localNow());
    setNote('');
    setMarkReady(true);
  }
  const item = workOrder ? db.costumes.find((c) => c.id === workOrder.costumeId) : undefined;
  const otherOpen = workOrder ? db.workOrders.filter((w) => w.costumeId === workOrder.costumeId && w.id !== workOrder.id && isOpenOrder(w)).length : 0;
  return (
    <Modal
      open={!!workOrder}
      onClose={onClose}
      title={`Complete ${workOrder ? workTypeLabels[workOrder.type] : ''}`}
      subtitle={item ? `${item.name} · ${item.inventoryNumber}` : ''}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => run(() => (completeWorkOrder(workOrder!.id, { completedAt: at, note, markReady }), true), 'Work completed and logged.') && onClose()}>
            <CheckCircle2 size={16} /> Mark complete
          </button>
        </>
      }
    >
      <Field label="Completed on">
        <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </Field>
      <Field label="What was done?">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dry cleaned and steamed, returned to Rack 1" />
      </Field>
      {otherOpen > 0 ? (
        <p className="small faint">This item has {otherOpen} other open work order(s), so it stays IN PROGRESS.</p>
      ) : (
        <label className="check-inline">
          <input type="checkbox" checked={markReady} onChange={(e) => setMarkReady(e.target.checked)} /> Mark the {item ? itemLabels[kindOf(item)].one : 'item'} READY
        </label>
      )}
    </Modal>
  );
}

const typeTone: Record<ProgressReason, 'info' | 'warn' | 'rose' | 'danger' | 'neutral'> = { cleaning: 'info', repair: 'warn', alteration: 'rose', replacement: 'danger', other: 'neutral' };

export function WorkTypeBadge({ type }: { type: ProgressReason }) {
  return <Badge tone={typeTone[type]}>{workTypeLabels[type]}</Badge>;
}

export function WorkStatusBadge({ w }: { w: WorkOrder }) {
  if (isOverdue(w)) return <Badge tone="danger">Overdue</Badge>;
  const tone = w.status === 'done' ? 'ready' : w.status === 'cancelled' ? 'neutral' : w.status === 'in_progress' ? 'progress' : 'info';
  return <Badge tone={tone}>{workStatusLabels[w.status]}</Badge>;
}

/** Work orders table with inline actions (assign, start, complete, edit, cancel, reopen). */
export function WorkOrderTable({ orders, showItem = true, showVolunteer = true, empty }: { orders: WorkOrder[]; showItem?: boolean; showVolunteer?: boolean; empty?: string }) {
  const db = useDb();
  const run = useRun();
  const confirm = useConfirm();
  const volunteers = useVolunteerOptions();
  const [editing, setEditing] = useState<ID | null>(null);
  const [completing, setCompleting] = useState<WorkOrder | null>(null);
  if (!orders.length) return <p className="faint pad">{empty ?? 'Nothing here.'}</p>;
  return (
    <>
      <div className="table-wrap">
        <table className="table work-table">
          <thead>
            <tr>
              {showItem && <th>Item</th>}
              <th>Work</th>
              {showVolunteer && <th>Volunteer</th>}
              <th>Dates</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((w) => {
              const item = db.costumes.find((c) => c.id === w.costumeId);
              const L = item ? itemLabels[kindOf(item)] : itemLabels.costume;
              const open = isOpenOrder(w);
              return (
                <tr key={w.id} className={isOverdue(w) ? 'row-bad' : ''}>
                  {showItem && (
                    <td>
                      {item && (
                        <div className="with-avatar">
                          <Avatar ownerType="item" ownerId={item.id} size={38} fallback={<L.Icon size={18} />} />
                          <div>
                            <Link to={`${L.base}/${item.id}`} className="link-strong">
                              {item.name}
                            </Link>
                            <div className="small faint">
                              {item.inventoryNumber} · {L.One}
                              {w.pieces > 1 && ` · ${w.pieces} pieces`}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  )}
                  <td>
                    <WorkTypeBadge type={w.type} />
                    {w.description && <div className="small">{w.description}</div>}
                    {w.completionNote && <div className="small faint">Done: {w.completionNote}</div>}
                  </td>
                  {showVolunteer && (
                    <td className="vol-cell">
                      {open ? (
                        <SearchSelect
                          ariaLabel={`Volunteer for ${item?.name ?? 'work order'}`}
                          value={w.volunteerId ?? ''}
                          onChange={(x) => run(() => updateWorkOrder(w.id, { volunteerId: x || null }), x ? 'Volunteer assigned.' : 'Volunteer unassigned.')}
                          options={volunteers}
                          noneLabel="Not assigned"
                        />
                      ) : w.volunteerId ? (
                        <Link to={`/volunteers/${w.volunteerId}`}>{volunteerName(db.volunteers.find((v) => v.id === w.volunteerId) ?? { firstName: 'Removed', lastName: '' })}</Link>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                  )}
                  <td className="small">
                    <div>
                      <span className="faint">Logged</span> {formatDate(w.createdAt)}
                    </div>
                    {w.scheduledAt && (
                      <div>
                        <span className="faint">Scheduled</span> {formatLocal(w.scheduledAt)}
                      </div>
                    )}
                    {w.startedAt && open && (
                      <div>
                        <span className="faint">Started</span> {formatLocal(w.startedAt)}
                      </div>
                    )}
                    {w.dueDate && open && (
                      <div className={isOverdue(w) ? 'bad-text' : ''}>
                        <span className="faint">Due</span> {formatDate(w.dueDate)}
                      </div>
                    )}
                    {w.completedAt && !open && (
                      <div>
                        <span className="faint">{w.status === 'cancelled' ? 'Cancelled' : 'Completed'}</span> {formatLocal(w.completedAt)}
                      </div>
                    )}
                  </td>
                  <td>
                    <WorkStatusBadge w={w} />
                  </td>
                  <td className="row-actions">
                    {open ? (
                      <>
                        {w.status === 'open' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => run(() => startWorkOrder(w.id), 'Marked as started.')} title="Mark as being worked on now">
                            <Play size={13} /> Start
                          </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={() => setCompleting(w)}>
                          <CheckCircle2 size={13} /> Complete
                        </button>
                        <button className="icon-btn" aria-label="Edit work order" title="Edit" onClick={() => setEditing(w.id)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          aria-label="Cancel work order"
                          title="Cancel"
                          onClick={async () => {
                            if (await confirm({ title: 'Cancel this work order?', message: 'It stays in the log as cancelled. If nothing else is open for this item, it goes back to READY.', confirmLabel: 'Cancel work order', danger: true }))
                              run(() => cancelWorkOrder(w.id, ''), 'Work order cancelled.');
                          }}
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => run(() => reopenWorkOrder(w.id), 'Work order reopened.')}>
                        <RotateCcw size={13} /> Reopen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <WorkOrderDialog open={!!editing} workOrderId={editing ?? undefined} onClose={() => setEditing(null)} />
      <CompleteWorkDialog workOrder={completing} onClose={() => setCompleting(null)} />
    </>
  );
}
