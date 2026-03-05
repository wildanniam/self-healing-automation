/**
 * DOM Differencing Demo Test — M5 Self-Healing
 *
 * Test ini mendemonstrasikan sistem self-healing dengan DOM Differencing.
 *
 * ─────────────────────────────────────────────────────────────────
 * SKENARIO DEMO:
 * ─────────────────────────────────────────────────────────────────
 *
 * Langkah 1 — Capture baseline (SEKALI, sebelum demo):
 *   npm run baseline:capture
 *   → Test berjalan normal terhadap demo.html (ID asli: user-email, user-password, btn-login)
 *   → DOM context setiap elemen disimpan ke baseline-snapshots/
 *
 * Langkah 2 — Simulasi developer mengubah UI:
 *   npm run demo:simulate-change
 *   → demo.html diganti dengan demo-changed.html
 *   → ID elemen berubah: user-email→email-field, user-password→password-field, btn-login→login-btn
 *
 * Langkah 3 — Jalankan test (locator akan gagal → healing via DOM diff):
 *   npm run test:diff-demo
 *   → Test mendeteksi kegagalan locator
 *   → Sistem load baseline dari baseline-snapshots/
 *   → DOM Diff membandingkan baseline vs kondisi sekarang
 *   → LLM menerima diff dan menghasilkan locator baru
 *   → Test di-heal dan dilanjutkan
 *   → Auto PR dibuat ke GitHub
 *
 * ─────────────────────────────────────────────────────────────────
 * PRASYARAT:
 * ─────────────────────────────────────────────────────────────────
 *   - File .env sudah terisi (OPENAI_API_KEY, GitHub token, dll)
 *   - Sudah menjalankan npm run baseline:capture minimal sekali
 *   - Sudah menjalankan npm run demo:simulate-change
 */

import * as path from 'path';
import { test, expect } from '@playwright/test';
import { createHealingWrapper, ResultsStore } from '../src/self-healing';

const DEMO_PAGE_URL = `file://${path.resolve(__dirname, 'fixtures/demo.html')}`;

// Store di-share antar test dan afterAll
let sharedStore: ResultsStore | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Login Form — Demo Utama DOM Differencing
// ─────────────────────────────────────────────────────────────────────────────
test('dom diff demo — login form healing', async ({ page }) => {
  const { wrapper, orchestrator } = createHealingWrapper(page);

  // Simpan referensi store agar bisa diakses di afterAll
  sharedStore = orchestrator.getStore();

  await page.goto(DEMO_PAGE_URL);

  /**
   * Locator di bawah ini BENAR terhadap demo.html asli.
   * Setelah demo:simulate-change, locator ini akan GAGAL
   * karena ID elemen di HTML berubah.
   *
   * Sistem akan:
   * 1. Deteksi kegagalan
   * 2. Load baseline: { domContext: '...id="user-email"...' }
   * 3. Diff: id="user-email" → id="email-field"
   * 4. Kirim diff ke LLM
   * 5. LLM suggest: [data-testid="input-email"] atau #email-field
   * 6. Validated → healed
   */
  await wrapper.safeFill(
    {
      selector:  '#user-email',
      testName:  'dom diff demo — login form healing',
      filePath:  __filename,
      stepName:  'Isi email',
    },
    'user@example.com',
    { timeout: 8000 },
  );

  await wrapper.safeFill(
    {
      selector:  '[data-testid="input-password"]',
      testName:  'dom diff demo — login form healing',
      filePath:  __filename,
      stepName:  'Isi password',
    },
    'secretpassword',
    { timeout: 8000 },
  );

  await wrapper.safeClick(
    {
      selector:  '[data-testid="btn-login"]',
      testName:  'dom diff demo — login form healing',
      filePath:  __filename,
      stepName:  'Klik tombol login',
    },
    { timeout: 8000 },
  );

  // Verifikasi hasil login berhasil (via locator healed atau memang langsung berhasil)
  await expect(page.locator('#result')).toBeVisible({ timeout: 5000 });

  // Print summary
  const summary = orchestrator.getStore().getSummary();
  console.log('\n[DOM-DIFF-DEMO] Healing Summary:', JSON.stringify(summary, null, 2));
  orchestrator.getStore().printSummary();

  // Simpan laporan healing ke file
  await orchestrator.getStore().saveToFile('./healing-results/dom-diff-demo.json');
});

// ─────────────────────────────────────────────────────────────────────────────
// Setelah semua test selesai: jalankan auto-patch & PR jika ada hasil healing
// ─────────────────────────────────────────────────────────────────────────────
test.afterAll(async () => {
  if (!sharedStore) return;

  const healedResults = sharedStore.getAll().filter(r => r.status === 'healed');

  if (healedResults.length === 0) {
    console.log('[DOM-DIFF-DEMO] Tidak ada healing — auto-patch dilewati.');
    return;
  }

  console.log(`[DOM-DIFF-DEMO] ${healedResults.length} locator di-heal — memulai auto-patch & PR...`);

  try {
    const { createPatchRunner } = await import('../src/self-healing');
    const runner = createPatchRunner();
    const prUrl  = await runner.runFromStore(sharedStore);

    if (prUrl) {
      console.log('[DOM-DIFF-DEMO] ✓ Pull Request berhasil dibuat:', prUrl);
    }
  } catch (err) {
    // Auto-patch optional — tidak gagalkan test jika PR gagal dibuat
    // (misalnya: GitHub token belum dikonfigurasi)
    console.warn('[DOM-DIFF-DEMO] Auto-patch dilewati:', err instanceof Error ? err.message : String(err));
  }
});

