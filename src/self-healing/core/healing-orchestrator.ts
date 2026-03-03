import { Page } from '@playwright/test';
import type { HealingContext, HealingResult } from '../types';
import type { SelfHealingConfig } from '../config';
import { loadConfig } from '../config';
import { LlmClient } from '../openai/llm-client';
import { PlaywrightWrapper } from '../playwright/wrapper';
import { LocatorValidator } from './locator-validator';
import { ResultsStore } from './results-store';
import { logger } from '../logger';

/**
 * HealingOrchestrator adalah otak utama sistem self-healing.
 *
 * Tugasnya menyambungkan semua komponen:
 *   PlaywrightWrapper (M1) → LlmClient (M2) → LocatorValidator (M3) → ResultsStore (M3)
 *
 * Alur per kegagalan:
 *   1. Wrapper mendeteksi error locator → memanggil orchestrator.heal(context)
 *   2. Orchestrator loop (maks maxRetries kali):
 *      a. Minta LLM untuk kandidat locator baru
 *      b. Validasi kandidat di runtime browser
 *      c. Jika valid  → catat sebagai 'healed', kembalikan selector
 *      d. Jika tidak  → lanjut ke iterasi berikutnya
 *   3. Jika semua retry habis → catat sebagai 'failed', kembalikan null
 *
 * Cara pakai (di test):
 *   const { wrapper, orchestrator } = createHealingWrapper(page);
 *   await wrapper.safeClick({ selector: '#btn', testName: 'Login', filePath: __filename });
 *   // Di afterAll:
 *   await orchestrator.getStore().saveToFile();
 */
export class HealingOrchestrator {
  private readonly llmClient: LlmClient;
  private readonly validator: LocatorValidator;
  private readonly store: ResultsStore;

  constructor(
    page: Page,
    private readonly config: SelfHealingConfig,
    store?: ResultsStore,
  ) {
    this.llmClient = new LlmClient(config);
    this.validator = new LocatorValidator(page);
    this.store     = store ?? new ResultsStore();
  }

  /**
   * Method healing utama — signature-nya cocok dengan HealCallback.
   * Di-inject ke PlaywrightWrapper via createHealingWrapper().
   *
   * @param context - HealingContext dari wrapper (locator gagal + DOM snapshot)
   * @returns       - Selector baru yang valid, atau null jika semua retry gagal
   */
  async heal(context: HealingContext): Promise<string | null> {
    const { descriptor } = context;
    const maxRetries = this.config.healing.maxRetries;

    logger.info('[orchestrator] Healing dimulai', {
      selector:   descriptor.selector,
      testName:   descriptor.testName,
      maxRetries,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`[orchestrator] Percobaan ${attempt}/${maxRetries}`, {
        selector: descriptor.selector,
      });

      // Step 1: Minta LLM menghasilkan kandidat locator baru
      const candidateSelector = await this.llmClient.getHealedLocator(context);

      if (!candidateSelector) {
        logger.warn(`[orchestrator] LLM tidak menghasilkan kandidat (percobaan ${attempt}/${maxRetries})`, {
          selector: descriptor.selector,
        });
        continue;
      }

      // Step 2: Validasi kandidat langsung di browser (runtime)
      const validation = await this.validator.validate(candidateSelector);

      if (validation.isValid) {
        logger.info('[orchestrator] ✓ Healing berhasil!', {
          oldLocator:   descriptor.selector,
          newLocator:   candidateSelector,
          attempt,
          elementCount: validation.elementCount,
        });

        const result: HealingResult = {
          testName:   descriptor.testName,
          filePath:   descriptor.filePath,
          oldLocator: descriptor.selector,
          newLocator: candidateSelector,
          timestamp:  new Date().toISOString(),
          status:     'healed',
          retryCount: attempt,
        };
        this.store.add(result);
        return candidateSelector;
      }

      logger.warn(`[orchestrator] Kandidat tidak valid (percobaan ${attempt}/${maxRetries})`, {
        candidateSelector,
        elementCount: validation.elementCount,
      });
    }

    // Semua percobaan habis tanpa hasil
    logger.error('[orchestrator] ✗ Healing gagal — semua percobaan habis', {
      selector:  descriptor.selector,
      testName:  descriptor.testName,
      maxRetries,
    });

    const failedResult: HealingResult = {
      testName:   descriptor.testName,
      filePath:   descriptor.filePath,
      oldLocator: descriptor.selector,
      newLocator: '',
      timestamp:  new Date().toISOString(),
      status:     'failed',
      retryCount: maxRetries,
    };
    this.store.add(failedResult);

    return null;
  }

  /**
   * Akses ke ResultsStore untuk menyimpan laporan setelah test run.
   */
  getStore(): ResultsStore {
    return this.store;
  }
}

/**
 * Factory function untuk membuat PlaywrightWrapper yang sudah terhubung
 * dengan HealingOrchestrator secara lengkap.
 *
 * Ini adalah cara termudah menggunakan sistem self-healing di test:
 *
 * @example
 * ```typescript
 * test.beforeEach(async ({ page }) => {
 *   const { wrapper, orchestrator } = createHealingWrapper(page);
 *   // gunakan wrapper untuk aksi, orchestrator untuk laporan
 * });
 * ```
 *
 * @param page   - Playwright Page object dari test fixture
 * @param config - Opsional: konfigurasi kustom. Jika tidak diisi, loadConfig() dari env
 * @returns      - Object berisi wrapper (untuk aksi test) dan orchestrator (untuk laporan)
 */
export function createHealingWrapper(
  page: Page,
  config?: SelfHealingConfig,
): { wrapper: PlaywrightWrapper; orchestrator: HealingOrchestrator } {
  const cfg          = config ?? loadConfig();
  const orchestrator = new HealingOrchestrator(page, cfg);
  const wrapper      = new PlaywrightWrapper(page, orchestrator.heal.bind(orchestrator));

  return { wrapper, orchestrator };
}
