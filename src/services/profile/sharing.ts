// Sharing safety for profiles (D13, docs/LIQUEAMP_PROFILE_SPEC.md §18).
// Before a profile leaves the device (cloud upload, later Friend Liques and
// Packs), every URL in it is checked for credentials. Nothing is changed
// silently: suspicious items are reported, and the user decides per item
// whether to exclude it from the shared copy or share it anyway (or cancel).
// These functions are pure — the local profile is never modified.
import type { LiqueAmpProfile } from './profile';

export type SharingReason =
  | 'credentials-in-url' // user:password@host
  | 'secret-parameter' // ?token=…, ?api_key=…, ?sig=…
  | 'signed-url' // cloud storage / CDN signatures (X-Amz-Signature, SAS, CloudFront …)
  | 'jwt'; // a JSON Web Token anywhere in the URL

export interface SharingFinding {
  /** Stable id of the decision: `media:<id>`, `station:<id>` or `playlist:<id>`. */
  key: string;
  kind: 'media' | 'station' | 'playlist';
  id: string;
  /** Title or name, for showing the finding to the user. */
  label: string;
  /** Every suspicious URL of this item, with the field it is in. */
  urls: Array<{ field: string; url: string; reasons: SharingReason[] }>;
}

export type SharingDecision = 'exclude' | 'share';

/** Query parameter names that carry secrets (case-insensitive, exact). */
const SECRET_PARAMS = new Set([
  'token',
  'access_token',
  'accesstoken',
  'id_token',
  'refresh_token',
  'auth',
  'auth_token',
  'authorization',
  'key',
  'api_key',
  'apikey',
  'api-key',
  'access_key',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'pwd',
  'sig',
  'signature',
  'session',
  'sessionid',
  'session_id',
  'hdnts', // Akamai edge token
  'hdnea',
]);
/** Parameter names that contain one of these are treated as secrets too (e.g. x-api-key, streamToken). */
const SECRET_FRAGMENTS = ['token', 'secret', 'password', 'apikey', 'api_key', 'api-key', 'signature'];

const JWT = /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/;

function isSignedUrl(names: Set<string>): boolean {
  const has = (n: string) => names.has(n);
  return (
    [...names].some((n) => n.startsWith('x-amz-') && (n === 'x-amz-signature' || n === 'x-amz-credential' || n === 'x-amz-security-token')) ||
    has('x-goog-signature') ||
    has('x-goog-credential') ||
    (has('googleaccessid') && has('signature')) ||
    (has('sig') && (has('se') || has('sv') || has('sp'))) || // Azure SAS
    (has('signature') && (has('key-pair-id') || has('policy') || has('expires'))) // CloudFront
  );
}

/** Why a URL looks like it carries a secret; empty when it does not. */
export function inspectUrl(url: string): SharingReason[] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  const reasons = new Set<SharingReason>();
  if (u.username || u.password) reasons.add('credentials-in-url');
  const params = new URLSearchParams(u.search);
  // fragments sometimes carry tokens too (#access_token=…)
  if (u.hash.includes('=')) for (const [k, v] of new URLSearchParams(u.hash.slice(1))) params.append(k, v);
  const names = new Set([...params.keys()].map((k) => k.toLowerCase()));
  if (isSignedUrl(names)) reasons.add('signed-url');
  for (const name of names) {
    if (SECRET_PARAMS.has(name) || SECRET_FRAGMENTS.some((f) => name.includes(f))) {
      if (!reasons.has('signed-url')) reasons.add('secret-parameter');
    }
  }
  if (JWT.test(url)) reasons.add('jwt');
  return [...reasons];
}

function check(fields: Array<[string, string | null | undefined]>) {
  const out: SharingFinding['urls'] = [];
  for (const [field, url] of fields) {
    if (!url) continue;
    const reasons = inspectUrl(url);
    if (reasons.length) out.push({ field, url, reasons });
  }
  return out;
}

/**
 * Finds every item whose URLs look like they carry credentials. Pure: the
 * profile is not modified.
 */
export function sanitizeForSharing(profile: LiqueAmpProfile): { findings: SharingFinding[] } {
  const findings: SharingFinding[] = [];
  for (const m of profile.data.media) {
    const urls = check([
      ['sourceUrl', m.sourceUrl],
      ['streamUrl', m.streamUrl],
      ['artwork', m.artwork],
    ]);
    if (urls.length) findings.push({ key: `media:${m.id}`, kind: 'media', id: m.id, label: m.title, urls });
  }
  for (const s of profile.data.stations) {
    const urls = check([
      ['streamUrl', s.streamUrl],
      ['sourceUrl', s.sourceUrl],
      ['homepage', s.homepage],
      ['favicon', s.favicon],
      ['artwork', s.artwork],
    ]);
    if (urls.length) findings.push({ key: `station:${s.id}`, kind: 'station', id: s.id, label: s.name, urls });
  }
  for (const p of profile.data.playlists) {
    const urls = check([['artwork', p.artwork]]);
    if (urls.length) findings.push({ key: `playlist:${p.id}`, kind: 'playlist', id: p.id, label: p.name, urls });
  }
  return { findings };
}

/** Findings the user has not decided on yet. */
export function undecided(findings: SharingFinding[], decisions: Record<string, SharingDecision>): SharingFinding[] {
  return findings.filter((f) => decisions[f.key] !== 'exclude' && decisions[f.key] !== 'share');
}

/**
 * The shareable copy of a profile, after the user's decisions. `exclude`
 * removes a media item or station (and the playlist entries and favourites
 * that point at it); for a playlist it removes only the playlist's artwork.
 * Returns a new profile; the input is never modified.
 */
export function applySharingDecisions(profile: LiqueAmpProfile, findings: SharingFinding[], decisions: Record<string, SharingDecision>): LiqueAmpProfile {
  const excluded = (kind: SharingFinding['kind']) => new Set(findings.filter((f) => f.kind === kind && decisions[f.key] === 'exclude').map((f) => f.id));
  const media = excluded('media');
  const stations = excluded('station');
  const playlistArt = excluded('playlist');
  const d = profile.data;
  return {
    ...profile,
    data: {
      ...d,
      media: d.media.filter((m) => !media.has(m.id)),
      stations: d.stations.filter((s) => !stations.has(s.id)),
      playlists: d.playlists.map((p) => {
        const items = p.items.filter((i) => !media.has(i.mediaId));
        const { artwork, ...rest } = p;
        return { ...rest, items, ...(artwork && !playlistArt.has(p.id) ? { artwork } : {}) };
      }),
      favorites: d.favorites.filter((f) => !(f.type === 'media' && media.has(f.refId)) && !(f.type === 'station' && stations.has(f.refId))),
    },
  };
}
