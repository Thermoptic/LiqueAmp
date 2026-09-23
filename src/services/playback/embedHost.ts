// Holds the official provider players (iframes). An iframe reloads — and
// stops playing — whenever it is moved in the DOM, so the host is created
// once, appended to <body>, and only ever *positioned*: over the Now Playing
// slot when that slot is on screen, otherwise docked in a corner. It is
// never hidden, because provider terms require a visible player (YouTube:
// at least 200×200 px).

type Listener = (state: EmbedHostState) => void;

export interface EmbedHostState {
  active: boolean;
  docked: boolean;
}

let host: HTMLDivElement | null = null;
let slot: HTMLElement | null = null;
let active = false;
let frame = 0;
const listeners = new Set<Listener>();
let resizeObserver: ResizeObserver | null = null;

function notify() {
  const state = getEmbedHostState();
  listeners.forEach((l) => l(state));
}

function slotVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function place() {
  frame = 0;
  if (!host) return;
  host.hidden = !active;
  if (!active) return;
  const docked = !slot || !slotVisible(slot);
  host.classList.toggle('embed-host--docked', docked);
  if (docked) {
    host.style.removeProperty('left');
    host.style.removeProperty('top');
    host.style.removeProperty('width');
    host.style.removeProperty('height');
  } else {
    const r = slot!.getBoundingClientRect();
    host.style.left = `${r.left}px`;
    host.style.top = `${r.top}px`;
    host.style.width = `${r.width}px`;
    host.style.height = `${r.height}px`;
  }
  if (host.dataset.docked !== String(docked)) {
    host.dataset.docked = String(docked);
    notify();
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(place);
}

/** The element provider players render into. Created on first use. */
export function getEmbedContainer(): HTMLDivElement {
  if (!host) {
    host = document.createElement('div');
    host.className = 'embed-host';
    host.hidden = true;
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Provider player');
    document.body.appendChild(host);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    resizeObserver = new ResizeObserver(schedule);
  }
  return host;
}

/** Shows or hides the host; called by embedded backends. */
export function setEmbedActive(value: boolean): void {
  active = value;
  getEmbedContainer();
  schedule();
  notify();
}

/** The Now Playing panel registers the element the player should cover. */
export function attachEmbedSlot(el: HTMLElement): () => void {
  slot = el;
  resizeObserver?.disconnect();
  getEmbedContainer();
  resizeObserver?.observe(el);
  resizeObserver?.observe(document.body);
  schedule();
  return () => {
    if (slot === el) slot = null;
    resizeObserver?.disconnect();
    schedule();
  };
}

export function getEmbedHostState(): EmbedHostState {
  return { active, docked: host?.dataset.docked === 'true' };
}

export function onEmbedHostChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
