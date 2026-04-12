# Self-Healing Test Automation Berbasis LLM

Prototype Tugas Akhir untuk memperbaiki locator UI test yang rusak secara otomatis menggunakan Large Language Model (LLM), Playwright, dan TypeScript.

Sistem ini dibuat untuk membantu proses maintenance UI test automation. Ketika locator seperti `#username`, `[data-testid="submit"]`, atau `.ant-btn-primary` tidak lagi cocok dengan DOM terbaru, test biasanya gagal walaupun fitur aplikasi sebenarnya masih berjalan. Repo ini mencoba menangani kasus tersebut dengan alur self-healing yang tetap divalidasi sebelum hasilnya dipakai dan dipermanenkan.

## Konteks Proyek

| Item | Keterangan |
| --- | --- |
| Jenis proyek | Tugas Akhir / penelitian terapan |
| Penulis | Wildan Syukri Niam |
| Program studi | S1 Rekayasa Perangkat Lunak, Telkom University |
| Studi kasus industri | PT Infomedia Nusantara |
| Target konteks | Pengujian UI aplikasi web, khususnya scenario OmniX |
| Stack utama | Playwright, TypeScript, Node.js, OpenAI SDK, GitHub Actions |

Repo ini adalah prototype penelitian. Fokusnya bukan membuat framework testing production-ready, tetapi membuktikan apakah locator yang rusak dapat dipulihkan secara otomatis, divalidasi saat runtime, lalu dijadikan patch yang bisa direview.

## Masalah yang Diselesaikan

UI test sering gagal karena locator berubah. Contohnya:

```text
locator lama: #password
DOM baru:     <input id="user-password" name="password" />
```

Pada kondisi seperti ini, kegagalan test bukan berarti fitur aplikasi rusak. Yang rusak adalah cara test menemukan elemen UI.

Masalah yang ingin dikurangi:

- false failure pada pipeline CI/CD,
- maintenance locator yang repetitif,
- waktu debugging QA yang terbuang,
- dan keterlambatan feedback ketika UI berubah tetapi behavior masih benar.

## Cara Kerja Sistem

Alur self-healing terbaru:

```text
Playwright test memanggil wrapper
-> locator gagal
-> wrapper mengambil konteks error dan DOM runtime
-> sistem mengekstrak kandidat elemen dari live DOM
-> kandidat diberi ranking berdasarkan action, step, locator lama, atribut, dan konteks
-> kandidat terbaik dikirim ke LLM
-> LLM memilih locator pengganti
-> validator mengecek locator di browser aktif
-> wrapper mencoba ulang action dengan locator baru
-> hasil healing disimpan
-> post-heal dapat membuat patch, branch, commit, push, dan Pull Request
```

Sistem dibagi menjadi dua bagian:

1. **Runtime healing**
   Memulihkan locator saat test sedang berjalan agar action dapat dicoba ulang.

2. **Permanent healing**
   Memermanenkan locator hasil healing ke file test melalui proses `post-heal`, sehingga perubahan bisa direview lewat Pull Request.

## Phase 2 Terbaru: Candidate Context, Bukan Full DOM

Perubahan terpenting pada versi terbaru ada di Phase 2.

Pendekatan lama:

```text
ambil full DOM
-> bersihkan DOM
-> potong sampai batas karakter
-> kirim ke LLM
```

Pendekatan lama cukup untuk halaman kecil, tetapi berisiko pada aplikasi besar seperti OmniX. DOM bisa sangat panjang, sehingga elemen target dapat terpotong dan tidak ikut terkirim ke LLM.

Pendekatan baru:

```text
ambil live DOM
-> ekstrak kandidat elemen penting
-> ranking kandidat
-> kirim top kandidat + suggested locator ke LLM
```

Contoh kandidat yang dikirim ke LLM:

```text
1. tag=input, id="user-email", name="email", placeholder="Email", locators=[#user-email | [name="email"]]
2. tag=input, id="user-password", name="password", placeholder="Password", locators=[#user-password | [name="password"]]
3. tag=button, text="Login", locators=[#login-button]
```

Dengan cara ini, LLM tidak diminta membaca seluruh halaman. LLM diarahkan memilih locator dari kandidat yang sudah dipersempit dan diberi konteks.

## Fitur Utama

