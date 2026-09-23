import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { RowList } from './RowList';
import { onTablistKeyDown } from './controls';

afterEach(cleanup);

function Rows({ n }: { n: number }) {
  return (
    <RowList aria-label="Rows">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <button type="button">main {i}</button>
          <button type="button">play {i}</button>
        </li>
      ))}
    </RowList>
  );
}

const tabbable = (c: HTMLElement) => Array.from(c.querySelectorAll('button')).filter((b) => b.tabIndex === 0).map((b) => b.textContent);

describe('RowList roving focus', () => {
  it('only the active row is in the Tab order', () => {
    const { container } = render(<Rows n={4} />);
    expect(tabbable(container)).toEqual(['main 0', 'play 0']);
  });

  it('arrow keys keep the column and move the Tab stop along', () => {
    const { getByText, container } = render(<Rows n={4} />);
    getByText('play 0').focus();
    fireEvent.keyDown(getByText('play 0'), { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('play 1');
    expect(tabbable(container)).toEqual(['main 1', 'play 1']);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('play 3');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement?.textContent).toBe('play 0');
  });

  it('consumes arrows at the ends so no global shortcut fires', () => {
    const { getByText } = render(<Rows n={2} />);
    getByText('main 0').focus();
    const notCancelled = fireEvent.keyDown(getByText('main 0'), { key: 'ArrowUp' });
    expect(notCancelled).toBe(false);
    expect(document.activeElement?.textContent).toBe('main 0');
  });

  it('keeps a valid Tab stop when rows are removed', async () => {
    const { getByText, container, rerender } = render(<Rows n={4} />);
    getByText('main 3').focus();
    rerender(<Rows n={2} />);
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver
    expect(tabbable(container)).toEqual(['main 1', 'play 1']);
  });
});

describe('tablist keyboard pattern', () => {
  it('arrows move and activate, wrapping; Home/End jump', () => {
    const clicked: string[] = [];
    const { getByText } = render(
      <div role="tablist" onKeyDown={onTablistKeyDown}>
        {['a', 'b', 'c'].map((t) => (
          <button key={t} role="tab" type="button" onClick={() => clicked.push(t)}>
            {t}
          </button>
        ))}
      </div>,
    );
    getByText('a').focus();
    fireEvent.keyDown(getByText('a'), { key: 'ArrowLeft' });
    expect(document.activeElement?.textContent).toBe('c');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(clicked).toEqual(['c', 'a', 'c']);
  });
});
