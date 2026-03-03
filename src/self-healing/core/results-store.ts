import { promises as fsp } from 'fs';
import * as path from 'path';
import type { HealingResult } from '../types';
import { logger } from '../logger';

export interface HealingSummary {
  total: number;
  healed: number;
  failed: number;
  skipped: number;
  successRate: string;
}

export interface HealingReport {
  generatedAt: string;
  summary: HealingSummary;
  results: HealingResult[];
}

/**
 * ResultsStore menyimpan semua HealingResult selama test run berlangsung.
 *
 * Tugasnya:
 * - Akumulasi hasil healing di memory (in-process)
 * - Menyediakan summary metrics (success rate, total, dsb.)
 * - Menyimpan laporan akhir ke file JSON setelah test run selesai
 *   (dipakai oleh Phase 4 untuk auto-patching dan CI/CD artifact)
 */
export class ResultsStore {
  private readonly results: HealingResult[] = [];

  /**
   * Mencatat satu HealingResult ke store.
   */
  add(result: HealingResult): void {
    this.results.push(result);
    logger.info('[results-store] Healing result dicatat', {
      testName: result.testName,
      status:   result.status,
      oldLocator: result.oldLocator,
      newLocator: result.newLocator || '(tidak ada)',
      retryCount: result.retryCount,
    });
  }

  /**
   * Mengembalikan salinan semua hasil yang tersimpan.
   */
  getAll(): HealingResult[] {
    return [...this.results];
  }

  /**
   * Mengembalikan ringkasan statistik dari semua hasil healing.
   */
  getSummary(): HealingSummary {
    const healed  = this.results.filter(r => r.status === 'healed').length;
    const failed  = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const total   = this.results.length;
    const successRate = total > 0 ? `${((healed / total) * 100).toFixed(1)}%` : 'N/A';

    return { total, healed, failed, skipped, successRate };
  }

  /**
   * Menyimpan laporan lengkap healing ke file JSON.
   * Folder dibuat otomatis jika belum ada.
   *
   * @param outputPath - Path file output (default: ./healing-results/results.json)
   */
  async saveToFile(outputPath = './healing-results/results.json'): Promise<void> {
    const dir = path.dirname(outputPath);
    await fsp.mkdir(dir, { recursive: true });

    const report: HealingReport = {
      generatedAt: new Date().toISOString(),
      summary:     this.getSummary(),
      results:     this.results,
    };

    await fsp.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

    const summary = this.getSummary();
    logger.info('[results-store] Laporan healing disimpan ke file', {
      path:        outputPath,
      total:       summary.total,
      healed:      summary.healed,
      failed:      summary.failed,
      successRate: summary.successRate,
    });
  }

  /**
   * Mencetak ringkasan healing ke console (berguna untuk output CI/CD).
   */
  printSummary(): void {
    const s = this.getSummary();
    logger.info('[results-store] ===== SELF-HEALING SUMMARY =====', {
      total:       s.total,
      healed:      s.healed,
      failed:      s.failed,
      skipped:     s.skipped,
      successRate: s.successRate,
    });
  }
}
