import { useState } from 'react';

// Company logo image, with a typographic fallback if the file can't load.
export function LogoMark({ url, company = 'Mihir Group', light }) {
  const [failed, setFailed] = useState(!url);
  if (!failed) return <img className={`logo-img ${light ? 'light' : ''}`} src={url} alt={company} onError={() => setFailed(true)} />;
  const [first, ...rest] = company.split(' ');
  return <span className="logo-word"><b>{first}</b> {rest.join(' ')}</span>;
}
