import { Page } from '@playwright/test';
import type {
  LocatorDescriptor,
  HealingContext,
  WrapperOptions,
  HealCallback,
} from '../types';
import { logger } from '../logger';

/**
 * PlaywrightWrapper membungkus aksi-aksi Playwright standar dengan:
 * - Error interception (TimeoutError / element not found)
 * - DOM snapshot saat terjadi kegagalan
 * - Pemanggilan HealCallback (Phase 3) jika tersedia
 *
 * Cara pakai:
 *   const wrapper = new PlaywrightWrapper(page);
 *   await wrapper.safeClick({ selector: '#btn-login', testName: 'Login Test', filePath: __filename });
 *
 * Untuk mengaktifkan healing, inject HealCallback dari HealingOrchestrator (dikembangkan di Milestone 3):
 *   const wrapper = new PlaywrightWrapper(page, orchestrator.heal.bind(orchestrator));
 */
export class PlaywrightWrapper {
  constructor(
    private readonly page: Page,
    private readonly healCallback?: HealCallback,
  ) {}

  /**
   * Mengambil DOM snapshot (HTML penuh) dari halaman saat ini.
   * Digunakan sebagai bagian dari HealingContext yang dikirim ke LLM di Phase 2.
   */
  private async captureSnapshot(): Promise<string> {
    try {
      return await this.page.content();
    } catch {
      return '';
    }
  }

  /**
   * Menjalankan proses healing jika healCallback tersedia.
   * Mengembalikan selector baru yang sudah divalidasi, atau null jika gagal/tidak dikonfigurasi.
   */
  private async tryHeal(context: HealingContext, enableHealing: boolean): Promise<string | null> {
    if (!enableHealing) {
      return null;
    }

    if (!this.healCallback) {
      logger.warn('[self-healing] HealCallback belum dikonfigurasi — healing dilewati', {
        selector: context.descriptor.selector,
        testName: context.descriptor.testName,
      });
      return null;
    }

    logger.info('[self-healing] Memulai proses healing...', {
      selector: context.descriptor.selector,
      testName: context.descriptor.testName,
      pageUrl: context.pageUrl,
    });

    return this.healCallback(context);
  }

