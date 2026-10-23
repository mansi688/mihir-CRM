import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STATUS_LABEL, PRIORITY_LABEL } from '../lib/constants';
import { isOverdue } from '../lib/utils';
import Icon from './Icons';

export function StatusBadge({ status }) {
  return <span className={`badge st-${status}`}>{STATUS_LABEL[status] || status}</span>;
}
export function PriorityBadge({ priority }) {
  return <span className={`badge pr pr-${priority}`}>{PRIORITY_LABEL[priority] || priority}</span>;
}
export function OverdueBadge({ complaint }) {
  return isOverdue(complaint) ? <span className="badge overdue-tag">Overdue</span> : null;
}

// The flat nameplate: dark tower block + white flat block, like a door plate
export function FlatPlate({ c, tower, wing, flat, lg, common }) {
  const t = (tower ?? c?.tower_name ?? '').replace(/^tower\s*/i, 'T');
  const w = wing ?? c?.wing_name ?? '';
  const f = flat ?? c?.flat_no ?? '';
  const isCommon = common ?? c?.area === 'common';
  return (
    <span className={`plate ${lg ? 'lg' : ''} ${isCommon ? 'common' : ''}`} title={isCommon ? 'Common area — reported from this flat' : 'Flat'}>
      <span className="t">{t}</span>
      <span className="f">{w}-{f}</span>
    </span>
  );
}

export function Spinner() { return <div className="spinner" role="status" aria-label="Loading" />; }
export function Loading() { return <div className="center"><Spinner /></div>; }

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert-box error" role="alert">{error}</div>;
}

// A labelled form field. Use `group` when the children are buttons/tiles (or several controls):
// a <label> would make the caption and gaps activate the first button inside it.
let fieldSeq = 0;
export function Field({ label, hint, children, group }) {
  const [id] = useState(() => `fld-${++fieldSeq}`);
  if (group) {
    return (
      <div className="field" role="group" aria-labelledby={label ? `${id}-l` : undefined} aria-describedby={hint ? `${id}-h` : undefined}>
        {label && <span id={`${id}-l`}>{label}</span>}
        {children}
        {hint && <small id={`${id}-h`}>{hint}</small>}
      </div>
    );
  }
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Stars({ value = 0, onChange, read }) {
  return (
    <span className={`stars ${read ? 'read' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        read ? (
          <span key={n} style={{ color: n <= value ? '#e3a500' : 'var(--line-strong)' }}><Icon name="star" filled /></span>
        ) : (
          <button key={n} type="button" className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} star`}>
            <Icon name="star" filled />
          </button>
        )
      )}
    </span>
  );
}

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Pager({ page, pageSize, count, onPage }) {
  if (!count || count <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(count, (page + 1) * pageSize);
  return (
    <div className="pager">
      <span>{from}–{to} of {count}</span>
      <div className="row">
        <button className="btn secondary sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn secondary sm" disabled={to >= count} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
