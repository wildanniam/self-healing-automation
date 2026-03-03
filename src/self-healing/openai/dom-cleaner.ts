/**
 * Pola regex untuk tag-tag yang dihapus dari DOM sebelum dikirim ke LLM.
 * Tujuan: mengurangi noise dan jumlah token, fokus pada elemen interaktif.
 *
 * Urutan penting: tag dengan konten ([\s\S]*?) dibersihkan sebelum tag self-closing.
 */
const BLOCK_TAG_PATTERNS: RegExp[] = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<style\b[^>]*>[\s\S]*?<\/style>/gi,
  /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
  /<head\b[^>]*>[\s\S]*?<\/head>/gi,
  /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  /<canvas\b[^>]*>[\s\S]*?<\/canvas>/gi,
];

const INLINE_TAG_PATTERNS: RegExp[] = [
  /<!--[\s\S]*?-->/g,
  /<meta\b[^>]*\/?>/gi,
  /<link\b[^>]*\/?>/gi,
];

/**
 * Membersihkan HTML DOM dari tag-tag yang tidak relevan untuk analisis locator.
 *
 * @param html     - Raw HTML dari page.content()
 * @param maxChars - Batas maksimum karakter output (default: 8000)
 * @returns        - DOM yang sudah bersih dan siap dikirim ke LLM
 */
export function cleanDom(html: string, maxChars = 8000): string {
  let cleaned = html;

  for (const pattern of BLOCK_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  for (const pattern of INLINE_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Normalisasi whitespace berlebih
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // Potong jika melebihi batas token
  if (cleaned.length > maxChars) {
    cleaned =
      cleaned.slice(0, maxChars) +
      '\n<!-- [DOM dipotong untuk efisiensi token] -->';
  }

  return cleaned;
}
