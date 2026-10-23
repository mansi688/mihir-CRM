import { useEffect, useRef, useState } from 'react';
import { MAX_PHOTOS } from '../lib/constants';
import Icon from './Icons';

// Lets the user add up to MAX_PHOTOS images (camera or gallery) with previews.
export default function PhotoPicker({ files, onChange, max = MAX_PHOTOS }) {
  const input = useRef(null);
  const [previews, setPreviews] = useState([]);
  const [warn, setWarn] = useState('');

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function add(list) {
    const picked = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    const tooBig = picked.filter((f) => f.size > 15 * 1024 * 1024);
    const ok = picked.filter((f) => f.size <= 15 * 1024 * 1024);
    const next = [...files, ...ok].slice(0, max);
    setWarn(tooBig.length ? 'Some photos were larger than 15 MB and were skipped.' :
      files.length + ok.length > max ? `You can attach up to ${max} photos.` : '');
    onChange(next);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="photos">
        {previews.map((src, i) => (
          <div className="photo" key={src}>
            <img src={src} alt={`Attachment ${i + 1}`} />
            <button type="button" className="x" aria-label="Remove photo" onClick={() => onChange(files.filter((_, j) => j !== i))}>
              <Icon name="x" />
            </button>
          </div>
        ))}
        {files.length < max && (
          <button type="button" className="photo-add" onClick={() => input.current?.click()}>
            <span><Icon name="camera" />Add photo</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {warn && <small className="muted">{warn}</small>}
    </div>
  );
}
