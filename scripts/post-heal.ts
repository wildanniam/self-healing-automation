/**
 * Post-Heal Runner — Milestone 4
 *
 * Script ini menjalankan alur M4 secara otomatis setelah `npm test` selesai:
 *   1. Baca healing-results/results.json
 *   2. Patch file .spec.ts dengan locator baru (FilePatcher)
 *   3. Buat branch, commit, push ke GitHub (GitService)
 *   4. Buat Pull Request di GitHub (GitHubPRCreator)
 *
 * Cara pakai:
 *   npx ts-node scripts/post-heal.ts
 *   npx ts-node scripts/post-heal.ts --report healing-results/results.json
 *   npx ts-node scripts/post-heal.ts --dry-run   (patch saja, tanpa git & PR)
 *
 * Env vars yang dibutuhkan (untuk step git & PR):
 *   GITHUB_TOKEN=ghp_xxx
 *   GITHUB_REPO=wildanniam/self-healing-automation
 */

import * as fs from 'fs';
import 'dotenv/config';

import { FilePatcher } from '../src/self-healing/core/file-patcher';
import { GitService } from '../src/self-healing/git/git-service';
import { GitHubPRCreator } from '../src/self-healing/git/github-pr-creator';
import { loadGitConfig, loadGitHubConfig } from '../src/self-healing/config';
import { logger } from '../src/self-healing/logger';
import type { HealingReport } from '../src/self-healing/core/results-store';
import type { PatchResult } from '../src/self-healing/core/file-patcher';

// ── Parse argumen CLI ─────────────────────────────────────────────────────────

const args         = process.argv.slice(2);
const reportFlag   = args.indexOf('--report');
const reportPath   = reportFlag !== -1 ? args[reportFlag + 1] : 'healing-results/results.json';
const isDryRun     = args.includes('--dry-run');

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('[post-heal] Memulai post-heal runner', { reportPath, isDryRun });

  // 1. Cek apakah report ada
  if (!fs.existsSync(reportPath)) {
    logger.error('[post-heal] File report tidak ditemukan', { reportPath });
    logger.info('[post-heal] Jalankan `npm test` terlebih dahulu untuk menghasilkan healing report.');
    process.exit(1);
  }

  // 2. Baca report untuk ambil test name (dipakai di branch & PR title)
  const raw    = fs.readFileSync(reportPath, 'utf-8');
  const report = JSON.parse(raw) as HealingReport;

  if (report.summary.healed === 0) {
    logger.info('[post-heal] Tidak ada locator yang di-heal — tidak ada yang perlu dipatch.', {
      total:  report.summary.total,
      failed: report.summary.failed,
    });
    process.exit(0);
  }

  logger.info('[post-heal] Healing report ditemukan', {
    healed:      report.summary.healed,
    failed:      report.summary.failed,
    successRate: report.summary.successRate,
  });

  // Ambil testName unik untuk nama branch & PR
  const testNames  = [...new Set(report.results.filter(r => r.status === 'healed').map(r => r.testName))];
  const testLabel  = testNames.length === 1 ? testNames[0] : `${testNames.length} tests`;

  // 3. Step 1 — Patch file .spec.ts
  logger.info('[post-heal] Step 1/3 — Menjalankan FilePatcher...');
  const patcher      = new FilePatcher();
  const patchResults = await patcher.patchFromReport(reportPath);
  patcher.printSummary(patchResults);

  const patched = patchResults.filter(r => r.success);
  if (patched.length === 0) {
    logger.warn('[post-heal] Tidak ada file yang berhasil dipatch — stop.');
    process.exit(1);
  }

  // 4. Jika dry-run, berhenti di sini
  if (isDryRun) {
    logger.info('[post-heal] --dry-run aktif, berhenti sebelum git & PR.');
    process.exit(0);
  }

  // 5. Step 2 — Git: branch + commit + push
  logger.info('[post-heal] Step 2/3 — Menjalankan GitService...');
  const gitConfig = loadGitConfig();
  const git       = new GitService(gitConfig);
  const gitResult = await git.commitAndPush(patchResults, testLabel);

  if (!gitResult.success) {
    logger.error('[post-heal] GitService gagal', { reason: gitResult.reason });
    process.exit(1);
  }

  logger.info('[post-heal] Branch berhasil di-push', {
    branch:         gitResult.branch,
    committedFiles: gitResult.committedFiles.length,
  });

  // 6. Step 3 — Buat GitHub PR
  logger.info('[post-heal] Step 3/3 — Membuat GitHub Pull Request...');

  let ghConfig;
  try {
    ghConfig = loadGitHubConfig();
  } catch {
    logger.warn('[post-heal] GITHUB_TOKEN atau GITHUB_REPO tidak diset — skip pembuatan PR.');
    logger.info('[post-heal] Set env vars tersebut di .env untuk mengaktifkan PR otomatis.');
    printSummary(patchResults, gitResult.branch, null);
    process.exit(0);
  }

  const prCreator = new GitHubPRCreator(ghConfig);
  const prResult  = await prCreator.createPR(gitResult.branch, patchResults, testLabel);

  printSummary(patchResults, gitResult.branch, prResult.success ? prResult.prUrl : null);

  if (!prResult.success) {
    logger.error('[post-heal] Gagal membuat PR', { reason: prResult.reason });
    process.exit(1);
  }

  process.exit(0);
}

// ── Helper ────────────────────────────────────────────────────────────────────

function printSummary(
  patchResults: PatchResult[],
  branch: string,
  prUrl: string | null,
): void {
  const patched = patchResults.filter(r => r.success).length;
  const skipped = patchResults.filter(r => !r.success).length;

  logger.info('[post-heal] ===== RINGKASAN POST-HEAL =====', {
    locatorDipatch: patched,
    locatorDiskip:  skipped,
    branch,
    prUrl:          prUrl ?? '(tidak dibuat)',
  });
}

main().catch(err => {
  logger.error('[post-heal] Error tidak terduga', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