  /**
   * Wrapper untuk page.locator(selector).click()
   */
  async safeClick(descriptor: LocatorDescriptor, options: WrapperOptions = {}): Promise<void> {
    const { timeout = 30000, enableHealing = true } = options;

    try {
      await this.page.locator(descriptor.selector).click({ timeout });
      logger.info('[self-healing] safeClick berhasil', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        step: descriptor.stepName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[self-healing] safeClick gagal — mengambil snapshot DOM', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        error: errorMessage,
      });

      const domSnapshot = await this.captureSnapshot();
      const context: HealingContext = {
        descriptor,
        errorMessage,
        pageUrl: this.page.url(),
        domSnapshot,
      };

      const healedSelector = await this.tryHeal(context, enableHealing ?? true);

      if (healedSelector) {
        logger.info('[self-healing] safeClick: mencoba selector baru hasil healing', {
          oldSelector: descriptor.selector,
          newSelector: healedSelector,
        });
        await this.page.locator(healedSelector).click({ timeout });
      } else {
        throw error;
      }
    }
  }

  /**
   * Wrapper untuk page.locator(selector).fill()
   */
  async safeFill(
    descriptor: LocatorDescriptor,
    value: string,
    options: WrapperOptions = {},
  ): Promise<void> {
    const { timeout = 30000, enableHealing = true } = options;

    try {
      await this.page.locator(descriptor.selector).fill(value, { timeout });
      logger.info('[self-healing] safeFill berhasil', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        step: descriptor.stepName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[self-healing] safeFill gagal — mengambil snapshot DOM', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        error: errorMessage,
      });

      const domSnapshot = await this.captureSnapshot();
      const context: HealingContext = {
        descriptor,
        errorMessage,
        pageUrl: this.page.url(),
        domSnapshot,
      };

      const healedSelector = await this.tryHeal(context, enableHealing ?? true);

      if (healedSelector) {
        logger.info('[self-healing] safeFill: mencoba selector baru hasil healing', {
          oldSelector: descriptor.selector,
          newSelector: healedSelector,
        });
        await this.page.locator(healedSelector).fill(value, { timeout });
      } else {
        throw error;
      }
    }
  }

  /**
   * Wrapper untuk page.locator(selector).selectOption()
   */
  async safeSelectOption(
    descriptor: LocatorDescriptor,
    value: string,
    options: WrapperOptions = {},
  ): Promise<void> {
    const { timeout = 30000, enableHealing = true } = options;

    try {
      await this.page.locator(descriptor.selector).selectOption(value, { timeout });
      logger.info('[self-healing] safeSelectOption berhasil', {
        selector: descriptor.selector,
        testName: descriptor.testName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[self-healing] safeSelectOption gagal — mengambil snapshot DOM', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        error: errorMessage,
      });

      const domSnapshot = await this.captureSnapshot();
      const context: HealingContext = {
        descriptor,
        errorMessage,
        pageUrl: this.page.url(),
        domSnapshot,
      };

      const healedSelector = await this.tryHeal(context, enableHealing ?? true);

      if (healedSelector) {
        await this.page.locator(healedSelector).selectOption(value, { timeout });
      } else {
        throw error;
      }
    }
  }

  /**
   * Wrapper untuk page.locator(selector).textContent()
   */
  async safeGetText(
    descriptor: LocatorDescriptor,
    options: WrapperOptions = {},
  ): Promise<string | null> {
    const { timeout = 30000, enableHealing = true } = options;

    try {
      const text = await this.page.locator(descriptor.selector).textContent({ timeout });
      logger.info('[self-healing] safeGetText berhasil', {
        selector: descriptor.selector,
        testName: descriptor.testName,
      });
      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[self-healing] safeGetText gagal — mengambil snapshot DOM', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        error: errorMessage,
      });

      const domSnapshot = await this.captureSnapshot();
      const context: HealingContext = {
        descriptor,
        errorMessage,
        pageUrl: this.page.url(),
        domSnapshot,
      };

      const healedSelector = await this.tryHeal(context, enableHealing ?? true);

      if (healedSelector) {
        return this.page.locator(healedSelector).textContent({ timeout });
      }

      throw error;
    }
  }

  /**
   * Wrapper untuk page.locator(selector).waitFor({ state: 'visible' })
   */
  async safeWaitForVisible(
    descriptor: LocatorDescriptor,
    options: WrapperOptions = {},
  ): Promise<void> {
    const { timeout = 30000, enableHealing = true } = options;

    try {
      await this.page.locator(descriptor.selector).waitFor({ state: 'visible', timeout });
      logger.info('[self-healing] safeWaitForVisible berhasil', {
        selector: descriptor.selector,
        testName: descriptor.testName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[self-healing] safeWaitForVisible gagal — mengambil snapshot DOM', {
        selector: descriptor.selector,
        testName: descriptor.testName,
        error: errorMessage,
      });

      const domSnapshot = await this.captureSnapshot();
      const context: HealingContext = {
        descriptor,
        errorMessage,
        pageUrl: this.page.url(),
        domSnapshot,
      };

      const healedSelector = await this.tryHeal(context, enableHealing ?? true);

      if (healedSelector) {
        await this.page.locator(healedSelector).waitFor({ state: 'visible', timeout });
      } else {
        throw error;
      }
    }
  }

  /**
   * Wrapper untuk page.locator(selector).isVisible()
   * Tidak melempar error — mengembalikan false jika elemen tidak ditemukan.
   */
  async safeIsVisible(descriptor: LocatorDescriptor): Promise<boolean> {
    try {
      const visible = await this.page.locator(descriptor.selector).isVisible();
      logger.info('[self-healing] safeIsVisible berhasil', {
        selector: descriptor.selector,
        visible,
      });
      return visible;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('[self-healing] safeIsVisible error — mengembalikan false', {
        selector: descriptor.selector,
        error: errorMessage,
      });
      return false;
    }
  }
}
