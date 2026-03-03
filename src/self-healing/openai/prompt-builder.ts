import type { HealingContext } from '../types';

/**
 * Membangun prompt yang dikirim ke LLM untuk mendapatkan locator baru.
 *
 * Struktur prompt:
 * 1. Konteks kegagalan (locator lama, nama test, URL, error message)
 * 2. DOM terbaru yang sudah dibersihkan
 * 3. Instruksi output HANYA JSON: {"new_locator": "..."}
 *
 * @param context    - HealingContext dari wrapper saat locator gagal
 * @param cleanedDom - HTML DOM yang sudah dibersihkan oleh dom-cleaner
 * @returns          - String prompt siap kirim ke OpenAI
 */
export function buildHealingPrompt(context: HealingContext, cleanedDom: string): string {
  const { descriptor, errorMessage, pageUrl } = context;

  return `You are an expert Test Automation Engineer specializing in Playwright and CSS/XPath locators.

A Playwright automated test has FAILED because the locator below no longer matches any element in the current DOM.

## Failed Test Info
- Test Name   : ${descriptor.testName}
- Step        : ${descriptor.stepName ?? '(not specified)'}
- Page URL    : ${pageUrl}
- Old Locator : ${descriptor.selector}
- Error       : ${errorMessage}

## Current DOM (noise removed)
\`\`\`html
${cleanedDom}
\`\`\`

## Your Task
Analyze the DOM above and find the BEST replacement locator that targets the same element the original locator was intended for.

## Strict Rules
1. Return ONLY a raw JSON object — no markdown fences, no explanation, no extra text.
2. The locator must work with Playwright's \`page.locator()\` method (CSS selector or XPath).
3. Prioritize stable attributes in this order:
   - id
   - data-testid / data-test / data-cy
   - name
   - aria-label / aria-labelledby
   - type + placeholder combination
   - Unique class name
   - XPath as last resort
4. NEVER use positional selectors (nth-child, :nth-of-type, index-based XPath).
5. If no suitable replacement can be found, return: {"new_locator": null}

## Response Format (ONLY this — nothing else)
{"new_locator": "SELECTOR_HERE"}`;
}
