/**
 * Extracts and repairs JSON responses from LLM output, including salvage
 * of partial item objects if a large batch was truncated near token limits.
 */
export function extractJsonBlock(raw: string): string {
  const text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    return fence[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

export function repairAndParseJson(rawJson: string): any | null {
  try {
    return JSON.parse(rawJson);
  } catch {
    // Attempt lightweight structural repair
  }

  let cleaned = rawJson
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/[\u0000-\u001F]+/g, (m) => (m === '\n' || m === '\r' || m === '\t' ? m : ' '));

  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;

  if (openBrackets > closeBrackets) {
    cleaned += ']'.repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    cleaned += '}'.repeat(openBraces - closeBraces);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function extractIndividualItemObjects(raw: string): any[] {
  const items: any[] = [];
  const blockStart = raw.indexOf('[');
  const scanTarget = blockStart >= 0 ? raw.slice(blockStart) : raw;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  for (let i = 0; i < scanTarget.length; i++) {
    const ch = scanTarget[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const candidateStr = scanTarget.slice(objStart, i + 1).replace(/,\s*([\]}])/g, '$1');
        try {
          const parsed = JSON.parse(candidateStr);
          if (parsed && typeof parsed === 'object' && parsed.expression && parsed.coreMeaning) {
            items.push(parsed);
          }
        } catch {
          // Skip malformed partial object
        }
        objStart = -1;
      }
    }
  }

  return items;
}

/**
 * Incrementally extracts newly completed top-level item objects from a streaming
 * JSON payload (`{"items":[{...},{...}`), returning items found since `fromIndex`
 * and a safe `nextIndex` cursor so partial objects are never parsed prematurely.
 */
export function extractCompletedItemsSince(
  rawText: string,
  fromIndex = 0,
): { items: any[]; nextIndex: number } {
  const text = String(rawText || '');
  let cursor = fromIndex;

  if (cursor <= 0) {
    const itemsKeyMatch = /"items"\s*:\s*\[/i.exec(text);
    if (itemsKeyMatch) {
      cursor = itemsKeyMatch.index + itemsKeyMatch[0].length;
    } else {
      const trimmedLead = text.search(/\[/);
      if (trimmedLead === -1) return { items: [], nextIndex: 0 };
      cursor = trimmedLead + 1;
    }
  }

  const items: any[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;
  let nextSafeIndex = cursor;

  for (let i = cursor; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (depth === 0 && ch === ']') {
      nextSafeIndex = i;
      break;
    }

    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && objStart !== -1) {
        const candidateStr = text.slice(objStart, i + 1).replace(/,\s*([\]}])/g, '$1');
        try {
          const parsed = JSON.parse(candidateStr);
          if (parsed && typeof parsed === 'object' && parsed.expression && parsed.coreMeaning) {
            items.push(parsed);
          }
        } catch {
          // Skip malformed object; final chunk parser will salvage if needed
        }
        objStart = -1;
        nextSafeIndex = i + 1;
      }
    }
  }

  return { items, nextIndex: nextSafeIndex };
}

export function parseLearningGenerationResponse(rawText: string): { items: any[] } {
  const extracted = extractJsonBlock(rawText);
  try {
    const direct = JSON.parse(extracted);
    if (Array.isArray(direct)) {
      return { items: direct };
    }
    if (direct && Array.isArray(direct.items)) {
      return { items: direct.items };
    }
  } catch {
    // Fall through to repair and object-level salvage
  }

  const repaired = repairAndParseJson(extracted);
  if (repaired) {
    if (Array.isArray(repaired)) return { items: repaired };
    if (Array.isArray(repaired.items)) return { items: repaired.items };
  }

  const salvaged = extractIndividualItemObjects(rawText);
  if (salvaged.length > 0) {
    return { items: salvaged };
  }

  throw new Error('The AI model returned an unstructured response that could not be parsed.');
}
