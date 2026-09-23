// A single polite live region for short status messages that have no other
// visible text change the screen reader would notice (e.g. a keyboard
// shortcut changed the volume). Plain DOM, outside React.

const ID = 'la-announcer';

function region(): HTMLElement {
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  return el;
}

let timer = 0;

/** Announces `message`; repeating the same message is announced again. */
export function announce(message: string): void {
  const el = region();
  el.textContent = '';
  window.clearTimeout(timer);
  // A short delay makes screen readers treat identical text as new.
  timer = window.setTimeout(() => {
    el.textContent = message;
  }, 50);
}
