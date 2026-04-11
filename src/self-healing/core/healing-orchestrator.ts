import { Page } from '@playwright/test';
import type { HealingContext, HealingResult } from '../types';
import type { SelfHealingConfig } from '../config';
import { loadConfig } from '../config';
import { LlmClient } from '../openai/llm-client';
import { formatCost } from '../openai/pricing';
import { extractCandidates } from '../openai/dom-context-extractor';
import { rankCandidates } from '../openai/candidate-ranker';
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
  private readonly page: Page;
  private readonly llmClient: LlmClient;
  private readonly validator: LocatorValidator;
  private readonly store: ResultsStore;

  constructor(
    page: Page,
    private readonly config: SelfHealingConfig,
    store?: ResultsStore,
  ) {
    this.page      = page;
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
    const startTime      = Date.now();
    const { descriptor } = context;
    const maxRetries = this.config.healing.maxRetries;

    logger.info('[orchestrator] Healing dimulai', {
      selector:   descriptor.selector,
      testName:   descriptor.testName,
      maxRetries,
    });

    // Simpan DOM snapshot ke file agar bisa diinspeksi (debugging & dokumentasi TA)
    let domSnapshotFile: string | undefined;
    try {
      domSnapshotFile = await this.store.saveDomSnapshot(context);
    } catch (err) {
      logger.warn('[orchestrator] Gagal menyimpan DOM snapshot', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Ekstrak kandidat elemen dari live DOM via page.evaluate()
    let rankedCandidates: ReturnType<typeof rankCandidates> = [];
    try {
      const rawCandidates = await extractCandidates(this.page, {
        actionType: context.actionType,
      });

      rankedCandidates = rankCandidates(rawCandidates, {
        oldSelector: descriptor.selector,
        stepName: descriptor.stepName,
        actionType: context.actionType,
      });

      logger.info('[orchestrator] Kandidat elemen diekstrak', {
        rawCount: rawCandidates.length,
        rankedCount: rankedCandidates.length,
        topScore: rankedCandidates[0]?.score ?? 0,
      });
    } catch (err) {
      logger.warn('[orchestrator] Gagal extract kandidat — fallback ke cleaned DOM', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Ambil kandidat teratas untuk dikirim ke LLM
    const candidatesForLlm = rankedCandidates.map(rc => rc.candidate);

    // Akumulasi token & biaya dari semua retry pada healing call ini
    let totalTokens   = 0;
    let totalCostUsd  = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`[orchestrator] Percobaan ${attempt}/${maxRetries}`, {
        selector: descriptor.selector,
        candidateCount: candidatesForLlm.length,
      });

      // Step 1: Minta LLM menghasilkan kandidat locator baru (dengan candidates jika ada)
      const llmResult = await this.llmClient.getHealedLocator(
        context,
        candidatesForLlm.length > 0 ? candidatesForLlm : undefined,
      );
      const candidateSelector = llmResult.locator;
      if (llmResult.usage) {
        totalTokens  += llmResult.usage.totalTokens;
        totalCostUsd += llmResult.usage.costUsd;
      }

      if (!candidateSelector) {
        logger.warn(`[orchestrator] LLM tidak menghasilkan kandidat (percobaan ${attempt}/${maxRetries})`, {
          selector: descriptor.selector,
        });
        continue;
      }

      // Step 2: Validasi kandidat langsung di browser (runtime)
      // Validator sekarang cek: count===1, visible, tag/role sesuai actionType
      const validation = await this.validator.validate(candidateSelector, context.actionType);

      if (validation.isValid) {
        logger.info('[orchestrator] Locator healed', {
          oldLocator:   descriptor.selector,
          newLocator:   candidateSelector,
          testName:     descriptor.testName,
          durationMs:   Date.now() - startTime,
          attempt,
          maxRetries,
          elementCount: validation.elementCount,
          tokens:       totalTokens,
          cost:         formatCost(totalCostUsd),
        });

        const result: HealingResult = {
          testName:          descriptor.testName,
          filePath:          descriptor.filePath,
          oldLocator:        descriptor.selector,
          newLocator:        candidateSelector,
          timestamp:         new Date().toISOString(),
          status:            'healed',
          retryCount:        attempt,
          domSnapshotFile,
          healingDurationMs: Date.now() - startTime,
          totalTokens,
          costUsd:           totalCostUsd,
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
    logger.error('[orchestrator] Healing failed — Max retries exhausted', {
      oldLocator: descriptor.selector,
      testName:   descriptor.testName,
      maxRetries,
      tokens:     totalTokens,
      cost:       formatCost(totalCostUsd),
    });

    const failedResult: HealingResult = {
      testName:          descriptor.testName,
      filePath:          descriptor.filePath,
      oldLocator:        descriptor.selector,
      newLocator:        '',
      timestamp:         new Date().toISOString(),
      status:            'failed',
      retryCount:        maxRetries,
      domSnapshotFile,
      healingDurationMs: Date.now() - startTime,
      totalTokens,
      costUsd:           totalCostUsd,
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

  // Callback: saat action dengan healed selector gagal, update status ke 'action_failed'
  const onActionFailed = (descriptor: { selector: string; testName: string; filePath: string }, healedSelector: string, error: string): void => {
    const store = orchestrator.getStore();
    const updated = store.updateLastStatus(
      {
        oldLocator: descriptor.selector,
        newLocator: healedSelector,
        testName: descriptor.testName,
        filePath: descriptor.filePath,
      },
      'healed',
      'action_failed',
    );
    if (updated) {
      logger.warn('[orchestrator] Status diubah ke action_failed', {
        oldLocator: descriptor.selector,
        healedLocator: healedSelector,
        error,
      });
    }
  };

  const wrapper = new PlaywrightWrapper(page, orchestrator.heal.bind(orchestrator), onActionFailed);

  return { wrapper, orchestrator };
}
