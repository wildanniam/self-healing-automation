import { Page } from '@playwright/test';
import type { ActionType } from '../types';

/**
 * Representasi satu kandidat elemen dari DOM runtime.
 * Berisi atribut-atribut penting yang dibutuhkan LLM untuk memilih locator pengganti.
 */
export interface CandidateElement {
  tag: string;
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  role?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  dataTestId?: string;
  dataTest?: string;
  dataCy?: string;
  title?: string;
  /** Class penting (ant-* classes dan class pendek, bukan hash/random) */
  classes?: string[];
  /** Text content pendek (max 80 chars) */
  text?: string;
  /** Label terdekat (dari <label for=...> atau parent label) */
  nearestLabel?: string;
  /** Parent context singkat: tag + id/class parent terdekat yang bermakna */
  parentContext?: string;
  /** Row context jika berada di dalam table */
  rowContext?: string;
  /** Modal/drawer context jika berada di dalam modal atau drawer */
  containerContext?: string;
  /** Apakah elemen visible di viewport */
  isVisible?: boolean;
  /** Apakah elemen disabled (button/input/select) */
  isDisabled?: boolean;
  /** Suggested locators siap pakai: #id, [data-testid=...], [name=...], dll */
  suggestedLocators?: string[];
  /** Marker ground truth untuk testing — TIDAK dikirim ke LLM */
  _evalTarget?: string;
}

/**
 * Opsi untuk mengontrol extraction.
 */
export interface ExtractionOptions {
  actionType: ActionType;
  maxCandidates?: number;
}

/**
 * Mengekstrak kandidat elemen dari live DOM via page.evaluate().
 *
 * @param page    - Playwright Page object
 * @param options - Opsi extraction termasuk actionType
 * @returns       - Array of CandidateElement
 */
