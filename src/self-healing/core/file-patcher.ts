import { promises as fsp } from 'fs';
import type { HealingResult } from '../types';
import type { HealingReport } from './results-store';
import { logger } from '../logger';

/**
 * Hasil patching untuk satu locator di satu file.
 */
export interface PatchResult {
  filePath: string;
  oldLocator: string;
  newLocator: string;
  /** Jumlah kemunculan selector lama yang ditemukan di file */
  occurrencesFound: number;
  /** Jumlah kemunculan yang berhasil diganti */
  occurrencesReplaced: number;
  success: boolean;
  /** Alasan jika gagal */
  reason?: string;
}

/**
 * FilePatcher membaca hasil healing dari ResultsStore dan menerapkan perubahan
 * locator langsung ke file .spec.ts yang bersangkutan.
 *
 * Alur kerja:
 *   1. Baca healing-results/results.json (output Phase 3)
 *   2. Filter hanya yang status 'healed'
 *   3. Untuk setiap hasil: cari selector lama di file test, ganti dengan selector baru
 *   4. Tulis kembali file yang dimodifikasi
 *
 * Strategi replacement (aman dari false replacement):
 *   - Pattern: selector harus muncul sebagai quoted string ('...' atau "...")
 *   - Tidak melakukan global string replace — hanya mencocokkan literal selector
 *   - Jika selector tidak ditemukan di file, skip dan log warning
 *
 * Cara pakai:
 *   const patcher = new FilePatcher();
 *   const results = await patcher.patchFromReport('./healing-results/results.json');
 *   patcher.printSummary(results);
 */
export class FilePatcher {
  /**
   * Baca healing report dari file JSON dan patch semua hasil 'healed'.
   *
   * @param reportPath - Path ke file healing report JSON
   * @returns          - Array PatchResult untuk setiap locator yang diproses
   */
  async patchFromReport(reportPath: string): Promise<PatchResult[]> {
    let report: HealingReport;

    try {
      const raw = await fsp.readFile(reportPath, 'utf-8');
      report = JSON.parse(raw) as HealingReport;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[file-patcher] Gagal membaca healing report', { reportPath, error: msg });
      throw new Error(`FilePatcher: tidak bisa membaca report dari '${reportPath}': ${msg}`);
    }

    const healedResults = report.results.filter(
      (r): r is HealingResult & { newLocator: string } =>
        r.status === 'healed' && Boolean(r.newLocator),
    );

    if (healedResults.length === 0) {
      logger.info('[file-patcher] Tidak ada locator healed yang perlu dipatch', { reportPath });
      return [];
    }

    logger.info(`[file-patcher] Memproses ${healedResults.length} locator healed`, { reportPath });

    const patchResults: PatchResult[] = [];
    for (const result of healedResults) {
      const patchResult = await this.patchFile(result);
      patchResults.push(patchResult);
    }

    return patchResults;
  }

  /**
   * Patch satu file .spec.ts berdasarkan satu HealingResult.
   *
   * Replacement hanya dilakukan jika selector lama ditemukan sebagai quoted string,
   * misalnya: '#username' atau "#username" — bukan bagian dari string lain.
   *
   * @param result - HealingResult dengan status 'healed'
   * @returns      - PatchResult dengan detail hasil patching
   */
  async patchFile(result: HealingResult): Promise<PatchResult> {
    const { filePath, oldLocator, newLocator, testName } = result;

    const patchResult: PatchResult = {
      filePath,
      oldLocator,
      newLocator,
      occurrencesFound: 0,
      occurrencesReplaced: 0,
      success: false,
    };

    // Baca file test
    let content: string;
    try {
      content = await fsp.readFile(filePath, 'utf-8');
    } catch (err) {
      patchResult.reason = `Gagal membaca file: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[file-patcher] Gagal membaca file test', { filePath, error: patchResult.reason });
      return patchResult;
    }

    // Pattern: selector lama sebagai quoted string (single atau double quote)
    // Contoh cocok: '#username'  atau  "#username"
    // Tidak cocok: bagian dari string lain, komentar, atau kode lain
    const escapedOld = escapeRegex(oldLocator);
    const pattern = new RegExp(`(['"])${escapedOld}\\1`, 'g');

    const matches = content.match(pattern);
    patchResult.occurrencesFound = matches ? matches.length : 0;

    if (patchResult.occurrencesFound === 0) {
      patchResult.reason = `Selector '${oldLocator}' tidak ditemukan sebagai quoted string di file`;
      logger.warn('[file-patcher] Selector tidak ditemukan di file', {
        filePath,
        oldLocator,
        testName,
      });
      return patchResult;
    }

    // Ganti semua kemunculan — pertahankan jenis quote aslinya (single/double)
    const newContent = content.replace(pattern, (_match, quote) => `${quote}${newLocator}${quote}`);

    // Hitung berapa yang benar-benar diganti (verifikasi)
    const remaining = (newContent.match(pattern) ?? []).length;
    patchResult.occurrencesReplaced = patchResult.occurrencesFound - remaining;

    // Tulis kembali ke file
    try {
      await fsp.writeFile(filePath, newContent, 'utf-8');
      patchResult.success = true;
      logger.info('[file-patcher] ✓ File berhasil dipatch', {
        filePath,
        oldLocator,
        newLocator,
        occurrencesFound:    patchResult.occurrencesFound,
        occurrencesReplaced: patchResult.occurrencesReplaced,
        testName,
      });
    } catch (err) {
      patchResult.reason = `Gagal menulis file: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[file-patcher] Gagal menulis file test', { filePath, error: patchResult.reason });
    }

    return patchResult;
  }

  /**
   * Cetak ringkasan hasil patching ke console.
   */
  printSummary(results: PatchResult[]): void {
    const success = results.filter(r => r.success).length;
    const failed  = results.filter(r => !r.success).length;

    logger.info('[file-patcher] ===== PATCH SUMMARY =====', {
      total:   results.length,
      success,
      failed,
    });

    for (const r of results) {
      if (r.success) {
        logger.info(`[file-patcher]   ✓ ${r.oldLocator} → ${r.newLocator}`, {
          file:    r.filePath,
          patched: r.occurrencesReplaced,
        });
      } else {
        logger.warn(`[file-patcher]   ✗ ${r.oldLocator} (gagal)`, {
          file:   r.filePath,
          reason: r.reason,
        });
      }
    }
  }
}

/**
 * Escape karakter spesial regex agar selector bisa dipakai sebagai literal pattern.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
