"use strict";
/**
 * Rekap Tartun — server.
 * - Menyajikan UI di public/ (parsing & rekonsiliasi tetap jalan di browser).
 * - REST API untuk menyimpan / memuat riwayat hasil analisa (SQLite via db.js).
 * - Auth opsional: aktif hanya bila env APP_PASSWORD diisi.
 */
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const db = require("./db");

const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.APP_PASSWORD || "";
const AUTH_ON = PASSWORD.length > 0;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

/* ---------- auth (opsional, sesi di memori) ---------- */
const sessions = new Set(); // token acak; hilang saat server restart (cukup untuk pemakaian rumahan)

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function authed(req) {
  if (!AUTH_ON) return true;
  const tok = parseCookies(req.headers.cookie).sid;
  return tok && sessions.has(tok);
}

app.get("/api/session", (req, res) => {
  res.json({ authRequired: AUTH_ON, authed: authed(req) });
});

app.post("/api/login", (req, res) => {
  if (!AUTH_ON) return res.json({ ok: true });
  const given = String((req.body && req.body.password) || "");
  const a = Buffer.from(given);
  const b = Buffer.from(PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "Password salah." });
  const tok = crypto.randomBytes(24).toString("hex");
  sessions.add(tok);
  res.setHeader(
    "Set-Cookie",
    `sid=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  );
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const tok = parseCookies(req.headers.cookie).sid;
  if (tok) sessions.delete(tok);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (authed(req)) return next();
  res.status(401).json({ error: "Perlu login." });
}

/* ---------- API riwayat ---------- */
const api = express.Router();
api.use(requireAuth);

api.get("/snapshots", (req, res) => {
  if (req.query.full) return res.json(db.daftarLengkap());
  res.json(db.daftar(Number(req.query.limit) || 60));
});

api.get("/db/info", (_req, res) => res.json(db.info()));

api.get("/snapshots/:id", (req, res) => {
  const row = db.ambil(req.params.id);
  if (!row) return res.status(404).json({ error: "Tidak ditemukan." });
  res.json(row);
});

api.patch("/snapshots/:id", (req, res) => {
  const b = req.body || {};
  const ok = db.ubah(req.params.id, { tanggal: b.tanggal, catatan: b.catatan });
  if (!ok) return res.status(404).json({ error: "Tidak ditemukan." });
  res.json({ ok: true });
});

api.post("/snapshots", (req, res) => {
  const b = req.body || {};
  if (!b.sumber || typeof b.sumber !== "object")
    return res.status(400).json({ error: "Field 'sumber' wajib." });
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(b.tanggal || "")
    ? b.tanggal
    : new Date().toISOString().slice(0, 10);
  try {
    const id = db.simpan({
      tanggal,
      catatan: (b.catatan || "").slice(0, 500),
      sumber: b.sumber,
      ringkasan: b.ringkasan || {},
    });
    res.status(201).json({ id, tanggal });
  } catch (e) {
    res.status(500).json({ error: "Gagal menyimpan: " + e.message });
  }
});

api.delete("/snapshots/:id", (req, res) => {
  res.json({ ok: db.hapus(req.params.id) });
});

api.post("/snapshots/hapus-semua", (req, res) => {
  const b = req.body || {};
  if (b.konfirmasi !== "HAPUS SEMUA")
    return res.status(400).json({ error: "Konfirmasi tidak cocok." });
  res.json({ dihapus: db.hapusSemua() });
});

app.use("/api", api);

/* ---------- statis ---------- */
app.get("/healthz", (_req, res) => res.type("text").send("ok"));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const server = app.listen(PORT, () => {
  console.log(
    `Rekap Tartun jalan di http://localhost:${PORT}  (auth: ${AUTH_ON ? "ON" : "OFF"})`
  );
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nMenutup…");
  server.close(() => {
    db.tutup();
    process.exit(0);
  });
  setTimeout(() => { db.tutup(); process.exit(0); }, 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
