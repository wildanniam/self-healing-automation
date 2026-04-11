/**
 * Test LocatorValidator — Round 3
 *
 * Verifikasi bahwa LocatorValidator menolak/menerima selector
 * berdasarkan: uniqueness, visibility, enabled, tag/role/contenteditable
 * sesuai actionType.
 */

import * as path from 'path';
import { test, expect } from '@playwright/test';
import { LocatorValidator } from '../src/self-healing/core/locator-validator';

const FIXTURE = `file://${path.resolve(__dirname, 'fixtures/validator-test.html')}`;

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

// ─────────────────────────────────────────────────────────────────────────────
// Uniqueness
// ─────────────────────────────────────────────────────────────────────────────

test('1 elemen visible → valid (tanpa actionType)', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#visible-input');
  expect(result.isValid).toBe(true);
  expect(result.elementCount).toBe(1);
});

test('0 elemen → rejected no_match', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#does-not-exist');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toBe('no_match');
  expect(result.elementCount).toBe(0);
});

test('ambigu (>1 elemen) → rejected ambiguous', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('.same-btn');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toBe('ambiguous');
  expect(result.elementCount).toBe(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────────────────────

test('hidden elemen → rejected not_visible', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#hidden-input');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toBe('not_visible');
});

// ─────────────────────────────────────────────────────────────────────────────
// Enabled check
// ─────────────────────────────────────────────────────────────────────────────

test('disabled button + click → rejected not_enabled', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#disabled-btn', 'click');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toBe('not_enabled');
});

test('enabled button + click → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#enabled-btn', 'click');
  expect(result.isValid).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// fill actionType
// ─────────────────────────────────────────────────────────────────────────────

test('fill ke input → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#visible-input', 'fill');
  expect(result.isValid).toBe(true);
});

test('fill ke textarea → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#my-textarea', 'fill');
  expect(result.isValid).toBe(true);
});

test('fill ke contenteditable div → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#editable-div', 'fill');
  expect(result.isValid).toBe(true);
});

test('fill ke plain div → rejected action_mismatch', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#plain-div', 'fill');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toContain('action_mismatch');
});

// ─────────────────────────────────────────────────────────────────────────────
// select actionType
// ─────────────────────────────────────────────────────────────────────────────

test('select ke native select → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#native-select', 'select');
  expect(result.isValid).toBe(true);
});

test('select ke plain div → rejected action_mismatch', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#plain-div', 'select');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toContain('action_mismatch');
});

test('select ke input → rejected action_mismatch', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#visible-input', 'select');
  expect(result.isValid).toBe(false);
  expect(result.rejectReason).toContain('action_mismatch');
});

// ─────────────────────────────────────────────────────────────────────────────
// click actionType — semua tag valid (no tag constraint)
// ─────────────────────────────────────────────────────────────────────────────

test('click ke div → valid (click tidak punya constraint tag)', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#plain-div', 'click');
  expect(result.isValid).toBe(true);
});

test('click ke input → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#visible-input', 'click');
  expect(result.isValid).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// getText / waitForVisible — no constraint
// ─────────────────────────────────────────────────────────────────────────────

test('getText ke div → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#plain-div', 'getText');
  expect(result.isValid).toBe(true);
});

test('waitForVisible ke input → valid', async ({ page }) => {
  const v = new LocatorValidator(page);
  const result = await v.validate('#visible-input', 'waitForVisible');
  expect(result.isValid).toBe(true);
});
