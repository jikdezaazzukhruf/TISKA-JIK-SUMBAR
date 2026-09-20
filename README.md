# TISKA JIK SUMBAR v1.0

Link hub JIK Sumatera Barat. Homepage publik menampilkan menu, tiap menu minta
password, password diverifikasi lewat Edge Function, isi menu (link/kontak)
hanya dikirim ke browser setelah permission dicek di server.

## Struktur folder

```
TISKA-JIK-SUMBAR/
├── index.html
├── css/style.css
├── js/
│   ├── supabase.js     <- isi URL & key di sini
│   ├── auth.js
│   └── index.js
└── supabase/
    ├── schema.sql               <- jalankan di SQL Editor
    └── functions/verify-access/index.ts   <- deploy sebagai Edge Function
```

## Status setup

Sudah dikerjakan langsung di project Supabase Anda (`qpurcpdkqrnwmieppylg`)
lewat koneksi MCP:

- [x] Skema lengkap dijalankan (`menus`, `access_profiles`,
      `access_permissions`, `links`, `contacts`, `login_attempts`) + RLS
- [x] Edge Function `verify-access` sudah dideploy dan aktif
- [x] `js/supabase.js` sudah diisi URL, anon key, dan URL Edge Function project ini

Yang **masih perlu Anda lakukan sendiri**, karena menyangkut kredensial rahasia:

### A. Ganti password contoh
Login memakai **username + password**. Username awal: `bgtk`, `bbpmp`,
`balbah`, `lldikti`, `admin` — passwordnya masih nilai sementara dari
`schema.sql` (`ganti_password_bgtk`, dst). Ganti lewat SQL Editor:

```sql
update access_profiles
set password_hash = crypt('password_baru_yang_kuat', gen_salt('bf'))
where username = 'bgtk';
```

Ulangi untuk `bbpmp`, `balbah`, `lldikti`, `admin`. Ini juga cara Anda
mengganti password kapan pun nanti — tanpa sentuh kode.

Untuk menambah profile/username baru:

```sql
insert into access_profiles (name, username, role, password_hash) values
  ('Nama Bebas', 'username_baru', 'engineer', crypt('password_kuat', gen_salt('bf')));
```

lalu beri akses menunya lewat tabel `access_permissions`.

### B. (Opsional, disarankan) Pindahkan SESSION_SECRET ke Supabase Secrets
Alat MCP yang dipakai untuk deploy tidak bisa mengatur *secret* environment,
jadi `SESSION_SECRET` untuk sekarang tertanam langsung sebagai fallback di
kode `supabase/functions/verify-access/index.ts`. Ini tetap aman (tidak
pernah terkirim ke browser), tapi untuk higienis, pindahkan lewat CLI:

```bash
supabase login
supabase link --project-ref qpurcpdkqrnwmieppylg
supabase secrets set SESSION_SECRET=$(openssl rand -hex 32)
```

Setelah secret itu diset, `Deno.env.get("SESSION_SECRET")` akan otomatis
dipakai duluan (kode sudah menangani fallback-nya), lalu hapus baris fallback
di kode agar tidak ada secret tertulis di source.

### C. Coba lokal
Buka `index.html` lewat live server (mis. ekstensi Live Server di VS Code —
jangan dobel-klik file langsung karena modul ES butuh http://, bukan file://).

Tombol menu harus muncul otomatis dari Supabase. Klik salah satu, masukkan
password yang sudah Anda ganti di langkah 2, isi link/kontak harus muncul.

### D. Deploy ke Vercel
```bash
npm i -g vercel
vercel
```
Pilih folder ini sebagai root. Tidak perlu build step — ini static site murni.

## Uji matriks akses (checklist dari dokumen)

- [ ] Password salah → pesan error umum, tidak ada data terkirim
- [ ] Password benar tapi menu tidak diizinkan → "akses ditolak", tidak minta password lagi untuk menu lain yang memang diizinkan
- [ ] Pindah ke menu lain yang diizinkan profile yang sama → tidak diminta password lagi (token sesi)
- [ ] Tutup tab, buka lagi → diminta password lagi (sesi hilang, sesuai keputusan desain)
- [ ] Tambah menu baru "2028" lewat Supabase Table Editor → langsung muncul di homepage tanpa redeploy
- [ ] Cek Network tab browser → tidak ada `service_role` key yang terkirim ke browser kapan pun

## Menambah menu/link/kontak baru (tanpa coding)

Semua lewat **Table Editor** di dashboard Supabase:
- Menu baru → tambah row di `menus`
- Link baru → tambah row di `links`, isi `menu_id` yang sesuai
- Kontak baru → tambah row di `contacts`, isi `menu_id` yang sesuai
- Beri akses ke profile → tambah row di `access_permissions`

## Keamanan yang sudah diterapkan

- RLS: hanya `menus` yang bisa dibaca anon key. Tabel lain (`access_profiles`,
  `access_permissions`, `links`, `contacts`) tidak punya policy sama sekali →
  tertutup total kecuali lewat Edge Function (service_role, sisi server).
- Password disimpan sebagai bcrypt hash (`pgcrypto`), tidak pernah plaintext.
- Token sesi ditandatangani HMAC-SHA256 dengan secret yang hanya ada di
  server (`SESSION_SECRET`), bukan bisa dipalsukan dari browser.
- `bcrypt.compare` tetap dijalankan (pakai hash dummy) walau username tidak
  ditemukan, supaya waktu respons tidak membocorkan username mana yang valid.
- Setiap permintaan isi menu selalu dicek ulang permission-nya di server —
  tidak pernah "ambil semua lalu sembunyikan di frontend".

**Catatan:** rate-limiting per IP (`login_attempts`) sengaja dilepas atas
permintaan — tidak ada lagi batas jumlah percobaan login. Cocok untuk tim
kecil yang saling percaya; kalau nanti butuh lagi, tinggal tambahkan
tabel serupa dan cek jumlah percobaan gagal di Edge Function sebelum
`bcrypt.compare`.
