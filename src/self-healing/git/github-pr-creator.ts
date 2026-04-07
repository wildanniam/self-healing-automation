import type { GitHubConfig } from '../config';
import type { PatchResult } from '../core/file-patcher';
import { logger } from '../logger';

export interface PRResult {
  prUrl: string;
  prNumber: number;
  title: string;
  success: boolean;
  reason?: string;
}

/**
 * GitHubPRCreator membuat Pull Request di GitHub secara otomatis
 * setelah GitService berhasil push branch ke remote.
 *
 * PR dibuat dengan:
 *   - Title: Auto-Healing: [test-name]
 *   - Body: tabel markdown berisi daftar old → new locator
 *   - Head branch: branch yang baru di-push
 *   - Base branch: main (default)
 *
 * Cara pakai:
 *   const pr = new GitHubPRCreator(loadGitHubConfig());
 *   const result = await pr.createPR('auto-healing/login-test', patchResults, 'Login Test');
 */
export class GitHubPRCreator {
  constructor(private readonly config: GitHubConfig) {}

  /**
   * Buat Pull Request di GitHub.
   *
   * @param branch       - Branch head yang sudah di-push (cth: auto-healing/login-test)
   * @param patchResults - Hasil patching untuk di-include di body PR
   * @param testName     - Nama test untuk judul PR
   * @param baseBranch   - Branch tujuan PR (default: main)
   */
  async createPR(
    branch: string,
    patchResults: PatchResult[],
    testName: string,
    baseBranch = 'main',
  ): Promise<PRResult> {
    const title = `Auto-Healing: ${testName}`;
    const body  = this.buildPRDescription(patchResults, testName);
    const url   = `https://api.github.com/repos/${this.config.repo}/pulls`;

    logger.info('[github-pr] Membuat Pull Request', { title, branch, baseBranch });

    let response: Response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':        'application/json',
          'Accept':              'application/vnd.github+json',
          'Authorization':       `Bearer ${this.config.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title,
          body,
          head: branch,
          base: baseBranch,
        }),
      });
    } catch (err) {
      const reason = `Network error: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[github-pr] Gagal menghubungi GitHub API', { error: reason });
      return { prUrl: '', prNumber: 0, title, success: false, reason };
    }

    if (!response.ok) {
      const text   = await response.text().catch(() => '');
      const reason = `GitHub API error ${response.status}: ${text}`;
      logger.error('[github-pr] GitHub API mengembalikan error', { status: response.status, body: text });
      return { prUrl: '', prNumber: 0, title, success: false, reason };
    }

    const data = await response.json() as { number: number; html_url: string };
    logger.info('[github-pr] ✓ Pull Request berhasil dibuat', {
      prNumber: data.number,
      prUrl:    data.html_url,
      title,
    });

    return {
      prUrl:    data.html_url,
      prNumber: data.number,
      title,
      success:  true,
    };
  }

  /**
   * Buat body PR dalam format markdown.
   * Berisi tabel old → new locator dan ringkasan healing.
   */
  buildPRDescription(patchResults: PatchResult[], testName: string): string {
    const patched  = patchResults.filter(r => r.success);
    const skipped  = patchResults.filter(r => !r.success);

    const lines: string[] = [
      `## Auto-Healing: ${testName}`,
      '',
      'Pull Request ini dibuat secara otomatis oleh sistem self-healing.',
      'Locator yang rusak telah diperbaiki menggunakan LLM dan divalidasi di browser.',
      '',
      `**Total dipatch:** ${patched.length} locator`,
      '',
    ];

    if (patched.length > 0) {
      lines.push('### Perubahan Locator', '');
      lines.push('| File | Locator Lama | Locator Baru |');
      lines.push('|---|---|---|');
      for (const r of patched) {
        const filename = r.filePath.split('/').pop() ?? r.filePath;
        lines.push(`| \`${filename}\` | \`${r.oldLocator}\` | \`${r.newLocator}\` |`);
      }
      lines.push('');
    }

    if (skipped.length > 0) {
      lines.push('### Locator yang Tidak Dipatch', '');
      for (const r of skipped) {
        lines.push(`- \`${r.oldLocator}\` — ${r.reason ?? 'tidak ditemukan di file'}`);
      }
      lines.push('');
    }

    lines.push(
      '---',
      '_Harap review perubahan di atas sebelum merge._',
      '_Pastikan locator baru menarget elemen yang benar sesuai konteks test._',
    );

    return lines.join('\n');
  }
}
