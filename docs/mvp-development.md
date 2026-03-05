# MVP Development — Self-Healing Test Automation

Dokumen ini mendefinisikan scope MVP yang siap didemonstrasikan ke dosen pembimbing, termasuk analisis progress saat ini, gap yang perlu diisi, dan langkah pengembangan yang diperlukan.

---

## 1. Tujuan MVP

Membuktikan kepada dosen pembimbing bahwa sistem self-healing berbasis LLM dengan DOM Differencing **bekerja secara end-to-end**, mulai dari deteksi locator rusak hingga auto-patch dan Pull Request ke GitHub — menggunakan dummy HTML sebagai objek uji.

---

## 2. Progress Saat Ini

### ✅ Sudah Selesai (M1–M4)

| Modul | File | Fungsi |
|---|---|---|
| PlaywrightWrapper | `playwright/wrapper.ts` | Intersepsi error locator, trigger healing |
| DOM Cleaner | `openai/dom-cleaner.ts` | Bersihkan HTML dari tag tidak relevan |
| Prompt Builder | `openai/prompt-builder.ts` | Susun prompt ke LLM |
| LLM Client | `openai/llm-client.ts` | Panggil OpenAI API, parse response |
| Locator Validator | `core/locator-validator.ts` | Validasi locator baru di browser |
| Healing Orchestrator | `core/healing-orchestrator.ts` | Koordinasi retry loop 3x |
| Results Store | `core/results-store.ts` | Simpan hasil healing ke JSON |
| Test File Patcher | `patching/test-file-patcher.ts` | Replace locator di .spec.ts |
| Git Service | `git/git-service.ts` | Branch, commit, push |
| GitHub PR Service | `git/github-pr.ts` | Buat PR via GitHub API |
| Patch Runner | `patching/patch-runner.ts` | Orkestrasi M4 |
| Demo Test | `tests/self-healing-demo.spec.ts` | Skenario uji dengan dummy HTML |

### ❌ Belum Ada — Gap untuk MVP

| Modul | Keterangan | Dampak Jika Tidak Ada |
|---|---|---|
| **Baseline Capturer** | Merekam DOM context elemen saat test pass | DOM Differencing tidak bisa berjalan |
| **Baseline Store** | Menyimpan hasil capture sebagai JSON | Tidak ada data pembanding |
| **DOM Differencer** | Membandingkan DOM gagal vs baseline | LLM tidak tahu *apa yang berubah* |
| Update **Prompt Builder** | Gunakan diff, bukan full DOM | LLM kurang akurat untuk UI kompleks |
| Update **Wrapper** | Capture element context, bukan full page | DOM yang dikirim tidak presisi |
| Update **Orchestrator** | Integrasikan diff ke alur healing | Pipeline final tidak terpenuhi |

---

## 3. Gap Kritis yang Harus Diselesaikan

### Gap 1 — Wrapper Masih Ambil Full Page DOM

**Kondisi sekarang** (`playwright/wrapper.ts`):
```typescript
private async captureSnapshot(): Promise<string> {
  return await this.page.content(); // ← Seluruh halaman
}
```

**Yang dibutuhkan untuk MVP:**
```typescript
private async captureElementContext(selector: string): Promise<string> {
  // Ambil DOM context hanya di sekitar elemen yang gagal
  // elemen target + parent 2 level + sibling langsung
}
```

---

### Gap 2 — Prompt Builder Masih Kirim Full DOM, Bukan Diff

**Kondisi sekarang** (`openai/prompt-builder.ts`):
```
## Current DOM (noise removed)
[seluruh halaman setelah dibersihkan]
```

**Yang dibutuhkan untuk MVP:**
```
## DOM Context Elemen yang Gagal (Sebelum — Baseline)
[DOM context elemen saat test terakhir pass]

## DOM Context Elemen yang Gagal (Sesudah — Sekarang)
[DOM context elemen saat ini]

## Perubahan yang Terdeteksi (Diff)
[apa yang berubah secara eksplisit]
```

---

### Gap 3 — Tidak Ada Mekanisme Baseline

Sistem belum punya cara untuk:
- Menyimpan "kondisi benar" dari setiap elemen yang diuji
- Membandingkan kondisi gagal dengan kondisi benar tersebut
- Memperbarui baseline setelah healing berhasil di-merge

