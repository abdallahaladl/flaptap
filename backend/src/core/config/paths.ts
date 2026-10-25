import * as path from 'path';
import * as fs from 'fs';

export function getSkillScriptPath(): string {
  // 1. Explicit environment variable override
  if (process.env.SKILL_SCRIPT_PATH && fs.existsSync(process.env.SKILL_SCRIPT_PATH)) {
    return process.env.SKILL_SCRIPT_PATH;
  }

  // 2. Self-contained internal platform path (Primary)
  const internalPlatformScript = path.resolve(__dirname, '../../../../skills/american-accent-shadowing-skill/scripts/extract_transcript.py');
  if (fs.existsSync(internalPlatformScript)) {
    return internalPlatformScript;
  }

  // 3. Fallback relative path from development src
  const srcDevScript = path.resolve(__dirname, '../../../skills/american-accent-shadowing-skill/scripts/extract_transcript.py');
  if (fs.existsSync(srcDevScript)) {
    return srcDevScript;
  }

  return 'extract_transcript.py';
}
