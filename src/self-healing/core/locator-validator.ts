import { Page } from '@playwright/test';
import type { ActionType } from '../types';
import { logger } from '../logger';

export interface ValidationResult {
  /** True jika locator valid: tepat 1 elemen, visible, enabled, sesuai actionType */
  isValid: boolean;
  /** Selector yang divalidasi */
  selector: string;
  /** Jumlah elemen yang ditemukan */
  elementCount: number;
  /** Alasan reject (jika tidak valid) */
  rejectReason?: string;
}

/**
 * Tag yang dianggap valid per action type.
 * Playwright .fill() hanya jalan di input, textarea, atau contenteditable.
 * Playwright .selectOption() hanya jalan di native <select>.
 */
const VALID_TAGS_FOR_ACTION: Record<ActionType, string[]> = {
  fill:           ['input', 'textarea'],  // contenteditable dicek terpisah
  click:          [],                      // semua tag bisa di-click
  select:         ['select'],              // hanya native <select>
  getText:        [],                      // semua tag punya text
  waitForVisible: [],                      // semua tag
  isVisible:      [],                      // semua tag
};

/**
 * Role yang dianggap valid per action type.
 * fill dan select tidak pakai role — hanya tag dan contenteditable.
 */
const VALID_ROLES_FOR_ACTION: Record<ActionType, string[]> = {
  fill:           [],  // role tidak relevan, yang penting tag atau contenteditable
  click:          ['button', 'link', 'menuitem', 'tab', 'option', 'checkbox', 'radio', 'switch', 'combobox'],
  select:         [],  // hanya native <select>, role tidak relevan
  getText:        [],
  waitForVisible: [],
  isVisible:      [],
};

/**
 * Action types yang butuh cek isEnabled — elemen disabled tidak valid.
 */
const ACTIONS_REQUIRING_ENABLED: ActionType[] = ['click', 'fill', 'select'];

/**
 * LocatorValidator memverifikasi bahwa sebuah locator kandidat
 * benar-benar menemukan elemen yang tepat di halaman.
 *
 * Kriteria valid:
 * 1. Tepat 1 elemen ditemukan (unik)
 * 2. Elemen visible
 * 3. Elemen enabled (untuk click, fill, select)
 * 4. Tag/role elemen sesuai dengan actionType
 */
export class LocatorValidator {
  constructor(private readonly page: Page) {}

  /**
   * Validasi selector secara ketat.
   *
   * @param selector   - CSS selector atau XPath yang akan diuji
   * @param actionType - Jenis aksi yang gagal (opsional, untuk backward compatibility)
   * @returns ValidationResult
   */
  async validate(selector: string, actionType?: ActionType): Promise<ValidationResult> {
    try {
      const locator = this.page.locator(selector);
      const elementCount = await locator.count();

      // Cek 1: harus tepat 1 elemen
      if (elementCount === 0) {
        logger.warn('[locator-validator] Selector tidak valid — tidak ada elemen', {
          selector,
          elementCount,
        });
        return { isValid: false, selector, elementCount, rejectReason: 'no_match' };
      }

      if (elementCount > 1) {
        logger.warn('[locator-validator] Selector tidak valid — match lebih dari 1 elemen', {
          selector,
          elementCount,
        });
        return { isValid: false, selector, elementCount, rejectReason: 'ambiguous' };
      }

      // Cek 2: elemen harus visible
      const isVisible = await locator.isVisible();
      if (!isVisible) {
        logger.warn('[locator-validator] Selector tidak valid — elemen tidak visible', {
          selector,
        });
        return { isValid: false, selector, elementCount, rejectReason: 'not_visible' };
      }

      // Cek 3: elemen harus enabled (untuk click, fill, select)
      if (actionType && ACTIONS_REQUIRING_ENABLED.includes(actionType)) {
        const isEnabled = await locator.isEnabled();
        if (!isEnabled) {
          logger.warn('[locator-validator] Selector tidak valid — elemen disabled', {
            selector,
            actionType,
          });
          return { isValid: false, selector, elementCount, rejectReason: 'not_enabled' };
        }
      }

      // Cek 4: tag/role/contenteditable sesuai actionType
      if (actionType) {
        const validTags = VALID_TAGS_FOR_ACTION[actionType];
        const validRoles = VALID_ROLES_FOR_ACTION[actionType];

        // Hanya cek kalau actionType punya constraint
        if (validTags.length > 0 || validRoles.length > 0) {
          const elementInfo = await locator.evaluate((el) => ({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            contentEditable: el.getAttribute('contenteditable'),
          }));

          const tagMatch = validTags.length === 0 || validTags.includes(elementInfo.tag);
          const roleMatch = validRoles.length > 0 &&
            elementInfo.role !== null && validRoles.includes(elementInfo.role);

          // fill juga valid untuk contenteditable="true"
          const contentEditableMatch = actionType === 'fill' &&
            elementInfo.contentEditable === 'true';

          if (!tagMatch && !roleMatch && !contentEditableMatch) {
            logger.warn('[locator-validator] Selector tidak valid — tag/role tidak sesuai actionType', {
              selector,
              actionType,
              tag: elementInfo.tag,
              role: elementInfo.role,
              contentEditable: elementInfo.contentEditable,
            });
            return {
              isValid: false,
              selector,
              elementCount,
              rejectReason: `action_mismatch: ${actionType} expects ${validTags.join('/')}${contentEditableMatch ? '/contenteditable' : ''}, got ${elementInfo.tag}${elementInfo.role ? `[role=${elementInfo.role}]` : ''}`,
            };
          }
        }
      }

      logger.info('[locator-validator] Selector valid', {
        selector,
        elementCount,
      });
      return { isValid: true, selector, elementCount };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('[locator-validator] Error saat evaluasi selector', {
        selector,
        error: errorMessage,
      });
      return { isValid: false, selector, elementCount: 0, rejectReason: `error: ${errorMessage}` };
    }
  }
}
