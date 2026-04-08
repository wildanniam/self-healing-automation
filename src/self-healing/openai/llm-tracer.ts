/**
 * LlmTracer — Menyimpan input (prompt) dan output (raw response) dari LLM
 * ke file markdown per panggilan. Berguna untuk:
 *   - Demo & presentasi (transparansi: dosen bisa lihat apa yang dikirim ke AI)
 *   - Debugging healing yang gagal
 *   - Audit/review kualitas prompt
 *
 * Output: ./healing-results/llm-traces/<timestamp>__<selector>.md
 */

import * as fs from 'fs';
import * as path from 'path';

const TRACE_DIR = path.resolve(process.cwd(), 'healing-results', 'llm-traces');

export interface LlmTrace {
  timestamp:    string;
  testName:     string;
  stepName?:    string;
  pageUrl:      string;
  oldLocator:   string;
  errorMessage: string;
  model:        string;
  domChars:     number;
  prompt:       string;
  rawResponse:  string;
  parsedLocator: string | null;
  durationMs:   number;
}

/**
 * Sanitasi selector menjadi nama file yang aman.
 */
function safeFileName(selector: string): string {
  return selector
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/**
 * Memastikan direktori trace ada.
 */
function ensureTraceDir(): void {
  if (!fs.existsSync(TRACE_DIR)) {
    fs.mkdirSync(TRACE_DIR, { recursive: true });
  }
}

/**
 * Menyimpan satu trace LLM call ke file markdown.
 *
 * @param trace - Data input/output lengkap
 * @returns      Path file yang disimpan (relatif ke cwd)
 */
export function saveTrace(trace: LlmTrace): string {
  ensureTraceDir();

  const tsForFile = trace.timestamp.replace(/[:.]/g, '-');
  const fileName  = `${tsForFile}__${safeFileName(trace.oldLocator)}.md`;
  const filePath  = path.join(TRACE_DIR, fileName);

  const content = renderMarkdown(trace);
  fs.writeFileSync(filePath, content, 'utf-8');

  return path.relative(process.cwd(), filePath);
}

/**
 * Format trace sebagai markdown human-readable.
 */
function renderMarkdown(t: LlmTrace): string {
  return `# LLM Healing Trace

> Catatan lengkap satu pemanggilan LLM untuk healing locator.
> File ini dihasilkan otomatis oleh sistem self-healing.

## 📋 Metadata

| Field          | Value                              |
|----------------|------------------------------------|
| Timestamp      | \`${t.timestamp}\`                  |
| Test Name      | ${t.testName}                       |
| Step Name      | ${t.stepName ?? '(tidak ada)'}      |
| Page URL       | ${t.pageUrl}                        |
| Model          | \`${t.model}\`                      |
| DOM Chars      | ${t.domChars}                       |
| Duration       | ${t.durationMs} ms                  |

## ❌ Locator Lama (Gagal)

\`\`\`
${t.oldLocator}
\`\`\`

**Error message:**
\`\`\`
${t.errorMessage}
\`\`\`

---

## 📤 INPUT — Prompt yang Dikirim ke LLM

\`\`\`
${t.prompt}
\`\`\`

---

## 📥 OUTPUT — Raw Response dari LLM

\`\`\`
${t.rawResponse}
\`\`\`

---

## ✅ Parsed Result

\`\`\`json
{
  "new_locator": ${t.parsedLocator === null ? 'null' : `"${t.parsedLocator}"`}
}
\`\`\`

${t.parsedLocator ? `**Status:** Locator baru berhasil diekstrak → \`${t.parsedLocator}\`` : '**Status:** LLM tidak menemukan locator pengganti'}
`;
}