- Wrapper Playwright untuk `click`, `fill`, `selectOption`, `getText`, `waitForVisible`, dan `isVisible`.
- Runtime DOM snapshot saat locator gagal.
- Candidate element extraction dari live DOM menggunakan `page.evaluate()`.
- Ranking kandidat berdasarkan `actionType`, `oldLocator`, `stepName`, atribut stabil, text, label, row context, parent context, dan container context.
- Suggested locator generation seperti `#id`, `[data-testid="..."]`, `[name="..."]`, `[aria-label="..."]`, dan `[placeholder="..."]`.
- Prompt builder yang mengirim kandidat elemen ke LLM.
- Fallback ke cleaned DOM jika kandidat tidak cukup.
- Runtime validator yang menolak locator ambigu, hidden, disabled, atau tidak cocok dengan action.
- Status `action_failed` jika locator valid tetapi action Playwright tetap gagal.
- Healing result dan DOM snapshot untuk debugging.
- Metrics collector untuk membaca hasil healing.
- Auto-patching file `.spec.ts` berdasarkan hasil healing yang valid.
- GitHub branch, commit, push, dan Pull Request automation.
- GitHub Actions untuk test, post-heal, dan upload artifact.
- Demo mode untuk kebutuhan presentasi TA.

## Status Implementasi

| Area | Status | Keterangan |
| --- | --- | --- |
| Phase 1 - Wrapper & interception | Implemented | Wrapper Playwright untuk aksi utama sudah aktif |
| Phase 2 - Candidate DOM context | Implemented | Extractor, ranker, suggested locators, prompt builder, dan fallback DOM sudah tersedia |
| Phase 3 - Runtime validation | Implemented | Orchestrator, validator ketat, retry, result store, dan status `action_failed` sudah berjalan |
| Phase 4 - Auto-patching | Implemented | `post-heal` dapat mengganti locator di file test berdasarkan hasil healing |
| Phase 4 - GitHub PR automation | Implemented | Branch, commit, push, dan PR creator sudah tersedia |
| Phase 5 - CI/CD & metrics | Implemented (basic) | GitHub Actions, artifact upload, report, dan metrics dasar sudah tersedia |
| Experiment readiness | In progress | Perlu stress fixture yang lebih kompleks untuk validasi terhadap pola OmniX/Ant Design |

## Struktur Repository

```text
src/self-healing/
  config.ts
  index.ts
  types/
    index.ts
  playwright/
    wrapper.ts
  openai/
    dom-cleaner.ts
    dom-context-extractor.ts
    candidate-ranker.ts
    prompt-builder.ts
    llm-client.ts
    llm-tracer.ts
    pricing.ts
  core/
    healing-orchestrator.ts
    locator-validator.ts
    results-store.ts
    metrics-collector.ts
    file-patcher.ts
  git/
    git-service.ts
    github-pr-creator.ts

scripts/
  demo.ts
  post-heal.ts

tests/
  self-healing-demo.spec.ts
  dom-context-extractor.spec.ts
  locator-validator.spec.ts
  action-failed.spec.ts
  metrics-collector.spec.ts
  file-patcher.spec.ts
  git-service.spec.ts
  fixtures/
    demo.html
    omni-like-*.html
    validator-test.html

docs/
  targeted-dom-context-extraction.md
```

## Persiapan Environment

### Prasyarat

- Node.js LTS
- npm
- Playwright browser dependencies
- OpenAI API key
- GitHub token jika ingin menjalankan PR automation

### Setup

Install dependency:

```bash
npm ci
```

Install browser Playwright:

```bash
npx playwright install --with-deps
```

Salin file environment:

```bash
cp .env.example .env
```

Isi minimal:

```env
OPENAI_API_KEY=sk-...your-api-key...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=500
OPENAI_TEMPERATURE=0
HEALING_MAX_RETRIES=3
HEALING_DOM_MAX_CHARS=8000
```

Jika ingin menjalankan `post-heal` sampai Pull Request:

```env
GITHUB_TOKEN=ghp_...your-token...
GITHUB_REPO=owner/repo
GIT_BRANCH_PREFIX=auto-healing
GIT_COMMIT_MSG_PREFIX=chore(self-healing)
```

Jangan commit file `.env`.

## Cara Menjalankan

Menjalankan semua test:

```bash
npm test
```

Menjalankan type-check:

```bash
npm run type-check
```

Menjalankan test dengan browser terlihat:

```bash
npm run test:headed
```

Menjalankan mode debug:

```bash
npm run test:debug
```

Menjalankan demo end-to-end:

```bash
npm run demo
```

Menjalankan post-heal:

```bash
npm run post-heal
```

Menjalankan post-heal tanpa membuat perubahan git/PR:

