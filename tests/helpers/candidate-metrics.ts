/**
 * Shared helper untuk mengukur kualitas candidate extraction dan ranking.
 * Dipakai di dom-context-extractor.spec.ts dan stress test.
 */

import * as path from 'path';
import type { Page } from '@playwright/test';
import { extractCandidates, formatCandidatesForPrompt } from '../../src/self-healing/openai/dom-context-extractor';
import { rankCandidates } from '../../src/self-healing/openai/candidate-ranker';
import type { ActionType } from '../../src/self-healing/types';

export function fixturePath(name: string): string {
  return `file://${path.resolve(__dirname, '..', 'fixtures', name)}`;
}

export interface ExtractorMetrics {
  scenario?: string;
  targetInTop10: boolean;
  targetInTop20: boolean;
  targetRank: number | null;
  candidateCount: number;
  rankedCandidateCount: number;
  promptChars: number;
  fullDomChars: number;
}

export async function extractAndRank(
  page: Page,
  opts: {
    actionType: ActionType;
    oldSelector: string;
    stepName?: string;
    evalTarget: string;
    scenario?: string;
  },
): Promise<ExtractorMetrics> {
  const rawCandidates = await extractCandidates(page, {
    actionType: opts.actionType,
  });

  const ranked = rankCandidates(rawCandidates, {
    oldSelector: opts.oldSelector,
    stepName: opts.stepName,
    actionType: opts.actionType,
  });

  const candidates = ranked.map(r => r.candidate);
  const promptText = formatCandidatesForPrompt(candidates);
  const fullDom = await page.content();

  const targetIndex = ranked.findIndex(
    r => r.candidate._evalTarget === opts.evalTarget,
  );

  return {
    scenario: opts.scenario,
    targetInTop10: targetIndex >= 0 && targetIndex < 10,
    targetInTop20: targetIndex >= 0 && targetIndex < 20,
    targetRank: targetIndex >= 0 ? targetIndex + 1 : null,
    candidateCount: rawCandidates.length,
    rankedCandidateCount: ranked.length,
    promptChars: promptText.length,
    fullDomChars: fullDom.length,
  };
}
