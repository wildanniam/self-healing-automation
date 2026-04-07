/**
 * Test Git Service & GitHub PR Creator — Milestone 4
 *
 * Strategi testing:
 * - GitService: test menggunakan temp git repo agar tidak menyentuh repo asli
 * - GitHubPRCreator: tidak test API asli — hanya test buildPRDescription() secara unit
 */

import * as path from 'path';
import * as os from 'os';
import { promises as fsp } from 'fs';
import { execSync } from 'child_process';
import { test, expect } from '@playwright/test';
import { GitService, GitHubPRCreator } from '../src/self-healing';
import type { PatchResult } from '../src/self-healing';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: buat temp git repo yang sudah di-init
// ─────────────────────────────────────────────────────────────────────────────
async function createTempRepo(): Promise<string> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'git-service-test-'));
  execSync('git init', { cwd: tmpDir });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir });
  execSync('git config user.name "Test"', { cwd: tmpDir });
  // Buat initial commit supaya HEAD ada
  await fsp.writeFile(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  execSync('git add README.md', { cwd: tmpDir });
  execSync('git commit -m "initial commit"', { cwd: tmpDir });
  return tmpDir;
}

const defaultGitConfig = {
  branchPrefix:    'auto-healing',
  commitMsgPrefix: 'chore(self-healing)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Branch Naming
// ─────────────────────────────────────────────────────────────────────────────
test('buildBranchName — spasi dan karakter spesial dikonversi ke dash', () => {
  const svc = new GitService(defaultGitConfig);
  expect(svc.buildBranchName('Login Test')).toBe('auto-healing/login-test');
  expect(svc.buildBranchName('Full Broken Flow!')).toBe('auto-healing/full-broken-flow');
  expect(svc.buildBranchName('test--double  spaces')).toBe('auto-healing/test-double-spaces');
});

// ─────────────────────────────────────────────────────────────────────────────
// Commit Message
// ─────────────────────────────────────────────────────────────────────────────
test('buildCommitMessage — format standar sesuai development plan', () => {
  const svc = new GitService(defaultGitConfig);
  expect(svc.buildCommitMessage('Login Test')).toBe('chore(self-healing): update locator for Login Test');
});

// ─────────────────────────────────────────────────────────────────────────────
// commitLocal — berhasil buat branch dan commit di temp repo
// ─────────────────────────────────────────────────────────────────────────────
test('commitLocal — buat branch dan commit file yang dipatch', async () => {
  const tmpDir = await createTempRepo();

  // Buat file dummy yang "sudah dipatch"
  const specPath = path.join(tmpDir, 'login.spec.ts');
  await fsp.writeFile(specPath, `await wrapper.safeClick({ selector: '#user-email' });\n`);

  const patchResults: PatchResult[] = [{
    filePath:            specPath,
    oldLocator:          '#username',
    newLocator:          '#user-email',
    occurrencesFound:    1,
    occurrencesReplaced: 1,
    success:             true,
  }];

  const svc    = new GitService(defaultGitConfig, tmpDir);
  const result = await svc.commitLocal(patchResults, 'Login Test');

  expect(result.success).toBe(true);
  expect(result.branch).toBe('auto-healing/login-test');
  expect(result.committedFiles).toContain(specPath);
  expect(result.pushedToRemote).toBe(false);

  // Verifikasi git log di temp repo
  const log = execSync('git log --oneline', { cwd: tmpDir }).toString();
  expect(log).toContain('chore(self-healing): update locator for Login Test');
});

// ─────────────────────────────────────────────────────────────────────────────
// commitLocal — skip jika tidak ada file yang berhasil dipatch
// ─────────────────────────────────────────────────────────────────────────────
test('commitLocal — tidak commit jika semua patchResults gagal', async () => {
  const tmpDir = await createTempRepo();

  const patchResults: PatchResult[] = [{
    filePath:            '/some/file.spec.ts',
    oldLocator:          '#username',
    newLocator:          '#user-email',
    occurrencesFound:    0,
    occurrencesReplaced: 0,
    success:             false,
    reason:              'Selector tidak ditemukan',
  }];

  const svc    = new GitService(defaultGitConfig, tmpDir);
  const result = await svc.commitLocal(patchResults, 'Login Test');

  expect(result.success).toBe(false);
  expect(result.committedFiles).toHaveLength(0);
  expect(result.reason).toBeDefined();
});

// ─────────────────────────────────────────────────────────────────────────────
// MR Description — format markdown benar
// ─────────────────────────────────────────────────────────────────────────────
test('buildPRDescription — menghasilkan tabel markdown yang benar', () => {
  const mr = new GitHubPRCreator({
    token: 'dummy',
    repo:  'wildanniam/self-healing-automation',
  });

  const patchResults: PatchResult[] = [
    {
      filePath:            '/project/tests/login.spec.ts',
      oldLocator:          '#username',
      newLocator:          '#user-email',
      occurrencesFound:    1,
      occurrencesReplaced: 1,
      success:             true,
    },
    {
      filePath:            '/project/tests/login.spec.ts',
      oldLocator:          '#submit-button',
      newLocator:          '#btn-login',
      occurrencesFound:    1,
      occurrencesReplaced: 1,
      success:             true,
    },
  ];

  const desc = mr.buildPRDescription(patchResults, 'Login Test');

  expect(desc).toContain('Auto-Healing: Login Test');
  expect(desc).toContain('`#username`');
  expect(desc).toContain('`#user-email`');
  expect(desc).toContain('`#submit-button`');
  expect(desc).toContain('`#btn-login`');
  expect(desc).toContain('login.spec.ts');
  expect(desc).toContain('Total dipatch:** 2');
});

// ─────────────────────────────────────────────────────────────────────────────
// PR Description — locator gagal masuk ke seksi "tidak dipatch"
// ─────────────────────────────────────────────────────────────────────────────
test('buildPRDescription — locator gagal ditampilkan di seksi terpisah', () => {
  const mr = new GitHubPRCreator({
    token: 'dummy',
    repo:  'wildanniam/self-healing-automation',
  });

  const patchResults: PatchResult[] = [
    {
      filePath: '/project/tests/login.spec.ts',
      oldLocator: '#username', newLocator: '#user-email',
      occurrencesFound: 1, occurrencesReplaced: 1, success: true,
    },
    {
      filePath: '/project/tests/login.spec.ts',
      oldLocator: '#ghost-element', newLocator: '',
      occurrencesFound: 0, occurrencesReplaced: 0, success: false,
      reason: 'Selector tidak ditemukan di file',
    },
  ];

  const desc = mr.buildPRDescription(patchResults, 'Login Test');

  expect(desc).toContain('Locator yang Tidak Dipatch');
  expect(desc).toContain('`#ghost-element`');
  expect(desc).toContain('Selector tidak ditemukan di file');
});
