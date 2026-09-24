import type { CSSProperties } from 'react';
import bodyMask from '../../assets/logo/body.png';
import noteMask from '../../assets/logo/note.png';

const mask = (url: string): CSSProperties => ({ maskImage: `url(${url})`, WebkitMaskImage: `url(${url})` });

/**
 * The LIQUEAMP mark. Two alpha masks cut from the logo artwork
 * (scripts/split-logo.mjs) are filled with theme colours, so the mark follows
 * the active theme: the play triangle and drop in the text colour, the music
 * note in the theme's primary colour.
 */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <span className="logo-mark__layer logo-mark__body" style={mask(bodyMask)} />
      <span className="logo-mark__layer logo-mark__note" style={mask(noteMask)} />
    </span>
  );
}
