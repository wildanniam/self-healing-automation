/**
 * Stress Test DOM Context Extractor — Validasi Phase 2 pada DOM kompleks
 *
 * Fixture: omni-like-stress.html (dashboard 40-row table, sidebar, modal, drawer)
 * Tujuan: membuktikan bahwa target elemen masuk kandidat ranking sebelum LLM dipakai.
 *
 * Tidak memanggil OpenAI API.
 */

import { test, expect } from '@playwright/test';
import { extractCandidates } from '../src/self-healing/openai/dom-context-extractor';
import { rankCandidates } from '../src/self-healing/openai/candidate-ranker';
import { fixturePath, extractAndRank } from './helpers/candidate-metrics';

const FIXTURE = 'omni-like-stress.html';

test.beforeEach(async ({ page }) => {
  await page.goto(fixturePath(FIXTURE));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Easy Cases — target harus masuk top 10
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Stress — Easy Cases', () => {
  test('fill customer name filter — top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#customer-filter',
      stepName: 'Filter nama customer',
      evalTarget: 'customer-name-filter',
      scenario: 'fill customer name filter',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop10).toBe(true);
    console.log('STRESS easy/customer-filter:', JSON.stringify(m, null, 2));
  });

  test('fill email di modal — top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#edit-email',
      stepName: 'Isi email customer',
      evalTarget: 'modal-email-input',
      scenario: 'fill email in modal',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop10).toBe(true);
    console.log('STRESS easy/modal-email:', JSON.stringify(m, null, 2));
  });

  test('select status filter (native select) — top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'select',
      oldSelector: '#status-select',
      stepName: 'Filter status invoice',
      evalTarget: 'status-filter',
      scenario: 'select status filter',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop10).toBe(true);
    console.log('STRESS easy/status-filter:', JSON.stringify(m, null, 2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Medium Cases — target harus masuk top 20
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Stress — Medium Cases', () => {
  test('click Save di modal — top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '#btn-save-customer',
      stepName: 'Simpan customer',
      evalTarget: 'save-modal-btn',
      scenario: 'click Save in modal',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop20).toBe(true);
    console.log('STRESS medium/save-modal:', JSON.stringify(m, null, 2));
  });

  test('click Apply di drawer — top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '#btn-apply-filter',
      stepName: 'Apply advanced filter',
      evalTarget: 'drawer-apply-btn',
      scenario: 'click Apply in drawer',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop20).toBe(true);
    console.log('STRESS medium/drawer-apply:', JSON.stringify(m, null, 2));
  });

  test('click Edit Jane Smith — top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '[data-testid="btn-edit-jane"]',
      stepName: 'Edit Jane Smith',
      evalTarget: 'edit-row-jane-smith',
      scenario: 'click Edit Jane Smith',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop20).toBe(true);
    console.log('STRESS medium/edit-jane:', JSON.stringify(m, null, 2));
  });

  test('click sidebar Customers — top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '.menu-customers',
      stepName: 'Buka menu Customers',
      evalTarget: 'sidebar-customers',
      scenario: 'click sidebar Customers',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop20).toBe(true);
    console.log('STRESS medium/sidebar-customers:', JSON.stringify(m, null, 2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Hard Cases — target harus masuk top 20, idealnya top 10
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Stress — Hard Cases', () => {
  test('click Detail John Doe (row 5 dari 40) — top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '[data-testid="btn-detail-john"]',
      stepName: 'Klik detail John Doe',
      evalTarget: 'detail-row-john-doe',
      scenario: 'click Detail John Doe',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop20).toBe(true);

    const rawCandidates = await extractCandidates(page, { actionType: 'click' });
    const target = rawCandidates.find(c => c._evalTarget === 'detail-row-john-doe');
    expect(target?.rowContext).toContain('John Doe');

    console.log('STRESS hard/detail-john-doe:', JSON.stringify(m, null, 2));
  });

  test('click Detail INV-0025 (row 25 dari 40, jauh di DOM) — top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '[data-testid="btn-detail-inv-0025-old"]',
      stepName: 'Klik detail INV-0025',
      evalTarget: 'detail-row-inv-0025',
      scenario: 'click Detail INV-0025',
    });

    expect(m.targetRank).not.toBeNull();
    expect(m.targetInTop20).toBe(true);

    const rawCandidates = await extractCandidates(page, { actionType: 'click' });
    const target = rawCandidates.find(c => c._evalTarget === 'detail-row-inv-0025');
    expect(target?.rowContext).toContain('INV-0025');

    console.log('STRESS hard/detail-inv-0025:', JSON.stringify(m, null, 2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Negative / Safety Cases
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Stress — Negative Cases', () => {
  test('hidden input — isVisible false, validator akan reject', async ({ page }) => {
    const rawCandidates = await extractCandidates(page, { actionType: 'fill' });
    const hidden = rawCandidates.find(c => c._evalTarget === 'hidden-input');

    expect(hidden).toBeDefined();
    expect(hidden!.isVisible).toBe(false);
    console.log('STRESS negative/hidden:', {
      found: !!hidden,
      isVisible: hidden?.isVisible,
      note: 'Validator akan reject elemen hidden — ini bukan tanggung jawab ranker',
    });
  });

  test('disabled button — isDisabled true, validator akan reject untuk click', async ({ page }) => {
    const rawCandidates = await extractCandidates(page, { actionType: 'click' });
    const disabled = rawCandidates.find(c => c._evalTarget === 'disabled-export-btn');

    expect(disabled).toBeDefined();
    expect(disabled!.isDisabled).toBe(true);
    console.log('STRESS negative/disabled:', {
      found: !!disabled,
      isDisabled: disabled?.isDisabled,
      note: 'Validator akan reject elemen disabled untuk click — guard utama ada di validator',
    });
  });

  test('banyak tombol Detail identik — candidateCount tinggi, ranker harus andalkan context', async ({ page }) => {
    const rawCandidates = await extractCandidates(page, { actionType: 'click' });
    const detailButtons = rawCandidates.filter(c =>
      c.text === 'Detail' && c.tag === 'button'
    );

    // Harus ada 40 tombol Detail
    expect(detailButtons.length).toBeGreaterThanOrEqual(30);
    console.log('STRESS negative/duplicate-detail:', {
      detailButtonCount: detailButtons.length,
      totalCandidates: rawCandidates.length,
      note: 'Banyak tombol identik — ranker membedakan lewat aria-label, rowContext, data-testid',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Overall Metrics — prompt size vs full DOM
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Stress — Overall Metrics', () => {
  test('log candidate count dan prompt/DOM ratio', async ({ page }) => {
    const rawCandidates = await extractCandidates(page, { actionType: 'click' });
    const ranked = rankCandidates(rawCandidates, {
      oldSelector: '#dummy',
      actionType: 'click',
    });

    const { formatCandidatesForPrompt } = await import('../src/self-healing/openai/dom-context-extractor');
    const promptText = formatCandidatesForPrompt(ranked.map(r => r.candidate));
    const fullDom = await page.content();
    const ratio = ((promptText.length / fullDom.length) * 100).toFixed(1);

    console.log('STRESS metrics:', {
      totalRawCandidates: rawCandidates.length,
      rankedCandidates: ranked.length,
      promptChars: promptText.length,
      fullDomChars: fullDom.length,
      ratio: `${ratio}%`,
    });

    // Tidak assert terlalu keras — hanya log untuk analisis
  });
});
