# Pengembangan Sistem Self-Healing Test Automation Berbasis Large Language Model pada Pengujian Antarmuka Web dalam Lingkungan CI/CD

Prototype tugas akhir untuk mendeteksi, memperbaiki, dan memermanenkan locator UI yang rusak secara otomatis menggunakan Large Language Model (LLM) pada stack Playwright + TypeScript.

## Ringkasan

Proyek ini dikembangkan untuk menjawab masalah **fragilitas locator** pada UI test automation. Perubahan kecil pada atribut atau struktur DOM sering membuat locator lama tidak lagi valid, sehingga test gagal walaupun perilaku aplikasi sebenarnya masih benar. Dampaknya adalah munculnya *false failure* di pipeline CI/CD dan meningkatnya beban maintenance bagi QA engineer.

Sistem pada repo ini menggabungkan:

- **Playwright wrapper** untuk mengintersepsi kegagalan locator pada runtime,
- **DOM extraction dan cleaning** untuk menyiapkan konteks yang efisien bagi LLM,
- **OpenAI-based healing** untuk menghasilkan kandidat locator baru,
- **runtime validation dan retry** untuk memeriksa apakah kandidat locator dapat dipakai,
- **post-heal auto-patching** untuk memperbarui source test secara permanen,
- **Git automation** untuk membuat branch, commit, push, dan Pull Request otomatis.

## Konteks Proyek

- **Jenis proyek:** Tugas Akhir / penelitian terapan
- **Author:** Wildan Syukri Niam
- **Program studi:** S1 Rekayasa Perangkat Lunak, Telkom University
- **Studi kasus industri:** PT Infomedia Nusantara
- **Objek pengujian:** aplikasi web OmniX

Repo ini berfungsi sebagai **prototype penelitian**, bukan produk production-ready. Fokus utamanya adalah membuktikan kelayakan arsitektur self-healing berbasis LLM pada pengujian UI di lingkungan CI/CD.

## Teknologi yang Digunakan

- **Test automation:** Playwright
- **Bahasa:** TypeScript / Node.js
- **LLM integration:** OpenAI SDK
- **CI/CD:** GitHub Actions
- **Version control automation:** simple-git
- **Patch automation:** Node.js file system + regex-based replacement

## Cara Kerja Sistem

Alur kerja utama sistem adalah sebagai berikut:

```text
Playwright Action via Wrapper
        ->
Deteksi Kegagalan Locator
        ->
Ekstraksi DOM Runtime + Failure Context
        ->
DOM Cleaning
        ->
LLM Menghasilkan Locator Baru
        ->
Runtime Validation + Retry
        ->
Re-run Aksi dengan Locator Baru
        ->
Simpan Healing Report
        ->
Post-Heal: Patch File Test + Branch + Commit + Push + PR
```

Secara praktis, sistem dibagi menjadi dua bagian besar:

1. **Runtime healing**
   Menjaga agar test dapat melanjutkan eksekusi ketika locator rusak.
2. **Permanent healing**
   Mengubah hasil healing menjadi patch yang bisa direview dan diadopsi ke source test.

## Fitur Utama

- Wrapper action untuk `click`, `fill`, `selectOption`, `getText`, `waitForVisible`, dan `isVisible`
- Pengambilan snapshot DOM saat kegagalan terjadi
- Pembersihan DOM dari `script`, `style`, `svg`, `head`, komentar HTML, dan noise lain
- Prompt builder dengan output JSON-only
- Integrasi OpenAI untuk menghasilkan locator baru
- Runtime validation pada browser aktif
- Retry healing hingga maksimal 3 kali
- Penyimpanan hasil healing ke report dan snapshot file
- Auto-patching locator pada file `.spec.ts`
- Branch, commit, push, dan Pull Request automation
- Workflow GitHub Actions untuk test, post-heal, dan artifact upload
- Demo mode untuk presentasi tugas akhir

## Status Implementasi Saat Ini

| Area | Status | Keterangan |
| --- | --- | --- |
| Wrapper & interception | Implemented | Wrapper Playwright untuk aksi utama sudah aktif |
| DOM cleaning & LLM prompting | Implemented | DOM cleaner, prompt builder, dan OpenAI client sudah tersedia |
| Runtime healing orchestration | Implemented | Orchestrator, validator, dan result store sudah berjalan |
| Auto-patching | Implemented | Patcher membaca report dan mengganti locator pada file test |
| Git automation & PR | Implemented | Branch, commit, push, dan GitHub PR creator sudah tersedia |
| CI/CD integration | Implemented (Basic) | Workflow GitHub Actions sudah menjalankan test dan post-heal |
| Research instrumentation | In progress | Beberapa metrik eksperimen masih perlu diperdalam |

## Struktur Repository

```text
src/self-healing/
  playwright/
    wrapper.ts                # Wrapper aksi Playwright
  openai/
    dom-cleaner.ts            # Pembersihan DOM
    prompt-builder.ts         # Penyusunan prompt ke LLM
    llm-client.ts             # Integrasi OpenAI
  core/
    healing-orchestrator.ts   # Orkestrasi healing runtime
    locator-validator.ts      # Validasi locator kandidat
    results-store.ts          # Penyimpanan hasil healing
    metrics-collector.ts      # Metrik dasar
    file-patcher.ts           # Patch locator ke file test
  git/
    git-service.ts            # Branch, commit, push
    github-pr-creator.ts      # Pembuatan Pull Request
scripts/
  post-heal.ts                # Patch + git + PR
  demo.ts                     # One-command demo
tests/
  self-healing-demo.spec.ts   # Demo end-to-end
  file-patcher.spec.ts        # Unit test patcher
  git-service.spec.ts         # Unit test git automation
```

