const BY_TYPE: ReadonlyArray<[RegExp, string]> = [
  [/^audio\/(mpeg|mp3|mpeg3|x-mpeg)\b/i, 'MP3'],
  [/^audio\/(aac|aacp|x-aac)\b/i, 'AAC'],
  [/^audio\/(mp4|x-m4a|m4a)\b/i, 'AAC/M4A'],
  [/^audio\/(ogg|x-ogg)\b.*opus/i, 'OPUS'],
  [/^audio\/opus\b/i, 'OPUS'],
  [/^audio\/(ogg|x-ogg|vorbis)\b/i, 'OGG'],
  [/^audio\/(flac|x-flac)\b/i, 'FLAC'],
  [/^audio\/(wav|x-wav|wave|vnd\.wave)\b/i, 'WAV'],
  [/^audio\/webm\b/i, 'WEBM'],
];

/** Codec label from a server-declared Content-Type, or undefined. */
export function codecFromContentType(contentType: string | null | undefined): string | undefined {
  if (!contentType) return undefined;
  return BY_TYPE.find(([re]) => re.test(contentType.trim()))?.[1];
}

/** Codec label from an HLS CODECS attribute (e.g. "mp4a.40.2"). */
export function codecFromHls(codecs: string | undefined): string | undefined {
  if (!codecs) return undefined;
  if (/mp4a\.40\.(2|5|29)/i.test(codecs)) return 'AAC';
  if (/mp4a\.(40\.34|6b)|mp3/i.test(codecs)) return 'MP3';
  if (/opus/i.test(codecs)) return 'OPUS';
  if (/flac/i.test(codecs)) return 'FLAC';
  if (/ac-3|ec-3/i.test(codecs)) return 'AC-3';
  return codecs.split(',')[0]?.trim().toUpperCase();
}

/** Positive integer kbps from a header like `icy-br: 128` (or "128,128"). */
export function parseBitrate(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value.split(',')[0]!.trim(), 10);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : undefined;
}
