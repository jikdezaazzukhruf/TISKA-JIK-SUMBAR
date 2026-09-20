// ============================================================
// js/supabase.js
// Satu-satunya tempat konfigurasi koneksi. Isi 3 nilai di bawah
// setelah project Supabase dan Edge Function siap. Tidak ada
// tempat lain di kode yang perlu diedit untuk koneksi.
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://qpurcpdkqrnwmieppylg.supabase.co";

export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdXJjcGRrcXJud21pZXBweWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjM3MDksImV4cCI6MjEwNTI5OTcwOX0.LLNFxDBg7k5xs-YxdrZxczFL6QgiRgmRqJ2nTkpVguY";

export const EDGE_FUNCTION_URL = "https://qpurcpdkqrnwmieppylg.supabase.co/functions/v1/verify-access";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper untuk memanggil Edge Function verify-access
export async function callVerifyAccess(payload) {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}