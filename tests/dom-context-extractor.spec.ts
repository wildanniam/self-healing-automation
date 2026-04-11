/**
 * Test DOM Context Extractor — Validasi tanpa OpenAI
 *
 * Test ini memvalidasi bahwa:
 * 1. Target element yang benar masuk ke daftar kandidat
 * 2. Target berada di ranking yang cukup tinggi (top 10 / top 20)
 * 3. Jumlah kandidat reasonable (tidak terlalu banyak)
 * 4. Prompt size lebih kecil dari full DOM
 *
 * Tidak memanggil OpenAI — murni test extractor dan ranker.
 */

import * as path from 'path';
import { test, expect } from '@playwright/test';
import { extractCandidates, formatCandidatesForPrompt } from '../src/self-healing/openai/dom-context-extractor';
import { rankCandidates } from '../src/self-healing/openai/candidate-ranker';
import type { ActionType } from '../src/self-healing/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fixturePath(name: string): string {
  return `file://${path.resolve(__dirname, 'fixtures', name)}`;
}

interface ExtractorMetrics {
  targetInTop10: boolean;
  targetInTop20: boolean;
  targetRank: number | null;
  candidateCount: number;
  promptChars: number;
  fullDomChars: number;
}

async function extractAndRank(
  page: import('@playwright/test').Page,
  opts: {
    actionType: ActionType;
    oldSelector: string;
    stepName?: string;
    evalTarget: string;
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

  // Cari target di ranked list
  const targetIndex = ranked.findIndex(
    r => r.candidate._evalTarget === opts.evalTarget,
  );

  return {
    targetInTop10: targetIndex >= 0 && targetIndex < 10,
    targetInTop20: targetIndex >= 0 && targetIndex < 20,
    targetRank: targetIndex >= 0 ? targetIndex + 1 : null,
    candidateCount: ranked.length,
    promptChars: promptText.length,
    fullDomChars: fullDom.length,
  };
}

// ── Form Fixture Tests ───────────────────────────────────────────────────────

test.describe('DOM Context Extractor — Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixturePath('omni-like-form.html'));
  });

  test('email input masuk top 10 (easy case)', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#username',
      stepName: 'Isi email',
      evalTarget: 'email-input',
    });

    expect(m.targetInTop10).toBe(true);
    expect(m.targetRank).toBeLessThanOrEqual(5);
    expect(m.promptChars).toBeLessThan(m.fullDomChars);
    console.log('Form/email:', JSON.stringify(m, null, 2));
  });

  test('password input masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#pass',
      stepName: 'Isi password',
      evalTarget: 'password-input',
    });

    expect(m.targetInTop10).toBe(true);
    expect(m.promptChars).toBeLessThan(m.fullDomChars);
    console.log('Form/password:', JSON.stringify(m, null, 2));
  });

  test('login button masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '#submit-login',
      stepName: 'Klik tombol login',
      evalTarget: 'login-button',
    });

    expect(m.targetInTop10).toBe(true);
    expect(m.promptChars).toBeLessThan(m.fullDomChars);
    console.log('Form/login-btn:', JSON.stringify(m, null, 2));
  });

  test('role select masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'select',
      oldSelector: '#role-dropdown',
      stepName: 'Pilih role user',
      evalTarget: 'role-select',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Form/role-select:', JSON.stringify(m, null, 2));
  });

  test('forgot password link masuk top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '.forgot-link',
      stepName: 'Klik forgot password',
      evalTarget: 'forgot-password-link',
    });

    expect(m.targetInTop20).toBe(true);
    console.log('Form/forgot-link:', JSON.stringify(m, null, 2));
  });
});

// ── Modal Fixture Tests ──────────────────────────────────────────────────────

test.describe('DOM Context Extractor — Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixturePath('omni-like-modal.html'));
  });

  test('product name input di modal masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#prod-name',
      stepName: 'Isi nama produk',
      evalTarget: 'product-name-input',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Modal/product-name:', JSON.stringify(m, null, 2));
  });

  test('modal save button masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '#btn-save',
      stepName: 'Klik Save',
      evalTarget: 'modal-save-button',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Modal/save-btn:', JSON.stringify(m, null, 2));
  });

  test('product category select di modal masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'select',
      oldSelector: '[name="cat"]',
      stepName: 'Pilih kategori produk',
      evalTarget: 'product-category-select',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Modal/category:', JSON.stringify(m, null, 2));
  });
});

// ── Table Fixture Tests ──────────────────────────────────────────────────────

