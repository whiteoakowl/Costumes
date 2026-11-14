import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowDown, ArrowUp, CalendarClock, Copy, ListChecks, ListTodo, Pencil, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { useDb } from '../data/store';
import { addTasks, clearCompleted, deleteTask, deleteTaskList, duplicateTaskList, moveTask, resetTaskList, saveTaskList, toggleTask, updateTask, type TaskInput, type TaskListInput } from '../data/planningActions';
import { isTaskOverdue, listItems, listProgress, priorityLabels, visibleTaskLists } from '../data/planning';
import { formatDate, formatDateTime, volunteerName } from '../data/selectors';
import { staffName, addDays } from '../data/studio';
import { todayStr } from '../data/ids';
import { Badge, Card, EmptyState, Field, PageHeader, SampleTag, Tabs } from '../components/ui';
import { FormModal } from '../components/forms';
import { useConfirm, useRun, useToast } from '../components/feedback';
import { useStaffOptions } from '../components/studioUi';
import { Progress } from '../components/charts';
import { openPrint } from './Print';
import { useViewer } from '../lib/session';
import type { Database, ID, TaskItem, TaskList, TaskPriority } from '../data/types';

const kindIcon = (k: TaskList['kind']) => (k === 'checklist' ? ListChecks : ListTodo);

function assigneeName(db: Database, t: TaskItem) {
  if (t.assigneeStaffId) return staffName(db.staff.find((s) => s.id === t.assigneeStaffId));
  if (t.assigneeVolunteerId) {
    const v = db.volunteers.find((x) => x.id === t.assigneeVolunteerId);
    return v ? volunteerName(v) : '';
  }
  return '';
}

function useLists() {
  const db = useDb();
  const v = useViewer();
  return { db, v, lists: visibleTaskLists(db, { admin: v.isStaffAdmin, staffId: v.staffId }) };
}

function DueBadge({ t }: { t: Pick<TaskItem, 'done' | 'dueDate'> }) {
  if (!t.dueDate) return null;
  const today = todayStr();
  if (isTaskOverdue(t, today)) return <Badge tone="danger">Overdue · {formatDate(t.dueDate)}</Badge>;
  if (!t.done && t.dueDate <= addDays(today, 3)) return <Badge tone="progress">Due {t.dueDate === today ? 'today' : formatDate(t.dueDate)}</Badge>;
  return <span className="small faint">Due {formatDate(t.dueDate)}</span>;
}

/* ============================================================ overview */

