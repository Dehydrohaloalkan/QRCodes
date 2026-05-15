/** Max UTF-8 bytes per chunk; below QR v40 byte capacity at EC level M (~2331). */
export const DEFAULT_MAX_CHUNK_BYTES = 2200;

export function splitTextIntoUtf8Chunks(text: string, maxBytes: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (maxBytes < 8) {
    throw new RangeError('maxBytes must be at least 8');
  }
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of normalized) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > maxBytes && current !== '') {
      chunks.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}
