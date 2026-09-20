-- ============================================================
-- TISKA JIK SUMBAR v1.0 — Skema Database Supabase
-- ============================================================
-- Jalankan file ini di Supabase Dashboard > SQL Editor > New query.
-- Aman dijalankan ulang: pakai IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. menus — daftar tombol utama di homepage
-- ------------------------------------------------------------
create table if not exists menus (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text,                              -- 'instansi' | 'tahun' | 'umum' (bebas, hanya label)
  content_type text not null default 'links'
               check (content_type in ('links', 'contacts')),
  status       text not null default 'active'
               check (status in ('active', 'inactive')),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. access_profiles — profile/credential (password sudah di-hash)
-- ------------------------------------------------------------
create table if not exists access_profiles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- mis. 'Engineer BGTK'
  username      text not null unique,              -- mis. 'bgtk' — dipakai untuk login
  role          text not null default 'engineer'
                check (role in ('engineer', 'admin')),
  password_hash text not null,                     -- bcrypt via crypt()/gen_salt('bf')
  status        text not null default 'active'
                check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_access_profiles_username on access_profiles (username);

-- ------------------------------------------------------------
-- 3. access_permissions — penghubung many-to-many profile <-> menu
-- ------------------------------------------------------------
create table if not exists access_permissions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references access_profiles(id) on delete cascade,
  menu_id    uuid not null references menus(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, menu_id)
);

-- ------------------------------------------------------------
-- 4. links — isi menu bertipe 'links'
-- ------------------------------------------------------------
create table if not exists links (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references menus(id) on delete cascade,
  name        text not null,
  url         text not null,
  icon        text,
  description text,
  status      text not null default 'active'
              check (status in ('active', 'inactive')),
  sort_order  int  not null default 0
);

-- ------------------------------------------------------------
-- 5. contacts — isi menu bertipe 'contacts' (mis. NOMOR PENTING)
-- ------------------------------------------------------------
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references menus(id) on delete cascade,
  name        text not null,
  position    text,
  phone       text not null,
  description text,
  status      text not null default 'active'
              check (status in ('active', 'inactive')),
  sort_order  int  not null default 0
);

-- Index pendukung query yang sering dipakai
create index if not exists idx_menus_status_sort on menus (status, sort_order);
create index if not exists idx_links_menu on links (menu_id, status, sort_order);
create index if not exists idx_contacts_menu on contacts (menu_id, status, sort_order);
create index if not exists idx_permissions_profile_menu on access_permissions (profile_id, menu_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Prinsip: hanya tabel 'menus' yang boleh dibaca publik (anon).
-- Semua tabel lain (access_profiles, access_permissions, links,
-- contacts, login_attempts) TIDAK punya policy sama sekali untuk
-- anon/authenticated -> default Postgres RLS = deny all.
-- Hanya Edge Function (pakai service_role key, bypass RLS) yang
-- boleh membaca/menulis tabel-tabel itu.
-- ============================================================

alter table menus             enable row level security;
alter table access_profiles   enable row level security;
alter table access_permissions enable row level security;
alter table links             enable row level security;
alter table contacts          enable row level security;

drop policy if exists "menus_public_read" on menus;
create policy "menus_public_read"
  on menus for select
  to anon, authenticated
  using (status = 'active');

-- Tidak ada CREATE POLICY untuk access_profiles, access_permissions,
-- links, contacts -> otomatis tertutup total dari anon key.

-- ============================================================
-- DATA AWAL — menu sesuai bab 3 dokumen
-- ============================================================
insert into menus (name, type, content_type, status, sort_order) values
  ('BGTK',           'instansi', 'links',    'active', 1),
  ('BBPMP',          'instansi', 'links',    'active', 2),
  ('BALBAH',         'instansi', 'links',    'active', 3),
  ('LLDIKTI',        'instansi', 'links',    'active', 4),
  ('NOMOR PENTING',  'umum',     'contacts', 'active', 5),
  ('2026',           'tahun',    'links',    'active', 6),
  ('2027',           'tahun',    'links',    'active', 7)
on conflict do nothing;

-- ============================================================
-- CONTOH PROFILE AWAL — GANTI SEMUA PASSWORD INI SEBELUM DIPAKAI
-- ============================================================
-- Login pakai username (bukan email), dicocokkan case-insensitive
-- (selalu disimpan huruf kecil). Cara ganti password kapan saja
-- tanpa coding, lewat SQL Editor:
--   update access_profiles
--   set password_hash = crypt('password_baru_disini', gen_salt('bf'))
--   where username = 'bgtk';
-- ============================================================
insert into access_profiles (name, username, role, password_hash) values
  ('Engineer BGTK',    'bgtk',    'engineer', crypt('ganti_password_bgtk',    gen_salt('bf'))),
  ('Engineer BBPMP',   'bbpmp',   'engineer', crypt('ganti_password_bbpmp',   gen_salt('bf'))),
  ('Engineer BALBAH',  'balbah',  'engineer', crypt('ganti_password_balbah',  gen_salt('bf'))),
  ('Engineer LLDIKTI', 'lldikti', 'engineer', crypt('ganti_password_lldikti', gen_salt('bf'))),
  ('Admin',            'admin',   'admin',    crypt('ganti_password_admin',   gen_salt('bf')))
on conflict do nothing;

-- ============================================================
-- MATRIKS PERMISSION AWAL — sesuai bab 5 dokumen
-- ============================================================
insert into access_permissions (profile_id, menu_id)
select p.id, m.id from access_profiles p, menus m
where
  (p.name = 'Engineer BGTK'    and m.name in ('BGTK', 'NOMOR PENTING', '2026', '2027'))
  or (p.name = 'Engineer BBPMP'   and m.name in ('BBPMP', 'NOMOR PENTING', '2026', '2027'))
  or (p.name = 'Engineer BALBAH'  and m.name in ('BALBAH', 'NOMOR PENTING', '2026', '2027'))
  or (p.name = 'Engineer LLDIKTI' and m.name in ('LLDIKTI', 'NOMOR PENTING', '2026', '2027'))
  or (p.name = 'Admin' and true)  -- admin dapat semua menu yang ada, termasuk yang ditambah nanti manual
on conflict do nothing;

-- ============================================================
-- CONTOH ISI LINKS & CONTACTS (boleh dihapus/ganti di Table Editor)
-- ============================================================
insert into links (menu_id, name, url, sort_order)
select id, 'Moodle', 'https://moodle.example.go.id', 1 from menus where name = 'BGTK'
union all
select id, 'SIMPEG', 'https://simpeg.example.go.id', 2 from menus where name = 'BGTK';

insert into contacts (menu_id, name, position, phone, sort_order)
select id, 'Contoh Nama', 'Koordinator JIK Sumbar', '0811-0000-0000', 1
from menus where name = 'NOMOR PENTING';
