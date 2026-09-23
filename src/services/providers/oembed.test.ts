import { describe, expect, it } from 'vitest';
import { detectSource } from './detect';
import { fetchOEmbed, normalizeOEmbed, providerPlaybackType } from './oembed';
import { youtubeError, youtubeVideoId } from '../playback/embedded/youtube';
import { spotifyUri } from '../playback/embedded/spotify';

describe('oEmbed normalization', () => {
  it('splits SoundCloud "Track by Artist" titles', () => {
    expect(normalizeOEmbed('soundcloud', { title: 'Flickermood by Forss', author_name: 'Forss', thumbnail_url: 'https://i1.sndcdn.com/a.jpg' })).toEqual({
      title: 'Flickermood',
      artist: 'Forss',
      artwork: 'https://i1.sndcdn.com/a.jpg',
    });
  });

  it('never invents a Spotify artist and drops non-https artwork', () => {
    expect(normalizeOEmbed('spotify', { title: 'Song', author_name: 'x', thumbnail_url: 'http://insecure/a.jpg' })).toEqual({
      title: 'Song',
      artist: undefined,
      artwork: undefined,
    });
  });

  it('rejects responses without a title', () => {
    expect(normalizeOEmbed('youtube', { author_name: 'x' })).toBeNull();
    expect(normalizeOEmbed('youtube', 'nope')).toBeNull();
  });

  it('asks YouTube about YouTube Music ids', async () => {
    let asked = '';
    const fake = (async (u: RequestInfo | URL) => {
      asked = String(u);
      return new Response(JSON.stringify({ title: 't' }));
    }) as typeof fetch;
    await fetchOEmbed(detectSource('https://music.youtube.com/watch?v=abcdefghijk'), fake);
    expect(new URL(asked).searchParams.get('url')).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });
});

describe('provider playback', () => {
  it('embeds single videos, opens YouTube playlists externally, embeds Spotify/SoundCloud', () => {
    expect(providerPlaybackType(detectSource('https://youtu.be/abcdefghijk'))).toBe('embed');
    expect(providerPlaybackType(detectSource('https://www.youtube.com/playlist?list=PL1'))).toBe('external');
    expect(providerPlaybackType(detectSource('https://open.spotify.com/album/abc123'))).toBe('embed');
    expect(providerPlaybackType(detectSource('https://soundcloud.com/a/b'))).toBe('embed');
  });

  it('extracts player ids', () => {
    expect(youtubeVideoId('https://music.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeVideoId('https://www.youtube.com/playlist?list=PL1')).toBeNull();
    expect(spotifyUri('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC')).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
  });

  it('explains YouTube player errors', () => {
    expect(youtubeError(150).code).toBe('EMBED_BLOCKED');
    expect(youtubeError(101).message).toMatch(/does not allow playback outside YouTube/);
    expect(youtubeError(100).recoverable).toBe(false);
  });
});