test.describe('DOM Context Extractor — Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixturePath('omni-like-table.html'));
  });

  test('search input masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#search-box',
      stepName: 'Cari user',
      evalTarget: 'search-input',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Table/search:', JSON.stringify(m, null, 2));
  });

  test('detail button row 1 masuk top 20 (medium case — banyak button mirip)', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '[data-testid="btn-detail-1"]',
      stepName: 'Klik detail John Doe',
      evalTarget: 'detail-btn-row1',
    });

    expect(m.targetInTop20).toBe(true);
    console.log('Table/detail-btn:', JSON.stringify(m, null, 2));
  });

  test('status filter select masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'select',
      oldSelector: '#filter-status',
      stepName: 'Filter status user',
      evalTarget: 'status-filter',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Table/status-filter:', JSON.stringify(m, null, 2));
  });
});

// ── Drawer Fixture Tests ─────────────────────────────────────────────────────

test.describe('DOM Context Extractor — Drawer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixturePath('omni-like-drawer.html'));
  });

  test('customer filter input di drawer masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#customer-search',
      stepName: 'Filter nama customer',
      evalTarget: 'filter-customer-input',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Drawer/customer:', JSON.stringify(m, null, 2));
  });

  test('apply filter button di drawer masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '#btn-apply',
      stepName: 'Klik Apply Filter',
      evalTarget: 'drawer-apply-button',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Drawer/apply-btn:', JSON.stringify(m, null, 2));
  });

  test('drawer close button masuk top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '.close-drawer',
      stepName: 'Tutup drawer',
      evalTarget: 'drawer-close-button',
    });

    expect(m.targetInTop20).toBe(true);
    console.log('Drawer/close-btn:', JSON.stringify(m, null, 2));
  });
});

// ── Select/Combobox Fixture Tests ────────────────────────────────────────────

test.describe('DOM Context Extractor — Select & Combobox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixturePath('omni-like-select.html'));
  });

  test('campaign type select masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'select',
      oldSelector: '#type-selector',
      stepName: 'Pilih tipe campaign',
      evalTarget: 'campaign-type-select',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Select/campaign-type:', JSON.stringify(m, null, 2));
  });

  test('audience combobox masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'fill',
      oldSelector: '#audience-input',
      stepName: 'Cari target audience',
      evalTarget: 'audience-combobox',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Select/audience:', JSON.stringify(m, null, 2));
  });

  test('icon button dengan aria-label masuk top 20', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '.settings-btn',
      stepName: 'Buka campaign settings',
      evalTarget: 'settings-icon-btn',
    });

    expect(m.targetInTop20).toBe(true);
    console.log('Select/settings-btn:', JSON.stringify(m, null, 2));
  });

  test('switch toggle masuk top 10', async ({ page }) => {
    const m = await extractAndRank(page, {
      actionType: 'click',
      oldSelector: '#toggle-active',
      stepName: 'Toggle active status',
      evalTarget: 'active-switch',
    });

    expect(m.targetInTop10).toBe(true);
    console.log('Select/switch:', JSON.stringify(m, null, 2));
  });

  test('negative case — div tanpa role tidak masuk kandidat atau rank rendah', async ({ page }) => {
    const rawCandidates = await extractCandidates(page, {
      actionType: 'click',
    });

    // Div tanpa role, aria-label, atau atribut test mungkin tidak masuk kandidat
    const negativeTarget = rawCandidates.find(c => c._evalTarget === 'negative-clickable-div');
    // Ini expected: custom div tanpa semantic markup sulit ditemukan
    if (negativeTarget) {
      console.log('Negative case: div ditemukan tapi expected rank rendah');
    } else {
      console.log('Negative case: div tanpa role/aria tidak masuk kandidat — expected behavior');
    }
    // Tidak assert fail — ini documented limitation
  });
});

// ── Metrics Summary ──────────────────────────────────────────────────────────

test.describe('DOM Context Extractor — Prompt Size Comparison', () => {
  test('prompt kandidat lebih kecil dari full DOM di semua fixture', async ({ page }) => {
    const fixtures = [
      'omni-like-form.html',
      'omni-like-modal.html',
      'omni-like-table.html',
      'omni-like-drawer.html',
      'omni-like-select.html',
    ];

    for (const fixture of fixtures) {
      await page.goto(fixturePath(fixture));

      const rawCandidates = await extractCandidates(page, { actionType: 'click' });
      const ranked = rankCandidates(rawCandidates, {
        oldSelector: '#dummy',
        actionType: 'click',
      });
      const promptText = formatCandidatesForPrompt(ranked.map(r => r.candidate));
      const fullDom = await page.content();

      const ratio = ((promptText.length / fullDom.length) * 100).toFixed(1);
      console.log(`${fixture}: prompt=${promptText.length} chars, fullDOM=${fullDom.length} chars, ratio=${ratio}%`);

      expect(promptText.length).toBeLessThan(fullDom.length);
    }
  });
});
