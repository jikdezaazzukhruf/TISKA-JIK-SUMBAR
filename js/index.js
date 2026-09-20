// ============================================================
// js/index.js
// Homepage: mengambil daftar menu AKTIF dari Supabase (tabel
// 'menus', public read lewat RLS) dan merender tombolnya,
// dikelompokkan per section berdasarkan kolom 'type'.
// TIDAK ADA daftar menu yang ditulis manual di file ini —
// menambah/mengubah/menghapus/mengurutkan menu cukup dari Supabase.
// ============================================================

import { supabase } from "./supabase.js";
import { tryOpenMenu } from "./auth.js";

const grid = document.getElementById("menu-grid");

// Urutan & label section. Kolom `menus.type` yang menentukan section-nya.
// Type yang tidak ada di daftar ini otomatis masuk ke "LAINNYA" di akhir.
// "collapsible: true" -> section dirender sebagai dropdown (<details>)
// yang bisa dibuka/tutup, cocok untuk section yang isinya bisa banyak.
const SECTION_ORDER = [
  { type: "instansi", label: "Instansi", collapsible: true },
  { type: "tahun", label: "Tahun", collapsible: true },
  { type: "umum", label: "Umum", collapsible: true },
];

async function loadMenus() {
  const { data: menus, error } = await supabase
    .from("menus")
    .select("id, name, type, content_type, sort_order")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (error) {
    grid.innerHTML = `<div class="menu-empty">Gagal memuat menu. Periksa koneksi Supabase (lihat js/supabase.js).</div>`;
    console.error(error);
    return;
  }

  if (!menus || menus.length === 0) {
    grid.innerHTML = `<div class="menu-empty">Belum ada menu aktif. Tambahkan lewat Supabase &gt; table "menus".</div>`;
    return;
  }

  grid.innerHTML = "";

  const grouped = groupBySection(menus);
  grouped.forEach(({ label, items, collapsible }) => grid.appendChild(buildSection(label, items, collapsible)));
}

function groupBySection(menus) {
  const byType = new Map();
  for (const menu of menus) {
    const key = menu.type || "lainnya";
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(menu);
  }

  const result = [];
  for (const { type, label, collapsible } of SECTION_ORDER) {
    if (byType.has(type)) {
      result.push({ label, items: byType.get(type), collapsible });
      byType.delete(type);
    }
  }
  // Sisa type yang tidak terdaftar di SECTION_ORDER, tampilkan juga
  // (default: dropdown, karena bisa jadi berisi banyak opsi juga)
  for (const [type, items] of byType) {
    result.push({ label: type.charAt(0).toUpperCase() + type.slice(1), items, collapsible: true });
  }
  return result;
}

function buildSection(label, items, collapsible) {
  const sectionGrid = document.createElement("div");
  sectionGrid.className = "menu-section-items";
  items.forEach((menu) => sectionGrid.appendChild(buildMenuButton(menu)));

  if (collapsible) {
    // <details>/<summary> native: browser yang menangani buka/tutup,
    // tidak perlu JS tambahan untuk toggle-nya.
    const details = document.createElement("details");
    details.className = "menu-section menu-section-dropdown";
    details.open = false; // default tertutup; baru terbuka saat diklik

    // Perilaku akordion: hanya satu section boleh terbuka. Begitu satu
    // dibuka, section lain yang sedang terbuka ditutup. Event "toggle"
    // dipancarkan <details> sendiri, jadi ini juga jalan kalau nanti
    // ada kode lain yang mengubah .open secara programatik.
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      grid
        .querySelectorAll("details.menu-section-dropdown[open]")
        .forEach((other) => {
          if (other !== details) other.open = false;
        });
    });

    const summary = document.createElement("summary");
    summary.className = "menu-section-title";
    summary.textContent = label;

    details.appendChild(summary);
    details.appendChild(sectionGrid);
    return details;
  }

  const section = document.createElement("div");
  section.className = "menu-section";

  const title = document.createElement("h2");
  title.className = "menu-section-title";
  title.textContent = label;

  section.appendChild(title);
  section.appendChild(sectionGrid);
  return section;
}

function buildMenuButton(menu) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-btn";
  btn.dataset.menuId = menu.id;

  btn.innerHTML = `
    <span class="menu-btn-icon" aria-hidden="true">${escapeHtml(menuInitial(menu.name))}</span>
    <span class="menu-btn-name">${escapeHtml(menu.name)}</span>
  `;

  btn.addEventListener("click", () => tryOpenMenu(menu));
  return btn;
}

// Supabase tidak menyimpan ikon per menu, jadi badge kecil di kiri nama
// pakai karakter pertama sebagai pengganti ikon (mis. "B" untuk BGTK).
function menuInitial(name) {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

loadMenus();