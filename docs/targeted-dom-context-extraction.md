# Targeted DOM Context Extraction Development Brief

Dokumen ini adalah konteks kerja untuk AI agent yang akan mengembangkan peningkatan Phase 2 pada sistem self-healing test automation.

Tujuannya: membuat sistem tidak lagi bergantung pada pengiriman full DOM yang dipotong, karena pendekatan itu berisiko gagal saat digunakan pada aplikasi besar seperti OmniX yang memakai React dan Ant Design.

## Keputusan Teknis

Jangan langsung implement full DOM diff.

Yang harus dikembangkan lebih dulu adalah **pengambilan kandidat elemen relevan** dari DOM runtime.

Alasan:

- Full DOM yang dipotong bisa membuat elemen target tidak ikut terkirim ke LLM.
- Full DOM diff pada React/Ant Design bisa terlalu berisik karena banyak perubahan DOM kecil yang tidak relevan.
- Daftar kandidat elemen lebih mudah diuji sebelum melibatkan LLM.
- Jika elemen target tidak masuk kandidat, LLM hampir pasti tidak bisa memilih locator yang benar.

## Masalah Implementasi Saat Ini

Alur Phase 2 saat ini:

```text
page.content()
-> cleanDom()
-> potong sampai HEALING_DOM_MAX_CHARS
-> kirim ke prompt LLM
```

Ini cukup untuk halaman dummy kecil, tetapi berisiko pada OmniX:

- DOM halaman bisa sangat panjang.
- Elemen target bisa berada di bagian DOM yang terpotong.
- Ant Design menghasilkan banyak wrapper `div`, class, modal, dropdown, dan table structure.
- LLM bisa menerima konteks yang tidak memuat elemen yang seharusnya di-heal.

## Tujuan Development

Buat modul baru yang mengambil daftar elemen kandidat dari DOM runtime, lalu kirim kandidat tersebut ke LLM sebagai konteks utama.

Target alur baru:

```text
locator gagal
-> ambil DOM runtime
-> bersihkan DOM dasar
-> ekstrak kandidat elemen relevan
-> ranking kandidat
-> kirim top kandidat + failure context ke LLM
-> validasi locator hasil LLM
```

Full DOM boleh tetap ada sebagai fallback, tetapi bukan konteks utama.

## Scope Yang Harus Dibangun

### 1. Tambahkan action type ke healing context

Saat wrapper memanggil proses healing, sistem perlu tahu jenis aksi yang gagal.

Contoh action type:

- `click`
- `fill`
- `select`
- `getText`
- `waitForVisible`
- `isVisible`

File yang kemungkinan disentuh:

- `src/self-healing/types/index.ts`
- `src/self-healing/playwright/wrapper.ts`

Contoh data:

```ts
actionType: 'fill'
```

Tujuan:

- `fill` fokus ke input, textarea, textbox, combobox.
- `click` fokus ke button, link, menu item, icon button, row action.
- `select` fokus ke select, combobox, dropdown.

### 2. Buat modul DOM context extractor

Buat file baru:

```text
src/self-healing/openai/dom-context-extractor.ts
```

Modul ini bertugas mengubah DOM besar menjadi daftar kandidat elemen.

Elemen yang harus dipertimbangkan:

- `input`
- `textarea`
- `select`
- `button`
- `a`
- elemen dengan `role`
- elemen dengan `aria-label`
- elemen dengan `placeholder`
- elemen dengan `name`
- elemen dengan `data-testid`, `data-test`, atau `data-cy`
- elemen Ant Design seperti `ant-input`, `ant-btn`, `ant-select`, `ant-picker`, `ant-modal`, `ant-drawer`, `ant-table`

Atribut yang perlu disimpan:

- tag
- id
- name
- type
- placeholder
- role
- aria-label
- aria-labelledby
- data-testid
- data-test
- data-cy
- title
- class penting
- text pendek
- label terdekat
- parent context singkat
- row context jika berada di table
- modal/drawer context jika berada di modal/drawer

Jangan simpan full HTML panjang untuk setiap kandidat.

### 3. Ranking kandidat

Buat scoring sederhana agar kandidat paling relevan muncul di atas.

Faktor scoring:

- kecocokan kata dari `stepName`
- kecocokan kata dari old locator
- kecocokan dengan action type
- atribut stabil seperti `data-testid`, `name`, `aria-label`, `placeholder`, `id`
- text atau label yang mirip dengan step
- kandidat berada di modal/drawer/table yang sesuai dengan step

Contoh:

Jika step adalah `Isi email`, maka kandidat dengan:

```html
<input name="email" placeholder="Email">
```

harus punya skor lebih tinggi daripada:

```html
<input name="password" placeholder="Password">
```

### 4. Ubah prompt agar memakai kandidat

Update:

```text
src/self-healing/openai/prompt-builder.ts
```

Prompt baru sebaiknya berisi:

