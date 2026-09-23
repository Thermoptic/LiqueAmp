/**
 * First tab stop on the page: jumps past the header and navigation to the
 * first visible panel of the main content. On mobile that is whichever
 * section is showing, so the target is found at click time.
 */
export function SkipLink({ targetId }: { targetId: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-link"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById(targetId);
        const panel = main && Array.from(main.querySelectorAll<HTMLElement>('section, [role="region"]')).find((el) => el.getClientRects().length > 0);
        if (!panel) return;
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        panel.focus();
      }}
    >
      Skip to main content
    </a>
  );
}
