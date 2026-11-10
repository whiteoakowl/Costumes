import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CostumeForm, DancerForm, LocationForm, PerformanceForm, ShowForm, StatusDialog, VolunteerForm } from './forms';
import { getDb } from '../data/store';
import type { CostumeInput, DancerInput } from '../data/actions';
import type { CostumeStatus, ID } from '../data/types';

/**
 * App-wide editors. Any page (or the dashboard Quick Actions) can open the
 * add/edit side panels without navigating away.
 */

type Editor =
  | { kind: 'dancer'; id?: ID; navigate?: boolean; defaults?: Partial<DancerInput> }
  | { kind: 'costume'; id?: ID; defaults?: Partial<CostumeInput>; navigate?: boolean }
  | { kind: 'location'; id?: ID; navigate?: boolean }
  | { kind: 'show'; id?: ID; navigate?: boolean }
  | { kind: 'performance'; id?: ID; showId?: ID; navigate?: boolean }
  | { kind: 'volunteer'; id?: ID; navigate?: boolean }
  | { kind: 'status'; ids: ID[]; status: CostumeStatus };

interface EditorApi {
  editDancer: (id?: ID, opts?: { navigate?: boolean; defaults?: Partial<DancerInput> }) => void;
  editCostume: (id?: ID, opts?: { defaults?: Partial<CostumeInput>; navigate?: boolean }) => void;
  editLocation: (id?: ID, opts?: { navigate?: boolean }) => void;
  editShow: (id?: ID, opts?: { navigate?: boolean }) => void;
  editPerformance: (id?: ID, opts?: { showId?: ID; navigate?: boolean }) => void;
  editProp: (id?: ID, opts?: { defaults?: Partial<CostumeInput>; navigate?: boolean }) => void;
  editVolunteer: (id?: ID, opts?: { navigate?: boolean }) => void;
  changeStatus: (ids: ID[], status: CostumeStatus) => void;
}

const Ctx = createContext<EditorApi | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const navigate = useNavigate();
  const close = useCallback(() => setEditor(null), []);

  const api = useMemo<EditorApi>(
    () => ({
      editDancer: (id, o) => setEditor({ kind: 'dancer', id, navigate: o?.navigate, defaults: o?.defaults }),
      editCostume: (id, o) => setEditor({ kind: 'costume', id, defaults: o?.defaults, navigate: o?.navigate }),
      editLocation: (id, o) => setEditor({ kind: 'location', id, navigate: o?.navigate }),
      editShow: (id, o) => setEditor({ kind: 'show', id, navigate: o?.navigate }),
      editPerformance: (id, o) => setEditor({ kind: 'performance', id, showId: o?.showId, navigate: o?.navigate }),
      editProp: (id, o) => setEditor({ kind: 'costume', id, defaults: { ...o?.defaults, kind: 'prop' }, navigate: o?.navigate }),
      editVolunteer: (id, o) => setEditor({ kind: 'volunteer', id, navigate: o?.navigate }),
      changeStatus: (ids, status) => setEditor({ kind: 'status', ids, status }),
    }),
    [],
  );

  const after = (path: string) => (id: ID) => {
    if (editor && 'navigate' in editor && editor.navigate) navigate(`${path}/${id}`);
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <DancerForm open={editor?.kind === 'dancer'} id={editor?.kind === 'dancer' ? editor.id : undefined} defaults={editor?.kind === 'dancer' ? editor.defaults : undefined} onClose={close} onSaved={after('/dancers')} />
      <CostumeForm
        open={editor?.kind === 'costume'}
        id={editor?.kind === 'costume' ? editor.id : undefined}
        defaults={editor?.kind === 'costume' ? editor.defaults : undefined}
        onClose={close}
        onSaved={(id) => after(getDb().costumes.find((c) => c.id === id)?.kind === 'prop' ? '/props' : '/costumes')(id)}
      />
      <LocationForm open={editor?.kind === 'location'} id={editor?.kind === 'location' ? editor.id : undefined} onClose={close} onSaved={after('/storage')} />
      <ShowForm open={editor?.kind === 'show'} id={editor?.kind === 'show' ? editor.id : undefined} onClose={close} onSaved={after('/shows')} />
      <PerformanceForm
        open={editor?.kind === 'performance'}
        id={editor?.kind === 'performance' ? editor.id : undefined}
        defaultShowId={editor?.kind === 'performance' ? editor.showId : undefined}
        onClose={close}
        onSaved={after('/performances')}
      />
      <VolunteerForm open={editor?.kind === 'volunteer'} id={editor?.kind === 'volunteer' ? editor.id : undefined} onClose={close} onSaved={after('/volunteers')} />
      <StatusDialog open={editor?.kind === 'status'} costumeIds={editor?.kind === 'status' ? editor.ids : []} initial={editor?.kind === 'status' ? editor.status : 'ready'} onClose={close} />
    </Ctx.Provider>
  );
}

export function useEditors() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditors must be used inside EditorProvider');
  return ctx;
}
