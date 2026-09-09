# Rekap Tartun — LaporanServer

Rekonsiliasi data **Otomax (Mutasi Reseller)** dengan mutasi **BCA, Mandiri, BRI** (dan opsional QRIS).
Semua parsing & pencocokan berjalan di browser; server hanya untuk **menyimpan riwayat** hasil analisa harian.

## Format sumber yang diterima (deteksi otomatis)

Tiap kotak punya tombol **📁 Buka file** (atau tempel manual).

| Sumber | Format |
| --- | --- |
| **Otomax** | `.xlsx` ekspor Otomax (dibaca langsung di browser), atau tempel TSV `Tanggal · Nama Reseller · Jumlah · Keterangan` |
| **BRI** | CSV ekspor resmi (`ID,NOREK,TGL_TRAN,…,TRREMK,…,REMARK_CUSTOM`) — atau tempel format BRImo (3 baris/transaksi) |
| **BCA** | CSV ekspor "Informasi Rekening" (`Tanggal Transaksi,Keterangan,Cabang,Jumlah,Saldo`) — atau tempel e-statement |
| **Mandiri** | CSV ekspor titik-koma (`AccountNo;Ccy;PostDate;Remarks;…;Credit Amount;Debit Amount;…`) — atau tempel Livin |
| **QRIS (slot 5)** | CSV mutasi rekening penampung QRIS (baris `KR OTOMATIS MID : <mid> <merchant> QR : <bruto> DDR : <fee>`, diagregat per merchant, **nilai bruto** dicocokkan ke `TARTUN QR BULK`); atau settlement BCA Merchant agregat (`Merchant Name · ID · Frequency · Amount`); atau file lama format Otomax |

Setoran BCA yang di Otomax hanya tercatat generik ("Auto Deposit BCA", tanpa referensi) disandingkan ke kredit bank **per nominal unik** (status "cocok (nominal)"). Merchant QRIS yang namanya beda dari outlet Otomax bisa disandingkan manual di tab Rekonsiliasi — pilihan disimpan per Merchant ID (`localStorage`).

## Stack

- **Node.js ≥ 22.5** + **Express 4**
- **SQLite** lewat modul bawaan `node:sqlite` (tanpa native build) — file DB di `data/rekap.db`
- Front-end: satu file `public/index.html`, vanilla JS, tanpa framework/bundler

## Jalankan lokal

```bash
npm install
npm start
# buka http://localhost:3000
```

`npm run dev` untuk mode auto-reload.

## Konfigurasi (env)

| Env            | Default        | Keterangan                                            |
| -------------- | -------------- | ----------------------------------------------------- |
| `PORT`         | `3000`         | Port HTTP                                             |
| `DATA_DIR`     | `./data`       | Lokasi file SQLite                                    |
| `APP_PASSWORD` | *(kosong)*     | Bila diisi → halaman minta login (1 password bersama) |
| `HOST_PORT`    | `3000`         | Port di sisi host (compose). Ganti kalau 3000 dipakai |

Auth: password tunggal, sesi disimpan di memori server (hilang saat restart — cukup untuk pemakaian di jaringan rumah).

## Deploy ke ZimaOS (Docker)

```bash
# opsional: buat .env
echo 'HOST_PORT=3100'          >  .env   # kalau port 3000 sudah dipakai
echo 'APP_PASSWORD=rahasia123' >> .env   # kalau mau langsung pakai password

docker compose up -d --build
```

Buka `http://<ip-host>:<HOST_PORT>`. Data persist di `./data` (bind-mount). Health check: `GET /healthz`.

## API

| Method + path            | Fungsi                                              |
| ------------------------ | -------------------------------------------------- |
| `GET /api/session`          | status auth                                        |
| `POST /api/login`           | `{ password }` → set cookie sesi                   |
| `POST /api/logout`          | hapus sesi                                         |
| `GET /api/db/info`          | jumlah baris, ukuran file, rentang tanggal         |
| `GET /api/snapshots`        | daftar riwayat (`?limit=`, atau `?full=1`)         |
| `POST /api/snapshots`       | `{ tanggal, catatan, sumber, ringkasan }` → simpan |
| `GET /api/snapshots/:id`    | ambil satu (termasuk teks sumber)                  |
| `PATCH /api/snapshots/:id`  | `{ tanggal?, catatan? }` → ubah                    |
| `DELETE /api/snapshots/:id` | hapus satu                                         |
| `POST /api/snapshots/hapus-semua` | `{ konfirmasi: "HAPUS SEMUA" }` → kosongkan  |
| `POST /api/password`        | `{ current?, baru }` → set / ganti password (disimpan di DB, menang atas `APP_PASSWORD`) |

## Halaman & menu

`/` — satu halaman dengan menu bar di header:

| Menu | Isi |
| --- | --- |
| **Import Data** | 5 kotak tempel + **Simpan data** (analisa + simpan ke server, ganti data tanggal yang sama). Daftar **data tersimpan** ada di bawahnya — klik **Buka** untuk membuka lagi. |
| **Rekonsiliasi** | Hasil: kartu angka + tab Ringkasan / Rekonsiliasi / Kategori (termasuk rekap per tanggal) / Per outlet. Tombol **Simpan hasil** untuk simpan ulang setelah ubah sandingan. |
| **Pengaturan** | Tema · sandingan merchant↔outlet · **konsolidasi nama outlet** (peta `ID agen → nama outlet`, mis. `PLC68 → PLC DM`, dipakai saat mutasi BCA menyebut kode tapi Otomax mencatat deposit dengan nama) · keputusan audit manual · akun (login / ganti password) · link Kelola DB · hapus data lokal. |

Header juga memuat **pemilih tanggal data** (auto dari keterangan `TGL` / kolom Tanggal, bisa diubah manual) dan toggle tema. Tanpa server, tombolnya jadi "Analisa data" saja.

`/kelola` — halaman terpisah: tabel semua snapshot, edit tanggal/catatan, lihat detail (teks mentah), hapus satu / hapus semua, info ukuran DB.

Satu *snapshot* menyimpan teks mentah yang ditempel (Otomax + tiap bank) plus ringkasan angka,
jadi bisa dibuka lagi kapan saja lewat tombol **Buka** di daftar Import Data.

## Catatan

Logika rekonsiliasi di `public/index.html` identik dengan artifact "Rekap Tartun" dan
`Downloads/Rekap Tartun.html`. Kalau aturan kategori/pencocokan diubah, samakan ketiganya.