- test name
- step name
- action type
- page URL
- old locator
- error message
- daftar kandidat elemen

Jangan kirim full cleaned DOM jika kandidat sudah cukup.

Contoh isi prompt:

```text
Old locator: #username
Action: fill
Step: Isi email

Candidate elements:
1. tag=input, id=user-email, name=email, placeholder=Email
2. tag=input, id=user-password, name=password, placeholder=Password
3. tag=button, id=btn-login, text=Login

Return the best replacement locator as JSON only.
```

### 5. Fallback jika kandidat buruk

Jika kandidat kosong atau terlalu sedikit, sistem boleh fallback ke cleaned DOM terbatas.

Fallback yang disarankan:

- kirim cleaned DOM seperti implementasi lama,
- atau kirim section DOM aktif seperti form, modal, drawer, atau table yang relevan.

Jangan langsung menghapus mekanisme lama. Pakai sebagai safety net.

## Validasi Yang Wajib Dibuat

Jangan langsung menilai LLM.

Pertama, validasi extractor dulu.

Pertanyaan utama:

> Apakah elemen target yang benar masuk ke daftar kandidat?

Jika target tidak masuk kandidat, LLM tidak bisa disalahkan.

### Buat test tanpa OpenAI

Buat fixture HTML dummy yang lebih mirip OmniX/Ant Design.

Contoh file:

```text
tests/fixtures/omni-like.html
tests/dom-context-extractor.spec.ts
```

Skenario minimal:

- form login dengan input email dan password
- search/filter form
- modal dengan tombol `Save`
- drawer filter
- Ant Design-like select/combobox
- table dengan banyak tombol `Detail`
- icon button dengan `aria-label`
- beberapa elemen dengan text yang sama
- custom clickable div tanpa role sebagai negative case

### Tambahkan ground truth

Setiap target benar diberi marker hanya untuk test extractor.

Contoh:

```html
<input data-eval-target="email-input" id="user-email" name="email">
```

Marker ini hanya untuk test, jangan dikirim ke LLM.

### Ukuran keberhasilan awal

Untuk setiap skenario, cek:

- target benar masuk top 10 kandidat,
- target benar masuk top 20 kandidat,
- jumlah kandidat tidak terlalu besar,
- ukuran prompt lebih kecil dari full DOM,
- kandidat tetap memuat konteks yang cukup.

Nama metrik sederhana:

- `targetInTop10`
- `targetInTop20`
- `candidateCount`
- `promptChars`
- `fullDomChars`

### Kriteria awal

Kriteria awal yang diharapkan:

- easy case: target masuk top 10
- medium case: target masuk top 20
- hard case: target minimal masuk kandidat, walaupun rank belum selalu tinggi
- negative case boleh gagal, tetapi harus dicatat kenapa gagal

## Negative Cases Yang Harus Diakui

Extractor bisa gagal jika:

- elemen klik hanya `div` biasa tanpa role,
- tidak ada `aria-label`, `data-testid`, text unik, atau label,
- banyak elemen sama persis tanpa row context,
- target muncul setelah interaksi yang belum dibuka seperti dropdown belum diklik,
- target berada di iframe atau canvas.

Jangan sembunyikan ini. Catat sebagai batasan sistem.

## Hubungan Dengan DOM Diff

DOM diff belum menjadi prioritas pertama.

Jika targeted extraction sering gagal, baru pertimbangkan diff ringan.

Diff yang disarankan bukan full HTML diff, tetapi perbandingan daftar elemen penting:

```text
baseline element inventory
vs
current element inventory
```

Tujuannya mencari perubahan atribut penting seperti:

- id berubah,
- name tetap,
- placeholder tetap,
- text tetap,
- data-testid berubah.

Jangan implement full DOM diff mentah kecuali ada alasan kuat dari hasil pengujian.

## Output Development Yang Diharapkan

AI agent yang mengerjakan task ini sebaiknya menghasilkan:

- `dom-context-extractor.ts`
- tipe data kandidat elemen
- action type pada healing context
- prompt builder yang mendukung candidate elements
- fallback ke cleaned DOM lama
- test extractor tanpa OpenAI
- fixture HTML OmniX-like/Ant Design-like
- dokumentasi singkat di README atau AGENTS jika perlu

## Cara Menilai Selesai

Task ini dianggap selesai jika:

- `npm run type-check` berhasil,
- test extractor berhasil,
- output kandidat bisa dilihat/logged dengan jelas,
- prompt baru tidak lagi bergantung penuh pada full DOM,
- fallback lama tetap tersedia,
- dan hasil test menunjukkan target benar masuk kandidat pada mayoritas skenario dummy.

## Catatan Penting Untuk Agent

Jangan over-engineer.

Fokus pertama:

1. target masuk kandidat,
2. prompt lebih kecil,
3. LLM punya konteks yang cukup,
4. test bisa membuktikan hasilnya.

Jangan mengklaim akurasi LLM meningkat sebelum ada hasil eksperimen.