## Persiapan Environment

### Prasyarat

- Node.js LTS
- npm
- Browser Playwright
- OpenAI API key
- GitHub token jika ingin mengaktifkan pembuatan PR otomatis

### Setup

1. Install dependency:

```bash
npm ci
```

2. Install browser Playwright:

```bash
npx playwright install --with-deps
```

3. Salin file environment:

```bash
cp .env.example .env
```

4. Isi variabel yang dibutuhkan pada `.env`, minimal:

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4o-mini
HEALING_MAX_RETRIES=3
HEALING_DOM_MAX_CHARS=8000
```

Jika ingin mengaktifkan post-heal hingga Pull Request otomatis, isi juga:

```env
GITHUB_TOKEN=your_github_token
GITHUB_REPO=owner/repo
GIT_BRANCH_PREFIX=auto-healing
GIT_COMMIT_MSG_PREFIX=chore(self-healing)
```

## Cara Menjalankan

### Menjalankan seluruh test

```bash
npm test
```

### Menjalankan test dengan browser terlihat

```bash
npm run test:headed
```

### Menjalankan demo end-to-end

```bash
npm run demo
```

Perintah ini akan:

- menjalankan `tests/self-healing-demo.spec.ts`,
- memicu jalur healing,
- menjalankan `post-heal`,
- lalu membuka report jika tersedia.

### Menjalankan post-heal secara manual

```bash
npm run post-heal
```

### Menjalankan post-heal tanpa git dan PR

```bash
npm run post-heal:dry
```

## Skenario Demo yang Sudah Tersedia

File `tests/self-healing-demo.spec.ts` saat ini memuat tiga skenario dasar:

- **Happy path**
  Locator benar, healing tidak dipanggil.
- **Single broken locator**
  Satu locator rusak dan sistem mencoba memperbaikinya.
- **Multiple broken locators**
  Beberapa locator rusak dalam satu flow dan diperbaiki secara berurutan.

Skenario ini cocok untuk demonstrasi awal, tetapi eksperimen formal TA masih akan diperluas ke skenario yang lebih terstruktur.

## Output yang Dihasilkan

Setelah pengujian berjalan, repo dapat menghasilkan artefak berikut:

- `healing-results/results.json`
  Ringkasan hasil healing
- `healing-results/snapshots/`
  Snapshot DOM saat kegagalan terjadi
- `playwright-report/`
  HTML report dari Playwright
- `test-results/`
  Artefak hasil test

## GitHub Actions

Workflow `.github/workflows/playwright.yml` saat ini menjalankan:

1. `npm ci`
2. install browser Playwright
3. `npx playwright test`
4. `npm run post-heal` pada event `push`
5. upload artifact report dan healing results

Dengan desain ini, permanensi perbaikan dilakukan sebagai **post-run workflow**, bukan inline di tengah test.

## Batasan Saat Ini

Beberapa batasan implementasi yang masih relevan:

- Validator saat ini memeriksa apakah locator kandidat menemukan minimal satu elemen, belum melakukan semantic verification penuh.
- Metrik seperti `false healing` dan `patch success rate` end-to-end masih perlu diperdalam untuk kebutuhan analisis penelitian.
- Demo yang tersedia saat ini masih dominan berbasis fixture HTML, sehingga eksperimen formal dengan mutasi DOM runtime masih perlu diperluas.
- Sistem ini masih berfokus pada kegagalan locator UI, bukan kegagalan logika bisnis aplikasi secara umum.

Bagian ini penting karena repo ini adalah artefak penelitian yang masih terus disempurnakan, bukan sistem final yang seluruh aspeknya sudah dikunci.

## Nilai Penelitian

Kontribusi utama proyek ini terletak pada kombinasi berikut:

- pemanfaatan LLM untuk memperbaiki locator UI secara kontekstual,
- pemisahan antara runtime healing dan permanent healing,
- validasi hasil healing sebelum perubahan diadopsi,
- auto-patching ke source test,
- serta integrasi ke workflow CI/CD modern.

Dengan demikian, proyek ini tidak hanya mencoba membuat test “tetap lulus”, tetapi juga berusaha menghasilkan perbaikan yang dapat diaudit dan dipermanenkan secara bertanggung jawab.

## Catatan

- Repo ini menggunakan **repo pribadi** untuk workflow patch, branch, commit, push, dan PR automation.
- Aplikasi target penelitian berada pada konteks industri, tetapi eksperimen dijalankan dengan kontrol penuh dari sisi automation test.
- Dokumentasi teknis internal tambahan tersedia di `AGENTS.md` dan `CLAUDE.md`.

## Kontak

Untuk keperluan akademik atau diskusi proyek:

- **Author:** Wildan Syukri Niam
- **Context:** Tugas Akhir S1 Rekayasa Perangkat Lunak, Telkom University
