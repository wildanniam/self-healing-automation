# PRODUCT REQUIREMENTS DOCUMENT (PRD) - TA INDUSTRI
**Project Title:** Pengembangan Sistem Self-Healing Test Automation Berbasis Large Language Model (LLM) untuk Meningkatkan Reliabilitas Pengujian dalam CI/CD Pipeline
**Author:** Wildan Syukri Niam
**Version:** 2.0 (Migration from Katalon to Playwright)
**Status:** In Development

---

## 1. CONTEXT & BACKGROUND
Otomasi pengujian UI menghadapi tantangan fragilitas locator. Perubahan minor pada Document Object Model (DOM) seperti modifikasi atribut elemen atau ID seringkali memicu false failures. Hal ini mengganggu stabilitas pipeline CI/CD dan membebani tim Quality Assurance (QA) dengan debugging manual yang repetitif. Sistem ini bertujuan menggantikan mekanisme self-healing konvensional yang kaku dengan pendekatan berbasis reasoning dari Large Language Model (LLM) untuk menghasilkan perbaikan locator yang adaptif dan kontekstual.

## 2. GOALS & OBJECTIVES
* **Automated Recovery:** Mengidentifikasi kegagalan locator secara otomatis selama eksekusi test suite.
* **LLM-Based Healing:** Menghasilkan rekomendasi locator baru (XPath/CSS) menggunakan reasoning LLM berdasarkan konteks DOM terbaru.
* **Verification & Stability:** Memvalidasi akurasi locator baru sebelum diterapkan secara permanen untuk mencegah false healing.
* **Auto-Patching:** Mengotomatisasi proses pembaruan file skrip pengujian dan melakukan sinkronisasi kembali ke repositori GitLab melalui Pull Request (PR).

## 3. TECHNICAL STACK
* **Core Framework:** Playwright (Node.js/TypeScript)
* **LLM Engine:** OpenAI API (GPT-4o atau GPT-3.5 Turbo)
* **CI/CD Integration:** Jenkins & GitLab
* **Automation Bridge:** Node.js Native SDKs (OpenAI, Simple-Git, FS)
* **Object Study:** OmniX Application

## 4. FUNCTIONAL REQUIREMENTS (FOR AI AGENT)

### Phase 1: Failover & Interception
* **Mechanism:** Membangun wrapper function di atas Playwright locator actions (seperti click, fill, dsb).
* **Error Catching:** Sistem harus mampu menangkap TimeoutError atau ElementNotFoundException menggunakan blok try-catch.
* **Snapshot Trigger:** Saat error tertangkap, sistem mengambil snapshot DOM (HTML source) pada state aplikasi saat terjadi kegagalan.

### Phase 2: Contextual Analysis & Prompting
* **DOM Cleaning:** Sebelum dikirim ke LLM, sistem membersihkan tag yang tidak relevan (script, style, SVG) untuk efisiensi token.
* **Prompt Structure:** Prompt harus menyertakan locator lama yang rusak, potongan DOM terbaru, dan instruksi output HANYA dalam format JSON: `{"new_locator": "..."}`.

### Phase 3: Validation & Healing Logic
* **Double-Check:** Sebelum file diperbarui, locator hasil rekomendasi LLM diuji coba langsung di runtime browser untuk memastikan target elemen benar.
* **Retry Mechanism:** Jika validasi gagal, sistem melakukan looping request ke LLM maksimal 3 kali untuk mendapatkan alternatif locator.

### Phase 4: Auto-Patching & Version Control
* **File Update:** Sistem memindai file `.spec.ts` lokal dan mengganti string locator lama dengan yang baru menggunakan module `fs`.
* **Bot Commit:** Melakukan automated commit dan membuat branch baru di GitLab dengan format nama `auto-healing/[test-name]`.
* **PR Creation:** Membuka Merge Request (MR) agar dapat ditinjau oleh QA Engineer sebagai bentuk transparansi perubahan.

## 5. EXPERIMENT METRICS
1.  **Success Rate:** Perbandingan % keberhasilan perbaikan LLM dibandingkan dengan mekanisme fallback statis.
2.  **Efficiency:** Pengurangan durasi waktu maintenance dibandingkan dengan proses perbaikan manual oleh manusia.
3.  **Reliability:** Peningkatan pass rate pada pipeline Jenkins setelah sistem aktif.

---

## 6. INSTRUCTIONS FOR AI AGENT
> "Anda bertugas sebagai Senior SDET untuk mengimplementasikan arsitektur ini. Gunakan prinsip modularity pada setiap Phase. Pastikan penanganan API OpenAI bersifat asinkron dan sistem patching file menggunakan regex yang aman agar tidak merusak struktur kode lain di dalam file test."