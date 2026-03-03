import { promises as fsp } from 'fs';
import * as path from 'path';
import type { HealingContext, HealingResult } from '../types';
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
   * Menyimpan raw HTML DOM snapshot ke file saat locator gagal.
   * File disimpan di baseDir/snapshots/ dan dapat dibuka langsung di browser.
   *
   * Nama file: {testName}-{selector-slug}-{timestamp}.html
   *
   * @param context - HealingContext yang berisi domSnapshot
   * @param baseDir - Folder root output (default: ./healing-results)
   * @returns       - Path absolut file snapshot yang disimpan
   */
  async saveDomSnapshot(
    context: HealingContext,
    baseDir = './healing-results',
  ): Promise<string> {
    const snapshotsDir = path.join(baseDir, 'snapshots');
    await fsp.mkdir(snapshotsDir, { recursive: true });

    const safeTestName = context.descriptor.testName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const safeSelector = context.descriptor.selector.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const timestamp    = new Date().toISOString().replace(/[:.]/g, '-');
    const filename     = `${safeTestName}__${safeSelector}__${timestamp}.html`;
    const filePath     = path.join(snapshotsDir, filename);

    // Sisipkan banner debug di atas HTML supaya mudah diidentifikasi saat dibuka di browser
    const banner = `<!--
  ╔══════════════════════════════════════════════════════════╗
  ║  SELF-HEALING DOM SNAPSHOT — untuk debugging             ║
  ╠══════════════════════════════════════════════════════════╣
  ║  Test     : ${context.descriptor.testName.padEnd(44)}║
  ║  Locator  : ${context.descriptor.selector.padEnd(44)}║
  ║  URL      : ${context.pageUrl.padEnd(44)}║
  ║  Waktu    : ${new Date().toISOString().padEnd(44)}║
  ╚══════════════════════════════════════════════════════════╝
-->
`;

    await fsp.writeFile(filePath, banner + context.domSnapshot, 'utf-8');

    logger.info('[results-store] DOM snapshot disimpan', {
      path:        filePath,
      selector:    context.descriptor.selector,
      domLength:   context.domSnapshot.length,
    });

    return filePath;
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
