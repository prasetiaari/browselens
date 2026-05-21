# BrowseLens — Development Checklist

> ⚠️ Baca dokumen ini setiap kali sebelum reload extension di Chrome.
> Masalah "Manifest file is missing" SELALU disebabkan oleh **build yang gagal** — bukan masalah manifest-nya itu sendiri.

---

## 🚨 Checklist Wajib Sebelum Reload Extension

### 1. Selalu Jalankan `npm run build` Dulu
```bash
cd ~/Documents/hacking/browselens
npm run build
```
- Pastikan output terakhir adalah: **`✓ built in Xms`**
- Jika ada error, **JANGAN** reload extension. Perbaiki error dulu.

### 2. Cek Apakah `dist/manifest.json` Ada
```bash
ls dist/manifest.json
```
- Jika file tidak ada → build gagal atau folder `dist/` belum dibuat.
- **JANGAN** load unpacked ke Chrome jika file ini tidak ada.

### 3. Cek Output Build Tidak Ada Error TypeScript
Tanda build gagal yang menyebabkan `dist/` tidak lengkap:
```
error TS2749: 'xxx' refers to a value, but is being used as a type here.
error TS2345: Argument of type ...
error TS2339: Property '...' does not exist on type '...'
```
Jika ada pesan seperti ini → `tsc` gagal → Vite tidak jalan → `dist/manifest.json` tidak dibuat.

---

## 🔄 Prosedur Benar Reload Extension

```bash
# 1. Build dulu
npm run build

# 2. Verifikasi manifest ada
ls dist/manifest.json

# 3. Baru reload di Chrome
# chrome://extensions/ → BrowseLens → tombol reload (🔄)
```

---

## 🐛 Akar Masalah "Manifest file is missing or unreadable"

| Penyebab | Solusi |
|---|---|
| Build gagal karena TypeScript error | Perbaiki error TypeScript, lalu `npm run build` ulang |
| `manifest.json` di-edit langsung (entry `service_worker` diubah ke file yang tidak ada) | Jangan ubah field `service_worker` di `manifest.json` secara manual — biarkan `@crxjs/vite-plugin` yang handle |
| Folder `dist/` tidak ada (belum pernah build) | Jalankan `npm run build` pertama kali |
| Build sukses tapi Chrome belum di-reload | Klik tombol reload di chrome://extensions/ |

---

## ⚠️ Aturan Utama — Jangan Pernah Dilanggar

1. **JANGAN** ubah field `"service_worker"` di `manifest.json` sumber secara manual. Plugin `@crxjs/vite-plugin` sudah otomatis menghasilkan `dist/manifest.json` yang benar saat build.
2. **JANGAN** load extension dari folder sumber (`src/`). Selalu gunakan folder `dist/`.
3. **Selalu** cek output `npm run build` sampai muncul `✓ built` sebelum reload Chrome.

---

## 📋 Masalah & Solusi yang Pernah Terjadi

### Masalah: `Record<string, url>` — TS2749
- **File:** `src/content/content.ts`
- **Penyebab:** Variabel `url` (parameter fungsi) dipakai sebagai type generic `Record<string, url>` padahal bukan tipe.
- **Solusi:** Ganti ke `Record<string, unknown>`.

### Masalah: `[UNRESOLVED_ENTRY] Cannot resolve entry module service-worker-loader.js`
- **File:** `manifest.json` (sumber)
- **Penyebab:** Field `"service_worker"` di-edit manual ke `"service-worker-loader.js"` padahal file itu hanya ada di `dist/` setelah build, bukan sebagai entry point build.
- **Solusi:** Kembalikan ke `"src/background/service-worker.ts"`.

### Masalah: Response Body `(none)` di Side Panel
- **Penyebab:** `chrome.storage.local` punya limit ~8KB per item. Body yang melebihi limit di-discard oleh Chrome.
- **Solusi:** Fungsi `safeTruncate()` di `service-worker.ts` memotong body ke maks 8000 karakter sebelum disimpan ke storage.

---

*Terakhir diperbarui: 2026-05-20*
