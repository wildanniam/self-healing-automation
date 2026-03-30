import simpleGit, { SimpleGit } from 'simple-git';
import type { GitConfig } from '../config';
import type { PatchResult } from '../core/file-patcher';
import { logger } from '../logger';

export interface GitResult {
  branch: string;
  committedFiles: string[];
  pushedToRemote: boolean;
  success: boolean;
  reason?: string;
}

/**
 * GitService mengotomasi operasi git setelah FilePatcher menerapkan perubahan locator.
 *
 * Alur kerja:
 *   1. Buat branch baru: auto-healing/[test-name]
 *   2. Stage hanya file yang berhasil dipatch
 *   3. Commit dengan pesan standar
 *   4. Push ke remote origin (opsional via commitAndPush)
 *
 * Cara pakai:
 *   const git = new GitService(loadGitConfig());
 *   const result = await git.commitAndPush(patchResults, 'Login Test');
 */
export class GitService {
  private readonly git: SimpleGit;

  constructor(
    private readonly config: GitConfig,
    repoPath: string = process.cwd(),
  ) {
    this.git = simpleGit(repoPath);
  }

  /**
   * Buat branch, commit file yang dipatch, dan push ke remote origin.
   *
   * @param patchResults - Hasil dari FilePatcher (hanya yang success === true yang di-commit)
   * @param testName     - Nama test yang di-heal (dipakai di nama branch & pesan commit)
   */
  async commitAndPush(patchResults: PatchResult[], testName: string): Promise<GitResult> {
    const result = await this.commitLocal(patchResults, testName);
    if (!result.success) return result;

    try {
      await this.git.push('origin', result.branch);
      result.pushedToRemote = true;
      logger.info('[git-service] ✓ Branch berhasil di-push ke remote', {
        branch: result.branch,
      });
    } catch (err) {
      result.success = false;
      result.pushedToRemote = false;
      result.reason = `Push gagal: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[git-service] Push ke remote gagal', {
        branch: result.branch,
        error:  result.reason,
      });
    }

    return result;
  }

  /**
   * Buat branch dan commit lokal tanpa push ke remote.
   * Berguna untuk testing dan validasi sebelum push.
   */
  async commitLocal(patchResults: PatchResult[], testName: string): Promise<GitResult> {
    const branch = this.buildBranchName(testName);
    const filesToCommit = patchResults
      .filter(r => r.success)
      .map(r => r.filePath);

    const result: GitResult = {
      branch,
      committedFiles: [],
      pushedToRemote: false,
      success: false,
    };

    if (filesToCommit.length === 0) {
      result.reason = 'Tidak ada file yang berhasil dipatch — tidak ada yang perlu di-commit';
      logger.warn('[git-service] Tidak ada file untuk di-commit', { testName });
      return result;
    }

    try {
      // Buat branch baru dari posisi HEAD saat ini
      await this.git.checkoutLocalBranch(branch);
      logger.info('[git-service] Branch baru dibuat', { branch });

      // Stage hanya file yang dipatch — tidak pakai git add -A
      await this.git.add(filesToCommit);
      logger.info('[git-service] File di-stage', { files: filesToCommit });

      // Commit
      const message = this.buildCommitMessage(testName);
      await this.git.commit(message);
      logger.info('[git-service] ✓ Commit berhasil', { branch, message, files: filesToCommit.length });

      result.committedFiles = filesToCommit;
      result.success = true;
    } catch (err) {
      result.reason = err instanceof Error ? err.message : String(err);
      logger.error('[git-service] Operasi git gagal', { branch, error: result.reason });
    }

    return result;
  }

  /**
   * Bentuk nama branch dari testName.
   * Contoh: 'Login Test' → 'auto-healing/login-test'
   */
  buildBranchName(testName: string): string {
    const slug = testName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${this.config.branchPrefix}/${slug}`;
  }

  /**
   * Bentuk pesan commit standar.
   * Contoh: 'chore(self-healing): update locator for Login Test'
   */
  buildCommitMessage(testName: string): string {
    return `${this.config.commitMsgPrefix}: update locator for ${testName}`;
  }
}