---

## 4. Scope MVP — Yang Perlu Dibangun (M5)

### File Baru yang Harus Dibuat

```
src/self-healing/
├── baseline/
│   ├── baseline-capturer.ts    ← Capture DOM context saat test pass
│   ├── baseline-store.ts       ← Read/write baseline JSON
│   └── baseline-updater.ts     ← Update baseline setelah healing
├── core/
│   └── dom-differencer.ts      ← Bandingkan DOM gagal vs baseline
```

### File yang Harus Dimodifikasi

```
src/self-healing/
├── playwright/wrapper.ts       ← captureSnapshot → captureElementContext
├── openai/prompt-builder.ts    ← Gunakan diff, bukan full DOM
├── core/healing-orchestrator.ts← Integrasikan DOM diff ke alur heal()
├── types/index.ts              ← Tambah type untuk Baseline & Diff
└── index.ts                    ← Export modul baseline baru
```

### Command Baru di package.json

```json
"scripts": {
  "baseline:capture": "...",   ← Rekam baseline dari test yang pass
  "baseline:update": "..."     ← Update baseline setelah PR merge
}
```

### Folder Output Baru

```
baseline-snapshots/             ← Baseline Store (di-commit ke git)
├── happy-path/
│   ├── isi-email.json
│   ├── isi-password.json
│   └── klik-login.json
└── ...
```

---

## 5. Format Baseline JSON

Setiap elemen yang berhasil diinteraksi akan disimpan dalam format:

```json
{
  "locator": "#user-email",
  "testName": "happy path — locator benar tidak memicu healing",
  "stepName": "Isi email",
  "pageUrl": "file:///path/to/demo.html",
  "domContext": "<div class=\"form-group\"><label for=\"user-email\">Email</label><input id=\"user-email\" name=\"email\" type=\"email\" data-testid=\"input-email\" placeholder=\"Masukkan email kamu\" /></div>",
  "capturedAt": "2026-03-05T10:00:00.000Z"
}
```

---

## 6. Format Diff yang Dikirim ke LLM

Setelah DOM Differencing berjalan, LLM menerima ini (bukan full DOM):

```
## Locator yang Gagal
#username

## DOM Context — Kondisi Sebelumnya (Baseline)
<div class="form-group">
  <label for="user-email">Email</label>
  <input id="user-email" name="email" type="email" data-testid="input-email" />
</div>

## DOM Context — Kondisi Sekarang
<div class="form-group">
  <label for="email-field">Email</label>
  <input id="email-field" name="email" type="email" data-testid="input-email" />
</div>

## Perubahan Terdeteksi
- id: "user-email" → "email-field"
- label for: "user-email" → "email-field"
- data-testid tetap sama: "input-email"
```

LLM langsung paham: elemen yang sama, hanya ID berubah. Locator terbaik: `[data-testid="input-email"]`.

---

## 7. Skenario Demo ke Dosen

### Persiapan (sekali saja)

```bash
# 1. Pastikan .env sudah terisi (OPENAI_API_KEY, GitHub token, dll)
# 2. Jalankan baseline capture — simpan kondisi "benar"
npm run baseline:capture
# → Menghasilkan: baseline-snapshots/ dengan JSON per elemen
```

### Demo Live (urutan yang ditunjukkan ke dosen)

**Langkah 1 — Tunjukkan baseline yang tersimpan**
```
baseline-snapshots/
├── happy-path---locator-benar.../
│   ├── isi-email.json          ← "id=user-email, data-testid=input-email"
│   ├── isi-password.json
│   └── klik-login.json
```

**Langkah 2 — Simulasi developer mengubah HTML**
```html
<!-- Sebelum (kondisi benar) -->
<input id="user-email" name="email" data-testid="input-email" />

<!-- Sesudah (developer refactor, ID berubah) -->
<input id="email-field" name="email" data-testid="input-email" />
```

**Langkah 3 — Jalankan test (locator akan gagal)**
```bash
npm test
```

