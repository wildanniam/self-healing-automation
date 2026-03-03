/**
 * Demo Test — Self-Healing End-to-End
 *
 * File ini mensimulasikan skenario nyata:
 *   → Developer mengubah ID elemen di HTML (seperti yang sering terjadi di dunia nyata)
 *   → Locator lama di test menjadi rusak
 *   → Sistem self-healing mendeteksi kegagalan, tanya LLM, validasi, dan test tetap lanjut
 *
 * Skenario yang diuji:
 *   ✅ Test 1 — Happy path: locator benar, tidak ada healing
 *   🔧 Test 2 — Broken locator: healing aktif, LLM temukan selector baru
 *   🔧 Test 3 — Multiple broken locators: serangkaian aksi semuanya di-heal
 *
 * Prasyarat:
 *   - File .env sudah dibuat dari .env.example
 *   - OPENAI_API_KEY sudah diisi di .env
 */

import * as path from 'path';
import { test, expect } from '@playwright/test';
import { createHealingWrapper } from '../src/self-healing';

const DEMO_PAGE_URL = `file://${path.resolve(__dirname, 'fixtures/demo.html')}`;

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Happy Path — locator benar, healing tidak seharusnya dipanggil
// ─────────────────────────────────────────────────────────────────────────────
test('happy path — locator benar tidak memicu healing', async ({ page }) => {
  const { wrapper, orchestrator } = createHealingWrapper(page);

  await page.goto(DEMO_PAGE_URL);

  // Semua selector di bawah ini BENAR → tidak ada healing yang terjadi
  await wrapper.safeFill(
    { selector: '#user-email', testName: 'Happy Path Test', filePath: __filename, stepName: 'Isi email' },
    'user@example.com',
  );

  await wrapper.safeFill(
    { selector: '#user-password', testName: 'Happy Path Test', filePath: __filename, stepName: 'Isi password' },
    'secretpassword',
  );

  await wrapper.safeClick(
    { selector: '#btn-login', testName: 'Happy Path Test', filePath: __filename, stepName: 'Klik login' },
  );

  // Verifikasi bahwa aksi berhasil
  await expect(page.locator('#result')).toBeVisible();

  // Tidak ada healing yang terjadi
  const summary = orchestrator.getStore().getSummary();
  expect(summary.total).toBe(0);

  orchestrator.getStore().printSummary();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Broken Locator — email field dengan selector yang sudah berubah
// ─────────────────────────────────────────────────────────────────────────────
test('broken locator — sistem self-healing berhasil memperbaiki selector email', async ({ page }) => {
  const { wrapper, orchestrator } = createHealingWrapper(page);

  await page.goto(DEMO_PAGE_URL);

  /**
   * Skenario:
   * Developer dulu punya <input id="username" />, lalu diubah jadi id="user-email"
   * Test lama masih pakai '#username' → RUSAK
   * LLM harus menemukan: '#user-email' atau '[name="email"]' atau '[data-testid="input-email"]'
   *
   * timeout: 5000 → locator gagal dalam 5 detik, menyisakan ~115 detik untuk healing
   */
  await wrapper.safeFill(
    {
      selector: '#username',              // ← selector RUSAK (sudah diganti developer)
      testName: 'Broken Locator Test',
      filePath: __filename,
      stepName: 'Isi email (locator lama)',
    },
    'user@example.com',
    { timeout: 5000 },
  );

  // Jika healing berhasil, test melanjutkan ke sini
  const summary = orchestrator.getStore().getSummary();
  console.log('\n[DEMO] Healing summary:', JSON.stringify(summary, null, 2));

  // Simpan laporan
  await orchestrator.getStore().saveToFile('./healing-results/demo-test.json');

  orchestrator.getStore().printSummary();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Full Flow — semua aksi pakai locator lama yang rusak
// ─────────────────────────────────────────────────────────────────────────────
test('full broken flow — heal semua locator sekaligus', async ({ page }) => {
  const { wrapper, orchestrator } = createHealingWrapper(page);

  await page.goto(DEMO_PAGE_URL);

  /**
   * Simulasi: seluruh test ditulis dengan locator lama sebelum developer refactor HTML.
   * Locator lama:  #username      →  di HTML sekarang: #user-email
   * Locator lama:  #password      →  di HTML sekarang: #user-password
   * Locator lama:  #submit-button →  di HTML sekarang: #btn-login
   *
   * timeout: 5000 di setiap aksi → locator gagal cepat (5s),
   * menyisakan waktu yang cukup untuk 3 locator × (LLM + validasi)
   */
  await wrapper.safeFill(
    { selector: '#username',      testName: 'Full Broken Flow', filePath: __filename, stepName: 'Isi email' },
    'user@example.com',
    { timeout: 5000 },
  );

  await wrapper.safeFill(
    { selector: '#password',      testName: 'Full Broken Flow', filePath: __filename, stepName: 'Isi password' },
    'secretpassword',
    { timeout: 5000 },
  );

  await wrapper.safeClick(
    { selector: '#submit-button', testName: 'Full Broken Flow', filePath: __filename, stepName: 'Klik submit' },
    { timeout: 5000 },
  );

  // Verifikasi bahwa aksi-aksi di atas berhasil (baik lewat healing maupun langsung)
  await expect(page.locator('#result')).toBeVisible();

  const summary = orchestrator.getStore().getSummary();
  console.log('\n[DEMO] Healing summary:', JSON.stringify(summary, null, 2));

  await orchestrator.getStore().saveToFile('./healing-results/full-flow-test.json');
  orchestrator.getStore().printSummary();
});
