// ============================================================
// js/auth.js
// Menangani: modal password, penyimpanan token sesi (sessionStorage
// -> otomatis hilang saat tab ditutup, sesuai keputusan desain),
// dan render isi menu (links atau contacts) di panel konten.
// ============================================================

import { callVerifyAccess } from "./supabase.js";

const TOKEN_KEY = "tiska_session_token";

const modal = document.getElementById("auth-modal");
const modalBackdrop = document.getElementById("auth-modal-backdrop");
const form = document.getElementById("auth-form");
const usernameInput = document.getElementById("auth-username");
const passwordInput = document.getElementById("auth-password");
const errorEl = document.getElementById("auth-error");
const submitBtn = document.getElementById("auth-submit");
const cancelBtn = document.getElementById("auth-cancel");
const authMenuName = document.getElementById("auth-menu-name");

const panel = document.getElementById("content-panel");
const panelMenuName = document.getElementById("content-menu-name");
const panelBody = document.getElementById("content-body");
const panelCloseBtn = document.getElementById("content-close");
const panelSession = document.getElementById("panel-session");
const panelLogoutBtn = document.getElementById("content-logout");
const appMain = document.getElementById("app-main");

const PROFILE_KEY = "tiska_session_profile";

let pendingMenu = null; // menu yang sedang menunggu password

// --------------------------------------------------------
// Sidebar (menu-grid) sekarang permanen di kiri sejak halaman dibuka
// (lihat class "layout-split" di index.html). Panel kanan mulai dari
// kondisi placeholder ini, dan kembali ke sini saat ditutup/logout —
// bukan menyembunyikan seluruh layout split seperti sebelumnya.
// --------------------------------------------------------
function resetPanel() {
  panelMenuName.textContent = "\u00A0";
  panelSession.hidden = true;
  panelLogoutBtn.hidden = true;
  panelCloseBtn.hidden = true;
  panelBody.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "panel-empty-state";
  wrap.innerHTML = `
    <div class="panel-empty-scene">
      <div class="panel-empty-skyline" role="img"
           aria-label="Ilustrasi Jam Gadang, rumah gadang, dan Masjid Raya Sumatera Barat">
        <span class="pe-art pe-art-rumah"></span>
      </div>
      <div class="panel-empty-ground" aria-hidden="true"></div>
    </div>
    <p class="panel-empty-title">TISKA JIK SUMBAR</p>
    <p class="panel-empty-text">Pilih salah satu menu untuk melihat konten.</p>
  `;
  panelBody.appendChild(wrap);
}

resetPanel();

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PROFILE_KEY);
}

