// Animates numbers in dashboard/report stat cards (.stat .v) from 0 to their value.
// Works on any page without changing its markup: it watches for new or changed figures
// and eases the first numeric text node. Skipped for people who prefer reduced motion.
const SELECTOR = '.stat .v';
const written = new WeakMap(); // text node -> value we last wrote ourselves
const running = new WeakMap(); // text node -> animation frame id

function animate(node) {
  const raw = node.nodeValue;
  if (written.get(node) === raw) return; // our own write
  const target = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(target)) return;
  const end = parseFloat(target);
  if (!end) return;
  const decimals = (target.split('.')[1] || '').length;
  cancelAnimationFrame(running.get(node));
  const start = performance.now();
  const duration = Math.min(1100, 500 + end * 12);
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = t < 1 ? (end * eased).toFixed(decimals) : target;
    const text = raw.replace(target, value);
    written.set(node, text);
    node.nodeValue = text;
    if (t < 1) running.set(node, requestAnimationFrame(frame));
  };
  running.set(node, requestAnimationFrame(frame));
}

function scan(root) {
  const els = root.matches?.(SELECTOR) ? [root] : root.querySelectorAll?.(SELECTOR) || [];
  els.forEach((el) => {
    const first = [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (first) animate(first);
  });
}

export function startCountUp() {
  if (typeof window === 'undefined' || !('MutationObserver' in window)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const mo = new MutationObserver((records) => {
    records.forEach((r) => {
      if (r.type === 'characterData') {
        const el = r.target.parentElement;
        if (el?.matches(SELECTOR)) animate(r.target);
      } else {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1) scan(n);
          else if (n.nodeType === 3 && n.parentElement?.matches(SELECTOR)) animate(n);
        });
      }
    });
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan(document.body);
}
