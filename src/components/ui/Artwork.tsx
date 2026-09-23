import { useState } from 'react';

interface ArtworkProps {
  src?: string | null;
  alt: string;
  className?: string;
}

/**
 * Square artwork with a designed LIQUEAMP fallback — never a broken image
 * icon (DESIGN §66). External artwork is shown as-is, never recolored.
 */
export function Artwork({ src, alt, className = '' }: ArtworkProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src && failed !== src;
  return (
    <div className={`artwork ${className}`}>
      <span className="artwork__corner artwork__corner--tl" aria-hidden="true" />
      <span className="artwork__corner artwork__corner--tr" aria-hidden="true" />
      <span className="artwork__corner artwork__corner--bl" aria-hidden="true" />
      <span className="artwork__corner artwork__corner--br" aria-hidden="true" />
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <svg className="artwork__fallback" viewBox="0 0 100 100" role="img" aria-label={alt}>
          <defs>
            <pattern id="la-dots" width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="0.9" />
            </pattern>
          </defs>
          <rect width="100" height="100" className="artwork__fallback-bg" />
          <rect width="100" height="100" fill="url(#la-dots)" className="artwork__fallback-dots" />
          <circle cx="50" cy="50" r="30" className="artwork__fallback-ring" />
          <circle cx="50" cy="50" r="18" className="artwork__fallback-ring artwork__fallback-ring--inner" />
          <circle cx="50" cy="50" r="3" className="artwork__fallback-core" />
        </svg>
      )}
    </div>
  );
}
