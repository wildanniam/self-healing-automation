# PRODUCT REQUIREMENTS DOCUMENT (PRD) - TA INDUSTRI
**Project Title:** Pengembangan Sistem Self-Healing Test Automation Berbasis Large Language Model (LLM) untuk Meningkatkan Reliabilitas Pengujian dalam CI/CD Pipeline
**Author:** Wildan Syukri Niam
**Version:** 2.1 (Revised — Playwright + DOM Differencing + GitHub)
**Status:** In Development

---

## 1. CONTEXT & BACKGROUND
Otomasi pengujian UI menghadapi tantangan fragilitas locator. Perubahan minor pada Document Object Model (DOM) seperti modifikasi atribut elemen atau ID seringkali memicu false failures. Hal ini mengganggu stabilitas pipeline CI/CD dan membebani tim Quality Assurance (QA) dengan debugging manual yang repetitif.

Sistem ini menggantikan mekanisme self-healing konvensional (rule-based) yang kaku dengan pendekatan berbasis reasoning dari Large Language Model (LLM). Keunggulan utama sistem ini adalah penggunaan **DOM Differencing** — membandingkan DOM saat kegagalan terjadi dengan Baseline DOM yang tersimpan — sehingga LLM menerima konteks *perubahan* yang presisi, bukan sekadar DOM mentah. Pendekatan ini menghasilkan perbaikan locator yang lebih adaptif dan akurat untuk UI yang kompleks.

---

## 2. GOALS & OBJECTIVES
- **Automated Recovery**: Mengidentifikasi kegagalan locator secara otomatis selama eksekusi test suite.
- **DOM Differencing**: Membandingkan DOM elemen yang gagal dengan Baseline Store untuk memberikan konteks perubahan yang presisi kepada LLM.
- **LLM-Based Healing**: Menghasilkan rekomendasi locator baru menggunakan reasoning LLM berdasarkan hasil diff DOM yang informatif.
- **Verification & Stability**: Memvalidasi akurasi locator baru langsung di browser sebelum diterapkan secara permanen.
- **Auto-Patching**: Mengotomatisasi pembaruan file test dan membuat Pull Request ke GitHub untuk review developer.
- **Comparative Evaluation**: Membandingkan efektivitas LLM-based healing dengan rule-based self-healing konvensional sebagai baseline penelitian.

---

## 3. TECHNICAL STACK
- **Core Framework**: Playwright (Node.js/TypeScript)
- **LLM Engine**: OpenAI API (GPT-4o atau GPT-3.5 Turbo)
- **CI/CD Integration**: Jenkins & GitHub
- **Automation Libraries**: OpenAI SDK, Simple-Git, Axios
- **Object Study**: Aplikasi OmniX

---

## 4. PIPELINE SISTEM

```
Mulai CI/CD Pipeline
        ↓
Baseline Tersedia?
  ├── Belum → Buat Baseline Awal → Eksekusi Test Case
  └── Sudah → Eksekusi Test Case
        ↓
Test Gagal?
  ├── Tidak → Selesai (Pipeline Hijau)
  └── Ya → Analisis DOM Differencing
              ↓
        Kirim ke LLM (Diff & Konteks Elemen)
              ↓
        LLM Menghasilkan Locator Baru
              ↓
        Locator Baru Sesuai?
          ├── Ya → Patch Locator & Buat Pull Request
          │          → Perbarui Baseline
          │          → Selesai (Pipeline Hijau)
          └── Tidak → Sudah 3x Percobaan?
                        ├── Belum → kembali ke LLM
                        └── Sudah → Catat & Laporkan Kegagalan
                                    → Selesai (Pipeline Merah)
```

---

## 5. FUNCTIONAL REQUIREMENTS

### Phase 0: Baseline Capture System *(Fondasi)*
- **Baseline Capturer**: Menjalankan seluruh test case dalam mode capture untuk merekam DOM context per elemen saat test berhasil. Dijalankan sekali sebelum pipeline pertama (`npm run baseline:capture`).
- **Baseline Store**: Menyimpan DOM context per elemen dalam format JSON (`baseline-snapshots/`). Di-commit ke repository sebagai source of truth.
- **Baseline Updater**: Memperbarui Baseline Store setelah Pull Request healing di-merge oleh developer (`npm run baseline:update`). Baseline tidak diperbarui otomatis — hanya setelah validasi developer.

