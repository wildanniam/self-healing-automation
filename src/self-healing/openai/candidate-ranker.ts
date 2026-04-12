import type { CandidateElement } from './dom-context-extractor';
import type { ActionType } from '../types';

/**
 * Kandidat elemen yang sudah diberi skor relevansi.
 */
export interface RankedCandidate {
  candidate: CandidateElement;
  score: number;
}

/**
 * Konteks yang dipakai untuk scoring kandidat.
 */
export interface RankingContext {
  /** Selector lama yang gagal */
  oldSelector: string;
  /** Nama step test (e.g., "Isi email") */
  stepName?: string;
  /** Jenis aksi yang gagal */
  actionType: ActionType;
}

/**
 * Tag-tag yang relevan per action type.
 * Dipakai untuk memberikan bonus skor pada kandidat yang cocok.
 */
const ACTION_TYPE_TAGS: Record<ActionType, string[]> = {
  fill:           ['input', 'textarea'],
  click:          ['button', 'a', 'div', 'span', 'li', 'img'],
  select:         ['select', 'input', 'div'],
  getText:        ['span', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'td'],
  waitForVisible: [], // semua tag relevan
  isVisible:      [], // semua tag relevan
};

/**
 * Role-role yang relevan per action type.
 */
const ACTION_TYPE_ROLES: Record<ActionType, string[]> = {
  fill:           ['textbox', 'combobox', 'searchbox', 'spinbutton'],
  click:          ['button', 'link', 'menuitem', 'tab', 'option', 'checkbox', 'radio', 'switch'],
  select:         ['combobox', 'listbox', 'option', 'select'],
  getText:        [],
  waitForVisible: [],
  isVisible:      [],
};

/**
 * Tokenize string jadi kata-kata lowercase untuk fuzzy matching.
 */
function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .split(/[\s\-_]+/)
    .filter(w => w.length > 1);
}

/**
 * Hitung overlap antara dua set kata (Jaccard-like).
 * Return jumlah kata yang cocok.
 */
function wordOverlap(words1: string[], words2: string[]): number {
  const set2 = new Set(words2);
  return words1.filter(w => set2.has(w)).length;
}

/**
 * Extract identifiers dari CSS selector untuk matching.
 * Contoh: "#user-email" → ["user", "email"]
 *         ".ant-input" → ["ant", "input"]
 *         "[name='email']" → ["name", "email"]
 */
