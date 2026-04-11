/**
 * Jenis aksi Playwright yang gagal — dipakai oleh DOM context extractor
 * untuk memprioritaskan kandidat elemen yang relevan.
 */
export type ActionType = 'click' | 'fill' | 'select' | 'getText' | 'waitForVisible' | 'isVisible';

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
  /** Jenis aksi yang gagal — dipakai untuk ranking kandidat elemen */
  actionType: ActionType;
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
  /**
   * healed         = locator di-heal DAN action berhasil
   * action_failed  = locator di-heal tapi action tetap gagal
   * failed         = max retry tercapai, tidak dapat locator valid
   * skipped        = healing dinonaktifkan
   */
  status: 'healed' | 'action_failed' | 'failed' | 'skipped';
  retryCount: number;
  /** Path ke file HTML snapshot DOM saat kegagalan (untuk debugging & inspeksi) */
  domSnapshotFile?: string;
  /** Durasi proses healing dalam milidetik — dari deteksi error sampai locator valid/gagal */
  healingDurationMs?: number;
  /** Total token (input + output) yang dipakai untuk healing locator ini (akumulatif dari semua retry) */
  totalTokens?: number;
  /** Total biaya USD untuk healing locator ini (akumulatif dari semua retry) */
  costUsd?: number;
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

/**
 * Callback yang dipanggil wrapper saat action dengan healed selector tetap gagal.
 * Dipakai untuk memperbarui status healing dari 'healed' ke 'action_failed'.
 */
export type ActionFailedCallback = (descriptor: LocatorDescriptor, healedSelector: string, error: string) => void;
