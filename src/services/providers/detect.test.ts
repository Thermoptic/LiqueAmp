import { describe, expect, it } from 'vitest';
import { detectSource, InvalidUrlError, normalizeUrl } from './detect';

describe('normalizeUrl', () => {
  it('trims, adds https to bare hosts, lower-cases the host, drops fragments and tracking params', () => {
    expect(normalizeUrl('  Example.COM/Stream.mp3?utm_source=x&token=abc#top ')).toBe('https://example.com/Stream.mp3?token=abc');
  });

  it('defaults bare local hosts and IPs to http, other hosts to https', () => {
    expect(normalizeUrl('127.0.0.1:8765/mix.m3u')).toBe('http://127.0.0.1:8765/mix.m3u');
    expect(normalizeUrl('localhost:8000/stream')).toBe('http://localhost:8000/stream');
    expect(normalizeUrl('radio.example.com:8000/live')).toBe('https://radio.example.com:8000/live');
  });

  it('keeps non-tracking query parameters (stream tokens)', () => {
    expect(normalizeUrl('https://cdn.example.com/live?auth=123&fbclid=zzz')).toBe('https://cdn.example.com/live?auth=123');
  });

  it('rejects empty and invalid input', () => {
    expect(() => normalizeUrl('   ')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('not a url')).toThrow(InvalidUrlError);
  });
});

describe('detectSource', () => {
  const kind = (u: string) => {
    const d = detectSource(u);
    return `${d.provider}/${d.kind}`;
  };

  it('detects YouTube variants and canonicalizes them', () => {
    const d = detectSource('https://youtu.be/dQw4w9WgXcQ?si=abc');
    expect(d.provider).toBe('youtube');
    expect(d.normalizedUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(d.providerItemId).toBe('youtube:video:dQw4w9WgXcQ');
    expect(detectSource('https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share').normalizedUrl).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(detectSource('https://www.youtube.com/shorts/abcdefghijk').providerItemId).toBe('youtube:video:abcdefghijk');
    expect(detectSource('https://www.youtube.com/playlist?list=PL123').providerItemId).toBe('youtube:playlist:PL123');
  });

  it('distinguishes YouTube Music before YouTube (PROVIDERS §29)', () => {
    expect(kind('https://music.youtube.com/watch?v=abcdefghijk')).toBe('youtube-music/provider');
  });

  it('detects Spotify URLs and URIs with the same identity', () => {
    const a = detectSource('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=xyz');
    const b = detectSource('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(a.providerItemId).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(b.providerItemId).toBe(a.providerItemId);
    expect(a.normalizedUrl).toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  });

  it('detects SoundCloud tracks', () => {
    const d = detectSource('https://soundcloud.com/artist/track-name/?in=x');
    expect(d.provider).toBe('soundcloud');
    expect(d.normalizedUrl).toBe('https://soundcloud.com/artist/track-name');
    expect(detectSource('https://soundcloud.com/').confidence).toBe('low');
  });

  it('classifies direct sources by extension', () => {
    expect(kind('https://x.com/a.mp3')).toBe('direct/audio');
    expect(kind('https://x.com/a.OPUS')).toBe('direct/audio');
    expect(kind('https://x.com/live.m3u8')).toBe('direct/hls');
    expect(kind('https://x.com/station.pls')).toBe('direct/playlist');
    expect(kind('https://x.com/station.m3u')).toBe('direct/playlist');
  });

  it('recognises extension-less Icecast/Shoutcast streams with medium confidence', () => {
    expect(detectSource('http://radio.example.com:8000/stream').confidence).toBe('medium');
    expect(detectSource('https://example.com/;').kind).toBe('stream');
    const unknown = detectSource('https://example.com/something');
    expect(unknown.kind).toBe('stream');
    expect(unknown.confidence).toBe('low');
  });

  it('marks unsupported schemes', () => {
    expect(detectSource('ftp://example.com/a.mp3').kind).toBe('unsupported');
  });
});