export function TasksPage() {
  const { db, v, lists } = useLists();
  const run = useRun();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<TaskList['kind'] | null>(null);
  const [tab, setTab] = useState<'lists' | 'due' | 'mine'>('lists');
  const [archived, setArchived] = useState(false);
  const today = todayStr();
  const shown = lists.filter((l) => l.archived === archived).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.name.localeCompare(b.name));
  const listIds = new Set(lists.filter((l) => !l.archived).map((l) => l.id));
  const open = db.tasks.filter((t) => listIds.has(t.listId) && !t.done);
  const due = open.filter((t) => t.dueDate && t.dueDate <= addDays(today, 7)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const mine = v.staffId ? open.filter((t) => t.assigneeStaffId === v.staffId).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')) : [];
  const overdue = open.filter((t) => isTaskOverdue(t, today)).length;
  return (
    <>
      <PageHeader
        title="Checklists & To-Dos"
        subtitle="Reusable checklists for recitals and events, and to-do lists with due dates and who's doing what"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCreating('checklist')}>
              <ListChecks size={16} /> New checklist
            </button>
            <button className="btn btn-primary" onClick={() => setCreating('todo')}>
              <ListTodo size={16} /> New to-do list
            </button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'lists', label: 'Lists', count: lists.filter((l) => !l.archived).length },
          { value: 'due', label: overdue ? `Due soon · ${overdue} overdue` : 'Due soon', count: due.length },
          ...(v.staffId ? [{ value: 'mine' as const, label: 'Assigned to me', count: mine.length }] : []),
        ]}
      />
      {tab === 'lists' && (
        <>
          {!shown.length ? (
            <EmptyState
              icon={<ListChecks size={28} />}
              title={archived ? 'No archived lists' : 'No lists yet'}
              message={archived ? undefined : 'Make a checklist you reuse (packing list, recital-day checklist) or a to-do list with due dates and owners.'}
              action={!archived && <button className="btn btn-primary" onClick={() => setCreating('checklist')}><Plus size={16} /> New checklist</button>}
            />
          ) : (
            <div className="list-cards">
              {shown.map((l) => {
                const p = listProgress(db, l.id);
                const Icon = kindIcon(l.kind);
                const late = db.tasks.filter((t) => t.listId === l.id && isTaskOverdue(t, today)).length;
                return (
                  <Link key={l.id} to={`/tasks/${l.id}`} className="card list-card">
                    <div className="list-card-head">
                      <Icon size={18} />
                      <strong>{l.name}</strong>
                      <SampleTag show={l.isSample} />
                    </div>
                    <div className="small faint">
                      {l.kind === 'checklist' ? 'Checklist' : 'To-do list'}
                      {l.dueDate && ` · by ${formatDate(l.dueDate)}`}
                      {l.visibility === 'office' && ' · Office only'}
                    </div>
                    <Progress value={p.done} max={p.total} label="Done" />
                    <div className="small">
                      {p.done} of {p.total} done {late > 0 && <Badge tone="danger">{late} overdue</Badge>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setArchived(!archived)}>
            <Archive size={14} /> {archived ? 'Show current lists' : 'Show archived lists'}
          </button>
        </>
      )}
      {tab !== 'lists' && (
        <Card>
          <TaskRows db={db} items={tab === 'due' ? due : mine} showList onToggle={(id) => run(() => toggleTask(id))} empty={tab === 'due' ? 'Nothing due in the next week.' : 'Nothing assigned to you.'} />
        </Card>
      )}
      {creating && <TaskListForm kind={creating} onClose={() => setCreating(null)} onSaved={(id) => navigate(`/tasks/${id}`)} />}
    </>
  );
}

function TaskRows({ db, items, showList, onToggle, empty }: { db: Database; items: TaskItem[]; showList?: boolean; onToggle: (id: ID) => void; empty: string }) {
  if (!items.length) return <p className="faint pad">{empty}</p>;
  return (
    <ul className="task-list">
      {items.map((t) => {
        const l = db.taskLists.find((x) => x.id === t.listId);
        return (
          <li key={t.id} className={`task ${t.done ? 'done' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} aria-label={`Mark ${t.title} ${t.done ? 'not done' : 'done'}`} />
            <div className="task-main">
              <span className="task-title">{t.title}</span>
              <div className="task-meta">
                {showList && l && <Link to={`/tasks/${l.id}`} className="small">{l.name}</Link>}
                <DueBadge t={t} />
                {assigneeName(db, t) && <span className="chip">{assigneeName(db, t)}</span>}
                {t.priority === 'high' && <Badge tone="danger">High</Badge>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ============================================================ list form */

function TaskListForm({ id, kind, onClose, onSaved }: { id?: ID; kind?: TaskList['kind']; onClose: () => void; onSaved?: (id: ID) => void }) {
  const db = useDb();
  const run = useRun();
  const existing = id ? db.taskLists.find((l) => l.id === id) : undefined;
  const [f, setF] = useState<TaskListInput>(() => existing ?? { name: '', kind: kind ?? 'todo', description: '', dueDate: '', visibility: 'staff', recitalId: null, archived: false });
  const set = (p: Partial<TaskListInput>) => setF({ ...f, ...p });
  return (
    <FormModal open onClose={onClose} title={id ? 'Edit list' : f.kind === 'checklist' ? 'New checklist' : 'New to-do list'} size="md" onSubmit={() => { const s = run(() => saveTaskList(f, id), 'Saved.'); if (s) { onClose(); onSaved?.(s); } }}>
      <Field label="Name" required>
        <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder={f.kind === 'checklist' ? 'Recital day checklist' : 'Recital to-dos'} />
      </Field>
      <div className="segmented full">
        <button type="button" className={f.kind === 'checklist' ? 'on' : ''} onClick={() => set({ kind: 'checklist' })}>
          <ListChecks size={14} /> Checklist
        </button>
        <button type="button" className={f.kind === 'todo' ? 'on' : ''} onClick={() => set({ kind: 'todo' })}>
          <ListTodo size={14} /> To-do list
        </button>
      </div>
      <p className="small faint">{f.kind === 'checklist' ? 'Tick things off, then reset to reuse it next time.' : 'Each item can have a due date, a person responsible and a priority.'}</p>
      <div className="grid-2">
        <Field label="Finish by">
          <input className="input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label="Recital">
          <select className="input" value={f.recitalId ?? ''} onChange={(e) => set({ recitalId: e.target.value || null })}>
            <option value="">None</option>
            {db.recitals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who can see it">
          <select className="input" value={f.visibility} onChange={(e) => set({ visibility: e.target.value as TaskList['visibility'] })}>
            <option value="staff">All staff (teachers & performance staff too)</option>
            <option value="office">Owner & office only</option>
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
    </FormModal>
  );
}

/* ============================================================ list page */

export function TaskListPage() {
  const { id } = useParams();
  const { db, lists } = useLists();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const staffOpts = useStaffOptions();
  const [editing, setEditing] = useState(false);
  const [itemEdit, setItemEdit] = useState<ID | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const blankAdd = (): TaskInput => ({ title: '', notes: '', dueDate: '', assigneeStaffId: null, assigneeVolunteerId: null, priority: 'normal' });
  const [add, setAdd] = useState<TaskInput>(blankAdd);
  const [more, setMore] = useState(false);
  const l = lists.find((x) => x.id === id);
  if (!l) {
    return (
      <>
        <PageHeader title="List not found" back={{ to: '/tasks', label: 'Checklists & To-Dos' }} />
        <EmptyState title="This list no longer exists, or isn't shared with you" action={<Link to="/tasks" className="btn btn-primary">All lists</Link>} />
      </>
    );
  }
  const items = listItems(db, l.id);
  const p = listProgress(db, l.id);
  const shown = items.filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : true));
  const todo = l.kind === 'todo';
  const submitAdd = () => {
    const r = run(() => addTasks(l.id, add));
    if (r) {
      if (r.length > 1) toast.success(`${r.length} items added.`);
      setAdd({ ...blankAdd(), assigneeStaffId: add.assigneeStaffId, dueDate: add.dueDate });
    }
  };
  const recital = db.recitals.find((r) => r.id === l.recitalId);
  return (
    <>
      <PageHeader
        back={{ to: '/tasks', label: 'Checklists & To-Dos' }}
        title={
          <>
            {l.name} <SampleTag show={l.isSample} />
          </>
        }
        subtitle={[todo ? 'To-do list' : 'Checklist', l.dueDate && `Finish by ${formatDate(l.dueDate)}`, recital?.name, l.visibility === 'office' ? 'Office only' : 'Shared with staff', l.archived && 'Archived'].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => openPrint('tasklist', { id: l.id })}>
              <Printer size={16} /> Print
            </button>
            <button className="btn btn-ghost danger" onClick={async () => { if (await confirm({ title: `Delete ${l.name}?`, message: `All ${items.length} items are deleted too.`, confirmLabel: 'Delete', danger: true })) if (run(() => (deleteTaskList(l.id), true), 'List deleted.')) navigate('/tasks'); }}>
              <Trash2 size={16} /> Delete
            </button>
            <button className="btn btn-ghost" onClick={() => run(() => saveTaskList({ ...l, archived: !l.archived }, l.id), l.archived ? 'List restored.' : 'List archived.')}>
              <Archive size={16} /> {l.archived ? 'Restore' : 'Archive'}
            </button>
            <button className="btn btn-ghost" onClick={() => { const c = run(() => duplicateTaskList(l.id), 'Copied as a fresh, unchecked list.'); if (c) navigate(`/tasks/${c}`); }}>
              <Copy size={16} /> Duplicate
            </button>
            {p.done > 0 && (
              <button className="btn btn-ghost" onClick={async () => { if (await confirm({ title: 'Uncheck everything?', message: 'All items are kept and marked not done, ready to use again.', confirmLabel: 'Reset' })) run(() => resetTaskList(l.id), 'List reset.'); }}>
                <RotateCcw size={16} /> Reset
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <Pencil size={16} /> Edit
            </button>
          </>
        }
      />
      <Card>
        <div className="task-progress">
          <Progress value={p.done} max={p.total} label="Done" />
          <span className="small">
            {p.done} of {p.total} done
          </span>
        </div>
        {l.description && <p className="small prewrap">{l.description}</p>}
        <form
          className="task-add"
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
        >
          <textarea
            className="input"
            rows={add.title.includes('\n') ? 4 : 1}
            placeholder={todo ? 'Add a to-do… (paste several lines to add many)' : 'Add an item… (paste several lines to add many)'}
            value={add.title}
            onChange={(e) => setAdd({ ...add, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitAdd();
              }
            }}
            aria-label="New item"
          />
          <button className="btn btn-primary" type="submit">
            <Plus size={16} /> Add
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setMore(!more)}>
            {more ? 'Fewer options' : 'Due date, owner…'}
          </button>
        </form>
        {more && (
          <div className="grid-3 task-add-more">
            <Field label="Due">
              <input className="input" type="date" value={add.dueDate} onChange={(e) => setAdd({ ...add, dueDate: e.target.value })} />
            </Field>
            <Field label="Who">
              <AssigneeSelect db={db} staffOpts={staffOpts} value={add} onChange={(x) => setAdd({ ...add, ...x })} />
            </Field>
            <Field label="Priority">
              <select className="input" value={add.priority} onChange={(e) => setAdd({ ...add, priority: e.target.value as TaskPriority })}>
                {(Object.keys(priorityLabels) as TaskPriority[]).map((k) => (
                  <option key={k} value={k}>
                    {priorityLabels[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {items.length > 0 && (
          <div className="toolbar">
            <div className="segmented">
              {(['all', 'open', 'done'] as const).map((k) => (
                <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                  {{ all: `All (${items.length})`, open: `To do (${items.length - p.done})`, done: `Done (${p.done})` }[k]}
                </button>
              ))}
            </div>
            {p.done > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Remove completed items?', message: `${p.done} done item${p.done === 1 ? ' is' : 's are'} deleted from this list.`, confirmLabel: 'Remove', danger: true })) run(() => clearCompleted(l.id), 'Completed items removed.'); }}>
                Clear completed
              </button>
            )}
          </div>
        )}
        {!items.length ? (
          <EmptyState icon={<CalendarClock size={26} />} title="Nothing on this list yet" message="Type above and press Enter. Paste a list from an email or document to add every line at once." />
        ) : (
          <ul className="task-list">
            {shown.map((t, i) => (
              <li key={t.id} className={`task ${t.done ? 'done' : ''} ${t.priority === 'high' && !t.done ? 'high' : ''}`}>
                <input type="checkbox" checked={t.done} onChange={() => run(() => toggleTask(t.id))} aria-label={`Mark ${t.title} ${t.done ? 'not done' : 'done'}`} />
                <div className="task-main">
                  <span className="task-title">{t.title}</span>
                  <div className="task-meta">
                    <DueBadge t={t} />
                    {assigneeName(db, t) && <span className="chip">{assigneeName(db, t)}</span>}
                    {t.priority !== 'normal' && <Badge tone={t.priority === 'high' ? 'danger' : 'neutral'}>{priorityLabels[t.priority]}</Badge>}
                    {t.done && t.doneBy && <span className="small faint">✓ {t.doneBy} · {formatDateTime(t.doneAt)}</span>}
                  </div>
                  {t.notes && <div className="small faint prewrap">{t.notes}</div>}
                </div>
                <div className="row-actions">
                  {filter === 'all' && (
                    <span className="move-btns">
                      <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => run(() => moveTask(t.id, -1))}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="icon-btn" aria-label="Move down" disabled={i === shown.length - 1} onClick={() => run(() => moveTask(t.id, 1))}>
                        <ArrowDown size={14} />
                      </button>
                    </span>
                  )}
                  <button className="icon-btn" aria-label={`Edit ${t.title}`} onClick={() => setItemEdit(t.id)}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn" aria-label={`Delete ${t.title}`} onClick={() => run(() => deleteTask(t.id))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <TaskListForm id={l.id} onClose={() => setEditing(false)} />}
      {itemEdit && <TaskItemForm id={itemEdit} onClose={() => setItemEdit(null)} />}
    </>
  );
}

function AssigneeSelect({ db, staffOpts, value, onChange }: { db: Database; staffOpts: { value: string; label: string }[]; value: Pick<TaskInput, 'assigneeStaffId' | 'assigneeVolunteerId'>; onChange: (v: Pick<TaskInput, 'assigneeStaffId' | 'assigneeVolunteerId'>) => void }) {
  const cur = value.assigneeStaffId ? `s:${value.assigneeStaffId}` : value.assigneeVolunteerId ? `v:${value.assigneeVolunteerId}` : '';
  return (
    <select
      className="input"
      value={cur}
      onChange={(e) => {
        const [k, id] = e.target.value.split(':');
        onChange({ assigneeStaffId: k === 's' ? id : null, assigneeVolunteerId: k === 'v' ? id : null });
      }}
    >
      <option value="">Nobody yet</option>
      <optgroup label="Staff">
        {staffOpts.map((o) => (
          <option key={o.value} value={`s:${o.value}`}>
            {o.label}
          </option>
        ))}
      </optgroup>
      {db.volunteers.length > 0 && (
        <optgroup label="Volunteers">
          {[...db.volunteers]
            .sort((a, b) => volunteerName(a).localeCompare(volunteerName(b)))
            .map((v) => (
              <option key={v.id} value={`v:${v.id}`}>
                {volunteerName(v)}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  );
}

function TaskItemForm({ id, onClose }: { id: ID; onClose: () => void }) {
  const db = useDb();
  const run = useRun();
  const staffOpts = useStaffOptions();
  const t = db.tasks.find((x) => x.id === id);
  const [f, setF] = useState<TaskInput>(() => ({ title: t?.title ?? '', notes: t?.notes ?? '', dueDate: t?.dueDate ?? '', assigneeStaffId: t?.assigneeStaffId ?? null, assigneeVolunteerId: t?.assigneeVolunteerId ?? null, priority: t?.priority ?? 'normal' }));
  if (!t) return null;
  const set = (p: Partial<TaskInput>) => setF({ ...f, ...p });
  return (
    <FormModal open onClose={onClose} title="Edit item" size="md" onSubmit={() => run(() => (updateTask(id, f), true), 'Saved.') && onClose()}>
      <Field label="Item" required>
        <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
      </Field>
      <div className="grid-3">
        <Field label="Due">
          <input className="input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label="Who">
          <AssigneeSelect db={db} staffOpts={staffOpts} value={f} onChange={set} />
        </Field>
        <Field label="Priority">
          <select className="input" value={f.priority} onChange={(e) => set({ priority: e.target.value as TaskPriority })}>
            {(Object.keys(priorityLabels) as TaskPriority[]).map((k) => (
              <option key={k} value={k}>
                {priorityLabels[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input" rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </FormModal>
  );
}
