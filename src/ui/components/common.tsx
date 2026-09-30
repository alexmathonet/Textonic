import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useApp } from '../../state/AppContext';

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describedBy?: string }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      aria-describedby={props.describedBy}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

/** Dialogue modal accessible : focus initial, piégeage simple du focus, Échap pour fermer. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onClose = props.onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea')];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="dialog-head">
          <h2 id={titleId}>{props.title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        {props.children}
        {props.footer && <div className="btn-group" style={{ marginTop: 18, justifyContent: 'flex-end' }}>{props.footer}</div>}
      </div>
    </div>
  );
}

export function Toast() {
  const { state, dispatch } = useApp();
  const n = state.notice;
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => dispatch({ type: 'notice/dismiss' }), 6000);
    return () => clearTimeout(t);
  }, [n, dispatch]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {n && (
        <div className={`toast ${n.tone}`} key={n.id}>
          <span>{n.text}</span>
          <button type="button" aria-label="Fermer la notification" onClick={() => dispatch({ type: 'notice/dismiss' })}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export function Empty(props: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{props.title}</strong>
      {props.children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="row" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="small muted">{label}</span>
    </span>
  );
}

const paths: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3',
  play: 'M7 5l12 7-12 7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  folder: 'M3 7h6l2 2h10v10H3z',
};

export function Icon({ name }: { name: keyof typeof paths | string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.home} />
    </svg>
  );
}
