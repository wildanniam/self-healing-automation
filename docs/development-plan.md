## Rencana Pengembangan Sistem Self-Healing Test Automation

Dokumen ini merinci rencana pengembangan teknis untuk sistem self-healing berbasis LLM yang dijelaskan di `readme.md`.

---

## 1. Gambaran Arsitektur Modul

Kita akan membangun beberapa modul utama:

- **Test Runner Layer (Integrasi Playwright)**
  - Wrapper untuk aksi: `click`, `fill`, `getByRole`, `locator`, dan aksi penting lain.
  - Penangkap error (timeout / element not found).
  - Pengambil snapshot DOM + metadata (URL, nama test, nama step).

- **Self-Healing Core**
  - **Failure Analyzer**: mengemas konteks failure (locator lama, DOM, info step).
  - **Prompt Builder**: menyusun prompt ke LLM sesuai format PRD.
  - **LLM Client**: modul pemanggilan OpenAI API (asinkron, dengan retry policy).
  - **Locator Evaluator**: menjalankan locator baru di browser (via Playwright) untuk validasi.
  - **Healing Orchestrator**: mengatur alur dari failure sampai didapat locator baru yang valid.

- **File Patching & Git Automation**
  - **Test File Scanner**: menemukan file `.spec.ts` yang relevan.
  - **Locator Replacer**: patch string locator di file (regex aman).
  - **Git Service**: membuat branch, commit, dan push.
  - **GitLab MR Service**: membuat Merge Request untuk review QA.

- **Observability & Metrics**
  - Logging terstruktur (mis. JSON log).
  - Pengukuran metrik: success rate healing, waktu rata-rata, dll.
  - Integrasi ke report Jenkins di tahap berikutnya.

---

## 2. Phase 1 – Failover & Interception (Playwright Wrapper)

**Tujuan**: Semua aksi locator Playwright lewat satu pintu, sehingga setiap failure bisa diintersepsi.

### 2.1 Deliverables Teknis

- Utility fungsi wrapper, misalnya:
  - `safeClick(locatorDescriptor)`
  - `safeFill(locatorDescriptor, value)`
  - Fungsi lain yang membungkus aksi penting di Playwright.
- `locatorDescriptor` berisi:
  - String locator asli (XPath/CSS/selector Playwright).
  - Informasi test (nama test, file, step).
- Di dalam wrapper:
  - Jalankan aksi Playwright normal.
  - `try/catch` untuk:
    - `TimeoutError`
    - Error sejenis “element not found”.
  - Jika sukses → lanjut tanpa healing.
  - Jika gagal → kirim event ke Self-Healing Core (Phase 2–3).

### 2.2 Desain Tambahan

- Menentukan format `locatorDescriptor` yang konsisten dan mudah di-refer ketika patch file.
- Menentukan strategi injeksi wrapper:
  - Mengubah semua test agar memakai wrapper (bantuan search & replace).
  - Atau membuat helper/base-layer yang menjadi standar untuk test baru.

---

## 3. Phase 2 – Contextual Analysis & Prompting (LLM Request)

**Tujuan**: Menyiapkan data yang rapi untuk LLM dan memastikan output berupa JSON saja.

### 3.1 DOM Snapshotter

- Fungsi yang:
  - Mengambil `page.content()` (HTML penuh).
  - Membersihkan tag yang tidak perlu:
    - `script`
    - `style`
    - `svg`
    - (opsional) `meta`, `link` jika terlalu berisik.
  - Ke depan dapat dioptimasi untuk hanya mengirim potongan DOM di sekitar elemen target.

### 3.2 Prompt Builder

- Menerima:
  - Locator lama yang gagal.
  - DOM hasil cleaning.
  - Informasi konteks test (opsional).
- Menyusun prompt yang menjelaskan tugas LLM:
  - Menemukan locator baru (XPath/CSS/selector Playwright) yang menarget elemen yang sama.
  - Output harus **hanya** dalam format JSON:
    - `{"new_locator": "..."}` tanpa penjelasan tambahan.

### 3.3 LLM Client

- Abstraksi di atas OpenAI SDK:
  - Fungsi async semisal `getHealedLocator(prompt): Promise<string>`.
  - Menentukan model: `gpt-4o` atau `gpt-3.5-turbo`.
  - Menangani:
    - Timeout.
    - Retry sederhana untuk error jaringan.
  - Parsing respons:
    - Memastikan respons valid JSON.
    - Menambahkan lapisan sanitasi jika LLM kadang menyertakan teks non-JSON.

---

## 4. Phase 3 – Validation & Healing Logic (Runtime Validation)

**Tujuan**: Memastikan locator baru benar-benar menunjuk ke elemen yang tepat sebelum di-patch ke file.

### 4.1 Locator Validator

- Di runtime (masih pada `page` yang sama), gunakan locator baru:
  - Cek bahwa locator menghasilkan setidaknya satu elemen.
  - (Opsional) Cek atribut unik atau teks yang relevan jika tersedia.
- Jika valid:
  - Return status `success` dan candidate locator.
- Jika tidak valid:
  - Tandai sebagai `failed` dan serahkan ke orchestrator untuk dicoba lagi.

### 4.2 Healing Orchestrator

- Mengontrol flow:
  1. Menerima sinyal error dari wrapper.
  2. Mengambil konteks (DOM, locator lama, metadata test).
  3. Loop maksimal 3 kali:
     - Memanggil LLM untuk candidate locator baru.
     - Memvalidasi locator baru.
     - Jika valid → berhenti dan tandai `healed`.
  4. Jika setelah 3 kali tetap gagal:
     - Biarkan test tetap fail (tidak memaksakan healing).
     - Logging lengkap untuk analisis manual.

