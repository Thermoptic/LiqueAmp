import { describe, expect, it } from 'vitest';
import { isHlsManifest, parseM3U, parsePlaylist, parsePLS, PlaylistParseError, sniffPlaylist } from './playlists';

const BASE = 'https://radio.example.com/lists/station.m3u';

describe('M3U', () => {
  it('parses extended M3U with titles, durations and relative URLs', () => {
    const text = '#EXTM3U\n#EXTINF:-1,Groove Radio\nhttps://s1.example.com/live\n#EXTINF:215,Artist - Song\nsong.mp3\n';
    expect(parseM3U(text, BASE)).toEqual([
      { url: 'https://s1.example.com/live', title: 'Groove Radio', duration: null },
      { url: 'https://radio.example.com/lists/song.mp3', title: 'Artist - Song', duration: 215 },
    ]);
  });

  it('parses plain M3U, CRLF and BOM, skipping non-http entries', () => {
    const text = '﻿http://a.example.com/1.mp3\r\nC:\\Music\\local.mp3\r\n\r\nhttp://a.example.com/2.mp3\r\n';
    expect(parseM3U(text, BASE).map((e) => e.url)).toEqual(['http://a.example.com/1.mp3', 'http://a.example.com/2.mp3']);
  });

  it('throws a readable error when nothing is playable', () => {
    expect(() => parseM3U('#EXTM3U\n#EXTINF:-1,Nothing\n', BASE)).toThrow(PlaylistParseError);
  });
});

describe('PLS', () => {
  it('parses entries in numeric order with live lengths as null', () => {
    const text = '[playlist]\nNumberOfEntries=2\nFile2=http://mirror.example.com/stream\nTitle2=Mirror\nLength2=-1\nfile1=http://main.example.com/stream\ntitle1=Main\nlength1=-1\nVersion=2\n';
    expect(parsePLS(text, BASE)).toEqual([
      { url: 'http://main.example.com/stream', title: 'Main', duration: null },
      { url: 'http://mirror.example.com/stream', title: 'Mirror', duration: null },
    ]);
  });

  it('rejects files without the [playlist] header', () => {
    expect(() => parsePLS('File1=http://x/y', BASE)).toThrow(PlaylistParseError);
  });
});

describe('sniffing', () => {
  it('tells HLS manifests from station lists', () => {
    const hls = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg1.ts\n';
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"\naudio.m3u8\n';
    expect(isHlsManifest(hls)).toBe(true);
    expect(sniffPlaylist(master)).toBe('hls');
    expect(sniffPlaylist('#EXTM3U\n#EXTINF:-1,Radio\nhttp://x/live\n')).toBe('m3u');
    expect(sniffPlaylist('[Playlist]\nFile1=http://x')).toBe('pls');
    expect(sniffPlaylist('<html>nope</html>')).toBe('unknown');
  });

  it('parsePlaylist returns no entries for HLS and errors for unknown content', () => {
    expect(parsePlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:4\n', BASE)).toEqual({ format: 'hls', entries: [] });
    expect(() => parsePlaylist('<html></html>', BASE)).toThrow(PlaylistParseError);
  });
});
