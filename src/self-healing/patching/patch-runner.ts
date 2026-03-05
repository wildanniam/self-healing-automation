import type { HealingResult } from '../types';
import type { GitHubConfig, GitBotConfig } from '../config';
import { loadGitHubConfig, loadGitBotConfig } from '../config';
import { GitService } from '../git/git-service';
import { GitHubPrService } from '../git/github-pr';
import { ResultsStore } from '../core/results-store';
import { patchTestFile } from './test-file-patcher';
import { logger } from '../logger';

/**
 * PatchRunner mengorkestrasi seluruh alur Phase 4 (Auto-Patching & GitHub PR):
 *
 *   1. Filter HealingResult yang berstatus 'healed'
 *   2. Patch masing-masing file .spec.ts (ganti locator lama → baru)
 *   3. Buat branch Git baru, commit, push ke remote
 *   4. Buat Pull Request di GitHub untuk review QA
 *
 * Cara pakai (di test, setelah test run selesai):
 * ```typescript
 * const runner = createPatchRunner();
 * const prUrl  = await runner.runFromStore(orchestrator.getStore());
 * console.log('PR:', prUrl);
 * ```
 */
export class PatchRunner {
  constructor(
    private readonly gitService: GitService,
    private readonly githubPr: GitHubPrService,
  ) {}

  /**
   * Shortcut — langsung ambil hasil dari ResultsStore.
   */
  async runFromStore(store: ResultsStore): Promise<string | null> {
    return this.run(store.getAll());
  }

  /**
   * Jalankan proses patching dan PR creation dari daftar HealingResult.
   *
   * @param results - Semua HealingResult dari test run (healed + failed)
   * @returns       - URL Pull Request yang dibuat, atau null jika tidak ada yang di-patch
   */
  async run(results: HealingResult[]): Promise<string | null> {
    const healed = results.filter(r => r.status === 'healed' && r.newLocator.length > 0);

    if (healed.length === 0) {
      logger.info('[patch-runner] Tidak ada locator yang perlu di-patch (belum ada hasil healed)');
      return null;
    }

    logger.info('[patch-runner] Memulai proses auto-patching', { count: healed.length });

    // ── Step 1: Patch setiap file .spec.ts ──────────────────────────────────
    const patchResults = await Promise.all(
      healed.map(r => patchTestFile(r.filePath, r.oldLocator, r.newLocator)),
    );

    const patchedFiles = [
      ...new Set(patchResults.filter(p => p.patched).map(p => p.filePath)),
    ];

    if (patchedFiles.length === 0) {
      logger.warn(
        '[patch-runner] Tidak ada file yang berhasil di-patch — ' +
        'locator mungkin sudah berubah atau tidak cocok dengan pola regex',
      );
      return null;
    }

    logger.info('[patch-runner] File berhasil di-patch', { patchedFiles });

    // ── Step 2: Git — buat branch, commit, push ──────────────────────────────
    const uniqueTestNames = [...new Set(healed.map(r => r.testName))];
    const commitLabel     = uniqueTestNames.join(' | ');

    const branchName = await this.gitService.createBranchAndCommit(commitLabel, patchedFiles);

    // ── Step 3: Buat GitHub Pull Request ─────────────────────────────────────
    const prUrl = await this.githubPr.createPullRequest(branchName, healed);

    logger.info('[patch-runner] ✓ Selesai — Pull Request siap direview', { prUrl });
    return prUrl;
  }
}

/**
 * Factory function untuk membuat PatchRunner yang sudah terkonfigurasi
 * dari environment variables.
 *
 * @param githubConfig - Opsional: konfigurasi GitHub kustom
 * @param gitBotConfig - Opsional: konfigurasi bot Git kustom
 * @param workDir      - Opsional: direktori kerja Git (default: process.cwd())
 */
export function createPatchRunner(
  githubConfig?: GitHubConfig,
  gitBotConfig?: GitBotConfig,
  workDir?: string,
): PatchRunner {
  const ghConfig  = githubConfig ?? loadGitHubConfig();
  const botConfig = gitBotConfig ?? loadGitBotConfig();

  const gitService = new GitService(botConfig, workDir);
  const githubPr   = new GitHubPrService(ghConfig);

  return new PatchRunner(gitService, githubPr);
}
