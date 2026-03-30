import type { GitLabConfig } from '../config';
import type { PatchResult } from '../core/file-patcher';
import { logger } from '../logger';

export interface MRResult {
  mrUrl: string;
  mrId: number;
  title: string;
  success: boolean;
  reason?: string;
}

/**
 * GitLabMRCreator membuat Merge Request di GitLab secara otomatis
 * setelah GitService berhasil push branch ke remote.
 *
 * MR dibuat dengan:
 *   - Title: Auto-Healing: [test-name]
 *   - Description: tabel markdown berisi daftar old → new locator
 *   - Source branch: branch yang baru di-push
 *   - Target branch: main (default)
 *
 * Cara pakai:
 *   const mr = new GitLabMRCreator(loadGitLabConfig());
 *   const result = await mr.createMR('auto-healing/login-test', patchResults, 'Login Test');
 */
export class GitLabMRCreator {
  constructor(private readonly config: GitLabConfig) {}

  /**
   * Buat Merge Request di GitLab.
   *
   * @param branch       - Branch source yang sudah di-push (cth: auto-healing/login-test)
   * @param patchResults - Hasil patching untuk di-include di deskripsi MR
   * @param testName     - Nama test untuk judul MR
   * @param targetBranch - Branch tujuan MR (default: main)
   */
  async createMR(
    branch: string,
    patchResults: PatchResult[],
    testName: string,
    targetBranch = 'main',
  ): Promise<MRResult> {
    const title       = `Auto-Healing: ${testName}`;
    const description = this.buildMRDescription(patchResults, testName);
    const url         = `${this.config.baseUrl}/api/v4/projects/${encodeURIComponent(this.config.projectId)}/merge_requests`;

    const body = {
      source_branch:        branch,
      target_branch:        targetBranch,
      title,
      description,
      remove_source_branch: true,
    };

    logger.info('[gitlab-mr] Membuat Merge Request', { title, branch, targetBranch });

    let response: Response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'PRIVATE-TOKEN': this.config.privateToken,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const reason = `Network error: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[gitlab-mr] Gagal menghubungi GitLab API', { error: reason });
      return { mrUrl: '', mrId: 0, title, success: false, reason };
    }

    if (!response.ok) {
      const text   = await response.text().catch(() => '');
      const reason = `GitLab API error ${response.status}: ${text}`;
      logger.error('[gitlab-mr] GitLab API mengembalikan error', { status: response.status, body: text });
      return { mrUrl: '', mrId: 0, title, success: false, reason };
    }

    const data = await response.json() as { iid: number; web_url: string };
    logger.info('[gitlab-mr] ✓ Merge Request berhasil dibuat', {
      mrId:  data.iid,
      mrUrl: data.web_url,
      title,
    });

    return {
      mrUrl:   data.web_url,
      mrId:    data.iid,
      title,
      success: true,
    };
  }

  /**
   * Buat deskripsi MR dalam format markdown.
   * Berisi tabel old → new locator dan ringkasan healing.
   */
  buildMRDescription(patchResults: PatchResult[], testName: string): string {
    const healed  = patchResults.filter(r => r.success);
    const skipped = patchResults.filter(r => !r.success);

    const lines: string[] = [
      `## 🤖 Auto-Healing: ${testName}`,
      '',
      'Merge Request ini dibuat secara otomatis oleh sistem self-healing.',
      'Locator yang rusak telah diperbaiki menggunakan LLM dan divalidasi di browser.',
      '',
      `**Total dipatch:** ${healed.length} locator`,
      '',
    ];

    if (healed.length > 0) {
      lines.push('### Perubahan Locator', '');
      lines.push('| File | Locator Lama | Locator Baru |');
      lines.push('|---|---|---|');
      for (const r of healed) {
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