function extractSelectorTokens(selector: string): string[] {
  return tokenize(
    selector
      .replace(/[#.\[\]='":>~+()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Hitung skor relevansi satu kandidat terhadap konteks healing.
 *
 * Faktor scoring:
 * 1. Kecocokan kata dari stepName
 * 2. Kecocokan kata dari old locator
 * 3. Kecocokan tag/role dengan action type
 * 4. Atribut stabil (data-testid, name, aria-label, placeholder, id)
 * 5. Visibility bonus
 */
function scoreCandidate(candidate: CandidateElement, ctx: RankingContext): number {
  let score = 0;

  const selectorTokens = extractSelectorTokens(ctx.oldSelector);
  const stepTokens = ctx.stepName ? tokenize(ctx.stepName) : [];

  // Gabungkan semua teks dari kandidat untuk matching
  // Termasuk rowContext, parentContext, containerContext agar matching lebih lengkap
  const candidateTexts = [
    candidate.id,
    candidate.name,
    candidate.placeholder,
    candidate.ariaLabel,
    candidate.text,
    candidate.nearestLabel,
    candidate.dataTestId,
    candidate.dataTest,
    candidate.dataCy,
    candidate.title,
    candidate.rowContext,
    candidate.parentContext,
    candidate.containerContext,
    ...(candidate.classes ?? []),
  ].filter(Boolean) as string[];

  const candidateTokens = candidateTexts.flatMap(t => tokenize(t));

  // 1. Kecocokan dengan old selector (bobot tinggi)
  const selectorOverlap = wordOverlap(selectorTokens, candidateTokens);
  score += selectorOverlap * 15;

  // 2. Kecocokan dengan stepName
  const stepOverlap = wordOverlap(stepTokens, candidateTokens);
  score += stepOverlap * 10;

  // 3. Tag cocok dengan action type
  const relevantTags = ACTION_TYPE_TAGS[ctx.actionType];
  if (relevantTags.length === 0 || relevantTags.includes(candidate.tag)) {
    score += 5;
  }

  // 4. Role cocok dengan action type
  const relevantRoles = ACTION_TYPE_ROLES[ctx.actionType];
  if (candidate.role && relevantRoles.includes(candidate.role)) {
    score += 8;
  }

  // 5. Atribut stabil — kandidat yang punya atribut stabil lebih berharga
  if (candidate.dataTestId) score += 6;
  if (candidate.dataTest) score += 5;
  if (candidate.dataCy) score += 5;
  if (candidate.id) score += 4;
  if (candidate.name) score += 4;
  if (candidate.ariaLabel) score += 3;
  if (candidate.placeholder) score += 2;

  // 6. Visibility bonus
  if (candidate.isVisible) score += 3;
  if (candidate.isVisible === false) score -= 20;

  // 6b. Disabled penalty untuk action yang membutuhkan elemen enabled.
  if (candidate.isDisabled && ['click', 'fill', 'select'].includes(ctx.actionType)) {
    score -= 20;
  }

  // 7. Exact ID match dari selector (e.g., selector "#user-email" → id="user-email")
  const idMatch = ctx.oldSelector.match(/^#([\w-]+)$/);
  if (idMatch && candidate.id === idMatch[1]) {
    score += 50; // very high — ini kemungkinan besar target yang benar
  }

  // 8. Exact name/data-testid match dari selector
  const attrMatch = ctx.oldSelector.match(/\[(\w[\w-]*)=['"]?([^'"\]]+)['"]?\]/);
  if (attrMatch) {
    const [, attr, val] = attrMatch;
    if (attr === 'name' && candidate.name === val) score += 30;
    if (attr === 'data-testid' && candidate.dataTestId === val) score += 30;
    if (attr === 'data-test' && candidate.dataTest === val) score += 30;
    if (attr === 'data-cy' && candidate.dataCy === val) score += 30;
    if (attr === 'placeholder' && candidate.placeholder === val) score += 25;
  }

  // 9. Row context matching dengan stepName dan old selector
  // Penting untuk table case: "Klik detail John Doe" + rowContext="John Doe"
  if (candidate.rowContext) {
    const rowTokens = tokenize(candidate.rowContext);
    if (stepTokens.length > 0) {
      score += wordOverlap(stepTokens, rowTokens) * 12;
    }
    score += wordOverlap(selectorTokens, rowTokens) * 8;
  }

  // 10. Parent context matching
  if (candidate.parentContext) {
    const parentTokens = tokenize(candidate.parentContext);
    if (stepTokens.length > 0) {
      score += wordOverlap(stepTokens, parentTokens) * 5;
    }
    score += wordOverlap(selectorTokens, parentTokens) * 5;
  }

  // 11. Container context matching (modal/drawer)
  if (candidate.containerContext && stepTokens.length > 0) {
    const containerTokens = tokenize(candidate.containerContext);
    score += wordOverlap(stepTokens, containerTokens) * 8;
  }

  return score;
}

/**
 * Ranking kandidat berdasarkan relevansi terhadap konteks healing.
 *
 * @param candidates    - Array kandidat dari DOM extractor
 * @param ctx           - Konteks ranking (selector lama, stepName, actionType)
 * @param maxCandidates - Jumlah maksimum kandidat yang dikembalikan (default: 30)
 * @returns             - Array kandidat yang sudah diurutkan berdasarkan skor
 */
export function rankCandidates(
  candidates: CandidateElement[],
  ctx: RankingContext,
  maxCandidates = 30,
): RankedCandidate[] {
  const ranked = candidates.map(candidate => ({
    candidate,
    score: scoreCandidate(candidate, ctx),
  }));

  // Sort descending by score
  ranked.sort((a, b) => b.score - a.score);

  return ranked.slice(0, maxCandidates);
}