export async function extractCandidates(
  page: Page,
  _options: ExtractionOptions,
): Promise<CandidateElement[]> {
  // Semua logika extraction dijalankan di browser context via evaluate
  // Tidak ada slicing di sini — semua kandidat dikembalikan utuh,
  // ranker yang bertanggung jawab memotong ke top N setelah scoring.
  const rawCandidates: CandidateElement[] = await page.evaluate(() => {
    const candidates: CandidateElement[] = [];

    const interactiveTags = 'input, textarea, select, button, a, [role], [aria-label], [placeholder], [name], [data-testid], [data-test], [data-cy]';
    const antSelectors = [
      '.ant-input', '.ant-btn', '.ant-select', '.ant-picker',
      '.ant-modal', '.ant-drawer', '.ant-table', '.ant-dropdown',
      '.ant-input-number', '.ant-checkbox', '.ant-radio',
      '.ant-switch', '.ant-tabs', '.ant-menu-item',
      '.ant-form-item', '.ant-upload',
    ].join(', ');

    const allSelectors = `${interactiveTags}, ${antSelectors}`;
    const elements = document.querySelectorAll(allSelectors);
    const seen = new Set<Element>();

    for (const el of elements) {
      if (seen.has(el)) continue;
      seen.add(el);

      const htmlEl = el as HTMLElement;
      const tag = el.tagName.toLowerCase();

      const style = window.getComputedStyle(htmlEl);
      const hasLayoutBox = htmlEl.offsetWidth > 0 ||
        htmlEl.offsetHeight > 0 ||
        htmlEl.getClientRects().length > 0;
      const isVisible = style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        hasLayoutBox;

      const isDisabled = (htmlEl as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled === true ||
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true';

      const candidate: CandidateElement = { tag, isVisible, isDisabled };

      if (el.id) candidate.id = el.id;
      const nameAttr = el.getAttribute('name');
      if (nameAttr) candidate.name = nameAttr;
      const typeAttr = el.getAttribute('type');
      if (typeAttr) candidate.type = typeAttr;
      const placeholderAttr = el.getAttribute('placeholder');
      if (placeholderAttr) candidate.placeholder = placeholderAttr;
      const roleAttr = el.getAttribute('role');
      if (roleAttr) candidate.role = roleAttr;
      const ariaLabelAttr = el.getAttribute('aria-label');
      if (ariaLabelAttr) candidate.ariaLabel = ariaLabelAttr;
      const ariaLabelledbyAttr = el.getAttribute('aria-labelledby');
      if (ariaLabelledbyAttr) candidate.ariaLabelledby = ariaLabelledbyAttr;
      const dataTestIdAttr = el.getAttribute('data-testid');
      if (dataTestIdAttr) candidate.dataTestId = dataTestIdAttr;
      const dataTestAttr = el.getAttribute('data-test');
      if (dataTestAttr) candidate.dataTest = dataTestAttr;
      const dataCyAttr = el.getAttribute('data-cy');
      if (dataCyAttr) candidate.dataCy = dataCyAttr;
      const titleAttr = el.getAttribute('title');
      if (titleAttr) candidate.title = titleAttr;

      const evalTarget = el.getAttribute('data-eval-target');
      if (evalTarget) candidate._evalTarget = evalTarget;

      // Classes — filter bermakna
      const classList = Array.from(el.classList) as string[];
      const meaningfulClasses = classList.filter((c: string) =>
        c.startsWith('ant-') ||
        (c.length < 30 && !/^[a-z]{1,3}[A-Za-z0-9_-]{20,}$/.test(c) && !/^css-/.test(c))
      );
      if (meaningfulClasses.length > 0) {
        candidate.classes = meaningfulClasses.slice(0, 5);
      }

      // Text content (pendek)
      const textContent = htmlEl.textContent?.trim() ?? '';
      if (textContent.length > 0 && textContent.length <= 80) {
        candidate.text = textContent;
      } else if (textContent.length > 80) {
        candidate.text = textContent.slice(0, 77) + '...';
      }

      // Nearest label
      const labelFor = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      if (labelFor) {
        candidate.nearestLabel = (labelFor as HTMLElement).textContent?.trim().slice(0, 60);
      } else {
        const parentLabel = el.closest('label');
        if (parentLabel && parentLabel !== el) {
          candidate.nearestLabel = parentLabel.textContent?.trim().slice(0, 60);
        }
      }

      // Parent context
      const parent = el.parentElement;
      if (parent) {
        const parentTag = parent.tagName.toLowerCase();
        const parentId = parent.id ? `#${parent.id}` : '';
        const parentClass = (Array.from(parent.classList) as string[])
          .filter((c: string) => c.startsWith('ant-') || c.length < 20)
          .slice(0, 2)
          .map((c: string) => `.${c}`)
          .join('');
        if (parentId || parentClass) {
          candidate.parentContext = `${parentTag}${parentId}${parentClass}`;
        }
      }

      // Row context
      const row = el.closest('tr');
      if (row) {
        const rowCells = Array.from(row.querySelectorAll('td, th')) as HTMLElement[];
        const rowTextParts = rowCells.slice(0, 6).map((cell: HTMLElement) => {
          const clone = cell.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('button, a, input, select, textarea').forEach((child: Element) => child.remove());
          return clone.textContent?.replace(/\s+/g, ' ').trim();
        }).filter(Boolean) as string[];

        if (rowTextParts.length > 0) {
          candidate.rowContext = rowTextParts.join(' | ').slice(0, 160);
        }
      }

      // Container context (modal/drawer)
      const modal = el.closest('.ant-modal, [role="dialog"], .ant-drawer, [role="complementary"]');
      if (modal) {
        const modalTitle = modal.querySelector('.ant-modal-title, .ant-drawer-title, [class*="title"]');
        const modalText = modalTitle
          ? (modalTitle as HTMLElement).textContent?.trim().slice(0, 40)
          : 'untitled';
        const containerType = modal.classList.contains('ant-drawer') || modal.getAttribute('role') === 'complementary'
          ? 'drawer'
          : 'modal';
        candidate.containerContext = `${containerType}: ${modalText}`;
      }

      // Generate suggested locators siap pakai
      // Helper: escape CSS identifier (untuk #id selectors)
      const esc = (val: string) => CSS.escape(val);
      // Helper: escape attribute value (untuk [attr="val"] selectors)
      const escAttr = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const suggested: string[] = [];
      if (candidate.id) suggested.push(`#${esc(candidate.id)}`);
      if (candidate.dataTestId) suggested.push(`[data-testid="${escAttr(candidate.dataTestId)}"]`);
      if (candidate.dataTest) suggested.push(`[data-test="${escAttr(candidate.dataTest)}"]`);
      if (candidate.dataCy) suggested.push(`[data-cy="${escAttr(candidate.dataCy)}"]`);
      if (candidate.name) suggested.push(`[name="${escAttr(candidate.name)}"]`);
      if (candidate.ariaLabel) suggested.push(`[aria-label="${escAttr(candidate.ariaLabel)}"]`);
      if (candidate.placeholder) suggested.push(`[placeholder="${escAttr(candidate.placeholder)}"]`);
      if (candidate.role && candidate.ariaLabel) {
        suggested.push(`${candidate.tag}[role="${escAttr(candidate.role)}"][aria-label="${escAttr(candidate.ariaLabel)}"]`);
      }
      if (suggested.length > 0) candidate.suggestedLocators = suggested;

      candidates.push(candidate);
    }

    return candidates;
  });

  return rawCandidates;
}

/**
 * Format CandidateElement menjadi string ringkas untuk prompt LLM.
 * TIDAK menyertakan _evalTarget (ground truth marker).
 */
export function formatCandidateForPrompt(candidate: CandidateElement, index: number): string {
  const parts: string[] = [`${index + 1}. tag=${candidate.tag}`];

  if (candidate.id) parts.push(`id="${candidate.id}"`);
  if (candidate.dataTestId) parts.push(`data-testid="${candidate.dataTestId}"`);
  if (candidate.dataTest) parts.push(`data-test="${candidate.dataTest}"`);
  if (candidate.dataCy) parts.push(`data-cy="${candidate.dataCy}"`);
  if (candidate.name) parts.push(`name="${candidate.name}"`);
  if (candidate.type) parts.push(`type="${candidate.type}"`);
  if (candidate.role) parts.push(`role="${candidate.role}"`);
  if (candidate.ariaLabel) parts.push(`aria-label="${candidate.ariaLabel}"`);
  if (candidate.ariaLabelledby) parts.push(`aria-labelledby="${candidate.ariaLabelledby}"`);
  if (candidate.placeholder) parts.push(`placeholder="${candidate.placeholder}"`);
  if (candidate.title) parts.push(`title="${candidate.title}"`);
  if (candidate.classes && candidate.classes.length > 0) {
    parts.push(`class="${candidate.classes.join(' ')}"`);
  }
  if (candidate.text) parts.push(`text="${candidate.text}"`);
  if (candidate.nearestLabel) parts.push(`label="${candidate.nearestLabel}"`);
  if (candidate.parentContext) parts.push(`parent=${candidate.parentContext}`);
  if (candidate.rowContext) parts.push(`row="${candidate.rowContext}"`);
  if (candidate.containerContext) parts.push(`container="${candidate.containerContext}"`);
  if (candidate.isVisible === false) parts.push(`[hidden]`);
  if (candidate.isDisabled === true) parts.push(`[disabled]`);
  if (candidate.suggestedLocators && candidate.suggestedLocators.length > 0) {
    parts.push(`locators=[${candidate.suggestedLocators.join(' | ')}]`);
  }

  return parts.join(', ');
}

/**
 * Format seluruh daftar kandidat menjadi string untuk prompt.
 */
export function formatCandidatesForPrompt(candidates: CandidateElement[]): string {
  return candidates.map((c, i) => formatCandidateForPrompt(c, i)).join('\n');
}
