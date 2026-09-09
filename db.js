"use strict";
/**
 * Penyimpanan riwayat rekonsiliasi memakai node:sqlite (bawaan Node >= 22.5).
 * Satu baris = satu "snapshot" hasil analisa untuk satu hari.
 */
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "rekap.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal     TEXT NOT NULL,               -- tanggal data, YYYY-MM-DD
    catatan     TEXT NOT NULL DEFAULT '',
    sumber      TEXT NOT NULL,               -- JSON { oto, bri, bca, mdr, qris }
    ringkasan   TEXT NOT NULL,               -- JSON hasil ringkas (angka & jumlah flag)
    dibuat_pada TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_snapshots_tanggal ON snapshots(tanggal DESC, id DESC)");
db.exec("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)");

const q = {
  insert: db.prepare(
    "INSERT INTO snapshots (tanggal, catatan, sumber, ringkasan) VALUES (?, ?, ?, ?)"
  ),
  list: db.prepare(
    "SELECT id, tanggal, catatan, ringkasan, dibuat_pada FROM snapshots ORDER BY tanggal DESC, id DESC LIMIT ?"
  ),
  all: db.prepare(
    "SELECT id, tanggal, catatan, ringkasan, dibuat_pada, length(sumber) AS sumber_bytes FROM snapshots ORDER BY tanggal DESC, id DESC"
  ),
  get: db.prepare("SELECT * FROM snapshots WHERE id = ?"),
  del: db.prepare("DELETE FROM snapshots WHERE id = ?"),
  delAll: db.prepare("DELETE FROM snapshots"),
  count: db.prepare("SELECT COUNT(*) AS n FROM snapshots"),
  getSetting: db.prepare("SELECT v FROM settings WHERE k = ?"),
  setSetting: db.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"),
  span: db.prepare("SELECT MIN(tanggal) AS min, MAX(tanggal) AS max FROM snapshots"),
};

module.exports = {
  /** @returns {number} id baru */
  simpan({ tanggal, catatan = "", sumber, ringkasan }) {
    const info = q.insert.run(
      String(tanggal),
      String(catatan),
      JSON.stringify(sumber || {}),
      JSON.stringify(ringkasan || {})
    );
    return Number(info.lastInsertRowid);
  },

  daftar(limit = 60) {
    return q.list.all(Math.min(Math.max(1, limit | 0), 500)).map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      catatan: r.catatan,
      ringkasan: safeParse(r.ringkasan),
      dibuat_pada: r.dibuat_pada,
    }));
  },

  ambil(id) {
    const r = q.get.get(id | 0);
    if (!r) return null;
    return {
      id: r.id,
      tanggal: r.tanggal,
      catatan: r.catatan,
      sumber: safeParse(r.sumber),
      ringkasan: safeParse(r.ringkasan),
      dibuat_pada: r.dibuat_pada,
    };
  },

  hapus(id) {
    return q.del.run(id | 0).changes > 0;
  },

  hapusSemua() {
    const n = q.delAll.run().changes;
    try { db.exec("VACUUM"); } catch {}
    return n;
  },

  /** Ubah tanggal, catatan &/atau ringkasan. @returns {boolean} */
  ubah(id, { tanggal, catatan, ringkasan }) {
    const cur = q.get.get(id | 0);
    if (!cur) return false;
    const t = /^\d{4}-\d{2}-\d{2}$/.test(tanggal || "") ? tanggal : cur.tanggal;
    const c = catatan == null ? cur.catatan : String(catatan).slice(0, 500);
    const r = ringkasan == null ? cur.ringkasan : JSON.stringify(ringkasan);
    db.prepare("UPDATE snapshots SET tanggal = ?, catatan = ?, ringkasan = ? WHERE id = ?").run(t, c, r, id | 0);
    return true;
  },

  info() {
    let bytes = 0;
    try {
      for (const suf of ["", "-wal", "-shm"]) {
        try { bytes += fs.statSync(DB_PATH + suf).size; } catch {}
      }
    } catch {}
    const span = q.span.get() || {};
    return {
      path: DB_PATH,
      bytes,
      rows: (q.count.get() || {}).n || 0,
      tanggal_min: span.min || null,
      tanggal_max: span.max || null,
    };
  },

  daftarLengkap() {
    return q.all.all().map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      catatan: r.catatan,
      ringkasan: safeParse(r.ringkasan),
      dibuat_pada: r.dibuat_pada,
      sumber_bytes: r.sumber_bytes,
    }));
  },

  getSetting(k) {
    const r = q.getSetting.get(String(k));
    return r ? r.v : null;
  },
  setSetting(k, v) {
    q.setSetting.run(String(k), String(v));
  },

  /** Checkpoint WAL ke file utama lalu tutup — dipanggil saat server berhenti,
   *  supaya file rekap.db aman dibuka DB Browser. */
  tutup() {
    try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
    try { db.close(); } catch {}
  },
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
