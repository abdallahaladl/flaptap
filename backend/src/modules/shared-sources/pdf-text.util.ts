import * as zlib from 'zlib';

/**
 * Pure-Node PDF text extractor (zero external npm dependencies).
 * Extracts text from uncompressed and FlateDecode PDF content streams
 * using standard Tj / TJ / ' / " text operators and handles literal strings,
 * octal escapes, hex strings, and UTF-16BE BOM strings.
 */
export function extractTextFromPdfBuffer(buffer: Buffer): { text: string; pageCount: number } {
  if (!buffer || buffer.length < 8) {
    throw new Error('The uploaded PDF file is empty.');
  }

  const header = buffer.subarray(0, 1024).toString('latin1');
  if (!header.includes('%PDF-')) {
    throw new Error('That file does not appear to be a valid PDF document.');
  }

  const raw = buffer.toString('latin1');
  const pageMatches = raw.match(/\/Type\s*\/Page\b(?!s)/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const streamIdx = raw.indexOf('stream', cursor);
    if (streamIdx < 0) break;

    // Inspect preceding dictionary for filter hints
    const dictStart = Math.max(0, raw.lastIndexOf('<<', streamIdx));
    const dictSlice = raw.slice(dictStart, streamIdx);
    const isImageStream = /\/Subtype\s*\/Image\b/i.test(dictSlice);

    let dataStart = streamIdx + 6;
    if (raw[dataStart] === '\r' && raw[dataStart + 1] === '\n') dataStart += 2;
    else if (raw[dataStart] === '\n' || raw[dataStart] === '\r') dataStart += 1;

    const endIdx = raw.indexOf('endstream', dataStart);
    if (endIdx < 0) break;
    cursor = endIdx + 9;

    if (isImageStream) continue;

    let streamEnd = endIdx;
    while (streamEnd > dataStart && (raw[streamEnd - 1] === '\n' || raw[streamEnd - 1] === '\r')) {
      streamEnd--;
    }

    const rawBytes = buffer.subarray(dataStart, streamEnd);
    const isFlate = /\/FlateDecode\b/i.test(dictSlice);
    let decoded = '';

    if (isFlate) {
      const inflated = tryInflate(rawBytes);
      if (inflated) {
        decoded = inflated.toString('latin1');
      }
    } else if (!/\/DCTDecode|\/JPXDecode|\/JBIG2Decode|\/CCITTFaxDecode/i.test(dictSlice)) {
      decoded = rawBytes.toString('latin1');
    }

    if (decoded && (decoded.includes('BT') || decoded.includes('Tj') || decoded.includes('TJ'))) {
      const extracted = extractPdfOperatorsText(decoded);
      if (extracted) chunks.push(extracted);
    }
  }

  // Fallback for minimalist uncompressed PDFs with top-level text objects
  if (chunks.length === 0) {
    const fallback = extractPdfOperatorsText(raw);
    if (fallback) chunks.push(fallback);
  }

  const text = chunks
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { text, pageCount };
}

function tryInflate(bytes: Buffer): Buffer | null {
  try {
    return zlib.inflateSync(bytes);
  } catch {
    try {
      return zlib.inflateRawSync(bytes);
    } catch {
      return null;
    }
  }
}