```bash
npm run post-heal:dry
```

## Test yang Disarankan

Untuk validasi cepat setelah perubahan kode:

```bash
npm run type-check
```

Untuk test utama self-healing:

```bash
npx playwright test tests/locator-validator.spec.ts tests/action-failed.spec.ts tests/dom-context-extractor.spec.ts tests/file-patcher.spec.ts tests/example.spec.ts --project=chromium
```

Untuk metrics dan git helper:

```bash
npx playwright test tests/metrics-collector.spec.ts tests/git-service.spec.ts --project=chromium
```

## Output yang Dihasilkan

Setelah test atau demo berjalan, repo dapat menghasilkan:

```text
healing-results/results.json
healing-results/snapshots/
playwright-report/
test-results/
```

Keterangan:

- `results.json` menyimpan status healing seperti `healed`, `failed`, `skipped`, dan `action_failed`.
- `snapshots/` menyimpan DOM saat kegagalan terjadi.
- `playwright-report/` menyimpan HTML report dari Playwright.
- `test-results/` menyimpan artifact eksekusi test.

## GitHub Actions

Workflow `.github/workflows/playwright.yml` menjalankan:

1. install dependency,
2. install browser Playwright,
3. menjalankan Playwright test,
4. menjalankan `post-heal` pada event `push`,
5. upload Playwright report dan healing results sebagai artifact.

Permanensi perbaikan dilakukan setelah test selesai, bukan inline di tengah eksekusi test. Desain ini membuat proses patch dan PR lebih mudah diaudit.

## Batasan Saat Ini

Repo ini sudah dapat digunakan untuk demo dan validasi awal, tetapi belum boleh diklaim robust untuk semua aplikasi web modern.

Batasan penting:

- Demo login masih terlalu sederhana untuk membuktikan robustness pada OmniX.
- Fixture Ant Design-like sudah membantu, tetapi belum sama dengan aplikasi industri nyata.
- `safeSelectOption` saat ini aman untuk native `<select>`, bukan seluruh custom select Ant Design.
- Dropdown, menu, atau portal yang belum terbuka saat snapshot diambil bisa tidak masuk kandidat.
- Icon-only button tanpa `aria-label`, text, atau atribut pembeda masih rawan gagal.
- Table dengan banyak tombol identik tetap membutuhkan row context yang jelas.
- Sistem fokus pada locator failure, bukan kegagalan logic bisnis aplikasi.
- False healing dan patch success rate masih perlu dirapikan sebagai metrik eksperimen formal.

## Arah Eksperimen Berikutnya

Langkah berikutnya yang paling penting adalah membuat stress fixture yang lebih mirip OmniX/Ant Design.

Fixture sebaiknya memuat:

- dashboard layout,
- sidebar panjang,
- topbar,
- filter form,
- table 30-50 row,
- tombol detail/edit/delete berulang,
- modal form,
- drawer filter,
- class Ant Design-like,
- hidden dan disabled elements,
- duplicate text,
- target elemen yang muncul jauh setelah banyak noise DOM.

Sebelum menilai kualitas LLM, extractor dan ranker perlu diuji dulu dengan metrik:

- `targetInTop10`
- `targetInTop20`
- `candidateCount`
- `promptChars`
- `fullDomChars`

Prinsipnya sederhana: kalau target elemen tidak masuk daftar kandidat, kegagalan tidak bisa sepenuhnya dianggap sebagai kegagalan LLM.

## Nilai Penelitian

Kontribusi utama prototype ini ada pada kombinasi:

- self-healing locator berbasis LLM,
- candidate-based DOM context agar prompt lebih fokus,
- validasi runtime sebelum locator dipakai ulang,
- pemisahan runtime healing dan permanent healing,
- auto-patching ke source test,
- dan integrasi ke workflow CI/CD melalui Pull Request.

Dengan desain ini, sistem tidak hanya membuat test mencoba lanjut, tetapi juga menghasilkan perubahan locator yang dapat dicek, diaudit, dan dipermanenkan.

## Dokumen Tambahan

- `docs/targeted-dom-context-extraction.md` - brief teknis Phase 2 terbaru.
- `AGENTS.md` - panduan untuk AI agent yang bekerja di repo ini.
- `healing-results/` - output runtime setelah test berjalan.

## Kontak

Untuk keperluan akademik atau diskusi proyek:

- **Author:** Wildan Syukri Niam
- **Context:** Tugas Akhir S1 Rekayasa Perangkat Lunak, Telkom University
