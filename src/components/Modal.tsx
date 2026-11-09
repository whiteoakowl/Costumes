import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Side panel slides in from the right instead of a centered dialog. */
  panel?: boolean;
}

let openCount = 0;

export function Modal({ open, title, subtitle, onClose, children, footer, size = 'md', panel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openCount += 1;
    document.body.classList.add('modal-open');
    const prevFocus = document.activeElement as HTMLElement | null;
    const myLevel = openCount;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && myLevel === openCount) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus first field for quick data entry.
    const t = setTimeout(() => {
      // Don't steal focus if the person has already started using the dialog.
      if (ref.current?.contains(document.activeElement)) return;
      const el = ref.current?.querySelector<HTMLElement>('[autofocus], input:not([type=checkbox]):not([type=hidden]), select, textarea, button.btn-primary');
      el?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      openCount -= 1;
      if (openCount === 0) document.body.classList.remove('modal-open');
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`overlay ${panel ? 'overlay-panel' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal modal-${size} ${panel ? 'modal-panel' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