function extractPdfOperatorsText(stream: string): string {
  const blocks: string[] = [];
  const btRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let match: RegExpExecArray | null;

  while ((match = btRegex.exec(stream)) !== null) {
    const body = match[1];
    const parts: string[] = [];
    let i = 0;

    while (i < body.length) {
      const ch = body[i];

      // Literal string (...) followed by Tj / ' / "
      if (ch === '(') {
        const { value, nextIndex } = readPdfLiteralString(body, i);
        i = nextIndex;
        const lookahead = body.slice(i, i + 16);
        if (/^\s*(?:Tj|'|")/.test(lookahead)) {
          const decoded = decodePdfTextString(value);
          if (decoded) parts.push(decoded);
        }
        continue;
      }

      // Hex string <...> followed by Tj
      if (ch === '<' && body[i + 1] !== '<') {
        const close = body.indexOf('>', i + 1);
        if (close > i) {
          const hex = body.slice(i + 1, close);
          i = close + 1;
          const lookahead = body.slice(i, i + 16);
          if (/^\s*(?:Tj|'|")/.test(lookahead)) {
            const decoded = decodePdfHexString(hex);
            if (decoded) parts.push(decoded);
          }
          continue;
        }
      }

      // Array [...] followed by TJ
      if (ch === '[') {
        const { text, nextIndex } = readPdfTextArray(body, i);
        i = nextIndex;
        const lookahead = body.slice(i, i + 16);
        if (/^\s*TJ\b/.test(lookahead)) {
          if (text) parts.push(text);
        }
        continue;
      }

      // New line operators Td / TD / T*
      if (
        (ch === 'T' && (body[i + 1] === 'd' || body[i + 1] === 'D' || body[i + 1] === '*')) &&
        parts.length > 0 &&
        !parts[parts.length - 1].endsWith('\n') &&
        !parts[parts.length - 1].endsWith(' ')
      ) {
        parts.push(' ');
        i += 2;
        continue;
      }

      i++;
    }

    const joined = parts.join('').replace(/[ \t]+/g, ' ').trim();
    if (joined && isLikelyReadableText(joined)) {
      blocks.push(joined);
    }
  }

  return blocks.join('\n').trim();
}

function readPdfLiteralString(src: string, start: number): { value: string; nextIndex: number } {
  let i = start + 1;
  let depth = 1;
  let out = '';

  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === undefined) break;
      if (next === 'n') {
        out += '\n';
        i += 2;
      } else if (next === 'r') {
        out += '\r';
        i += 2;
      } else if (next === 't') {
        out += '\t';
        i += 2;
      } else if (next === 'b') {
        out += '\b';
        i += 2;
      } else if (next === 'f') {
        out += '\f';
        i += 2;
      } else if (next === '(' || next === ')' || next === '\\') {
        out += next;
        i += 2;
      } else if (next === '\r' || next === '\n') {
        i += next === '\r' && src[i + 2] === '\n' ? 3 : 2;
      } else if (/[0-7]/.test(next)) {
        const oct = src.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
        out += String.fromCharCode(parseInt(oct, 8));
        i += 1 + oct.length;
      } else {
        out += next;
        i += 2;
      }
      continue;
    }
    if (ch === '(') {
      depth++;
      out += ch;
      i++;
      continue;
    }
    if (ch === ')') {
      depth--;
      if (depth > 0) out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }

  return { value: out, nextIndex: i };
}

function readPdfTextArray(src: string, start: number): { text: string; nextIndex: number } {
  let i = start + 1;
  let out = '';

  while (i < src.length && src[i] !== ']') {
    const ch = src[i];
    if (ch === '(') {
      const { value, nextIndex } = readPdfLiteralString(src, i);
      out += decodePdfTextString(value);
      i = nextIndex;
      continue;
    }
    if (ch === '<' && src[i + 1] !== '<') {
      const close = src.indexOf('>', i + 1);
      if (close > i) {
        out += decodePdfHexString(src.slice(i + 1, close));
        i = close + 1;
        continue;
      }
    }
    // Negative kerning adjustment larger than ~140 typically indicates a word space
    const numMatch = /^-?\d+(?:\.\d+)?/.exec(src.slice(i));
    if (numMatch) {
      const kern = parseFloat(numMatch[0]);
      if (kern <= -140 && out.length > 0 && !out.endsWith(' ')) {
        out += ' ';
      }
      i += numMatch[0].length;
      continue;
    }
    i++;
  }

  return { text: out, nextIndex: i < src.length ? i + 1 : i };
}

function decodePdfTextString(raw: string): string {
  if (raw.length >= 2 && raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < raw.length; i += 2) {
      out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
    }
    return cleanPdfChars(out);
  }
  return cleanPdfChars(raw);
}

function decodePdfHexString(hexRaw: string): string {
  const clean = hexRaw.replace(/[^0-9a-fA-F]/g, '');
  if (!clean) return '';
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  const bytes = Buffer.from(padded, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return cleanPdfChars(out);
  }
  // Detect UTF-16BE encoded glyph pairs (common in Google Docs / Word PDFs)
  if (bytes.length >= 4 && bytes.length % 2 === 0 && bytes[0] === 0 && bytes[2] === 0) {
    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return cleanPdfChars(out);
  }
  return cleanPdfChars(bytes.toString('latin1'));
}

function cleanPdfChars(str: string): string {
  return str
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
}

function isLikelyReadableText(text: string): boolean {
  const readable = (text.match(/[A-Za-z0-9\s.,!?;:'"()\-–—/%$#@&+]/g) || []).length;
  return text.length > 0 && readable / text.length >= 0.55;
}
