import { promises as fsp } from 'fs';
import { logger } from '../logger';

export interface PatchResult {
  filePath: string;
  oldLocator: string;
  newLocator: string;
  /** Jumlah baris yang berhasil diganti */
  replacementCount: number;
  /** True jika minimal 1 penggantian berhasil dilakukan */
  patched: boolean;
}

/**
 * Escape karakter-karakter spesial regex dalam sebuah string.
 * Digunakan agar selector seperti '#btn.active[type="submit"]'
 * tidak diinterpretasikan sebagai pola regex.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mengganti locator lama dengan locator baru di dalam string konten file.
 *
 * Pola yang ditangani (single, double, backtick quote):
 *   1. page.locator('selector')         ← Playwright native
 *   2. selector: 'value'               ← property wrapper kami
 *
 * Penggantian bersifat aman:
 *   - Hanya cocok dalam konteks Playwright / wrapper
 *   - Tidak mengganti string di komentar atau konteks lain
 *   - Menghormati jenis quote yang dipakai (', ", `)
 *
 * @returns Object berisi konten baru dan jumlah penggantian
 */
export function patchLocatorInContent(
  content: string,
  oldLocator: string,
  newLocator: string,
): { newContent: string; count: number } {
  const escaped = escapeRegex(oldLocator);
  let count = 0;

  const patterns: RegExp[] = [
    // Playwright native: page.locator('selector') / page.locator("selector")
    new RegExp(`(page\\.locator\\(\\s*)(['"\`])(${escaped})\\2`, 'g'),
    // Wrapper property: selector: 'value' / selector: "value"
    new RegExp(`(\\bselector\\s*:\\s*)(['"\`])(${escaped})\\2`, 'g'),
  ];

  let newContent = content;
  for (const pattern of patterns) {
    newContent = newContent.replace(pattern, (_match, prefix: string, quote: string) => {
      count++;
      return `${prefix}${quote}${newLocator}${quote}`;
    });
  }

  return { newContent, count };
}

/**
 * Membaca file `.spec.ts`, mengganti locator lama dengan yang baru,
 * lalu menyimpan kembali ke file yang sama.
 *
 * Jika locator tidak ditemukan dalam file, file tidak diubah dan
 * `patched: false` dikembalikan — tidak ada error yang dilempar.
 *
 * @param filePath   - Path absolut ke file .spec.ts
 * @param oldLocator - Selector lama yang perlu diganti
 * @param newLocator - Selector baru hasil healing
 */
export async function patchTestFile(
  filePath: string,
  oldLocator: string,
  newLocator: string,
): Promise<PatchResult> {
  const content = await fsp.readFile(filePath, 'utf-8');
  const { newContent, count } = patchLocatorInContent(content, oldLocator, newLocator);

  if (count > 0) {
    await fsp.writeFile(filePath, newContent, 'utf-8');
    logger.info('[file-patcher] File berhasil di-patch', {
      filePath,
      oldLocator,
      newLocator,
      replacementCount: count,
    });
  } else {
    logger.warn('[file-patcher] Locator tidak ditemukan dalam file — file tidak diubah', {
      filePath,
      oldLocator,
    });
  }

  return { filePath, oldLocator, newLocator, replacementCount: count, patched: count > 0 };
}
