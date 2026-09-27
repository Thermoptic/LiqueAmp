// The artwork placeholder: rings by default, the LIQUEAMP mark in Now Playing.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Artwork } from './Artwork';

afterEach(cleanup);

describe('Artwork placeholder', () => {
  it('shows the rings by default (mini player, media editor)', () => {
    const { container } = render(<Artwork src={null} alt="" />);
    expect(container.querySelectorAll('.artwork__fallback-ring')).toHaveLength(2);
    expect(container.querySelector('.artwork__logo')).toBeNull();
  });

  it('shows the theme-coloured LIQUEAMP mark instead of the rings when asked (Now Playing)', () => {
    const { container } = render(<Artwork src={null} alt="" placeholder="logo" />);
    expect(container.querySelector('.artwork__fallback-ring')).toBeNull();
    expect(container.querySelector('.artwork__fallback-bg')).not.toBeNull(); // same background and dots
    const mark = container.querySelector('.artwork__logo .logo-mark') as HTMLElement;
    expect(mark.querySelector('.logo-mark__body')).not.toBeNull();
    expect(mark.querySelector('.logo-mark__note')).not.toBeNull();
    expect(mark.style.width).toBe('100%');
  });

  it('real artwork is shown as-is, without the mark', () => {
    const { container } = render(<Artwork src="https://art.example/a.jpg" alt="Cover" placeholder="logo" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://art.example/a.jpg');
    expect(container.querySelector('.artwork__logo')).toBeNull();
  });
});
