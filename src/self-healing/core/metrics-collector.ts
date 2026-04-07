import { promises as fsp } from 'fs';
import * as path from 'path';
import type { ResultsStore } from './results-store';
import { logger } from '../logger';

export interface HealingMetrics {
  generatedAt: string;
  totalLocators: number;
  healed: number;
  failed: number;
  skipped: number;
  successRate: string;
  /** Rata-rata durasi healing dalam ms (hanya dari yang berstatus 'healed') */
  avgHealingTimeMs: number;
  /** Durasi healing tercepat dalam ms */
  fastestHealMs: number;
  /** Durasi healing terlama dalam ms */
  slowestHealMs: number;
  /** Rata-rata jumlah retry ke LLM */
  avgRetryCount: number;
  /** Detail per locator — berguna untuk analisis TA */
  details: HealingMetricDetail[];
}

export interface HealingMetricDetail {
  testName: string;
  oldLocator: string;
  newLocator: string;
  status: 'healed' | 'failed' | 'skipped';
  durationMs: number;
  retryCount: number;
}

/**
 * MetricsCollector mengumpulkan data kuantitatif dari ResultsStore
 * dan menyimpannya ke file metrics.json untuk keperluan analisis dan laporan TA.
 *
 * Cara pakai (di afterAll test):
 *   const collector = new MetricsCollector();
 *   const metrics   = collector.collect(orchestrator.getStore());
 *   await collector.saveToFile(metrics);
 *   collector.printSummary(metrics);
 */
export class MetricsCollector {
  /**
   * Hitung metrics dari ResultsStore.
   * Dapat dipanggil kapan saja setelah test run selesai.
   */
  collect(store: ResultsStore): HealingMetrics {
    const summary = store.getSummary();
    const results = store.getAll();

    const details: HealingMetricDetail[] = results.map(r => ({
      testName:   r.testName,
      oldLocator: r.oldLocator,
      newLocator: r.newLocator || '',
      status:     r.status,
      durationMs: r.healingDurationMs ?? 0,
      retryCount: r.retryCount,
    }));

    return {
      generatedAt:      new Date().toISOString(),
      totalLocators:    summary.total,
      healed:           summary.healed,
      failed:           summary.failed,
      skipped:          summary.skipped,
      successRate:      summary.successRate,
      avgHealingTimeMs: summary.avgHealingTimeMs,
      fastestHealMs:    summary.fastestHealMs,
      slowestHealMs:    summary.slowestHealMs,
      avgRetryCount:    summary.avgRetryCount,
      details,
    };
  }

  /**
   * Simpan metrics ke file JSON.
   * Folder dibuat otomatis jika belum ada.
   *
   * @param metrics    - Hasil dari collect()
   * @param outputPath - Path output (default: ./healing-results/metrics.json)
   */
  async saveToFile(
    metrics: HealingMetrics,
    outputPath = './healing-results/metrics.json',
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(outputPath, JSON.stringify(metrics, null, 2), 'utf-8');

    logger.info('[metrics-collector] Metrics disimpan ke file', {
      path:        outputPath,
      total:       metrics.totalLocators,
      successRate: metrics.successRate,
      avgTimeMs:   metrics.avgHealingTimeMs,
    });
  }

  /**
   * Cetak ringkasan metrics ke console — format yang mudah dibaca di CI/CD log.
   */
  printSummary(metrics: HealingMetrics): void {
    logger.info('[metrics-collector] ===== HEALING METRICS =====', {
      total:            metrics.totalLocators,
      healed:           metrics.healed,
      failed:           metrics.failed,
      skipped:          metrics.skipped,
      successRate:      metrics.successRate,
      avgHealingTimeMs: metrics.avgHealingTimeMs,
      fastestHealMs:    metrics.fastestHealMs,
      slowestHealMs:    metrics.slowestHealMs,
      avgRetryCount:    metrics.avgRetryCount,
    });
  }
}
