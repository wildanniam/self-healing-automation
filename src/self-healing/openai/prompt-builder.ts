import type { HealingContext } from '../types';
import type { CandidateElement } from './dom-context-extractor';
import { formatCandidatesForPrompt } from './dom-context-extractor';

/**
 * Membangun prompt yang dikirim ke LLM untuk mendapatkan locator baru.
 * Versi lama — memakai full cleaned DOM sebagai konteks.
 *
 * Dipakai sebagai fallback jika kandidat elemen kosong.
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

/**
 * Membangun prompt berbasis kandidat elemen (targeted context).
 * Ini adalah prompt utama yang dipakai saat kandidat cukup banyak.
 *
 * @param context    - HealingContext dari wrapper
 * @param candidates - Daftar kandidat elemen yang sudah di-ranking
 * @param supplement - Opsional: cleaned DOM terbatas sebagai konteks tambahan
 * @returns          - String prompt siap kirim ke OpenAI
 */
export function buildCandidatePrompt(
  context: HealingContext,
  candidates: CandidateElement[],
  supplement?: string,
): string {
  const { descriptor, errorMessage, pageUrl, actionType } = context;
  const candidateList = formatCandidatesForPrompt(candidates);

  let supplementSection = '';
  if (supplement) {
    supplementSection = `

## Additional DOM Context (partial)
\`\`\`html
${supplement}
\`\`\``;
  }

  return `You are an expert Test Automation Engineer specializing in Playwright and CSS/XPath locators.

A Playwright automated test has FAILED because the locator below no longer matches any element in the current DOM.

## Failed Test Info
- Test Name   : ${descriptor.testName}
- Step        : ${descriptor.stepName ?? '(not specified)'}
- Action Type : ${actionType}
- Page URL    : ${pageUrl}
- Old Locator : ${descriptor.selector}
- Error       : ${errorMessage}

## Candidate Elements
These are the interactive elements found in the current DOM, ranked by relevance:

${candidateList}
${supplementSection}

## Your Task
From the candidate elements above, find the BEST replacement locator that targets the same element the original locator was intended for.

Each candidate has a \`locators=[...]\` field with ready-to-use selectors. Pick one of those selectors whenever possible.

## Strict Rules
1. Return ONLY a raw JSON object — no markdown fences, no explanation, no extra text.
2. The locator must work with Playwright's \`page.locator()\` method (CSS selector or XPath).
3. PREFER picking a locator from the candidate's \`locators=[...]\` list. Only compose a new selector if none of the suggested locators are suitable.
4. Prioritize stable attributes in this order:
   - id
   - data-testid / data-test / data-cy
   - name
   - aria-label / aria-labelledby
   - type + placeholder combination
   - Unique class name
   - XPath as last resort
5. NEVER use positional selectors (nth-child, :nth-of-type, index-based XPath).
6. Consider the action type "${actionType}" — the locator should target an element appropriate for this action.
7. If no suitable replacement can be found, return: {"new_locator": null}

## Response Format (ONLY this — nothing else)
{"new_locator": "SELECTOR_HERE"}`;
}
