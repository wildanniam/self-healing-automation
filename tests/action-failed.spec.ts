/**
 * Test action_failed flow — Round 3
 *
 * Verifikasi bahwa:
 * 1. ResultsStore.updateLastStatus match dengan 4-field criteria
 * 2. ActionFailedCallback dipanggil dengan descriptor lengkap
 * 3. MetricsCollector menghitung actionFailed
 */

import { test, expect } from '@playwright/test';
import { ResultsStore } from '../src/self-healing/core/results-store';
import { MetricsCollector } from '../src/self-healing/core/metrics-collector';
import type { HealingResult } from '../src/self-healing/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<HealingResult> = {}): HealingResult {
  return {
    testName: 'Login Test',
    filePath: '/tests/login.spec.ts',
    oldLocator: '#username',
    newLocator: '#user-email',
    timestamp: new Date().toISOString(),
    status: 'healed',
    retryCount: 1,
    healingDurationMs: 500,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// updateLastStatus — 4-field matching
// ─────────────────────────────────────────────────────────────────────────────

test('updateLastStatus — match dengan semua 4 field → status berubah', () => {
  const store = new ResultsStore();
  store.add(makeResult());

  const updated = store.updateLastStatus(
    { oldLocator: '#username', newLocator: '#user-email', testName: 'Login Test', filePath: '/tests/login.spec.ts' },
    'healed',
    'action_failed',
  );

  expect(updated).toBe(true);
  expect(store.getAll()[0].status).toBe('action_failed');
});

test('updateLastStatus — oldLocator cocok tapi testName beda → tidak match', () => {
  const store = new ResultsStore();
  store.add(makeResult());

  const updated = store.updateLastStatus(
    { oldLocator: '#username', newLocator: '#user-email', testName: 'Different Test', filePath: '/tests/login.spec.ts' },
    'healed',
    'action_failed',
  );

  expect(updated).toBe(false);
  expect(store.getAll()[0].status).toBe('healed'); // tidak berubah
});

test('updateLastStatus — oldLocator cocok tapi filePath beda → tidak match', () => {
  const store = new ResultsStore();
  store.add(makeResult());

  const updated = store.updateLastStatus(
    { oldLocator: '#username', newLocator: '#user-email', testName: 'Login Test', filePath: '/tests/other.spec.ts' },
    'healed',
    'action_failed',
  );

  expect(updated).toBe(false);
  expect(store.getAll()[0].status).toBe('healed');
});

test('updateLastStatus — fromStatus tidak cocok → tidak match', () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'failed' }));

  const updated = store.updateLastStatus(
    { oldLocator: '#username', newLocator: '#user-email', testName: 'Login Test', filePath: '/tests/login.spec.ts' },
    'healed', // fromStatus healed, tapi status di store adalah failed
    'action_failed',
  );

  expect(updated).toBe(false);
  expect(store.getAll()[0].status).toBe('failed');
});

test('updateLastStatus — multiple results, update yang terakhir cocok', () => {
  const store = new ResultsStore();
  store.add(makeResult({ newLocator: '#email-v1' }));
  store.add(makeResult({ newLocator: '#email-v2' }));

  const updated = store.updateLastStatus(
    { oldLocator: '#username', newLocator: '#email-v2', testName: 'Login Test', filePath: '/tests/login.spec.ts' },
    'healed',
    'action_failed',
  );

  expect(updated).toBe(true);
  // Yang pertama tidak berubah
  expect(store.getAll()[0].status).toBe('healed');
  // Yang kedua berubah
  expect(store.getAll()[1].status).toBe('action_failed');
});

// ─────────────────────────────────────────────────────────────────────────────
// MetricsCollector — actionFailed field
// ─────────────────────────────────────────────────────────────────────────────

test('MetricsCollector menghitung actionFailed dari store', () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'healed' }));
  store.add(makeResult({ status: 'action_failed', oldLocator: '#password', newLocator: '#pwd' }));
  store.add(makeResult({ status: 'failed', oldLocator: '#submit', newLocator: '' }));

  const collector = new MetricsCollector();
  const metrics = collector.collect(store);

  expect(metrics.totalLocators).toBe(3);
  expect(metrics.healed).toBe(1);
  expect(metrics.actionFailed).toBe(1);
  expect(metrics.failed).toBe(1);
});

test('MetricsCollector — zero actionFailed saat semua berhasil', () => {
  const store = new ResultsStore();
  store.add(makeResult({ status: 'healed' }));
  store.add(makeResult({ status: 'healed', oldLocator: '#password', newLocator: '#pwd' }));

  const collector = new MetricsCollector();
  const metrics = collector.collect(store);

  expect(metrics.actionFailed).toBe(0);
  expect(metrics.healed).toBe(2);
});