### Phase 1: Failover & Interception
- **Wrapper Mechanism**: Membangun wrapper function di atas Playwright locator actions (`safeClick`, `safeFill`, `safeSelectOption`, dll).
- **Error Catching**: Menangkap `TimeoutError` atau `ElementNotFoundException` menggunakan blok try-catch.
- **Failure Trigger**: Saat error tertangkap, sistem memicu proses self-healing dengan membawa konteks lengkap (locator, nama test, nama step, URL).

### Phase 2: DOM Differencing *(Core Innovation)*
- **DOM Context Capture**: Mengambil DOM context elemen yang gagal (elemen target + parent 2 level + sibling), bukan seluruh halaman.
- **DOM Cleaning**: Membersihkan tag yang tidak relevan (`script`, `style`, `svg`, `noscript`, `iframe`) sebelum diff dilakukan.
- **Differencing**: Membandingkan DOM context saat gagal dengan entri di Baseline Store. Menghasilkan diff yang menunjukkan apa yang berubah secara eksplisit.

### Phase 3: LLM Prompting
- **Prompt Structure**: Prompt menyertakan hasil DOM diff (bukan full DOM), locator lama yang rusak, konteks test, dan instruksi output dalam format JSON `{"new_locator": "..."}`.
- **Locator Priority**: LLM diarahkan untuk memprioritaskan locator semantik: `data-testid` → `aria-label` → `role + text` → CSS atribut. XPath dan positional selector dihindari.

### Phase 4: Validation & Healing Logic
- **Runtime Validation**: Locator hasil rekomendasi LLM diuji langsung di browser — elemen harus ditemukan dan aksi harus berhasil dijalankan.
- **Retry Mechanism**: Jika validasi gagal, sistem melakukan looping request ke LLM maksimal 3 kali. Setiap retry menyertakan informasi mengapa percobaan sebelumnya gagal.

### Phase 5: Auto-Patching & GitHub Pull Request
- **File Update**: Sistem memindai file `.spec.ts` dan mengganti locator lama dengan yang baru menggunakan regex yang aman.
- **Bot Commit**: Automated commit dengan branch baru format `auto-healing/[test-name]`.
- **PR Creation**: Pull Request dibuka di GitHub agar dapat ditinjau oleh developer sebagai bentuk transparansi perubahan.

### Phase 6: Rule-Based Self-Healing *(Sistem Pembanding)*
- Implementasi self-healing tanpa LLM menggunakan strategi heuristik berurutan: ID → name → aria-label → CSS class → text.
- Digunakan sebagai sistem pembanding dalam eksperimen penelitian untuk mengukur keunggulan LLM-based approach.

---

## 6. EXPERIMENT METRICS

### Metrik Utama
1. **Success Rate**: Persentase keberhasilan perbaikan locator — dibandingkan antara LLM-based vs Rule-based.
2. **Healing Efficiency**: Waktu rata-rata proses healing per kasus (rule-based vs LLM-based).
3. **Pipeline Reliability**: Peningkatan pass rate pada pipeline Jenkins setelah sistem aktif.

### Metrik Tambahan
4. **Locator Quality**: Kualitas locator yang dihasilkan (resilience terhadap perubahan UI berikutnya).
5. **False Healing Rate**: Persentase kasus di mana locator "berhasil" di-heal tapi menunjuk elemen yang salah.
6. **Retry Distribution**: Distribusi jumlah percobaan LLM yang dibutuhkan per kasus (1x, 2x, 3x, gagal).

---

## 7. MILESTONE IMPLEMENTASI

| Milestone | Deskripsi | Status |
|---|---|---|
| M1 | Playwright Wrapper & Infrastruktur Dasar | ✅ Selesai |
| M2 | LLM Integration (DOM Cleaner, Prompt Builder, LLM Client) | ✅ Selesai |
| M3 | Validation & Healing Orchestration | ✅ Selesai |
| M4 | Auto-Patching & GitHub Pull Request | ✅ Selesai |
| M5 | Baseline Capture & DOM Differencing | 🔧 In Progress |
| M6 | Rule-Based Self-Healing (Pembanding) | ⏳ Planned |
| M7 | Test Case OmniX & Eksperimen | ⏳ Planned |
| M8 | Observability & Jenkins Integration | ⏳ Planned |

---

## 8. INSTRUCTIONS FOR AI AGENT
> "Anda bertugas sebagai Senior SDET untuk mengimplementasikan arsitektur ini. Gunakan prinsip modularity pada setiap Phase. Pastikan penanganan API OpenAI bersifat asinkron, sistem DOM Differencing menggunakan Baseline Store berbasis JSON, dan patching file menggunakan regex yang aman agar tidak merusak struktur kode lain di dalam file test. Semua perubahan locator harus melalui Pull Request di GitHub sebelum diterapkan secara permanen."
