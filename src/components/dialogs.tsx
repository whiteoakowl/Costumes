import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Field, SearchSelect, type Option } from './ui';
import { useRun } from './feedback';
import { moveCostumes, setCostumesCategory } from '../data/actions';
import { useCategoryOptions, useLocationOptions } from './forms';
import type { ID } from '../data/types';

/** Pick a storage location for one or more costumes. */
export function MoveCostumesDialog({ open, onClose, costumeIds, onDone }: { open: boolean; onClose: () => void; costumeIds: ID[]; onDone?: () => void }) {
  const run = useRun();
  const locations = useLocationOptions();
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (open) setTarget('');
  }, [open]);
  const go = () => {
    const name = locations.find((l) => l.value === target)?.label ?? 'Unassigned';
    const ok = run(() => {
      moveCostumes(costumeIds, target || null);
      return true;
    }, `${costumeIds.length === 1 ? 'Costume' : `${costumeIds.length} costumes`} moved to ${name}.`);
    if (ok) {
      onDone?.();
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move to Storage Location"
      subtitle={`${costumeIds.length} costume${costumeIds.length === 1 ? '' : 's'} selected`}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={go}>
            Move
          </button>
        </>
      }
    >
      <Field label="New location">
        <SearchSelect ariaLabel="New location" value={target} onChange={setTarget} options={locations} noneLabel="Unassigned" />
      </Field>
      <p className="small faint">The move is recorded in each costume's notes log.</p>
    </Modal>
  );
}

export function SetCategoryDialog({ open, onClose, costumeIds, onDone }: { open: boolean; onClose: () => void; costumeIds: ID[]; onDone?: () => void }) {
  const run = useRun();
  const categories = useCategoryOptions();
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (open) setTarget('');
  }, [open]);
  const go = () => {
    const name = categories.find((c) => c.value === target)?.label ?? 'Uncategorized';
    const ok = run(() => {
      setCostumesCategory(costumeIds, target || null);
      return true;
    }, `${costumeIds.length === 1 ? 'Costume' : `${costumeIds.length} costumes`} moved to ${name}.`);
    if (ok) {
      onDone?.();
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move to Category"
      subtitle={`${costumeIds.length} costume${costumeIds.length === 1 ? '' : 's'} selected`}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={go}>
            Move
          </button>
        </>
      }
    >
      <Field label="Category">
        <SearchSelect ariaLabel="Category" value={target} onChange={setTarget} options={categories} noneLabel="Uncategorized" />
      </Field>
    </Modal>
  );
}

/**
 * Delete something that costumes depend on (a category or storage location),
 * asking where those costumes should go first — nothing is silently lost.
 */
export function ReassignDeleteDialog({
  open,
  onClose,
  title,
  itemName,
  count,
  noun,
  options,
  noneLabel,
  onConfirm,
  itemNoun = 'costume',
}: {
  itemNoun?: string;
  open: boolean;
  onClose: () => void;
  title: string;
  itemName: string;
  count: number;
  noun: string;
  options: Option[];
  noneLabel: string;
  onConfirm: (target: ID | null) => boolean;
}) {
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (open) setTarget('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (onConfirm(target || null)) onClose();
            }}
          >
            Delete “{itemName}”
          </button>
        </>
      }
    >
      {count > 0 ? (
        <>
          <p>
            <strong>{count}</strong> {itemNoun}
            {count === 1 ? ' is' : 's are'} currently assigned to <strong>{itemName}</strong>. Choose where {count === 1 ? 'it' : 'they'} should go:
          </p>
          <Field label={`Move ${itemNoun}s to ${noun}`}>
            <SearchSelect ariaLabel={`Move ${itemNoun}s to ${noun}`} value={target} onChange={setTarget} options={options} noneLabel={noneLabel} />
          </Field>
          <p className="small faint">Each {itemNoun}'s notes log will record the change.</p>
        </>
      ) : (
        <p>
          No {itemNoun}s are assigned to <strong>{itemName}</strong>. It is safe to delete.
        </p>
      )}
    </Modal>
  );
}
