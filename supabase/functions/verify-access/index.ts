// ============================================================
// TISKA JIK SUMBAR v1.0 — Edge Function: verify-access
// ============================================================
// Satu-satunya pintu masuk ke data protected (access_profiles,
// access_permissions, links, contacts). Frontend TIDAK PERNAH
// menyentuh tabel-tabel itu langsung — RLS menutupnya untuk anon.
//
// Fungsi ini memakai SUPABASE_SERVICE_ROLE_KEY (disuntik otomatis
// oleh runtime Supabase, bukan ditulis manual) yang membolos RLS,
// jadi ini AMAN dijalankan di server, TAPI KEY ITU TIDAK PERNAH
// dikirim ke frontend.
//
// Dua mode (field "action" di body JSON):
//   1) { action: "login",  username, password, menu_id }
//      -> cari profile lewat username, cocokkan password (bcrypt),
//         cek permission, balas token sesi + isi menu jika lolos.
//   2) { action: "access", token, menu_id }
//      -> verifikasi token, cek permission lagi (untuk menu lain
//         yang berbeda), balas isi menu jika lolos.
//         Ini yang membuat pengguna tidak perlu login ulang saat
//         pindah ke menu lain yang juga diizinkan.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Secret khusus untuk menandatangani token sesi. Sebaiknya dipindah ke
// Supabase Secrets nanti (Dashboard > Edge Functions > Manage secrets):
//   supabase secrets set SESSION_SECRET=isi_dengan_string_acak_panjang
// lalu hapus nilai fallback di bawah ini.
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ??
  "52c6513bfb3d51fb1553d993f39574510ee87c19ec99338eaa63805b0f98981a";

const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 jam, batas pengaman server

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // ganti ke domain Vercel Anda saat production
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// ---- Tanda tangan token sederhana pakai HMAC-SHA256 (Web Crypto) ----
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function issueToken(profileId: string): Promise<string> {
  const payload = JSON.stringify({ pid: profileId, iat: Math.floor(Date.now() / 1000) });
  const encodedPayload = btoa(payload);
  const sig = await hmac(encodedPayload);
  return `${encodedPayload}.${sig}`;
}

async function verifyToken(token: string): Promise<{ pid: string } | null> {
  const [encodedPayload, sig] = (token || "").split(".");
  if (!encodedPayload || !sig) return null;
  const expected = await hmac(encodedPayload);
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(atob(encodedPayload));
    const age = Math.floor(Date.now() / 1000) - payload.iat;
    if (age > TOKEN_MAX_AGE_SECONDS) return null;
    return { pid: payload.pid };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { action, menu_id } = body;
  if (!menu_id) return json({ error: "menu_id_required" }, 400);

  // --------------------------------------------------------
  // Ambil data menu dulu (perlu content_type untuk tahu tabel apa)
  // --------------------------------------------------------
  const { data: menu, error: menuErr } = await supabase
    .from("menus")
    .select("id, content_type, status")
    .eq("id", menu_id)
    .single();

  if (menuErr || !menu || menu.status !== "active") {
    return json({ error: "menu_not_found" }, 404);
  }

  let profileId: string | null = null;

  // ==========================================================
  // MODE 1: login dengan username + password
  // ==========================================================
  if (action === "login") {
    const { username, password } = body;
    if (!username || !password) {
      return json({ error: "username_password_required" }, 400);
    }

    const { data: profile } = await supabase
      .from("access_profiles")
      .select("id, password_hash")
      .eq("username", String(username).toLowerCase().trim())
      .eq("status", "active")
      .maybeSingle();

    // Selalu jalankan bcrypt.compare walau username tidak ketemu (pakai hash
    // dummy), supaya waktu respons tidak membocorkan username mana yang valid.
    const hashToCheck = profile?.password_hash ??
      "$2a$10$CwTycUXWue0Thq9StjUM0uJ8gc8lqZL2vTpDGKMSTd1o8kMSfEZTa";
    const passwordOk = await bcrypt.compare(password, hashToCheck);

    if (!profile || !passwordOk) {
      return json({ error: "invalid_credentials" }, 401);
    }

    profileId = profile.id;
  }
  // ==========================================================
  // MODE 2: akses pakai token sesi yang sudah ada
  // ==========================================================
  else if (action === "access") {
    const { token } = body;
    if (!token) return json({ error: "token_required" }, 400);
    const verified = await verifyToken(token);
    if (!verified) return json({ error: "session_expired" }, 401);
    profileId = verified.pid;
  } else {
    return json({ error: "invalid_action" }, 400);
  }

  // --------------------------------------------------------
  // Cek permission — profile valid TIDAK otomatis berarti boleh
  // buka menu ini (bab 4 & 12 dokumen)
  // --------------------------------------------------------
  const { data: permission } = await supabase
    .from("access_permissions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("menu_id", menu_id)
    .maybeSingle();

  if (!permission) {
    // Tetap balas token supaya frontend bisa simpan sesi dan coba
    // menu lain tanpa login ulang, tapi TANPA isi menu ini.
    const token = action === "login" ? await issueToken(profileId!) : undefined;
    return json({ error: "access_denied", token }, 403);
  }

  // --------------------------------------------------------
  // Lolos permission -> ambil isi menu sesuai content_type
  // --------------------------------------------------------
  const table = menu.content_type === "contacts" ? "contacts" : "links";
  const { data: items } = await supabase
    .from(table)
    .select("*")
    .eq("menu_id", menu_id)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  const token = action === "login" ? await issueToken(profileId!) : body.token;

  return json({
    ok: true,
    content_type: menu.content_type,
    items: items ?? [],
    token,
  });
});
