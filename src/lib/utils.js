import { ACTIVE_STATUSES } from './constants';

const IST = 'Asia/Kolkata';

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });
}
export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST,
  });
}
export function timeAgo(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24); if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return fmtDate(d);
}
export function isOverdue(c) {
  return Boolean(c?.due_at && ACTIVE_STATUSES.includes(c.status) && new Date(c.due_at) < new Date());
}
export function dueText(c) {
  if (!c?.due_at) return '—';
  if (!ACTIVE_STATUSES.includes(c.status)) return fmtDateTime(c.due_at);
  const diff = new Date(c.due_at).getTime() - Date.now();
  const hrs = Math.abs(diff) / 3600e3;
  const span = hrs < 1 ? `${Math.max(1, Math.round(hrs * 60))} min` : hrs < 48 ? `${Math.round(hrs)} hr` : `${Math.round(hrs / 24)} days`;
  return diff < 0 ? `Overdue by ${span}` : `Due in ${span}`;
}
export function hoursBetween(a, b) {
  if (!a || !b) return null;
  return Math.round(((new Date(b) - new Date(a)) / 3600e3) * 10) / 10;
}
// short local datetime value for <input type="datetime-local">
export function toLocalInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function errMsg(e) {
  if (!e) return 'Something went wrong.';
  const m = e.message || e.error_description || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
  if (/User already registered/i.test(m)) return 'An account with this email already exists. Try signing in.';
  if (/row-level security/i.test(m)) return 'You do not have permission to do this.';
  if (/duplicate key/i.test(m)) return 'This already exists.';
  if (/violates foreign key/i.test(m)) return 'This record is in use and cannot be removed.';
  return m;
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export function downloadCSV(filename, rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Shrinks phone photos to ≤1600px JPEG before upload (saves mobile data & storage).
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  if (!file.type.startsWith('image/') || /heic|heif/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function flatCode(c) {
  if (!c) return '';
  const tower = (c.tower_name || '').replace(/^tower\s*/i, 'T');
  return `${tower} / ${c.wing_name}-${c.flat_no}`;
}

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now().toString(36);
}