function setStoredProfile(profile) {
  if (profile?.username) sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function getStoredProfile() {
  try {
    return JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null");
  } catch {
    return null;
  }
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function openAuthModal(menu) {
  pendingMenu = menu;
  authMenuName.textContent = menu.name;
  hideError();
  usernameInput.value = "";
  passwordInput.value = "";
  modal.hidden = false;
  setTimeout(() => usernameInput.focus(), 50);
}

function closeAuthModal() {
  modal.hidden = true;
  pendingMenu = null;
}

modalBackdrop.addEventListener("click", closeAuthModal);
cancelBtn.addEventListener("click", closeAuthModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeAuthModal();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingMenu) return;
  const menu = pendingMenu; // simpan dulu — closeAuthModal() di bawah akan me-null-kan pendingMenu
  hideError();
  submitBtn.disabled = true;
  submitBtn.textContent = "Memeriksa\u2026";

  try {
    const { ok, status, data } = await callVerifyAccess({
      action: "login",
      menu_id: menu.id,
      username: usernameInput.value.trim().toLowerCase(),
      password: passwordInput.value,
    });

    if (data?.token) setToken(data.token);

    if (ok && data?.ok) {
      closeAuthModal();
      if (data.items !== undefined || data.content_type) {
        // Response login sudah membawa isi menu langsung.
        renderContent(menu, data);
      } else {
        // Response login cuma token+profile (tanpa isi menu) — ambil
        // isinya lewat jalur "access" yang sama seperti klik ulang,
        // supaya isi langsung tampil tanpa perlu klik menu lagi.
        await tryOpenMenu(menu);
      }
      return;
    }

    if (status === 401) {
      showError("Username atau password salah.");
    } else if (status === 403) {
      showError("Login berhasil, tapi profile ini tidak punya akses ke menu ini.");
    } else if (status === 429) {
      const minutes = data?.retry_after_minutes;
      showError(
        minutes
          ? `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`
          : "Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi."
      );
    } else if (status === 0) {
      showError("Tidak bisa menghubungi server. Periksa koneksi atau konfigurasi Supabase.");
    } else {
      showError("Terjadi kesalahan. Coba lagi.");
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Buka";
  }
});

// --------------------------------------------------------
// Coba buka menu memakai token sesi yang sudah ada (tanpa
// minta password lagi). Dipanggil dari index.js saat klik menu.
// Balikan: true jika berhasil ditampilkan, false jika perlu modal.
// --------------------------------------------------------
export async function tryOpenMenu(menu) {
  const token = getToken();

  if (token) {
    showLoadingPanel(menu);

    const { ok, status, data } = await callVerifyAccess({
      action: "access",
      menu_id: menu.id,
      token,
    });

    if (ok && data?.ok) {
      renderContent(menu, data);
      return;
    }

    if (status === 403) {
      // Profile dikenali, tapi memang tidak punya izin ke menu ini.
      // Sesuai bab 12: tidak perlu re-password, cukup tolak.
      renderContent(menu, { content_type: menu.content_type, items: [], _denied: true, profile: data.profile });
      return;
    }

    // status 401 -> token invalid/kadaluarsa, minta password lagi
    clearToken();
  }

  openAuthModal(menu);
}

// --------------------------------------------------------
// Ditampilkan sesaat sementara request "access" (pakai token sesi
// yang sudah ada) masih berjalan, supaya klik menu terasa responsif
// walau koneksi/Edge Function-nya agak lambat.
// --------------------------------------------------------
function showLoadingPanel(menu) {
  panelMenuName.textContent = menu.name;
  panelSession.hidden = true;
  panelLogoutBtn.hidden = true;
  panelCloseBtn.hidden = true;
  panelBody.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "panel-loading";
  wrap.innerHTML = `<span class="panel-spinner" aria-hidden="true"></span> Memuat konten\u2026`;
  panelBody.appendChild(wrap);

  document.querySelectorAll(".menu-btn.is-active").forEach((b) => b.classList.remove("is-active"));
  const activeBtn = document.querySelector(`.menu-btn[data-menu-id="${menu.id}"]`);
  if (activeBtn) activeBtn.classList.add("is-active");
}

// --------------------------------------------------------
// Render panel konten (daftar link atau daftar kontak)
// --------------------------------------------------------
function renderContent(menu, data) {
  if (data.profile) setStoredProfile(data.profile);
  const profile = data.profile ?? getStoredProfile();

  panelMenuName.textContent = menu.name;
  panelBody.innerHTML = "";

  if (profile?.username) {
    panelSession.textContent = `Masuk sebagai ${profile.name || profile.username}`;
    panelSession.hidden = false;
    panelLogoutBtn.hidden = false;
  } else {
    panelSession.hidden = true;
    panelLogoutBtn.hidden = true;
  }

  if (data._denied) {
    const msg = document.createElement("p");
    msg.className = "panel-message is-error";
    msg.textContent = "Akses ditolak untuk menu ini.";
    panelBody.appendChild(msg);
  } else if (!data.items || data.items.length === 0) {
    const msg = document.createElement("p");
    msg.className = "panel-message";
    msg.textContent = "Belum ada data untuk menu ini.";
    panelBody.appendChild(msg);
  } else if (data.content_type === "contacts") {
    data.items.forEach((c) => panelBody.appendChild(buildContactRow(c)));
  } else {
    data.items.forEach((l) => panelBody.appendChild(buildLinkRow(l)));
  }

  panel.hidden = false;
  panelCloseBtn.hidden = false;
  appMain.classList.add("layout-split");
  document.body.classList.add("split-mode");
  document.querySelectorAll(".menu-btn.is-active").forEach((b) => b.classList.remove("is-active"));
  const activeBtn = document.querySelector(`.menu-btn[data-menu-id="${menu.id}"]`);
  if (activeBtn) activeBtn.classList.add("is-active");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildLinkRow(link) {
  const a = document.createElement("a");
  a.className = "link-row";
  a.href = link.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const left = document.createElement("span");
  left.innerHTML = `<span class="link-name">${escapeHtml(link.name)}</span>` +
    (link.description ? `<span class="link-desc">${escapeHtml(link.description)}</span>` : "");

  const right = document.createElement("span");
  right.className = "row-right";

  const urlText = document.createElement("span");
  urlText.className = "link-url";
  urlText.textContent = safeHost(link.url);

  right.appendChild(urlText);
  right.appendChild(buildCopyButton(link.url, "Salin URL"));

  a.appendChild(left);
  a.appendChild(right);
  return a;
}

function buildContactRow(contact) {
  const row = document.createElement("div");
  row.className = "contact-row";

  const left = document.createElement("span");
  left.innerHTML = `<span class="contact-name">${escapeHtml(contact.name)}</span>` +
    (contact.position ? `<span class="contact-position">${escapeHtml(contact.position)}</span>` : "");

  const right = document.createElement("span");
  right.className = "row-right";

  const waLink = document.createElement("a");
  waLink.className = "contact-phone";
  waLink.href = `https://wa.me/${toWhatsAppNumber(contact.phone)}`;
  waLink.target = "_blank";
  waLink.rel = "noopener noreferrer";
  waLink.title = "Buka chat WhatsApp";
  waLink.textContent = contact.phone;

  right.appendChild(waLink);
  right.appendChild(buildCopyButton(contact.phone, "Salin nomor"));

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

// Ubah nomor lokal (mis. "0812-3456-7890") jadi format wa.me (62812...).
// Nomor yang sudah diawali 62 atau +62 dibiarkan, cuma dibersihkan dari
// karakter non-digit.
function toWhatsAppNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

// Tombol salin kecil di sebelah URL/nomor telepon. Dipakai di dalam <a>
// (link-row), jadi klik-nya WAJIB stopPropagation+preventDefault supaya
// tidak ikut membuka link saat orang cuma mau menyalin.
function buildCopyButton(text, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-btn";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.textContent = "\u29c9"; // simbol "salin" sederhana, tanpa perlu ikon font

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback untuk browser/konteks lama yang tidak dukung Clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    const original = btn.textContent;
    btn.textContent = "\u2713";
    btn.classList.add("is-copied");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("is-copied");
    }, 1200);
  });

  return btn;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

panelCloseBtn.addEventListener("click", () => {
  resetPanel();
  document.querySelectorAll(".menu-btn.is-active").forEach((b) => b.classList.remove("is-active"));
});

panelLogoutBtn.addEventListener("click", () => {
  clearToken();
  resetPanel();
  document.querySelectorAll(".menu-btn.is-active").forEach((b) => b.classList.remove("is-active"));
});

export { renderContent };