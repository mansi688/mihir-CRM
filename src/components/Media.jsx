import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icons';

// Image with lazy loading and an elegant typographic fallback if the file can't load.
export function Photo({ src, alt = '', label, className = '', eager, style, onClick, ...rest }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  if (failed) {
    return (
      <div className={`photo-fallback ${className}`} style={style} role="img" aria-label={alt || label || 'Image unavailable'}>
        {label && <span>{label}</span>}
      </div>
    );
  }
  return (
    <img src={src} alt={alt} className={className} style={style} loading={eager ? 'eager' : 'lazy'} decoding="async"
      onError={() => setFailed(true)} onClick={onClick} {...rest} />
  );
}

// Accessible lightbox: arrow keys, Esc, swipe, previous/next buttons, focus kept inside.
export function Lightbox({ items, index, onClose, onIndex }) {
  const box = useRef(null);
  const touch = useRef(null);
  const item = items[index];
  const go = useCallback((d) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    const prev = document.activeElement;
    document.body.style.overflow = 'hidden';
    box.current?.focus();
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Tab') {
        const f = box.current.querySelectorAll('button');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [go, onClose]);

  if (!item) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" ref={box} tabIndex={-1}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}>
      <button className="lb-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      {items.length > 1 && <button className="lb-nav prev" onClick={() => go(-1)} aria-label="Previous image"><Icon name="back" /></button>}
      <figure>
        <Photo key={item.src} src={item.src} alt={item.alt} label={item.alt} eager />
        <figcaption>{item.caption || item.alt}<span>{index + 1} / {items.length}</span></figcaption>
      </figure>
      {items.length > 1 && <button className="lb-nav next" onClick={() => go(1)} aria-label="Next image"><Icon name="back" style={{ transform: 'rotate(180deg)' }} /></button>}
    </div>
  );
}

// Gallery grid that opens the lightbox. Mixes wide and portrait tiles.
export function Gallery({ items, className = '' }) {
  const [open, setOpen] = useState(-1);
  if (!items?.length) return null;
  return (
    <>
      <ul className={`gallery ${className}`}>
        {items.map((g, i) => (
          <li key={g.src + i} className={`reveal g${i % 5}`} style={{ transitionDelay: `${(i % 4) * 0.08}s` }}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Open image: ${g.alt || 'project image'}`}>
              <Photo src={g.src} alt={g.alt} label={g.alt} />
              {g.caption && <span className="g-cap">{g.caption}</span>}
            </button>
          </li>
        ))}
      </ul>
      {open >= 0 && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />}
    </>
  );
}

// Video with poster, controls, lazy loading, and a fallback image
export function Film({ src, poster, title }) {
  const yt = (src || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)?.[1];
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  if (yt) {
    return (
      <div className="film">
        <iframe src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`} title={title} loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (failed) return poster ? <div className="film"><Photo src={poster} alt={title} label={title} /></div> : null;
  return (
    <div className="film">
      <video src={src} poster={poster} controls playsInline preload="none" onError={() => setFailed(true)} aria-label={title}>
        <a href={src}>Download the video</a>
      </video>
    </div>
  );
}
