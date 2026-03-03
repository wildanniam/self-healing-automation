import { Page } from '@playwright/test';
import { logger } from '../logger';

export interface ValidationResult {
  /** True jika locator menemukan minimal 1 elemen di halaman */
  isValid: boolean;
  /** Selector yang divalidasi */
  selector: string;
  /** Jumlah elemen yang ditemukan */
  elementCount: number;
}

/**
 * LocatorValidator memverifikasi bahwa sebuah locator kandidat
 * benar-benar menemukan elemen di halaman yang sedang dibuka.
 *
 * Dijalankan di runtime browser (via Playwright Page) sebelum
 * locator baru diterima sebagai hasil healing yang valid.
 */
export class LocatorValidator {
  constructor(private readonly page: Page) {}

  /**
   * Validasi selector: cek apakah minimal 1 elemen ditemukan di DOM saat ini.
   *
   * @param selector - CSS selector atau XPath yang akan diuji
   * @returns ValidationResult berisi isValid, selector, dan jumlah elemen
   */
  async validate(selector: string): Promise<ValidationResult> {
    try {
      const elementCount = await this.page.locator(selector).count();
      const isValid = elementCount > 0;

      if (isValid) {
        logger.info('[locator-validator] Selector valid — elemen ditemukan', {
          selector,
          elementCount,
        });
      } else {
        logger.warn('[locator-validator] Selector tidak valid — tidak ada elemen', {
          selector,
          elementCount,
        });
      }

      return { isValid, selector, elementCount };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('[locator-validator] Error saat evaluasi selector', {
        selector,
        error: errorMessage,
      });
      return { isValid: false, selector, elementCount: 0 };
    }
  }
}
