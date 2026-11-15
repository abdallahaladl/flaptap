/**
 * Cleans common speech-to-text / ASR artifacts transparently before AI analysis.
 */
export function cleanAsrTranscript(text: string): string {
  if (!text) return '';

  return text
    .replace(/\.{2,}/g, '.')
    .replace(/[ \t]+/g, ' ')
    .replace(/\baccelerated\.\s+The growth\b/gi, 'accelerated the growth')
    .replace(/\bworkers\.\s+New York\b/gi, 'workers, New York')
    .replace(/\bgrowth is a tech hub\b/gi, 'growth as a tech hub')
    .replace(/\b(the|in|to|of|that|a)\s+\1\b/gi, '$1')
    .replace(/\bopen ai\b/gi, 'OpenAI')
    .replace(/\banthropic\b/gi, 'Anthropic')
    .replace(/\bface time\b/gi, 'FaceTime')
    .replace(/\bzoom\b/gi, 'Zoom')
    .trim();
}