### 4.3 Strategi Waktu Patching

- Dua opsi mode:
  - **Immediate patch mode**:
    - Langsung menandai perubahan untuk di-apply setelah test run.
  - **Deferred patch mode**:
    - Menyimpan candidate dan metadata di file (mis. `healing-results.json`) untuk diproses di job terpisah.
- Tahap awal:
  - Disarankan memakai pendekatan deferred:
    - Simpan hasil healing selama run.
    - Jalankan patching di langkah post-run.

---

## 5. Phase 4 – Auto-Patching & Version Control (Git & GitLab MR)

**Tujuan**: Mengotomatisasi perubahan locator di file `.spec.ts` dan integrasi ke GitLab.

### 5.1 Data Model “Healing Result”

- Struktur data per kasus (contoh):
  - `testName`
  - `filePath`
  - `oldLocator`
  - `newLocator`
  - `timestamp`
  - `status` (misalnya `healed` atau `failed`)
- Disimpan ke file (mis. `healing-results.json`) setelah test run.

### 5.2 Test File Scanner & Patcher

- Fungsi yang:
  - Membaca file `.spec.ts` terkait.
  - Menemukan string `oldLocator` dengan konteks yang spesifik, misalnya:
    - Di dalam blok test tertentu (`test('...', async () => { ... })`).
    - Di sekitar pemanggilan Playwright (`page.locator("...")`, `getByRole`, dll).
  - Mengganti menjadi `newLocator` menggunakan regex yang ketat:
    - Menghindari global replace tanpa konteks.
    - Memastikan hanya locator yang dimaksud yang berubah.
  - Menjaga struktur dan gaya kode (indentasi, kutip, dsb).

### 5.3 Git Service

- Menggunakan library seperti `simple-git`:
  - Membuat branch baru:
    - Format: `auto-healing/[test-name]`.
  - `git add` file yang berubah.
  - `git commit` dengan pesan yang deskriptif, contoh:
    - `chore(self-healing): update locator for [test-name]`.
  - `git push` ke remote origin.

### 5.4 GitLab MR Creator

- Menggunakan GitLab API (mis. via `axios` atau `node-fetch`):
  - Membuat Merge Request dengan:
    - Title: `Auto-Healing: [test-name]`.
    - Description: rangkuman perubahan (old locator → new locator, jumlah test yang di-heal, dsb).
  - MR siap direview oleh QA Engineer sebelum merge.

---

## 6. Observability, Metrics, & Integrasi CI/CD

**Tujuan**: Memastikan sistem bisa dipantau dan diukur dampaknya di pipeline CI/CD.

### 6.1 Logging

- Menghasilkan log terstruktur (mis. JSON) yang memuat:
  - `testName`, `filePath`, `stepName`.
  - `oldLocator`, `newLocator`.
  - `status` healing (`healed`, `failed`, `skipped`).
  - Jumlah retry ke LLM.

### 6.2 Metrics Collector

- Setelah test run:
  - Hitung:
    - Jumlah failure locator yang:
      - Berhasil di-heal.
      - Gagal di-heal.
    - Waktu rata-rata proses healing per kasus.
  - Output:
    - File ringkasan (JSON/CSV).
    - Atau summary di console yang dapat dibaca Jenkins.

### 6.3 Integrasi Jenkins

- Tambahan step di pipeline:
  - Menjalankan test dengan self-healing aktif.
  - Mengarsipkan report self-healing (mis. `healing-results.json` dan summary) sebagai artifact.
  - (Opsional) Mem-publish summary ke dashboard Jenkins atau tool observability lain.

---

## 7. Milestone Implementasi

### 7.1 Milestone 1 – Infrastruktur Dasar

- Setup project Node.js/TypeScript + Playwright.
- Membuat modul wrapper dasar untuk beberapa aksi (mis. `safeClick`, `safeFill`).
- Menambahkan logging dasar ketika terjadi error locator.

### 7.2 Milestone 2 – Integrasi LLM (Phase 2)

- Implementasi `DOM Snapshotter`, `Prompt Builder`, dan `LLM Client`.
- Uji manual beberapa case:
  - Sengaja membuat locator salah.
  - Lihat apakah LLM bisa mengusulkan locator pengganti yang masuk akal (tanpa auto-patching dulu).

### 7.3 Milestone 3 – Validation & Orchestration (Phase 3)

- Implementasi `Locator Validator` dan `Healing Orchestrator`.
- Uji alur end-to-end:
  - Locator salah → LLM → validasi runtime → test lanjut jika berhasil.

### 7.4 Milestone 4 – Auto-Patching & Git (Phase 4)

- Implementasi:
  - Penyimpanan hasil healing.
  - File patcher (regex aman).
  - Git automation dan pembuatan GitLab MR.
- Uji dengan repo sandbox/dummy terlebih dahulu.

### 7.5 Milestone 5 – Observability & CI/CD

- Menambahkan logging dan metrics secara lengkap.
- Integrasi penuh dengan Jenkins pipeline.
- Mulai mengukur:
  - Success rate healing.
  - Pengurangan waktu maintenance.
  - Peningkatan pass rate pipeline.

---

## 8. Pertimbangan Khusus

- **Keamanan & Stabilitas Regex**
  - Pastikan regex patching hanya menyentuh locator yang dimaksud.
  - Uji terhadap berbagai bentuk penulisan selector di kode.

- **Kontrol Cost & Latency LLM**
  - Batasi ukuran DOM yang dikirim.
  - Pertimbangkan caching untuk pola failure yang berulang.

- **Safety melalui MR**
  - Semua perubahan locator difinalisasi melalui Merge Request.
  - QA Engineer tetap memiliki kontrol penuh untuk menerima/menolak perubahan.

