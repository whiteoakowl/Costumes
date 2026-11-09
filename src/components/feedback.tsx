import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Modal } from './Modal';

/* ---------------------------------------------------------------- toasts */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/* --------------------------------------------------------------- confirm */

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, kind, message }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const api = useRef<ToastApi>({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }).current;

  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise((resolve) => setPending({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  const icons = { success: CheckCircle2, error: XCircle, info: Info };

  return (
    <ToastContext.Provider value={api}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <Modal
          open={!!pending}
          title={pending?.title ?? ''}
          onClose={() => close(false)}
          size="sm"
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${pending?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
                {pending?.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          <div className="confirm-body">
            {pending?.danger && <AlertTriangle className="confirm-icon" size={22} />}
            <div>{pending?.message}</div>
          </div>
        </Modal>
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => {
            const Icon = icons[t.kind];
            return (
              <div key={t.id} className={`toast toast-${t.kind}`}>
                <Icon size={18} />
                <span>{t.message}</span>
                <button className="toast-close" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside FeedbackProvider');
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside FeedbackProvider');
  return ctx;
}

/**
 * Run a data action, showing a success toast or a friendly error.
 * Returns the action's result, or undefined if it failed.
 */
export function useRun() {
  const toast = useToast();
  return useCallback(
    <T,>(fn: () => T, success?: string): T | undefined => {
      try {
        const result = fn();
        if (success) toast.success(success);
        return result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong.');
        return undefined;
      }
    },
    [toast],
  );
}
