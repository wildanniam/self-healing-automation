/**
 * Descriptor yang menggambarkan sebuah locator di dalam test.
 * Dipakai oleh wrapper dan healing engine untuk mengidentifikasi
 * elemen mana yang gagal dan perlu di-heal.
 */
export interface LocatorDescriptor {
  /** Selector string: CSS, XPath, atau Playwright selector */
  selector: string;
  /** Nama test case tempat locator ini digunakan */
  testName: string;
  /** Path absolut ke file .spec.ts yang memuat locator ini */
  filePath: string;
  /** Deskripsi opsional langkah test untuk keperluan logging */
  stepName?: string;
}

/**
 * Konteks lengkap saat terjadi kegagalan locator.
 * Diteruskan ke HealCallback untuk proses healing di Phase 2-3.
 */
export interface HealingContext {
  /** Descriptor locator yang gagal */
  descriptor: LocatorDescriptor;
  /** Pesan error asli dari Playwright */
  errorMessage: string;
  /** URL halaman saat kegagalan terjadi */
  pageUrl: string;
  /** Snapshot HTML DOM saat kegagalan (dipakai oleh LLM di Phase 2) */
  domSnapshot: string;
}

/**
 * Hasil akhir dari proses healing satu locator.
 * Disimpan ke healing-results.json untuk keperluan patching dan metrics.
 */
export interface HealingResult {
  testName: string;
  filePath: string;
  oldLocator: string;
  newLocator: string;
  timestamp: string;
  /** healed = berhasil di-heal, failed = max retry tercapai, skipped = healing dinonaktifkan */
  status: 'healed' | 'failed' | 'skipped';
  retryCount: number;
  /** Path ke file HTML snapshot DOM saat kegagalan (untuk debugging & inspeksi) */
  domSnapshotFile?: string;
}

/**
 * Opsi tambahan yang dapat diteruskan ke setiap fungsi wrapper.
 */
export interface WrapperOptions {
  /** Timeout dalam milidetik (default: 30000) */
  timeout?: number;
  /** Aktifkan healing saat gagal (default: true) */
  enableHealing?: boolean;
}

/**
 * Tipe callback yang akan dipanggil wrapper saat locator gagal.
 * Implementasinya ada di HealingOrchestrator (Phase 3).
 * Mengembalikan selector baru yang sudah divalidasi, atau null jika gagal.
 */
export type HealCallback = (context: HealingContext) => Promise<string | null>;
