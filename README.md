# Rekap Tartun — LaporanServer

Rekonsiliasi data **Otomax (Mutasi Reseller)** dengan mutasi **BCA, Mandiri, BRI** (dan opsional QRIS).
Semua parsing & pencocokan berjalan di browser; server hanya untuk **menyimpan riwayat** hasil analisa harian.

Slot ke-5 ("QRIS BCA / BCA Merchant") menerima **dua format**, dideteksi otomatis:
- format lama seperti Otomax (per transaksi), dicocokkan per nama outlet;
- **settlement BCA Merchant** (`Merchant Name · Merchant ID · Total Frequency · Total Amount`) — agregat per merchant, dicocokkan ke baris `TARTUN QR BULK` lewat: sandingan manual tersimpan → nama outlet → nominal unik → nama mirip. Merchant yang belum ketemu bisa disandingkan manual di tab Rekonsiliasi; pilihan disimpan per Merchant ID (`localStorage`, tidak ikut terhapus oleh "Hapus data") dan otomatis dipakai lagi.

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

Auth: password tunggal, sesi disimpan di memori server (hilang saat restart — cukup untuk pemakaian di jaringan rumah).

## Deploy ke ZimaOS (Docker)

```bash
# opsional: set password
echo 'APP_PASSWORD=rahasia123' > .env

docker compose up -d --build
```

Data persist di `./data` (bind-mount). Health check: `GET /healthz`.

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
| **Import Data** | 5 kotak tempel + Analisa. Selesai → pindah ke Rekonsiliasi. |
| **Rekonsiliasi** | Hasil: kartu angka + tab Ringkasan / Rekonsiliasi / Kategori / Per outlet + tombol Simpan. |
| **Riwayat** | Daftar snapshot tersimpan (muncul kalau server aktif). |
| **Pengaturan** | Tema · sandingan merchant↔outlet · akun (login / ganti password) · link Kelola DB · hapus data lokal. |

Header juga memuat **pemilih tanggal data** (dipakai saat Simpan) dan toggle tema.

`/kelola` — halaman terpisah: tabel semua snapshot, edit tanggal/catatan, lihat detail (teks mentah), hapus satu / hapus semua, info ukuran DB.

Satu *snapshot* menyimpan teks mentah yang ditempel (Otomax + tiap bank) plus ringkasan angka,
jadi bisa dimuat ulang kapan saja lewat tombol **Muat** di panel Riwayat.

## Catatan

Logika rekonsiliasi di `public/index.html` identik dengan artifact "Rekap Tartun" dan
`Downloads/Rekap Tartun.html`. Kalau aturan kategori/pencocokan diubah, samakan ketiganya.
