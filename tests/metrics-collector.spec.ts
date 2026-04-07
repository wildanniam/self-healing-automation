/**
 * Test Metrics Collector — Milestone 5
 *
 * Unit test murni — tidak butuh browser atau OPENAI_API_KEY.
 * Verifikasi bahwa MetricsCollector menghitung statistik dengan benar.
 */

import * as path from 'path';
import * as os from 'os';
import { promises as fsp } from 'fs';
import { test, expect } from '@playwright/test';
import { MetricsCollector, ResultsStore } from '../src/self-healing';
import type { HealingResult } from '../src/self-healing';

function makeResult(overrides: Partial<HealingResult>): HealingResult {
  return {
    testName:    'Test',
    filePath:    '/test/file.spec.ts',
    oldLocator:  '#old',
    newLocator:  '#new',
    timestamp:   new Date().toISOString(),
    status:      'healed',
    retryCount:  1,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Store kosong — semua nilai 0
// ─────────────────────────────────────────────────────────────────────────────
test('collect() dari store kosong — nilai default nol', () => {
  const store     = new ResultsStore();
  const collector = new MetricsCollector();
  const metrics   = collector.collect(store);

  expect(metrics.totalLocators).toBe(0);
  expect(metrics.healed).toBe(0);
  expect(metrics.failed).toBe(0);
  expect(metrics.skipped).toBe(0);
  expect(metrics.successRate).toBe('N/A');
  expect(metrics.avgHealingTimeMs).toBe(0);
  expect(metrics.fastestHealMs).toBe(0);
  expect(metrics.slowestHealMs).toBe(0);
  expect(metrics.avgRetryCount).toBe(0);
  expect(metrics.details).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Mixed results — healed/failed/skipped dihitung benar
// ─────────────────────────────────────────────────────────────────────────────
test('collect() dengan mixed results — statistik dihitung benar', () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'healed', retryCount: 1, healingDurationMs: 1000 }));
  store.add(makeResult({ status: 'healed', retryCount: 2, healingDurationMs: 3000 }));
  store.add(makeResult({ status: 'failed', retryCount: 3, healingDurationMs: 5000 }));
  store.add(makeResult({ status: 'skipped', retryCount: 0 }));

  const collector = new MetricsCollector();
  const metrics   = collector.collect(store);

  expect(metrics.totalLocators).toBe(4);
  expect(metrics.healed).toBe(2);
  expect(metrics.failed).toBe(1);
  expect(metrics.skipped).toBe(1);
  expect(metrics.successRate).toBe('50.0%');
  expect(metrics.details).toHaveLength(4);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Timing — avg, fastest, slowest dihitung hanya dari 'healed'
// ─────────────────────────────────────────────────────────────────────────────
test('avgHealingTimeMs — dihitung hanya dari hasil healed', () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'healed', healingDurationMs: 1000 }));
  store.add(makeResult({ status: 'healed', healingDurationMs: 3000 }));
  store.add(makeResult({ status: 'failed', healingDurationMs: 9999 })); // tidak ikut avg

  const metrics = new MetricsCollector().collect(store);

  expect(metrics.avgHealingTimeMs).toBe(2000);  // (1000 + 3000) / 2
  expect(metrics.fastestHealMs).toBe(1000);
  expect(metrics.slowestHealMs).toBe(3000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: avgRetryCount — rata-rata dari semua result
// ─────────────────────────────────────────────────────────────────────────────
test('avgRetryCount — rata-rata retry dari semua hasil', () => {
  const store = new ResultsStore();
  store.add(makeResult({ retryCount: 1 }));
  store.add(makeResult({ retryCount: 3 }));

  const metrics = new MetricsCollector().collect(store);

  expect(metrics.avgRetryCount).toBe(2.0);  // (1 + 3) / 2
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: saveToFile — file JSON terbuat dengan konten benar
// ─────────────────────────────────────────────────────────────────────────────
test('saveToFile — metrics.json terbuat dengan struktur yang benar', async () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'healed', healingDurationMs: 2500, retryCount: 2 }));

  const collector = new MetricsCollector();
  const metrics   = collector.collect(store);

  const tmpDir    = await fsp.mkdtemp(path.join(os.tmpdir(), 'metrics-test-'));
  const outputPath = path.join(tmpDir, 'metrics.json');

  await collector.saveToFile(metrics, outputPath);

  const raw    = await fsp.readFile(outputPath, 'utf-8');
  const parsed = JSON.parse(raw);

  expect(parsed.totalLocators).toBe(1);
  expect(parsed.healed).toBe(1);
  expect(parsed.successRate).toBe('100.0%');
  expect(parsed.avgHealingTimeMs).toBe(2500);
  expect(parsed.details).toHaveLength(1);
  expect(parsed.details[0].durationMs).toBe(2500);
  expect(parsed.generatedAt).toBeDefined();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: healingDurationMs tanpa data — default ke 0
// ─────────────────────────────────────────────────────────────────────────────
test('result tanpa healingDurationMs — durasinya default ke 0', () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'healed' }));  // tidak ada healingDurationMs

  const metrics = new MetricsCollector().collect(store);

  // Tidak crash, tapi avg = 0 karena tidak ada data timing
  expect(metrics.avgHealingTimeMs).toBe(0);
  expect(metrics.details[0].durationMs).toBe(0);
});
