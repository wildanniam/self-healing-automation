import axios, { AxiosError } from 'axios';
import type { GitHubConfig } from '../config';
import type { HealingResult } from '../types';
import { logger } from '../logger';

interface GitHubPrPayload {
  title: string;
  head: string;
  base: string;
  body: string;
}

interface GitHubPrResponse {
  number: number;
  html_url: string;
  title: string;
}

/**
 * Membangun deskripsi Pull Request dalam format Markdown.
 * Berisi tabel locator lama → baru dan ringkasan singkat untuk QA.
 */
function buildPrBody(results: HealingResult[]): string {
  const tableRows = results
    .map(
      r =>
        `| \`${r.testName}\` | \`${r.oldLocator}\` | \`${r.newLocator}\` | ${r.retryCount} |`,
    )
    .join('\n');

  return `## 🤖 Self-Healing Auto-Patch

PR ini dibuat secara otomatis oleh sistem **Self-Healing Test Automation**.
Locator yang rusak terdeteksi saat test berjalan, dan sistem berhasil menemukan penggantinya menggunakan LLM (GPT).

---

### 📊 Ringkasan

- **Total locator di-heal**: ${results.length}
- **Dibuat pada**: ${new Date().toISOString()}

---

### 🔄 Perubahan Locator

| Test Name | Locator Lama | Locator Baru | LLM Retry |
|-----------|-------------|--------------|-----------|
${tableRows}

---

### ✅ Checklist Review untuk QA Engineer

- [ ] Verifikasi locator baru sudah menunjuk ke elemen yang benar
- [ ] Jalankan test secara lokal dengan locator baru
- [ ] Pastikan tidak ada test lain yang terpengaruh

> ⚠️ Locator baru telah **divalidasi di runtime browser** sebelum PR ini dibuat,
> namun review manusia tetap direkomendasikan sebelum merge ke \`main\`.
`;
}

/**
 * GitHubPrService membuat Pull Request di GitHub menggunakan GitHub REST API.
 *
 * Endpoint: POST /repos/{owner}/{repo}/pulls
 * Auth: Bearer token (Personal Access Token dengan scope: Contents + Pull requests)
 */
export class GitHubPrService {
  private readonly baseUrl = 'https://api.github.com';

  constructor(private readonly config: GitHubConfig) {}

  /**
   * Membuat Pull Request dari branch healing ke base branch.
   *
   * @param branchName - Nama branch yang sudah di-push (misal: auto-healing/login-test-1234)
   * @param results    - Daftar HealingResult yang akan dicantumkan di deskripsi PR
   * @returns          - URL Pull Request yang baru dibuat
   */
  async createPullRequest(branchName: string, results: HealingResult[]): Promise<string> {
    const testNames = [...new Set(results.map(r => r.testName))].join(', ');
    const title     = `🤖 Auto-Healing: ${testNames}`;

    const payload: GitHubPrPayload = {
      title,
      head: branchName,
      base: this.config.baseBranch,
      body: buildPrBody(results),
    };

    logger.info('[github-pr] Membuat Pull Request', {
      owner:      this.config.owner,
      repo:       this.config.repo,
      branchName,
      baseBranch: this.config.baseBranch,
    });

    try {
      const response = await axios.post<GitHubPrResponse>(
        `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/pulls`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            Accept:         'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
        },
      );

      const prUrl = response.data.html_url;
      logger.info('[github-pr] Pull Request berhasil dibuat', {
        prNumber: response.data.number,
        prUrl,
        title: response.data.title,
      });

      return prUrl;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status   = axiosErr.response?.status;
      const message  = axiosErr.response?.data
        ? JSON.stringify(axiosErr.response.data)
        : axiosErr.message;

      logger.error('[github-pr] Gagal membuat Pull Request', {
        status,
        message,
        branchName,
      });

      throw new Error(`[github-pr] GitHub API error ${status ?? 'unknown'}: ${message}`);
    }
  }
}