**Langkah 4 — Sistem bekerja otomatis:**
```
[LOG] Locator #user-email gagal ditemukan
[LOG] Mengambil DOM context elemen yang gagal...
[LOG] Membandingkan dengan baseline...
[DIFF] id: "user-email" → "email-field"
[LOG] Mengirim diff ke LLM...
[LLM] Locator baru yang disarankan: [data-testid="input-email"]
[LOG] Validasi locator baru di browser... ✅ Valid
[LOG] Healing berhasil! Test dilanjutkan.
[LOG] Membuat Pull Request ke GitHub...
[PR]  https://github.com/.../pull/1
```

**Langkah 5 — Tunjukkan output:**
- File `baseline-snapshots/` (bukti baseline capture)
- File `healing-results/demo-test.json` (laporan healing)
- Pull Request yang terbuka di GitHub (bukti auto-patch)

---

## 8. Checklist Pengembangan M5

### Phase A — Baseline System

- [ ] Buat `src/self-healing/baseline/baseline-store.ts`
  - Read/write JSON per elemen ke `baseline-snapshots/`
  - Key: kombinasi testName + stepName + selector
- [ ] Buat `src/self-healing/baseline/baseline-capturer.ts`
  - Mode capture: jalankan test, simpan DOM context setiap aksi berhasil
  - Integrasi dengan PlaywrightWrapper
- [ ] Buat `src/self-healing/baseline/baseline-updater.ts`
  - Update entry di Baseline Store berdasarkan healing result
  - Dijalankan manual via `npm run baseline:update`
- [ ] Update `package.json` — tambah script `baseline:capture` dan `baseline:update`

### Phase B — DOM Differencing

- [ ] Buat `src/self-healing/core/dom-differencer.ts`
  - Input: DOM context saat gagal + baseline entry
  - Output: diff yang informatif (perubahan atribut, struktur)
- [ ] Update `src/self-healing/playwright/wrapper.ts`
  - `captureSnapshot()` → `captureElementContext(selector)` untuk ambil konteks elemen saja
- [ ] Update `src/self-healing/openai/prompt-builder.ts`
  - Tambah parameter `domDiff` (opsional untuk backward compatibility)
  - Jika ada diff: kirim diff + before/after context
  - Jika tidak ada diff (no baseline): fallback ke full DOM (backward compatible)
- [ ] Update `src/self-healing/types/index.ts`
  - Tambah interface `BaselineEntry`, `DomDiff`
  - Update `HealingContext` — tambah `baselineEntry?` dan `domDiff?`
- [ ] Update `src/self-healing/core/healing-orchestrator.ts`
  - Load baseline entry saat `heal()` dipanggil
  - Jalankan DOM diff
  - Teruskan diff ke LLM via context yang diperbarui

### Phase C — Verifikasi & Demo Test

- [ ] Update `tests/self-healing-demo.spec.ts`
  - Tambah skenario yang memanfaatkan baseline (bukan hanya locator salah yang hardcoded)
- [ ] Jalankan full demo flow dan verifikasi semua langkah berjalan
- [ ] Pastikan PR terbuat di GitHub dengan deskripsi yang informatif

---

## 9. Kriteria MVP Selesai

MVP dianggap selesai dan siap demo jika semua kondisi berikut terpenuhi:

1. `npm run baseline:capture` berjalan tanpa error dan menghasilkan file JSON di `baseline-snapshots/`
2. Setelah `demo.html` dimodifikasi (ubah ID elemen), `npm test` mendeteksi kegagalan locator
3. Sistem menampilkan diff di log: menunjukkan apa yang berubah antara baseline dan kondisi sekarang
4. LLM menerima diff (bukan full DOM) dan menghasilkan locator baru yang valid
5. File `healing-results/*.json` berisi laporan healing dengan status `healed`
6. Pull Request terbuka di GitHub dengan deskripsi locator lama → baru
7. Seluruh proses di atas berjalan tanpa error TypeScript (`npm run type-check` clean)

---

## 10. Yang TIDAK Termasuk MVP

Item berikut sengaja dikeluarkan dari scope MVP dan akan dikerjakan setelah demo:

- Rule-Based Self-Healing (sistem pembanding) — M6
- Test Case OmniX (aplikasi nyata) — M7
- Jenkins Integration — M8
- Observability dashboard — M8
- Automatic baseline update setelah PR merge (untuk MVP, update dilakukan manual)
