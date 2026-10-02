// ============================================================
// js/admin.js
// Logika halaman admin.html: login (role=admin wajib), 4 tab
// (Menu, Link & Kontak, Profile, Permission), semua CRUD lewat
// Edge Function admin-manage (lihat callAdminManage di supabase.js).
// ============================================================

import { callAdminManage } from "./supabase.js";

const TOKEN_KEY = "tiska_admin_token";

// ---- Elemen utama ----
const loginView = document.getElementById("admin-login");
const loginForm = document.getElementById("admin-login-form");
const loginError = document.getElementById("admin-login-error");
const loginBtn = document.getElementById("admin-login-btn");

const appView = document.getElementById("admin-app");
const whoamiEl = document.getElementById("admin-whoami");
const logoutBtn = document.getElementById("admin-logout");

const tabsNav = document.getElementById("admin-tabs");

// ---- State di memori (dimuat ulang tiap ganti tab/aksi) ----
let state = {
  menus: [],
  profiles: [],
  permissions: [], // {id, profile_id, menu_id}
  currentContentMenuId: null,
};

// ============================================================
// Sesi admin
// ============================================================
function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
function setToken(t) {
  sessionStorage.setItem(TOKEN_KEY, t);
}
function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function boot() {
  const token = getToken();
  if (!token) return showLogin();

  const { ok, data } = await callAdminManage({ action: "whoami", token });
  if (ok && data?.ok) {
    showApp(data.profile);
  } else {
    clearToken();
    showLogin();
  }
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
}

async function showApp(profile) {
  loginView.hidden = true;
  appView.hidden = false;
  whoamiEl.textContent = profile?.name || profile?.username || "";
  try {
    await loadMenus();
    await loadProfiles();
    await loadPermissions();
    renderMenusTable();
    renderProfilesTable();
    renderPermissionsMatrix();
    populateContentMenuSelect();
  } catch (err) {
    // Jangan biarkan satu bagian yang gagal bikin seluruh halaman admin
    // diam-diam kosong tanpa penjelasan — tetap tampil + catat ke Console.
    console.error("Gagal memuat sebagian data admin:", err);
    alert("Sebagian data gagal dimuat. Buka Console (F12) untuk detail errornya, lalu coba muat ulang halaman.");
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Memeriksa\u2026";

  const username = document.getElementById("admin-username").value.trim().toLowerCase();
  const password = document.getElementById("admin-password").value;

  try {
    const { ok, status, data } = await callAdminManage({ action: "login", username, password });
    if (ok && data?.ok) {
      setToken(data.token);
      document.getElementById("admin-password").value = "";
      showApp(data.profile);
      return;
    }
    if (status === 401) loginError.textContent = "Username atau password salah.";
    else if (status === 403) loginError.textContent = "Akun ini bukan admin.";
    else if (status === 0) loginError.textContent = "Tidak bisa menghubungi server.";
    else loginError.textContent = "Terjadi kesalahan. Coba lagi.";
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Masuk";
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  location.reload();
});

// ============================================================
// Tabs
// ============================================================
tabsNav.addEventListener("click", (e) => {
  const btn = e.target.closest(".admin-tab");
  if (!btn) return;
  document.querySelectorAll(".admin-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
  document.querySelectorAll(".admin-tab-panel").forEach((p) =>
    p.classList.toggle("is-active", p.id === `tab-${btn.dataset.tab}`)
  );
});

// ============================================================
// Helper umum: alert ringan (dipakai untuk error dari aksi tabel)
// ============================================================
function notifyError(data, fallback) {
  alert(data?.message || data?.error || fallback || "Terjadi kesalahan.");
}

function confirmDelete(label) {
  return confirm(`Hapus "${label}"? Tindakan ini tidak bisa dibatalkan.`);
}

// ============================================================
// MODAL FORM generik — dipakai untuk tambah/edit menu, link,
// kontak, dan profile. `fields` = array {key,label,type,options,
// required,placeholder}. Balikan: Promise<object|null> (null kalau batal).
// ============================================================
const modal = document.getElementById("admin-modal");
const modalBackdrop = document.getElementById("admin-modal-backdrop");
const modalForm = document.getElementById("admin-modal-form");
const modalTitle = document.getElementById("admin-modal-title");
const modalFields = document.getElementById("admin-modal-fields");
const modalError = document.getElementById("admin-modal-error");
const modalCancel = document.getElementById("admin-modal-cancel");

function openModal(title, fields, initialValues = {}) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalError.hidden = true;
    modalFields.innerHTML = "";

    fields.forEach((f) => {
      const wrap = document.createElement("div");
      wrap.className = "admin-field";
      const label = document.createElement("label");
      label.textContent = f.label;
      label.htmlFor = `field-${f.key}`;
      wrap.appendChild(label);

      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        f.options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          input.appendChild(o);
        });
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.id = `field-${f.key}`;
      input.name = f.key;
      if (f.required) input.required = true;
      if (initialValues[f.key] !== undefined && initialValues[f.key] !== null) {
        input.value = initialValues[f.key];
      }
      wrap.appendChild(input);
      modalFields.appendChild(wrap);
    });

    modal.hidden = false;

    function cleanup() {
      modal.hidden = true;
      modalForm.removeEventListener("submit", onSubmit);
      modalCancel.removeEventListener("click", onCancel);
      modalBackdrop.removeEventListener("click", onCancel);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onSubmit(e) {
      e.preventDefault();
      const result = {};
      fields.forEach((f) => {
        const el = document.getElementById(`field-${f.key}`);
        result[f.key] = f.type === "number" ? Number(el.value) : el.value;
      });
      cleanup();
      resolve(result);
    }

    modalForm.addEventListener("submit", onSubmit);
    modalCancel.addEventListener("click", onCancel);
    modalBackdrop.addEventListener("click", onCancel);
  });
}

const STATUS_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

// ============================================================
// TAB: MENUS
// ============================================================
async function loadMenus() {
  const { ok, data } = await callAdminManage({ action: "list_menus", token: getToken() });
  if (ok && data?.ok) state.menus = data.data || [];
}

function renderMenusTable() {
  const tbody = document.querySelector("#menus-table tbody");
  tbody.innerHTML = "";

  // state.menus sudah terurut by sort_order (global) dari list_menus.
  // Kolom "Urutan" di sini DITAMPILKAN sebagai posisi di dalam dropdown-nya
  // sendiri (mulai dari 1 lagi tiap ganti tipe) — bukan angka sort_order
  // mentah — supaya cocok dengan nomor dropdown yang terlihat di situs
  // utama. sort_order asli tetap yang dipakai untuk urutan sebenarnya
  // (dan yang diedit lewat form Edit), ini murni soal tampilan angkanya.
  const posWithinType = new Map(); // type -> counter berjalan
  state.menus.forEach((m) => {
    const key = m.type || "";
    const next = (posWithinType.get(key) || 0) + 1;
    posWithinType.set(key, next);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.type || "")}</td>
      <td>${contentTypeLabel(m.content_type)}</td>
      <td>${m.status === "active" ? "Aktif" : "Nonaktif"}</td>
      <td>${next}</td>
    `;
    const actionsTd = document.createElement("td");
    actionsTd.appendChild(buildRowButton("Edit", () => editMenu(m)));
    actionsTd.appendChild(buildRowButton("Hapus", () => deleteMenu(m), true));
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

// 'contacts' dan 'address' sama-sama disimpan di tabel `contacts` (field
// phone dipakai ulang untuk teks alamat pada tipe 'address') — cuma beda
// label & cara tampil di situs utama (kontak -> link WhatsApp, alamat ->
// link Google Maps).
function usesContactsTable(contentType) {
  return contentType === "contacts" || contentType === "address";
}

function contentTypeLabel(contentType) {
  if (contentType === "contacts") return "Kontak";
  if (contentType === "address") return "Alamat";
  return "Link";
}

function menuFieldsSpec() {
  return [
    { key: "name", label: "Nama menu", required: true },
    { key: "type", label: "Tipe (label section, mis. instansi/tahun/umum)" },
    { key: "content_type", label: "Isi menu", type: "select", options: [
      { value: "links", label: "Daftar link" },
      { value: "contacts", label: "Daftar kontak (No. HP/WA)" },
      { value: "address", label: "Daftar alamat (buka di Maps)" },
    ] },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "sort_order", label: "Urutan (angka)", type: "number" },
  ];
}

document.getElementById("menu-add-btn").addEventListener("click", async () => {
  const values = await openModal("Menu baru", menuFieldsSpec(), { content_type: "links", status: "active", sort_order: state.menus.length + 1 });
  if (!values) return;
  const { ok, data } = await callAdminManage({ action: "upsert_menu", token: getToken(), ...values });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menyimpan menu.");
  await loadMenus();
  renderMenusTable();
  populateContentMenuSelect();
  renderPermissionsMatrix();
});

async function editMenu(m) {
  const values = await openModal(`Edit menu: ${m.name}`, menuFieldsSpec(), m);
  if (!values) return;
  const { ok, data } = await callAdminManage({ action: "upsert_menu", token: getToken(), id: m.id, ...values });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menyimpan menu.");
  await loadMenus();
  renderMenusTable();
  populateContentMenuSelect();
}

async function deleteMenu(m) {
  if (!confirmDelete(m.name)) return;
  const { ok, data } = await callAdminManage({ action: "delete_menu", token: getToken(), id: m.id });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menghapus menu.");
  await loadMenus();
  renderMenusTable();
  populateContentMenuSelect();
  await loadPermissions();
  renderPermissionsMatrix();
}

// ============================================================
// TAB: LINKS & CONTACTS
// ============================================================
const contentMenuSelect = document.getElementById("content-menu-select");
const contentAddBtn = document.getElementById("content-add-btn");

function populateContentMenuSelect() {
  contentMenuSelect.innerHTML = "";
  state.menus.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = `${m.name} (${contentTypeLabel(m.content_type).toLowerCase()})`;
    contentMenuSelect.appendChild(o);
  });
  if (state.menus.length) {
    state.currentContentMenuId = state.menus[0].id;
    contentMenuSelect.value = state.currentContentMenuId;
    loadAndRenderContent();
  }
}

contentMenuSelect.addEventListener("change", () => {
  state.currentContentMenuId = contentMenuSelect.value;
  loadAndRenderContent();
});

function currentMenu() {
  return state.menus.find((m) => m.id === state.currentContentMenuId);
}

async function loadAndRenderContent() {
  const menu = currentMenu();
  if (!menu) return;
  const action = usesContactsTable(menu.content_type) ? "list_contacts" : "list_links";
  const { ok, data } = await callAdminManage({ action, token: getToken(), menu_id: menu.id });
  const items = ok && data?.ok ? data.data || [] : [];
  renderContentTable(menu, items);
}

function linkFieldsSpec() {
  return [
    { key: "name", label: "Nama link", required: true },
    { key: "url", label: "URL", required: true, placeholder: "https://..." },
    { key: "description", label: "Deskripsi (opsional)" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "sort_order", label: "Urutan (angka)", type: "number" },
  ];
}
function contactFieldsSpec(contentType) {
  const isAddress = contentType === "address";
  return [
    { key: "name", label: "Nama", required: true },
    { key: "position", label: isAddress ? "Label (mis. Kantor Pusat) (opsional)" : "Jabatan (opsional)" },
    { key: "phone", label: isAddress ? "Alamat lengkap" : "No. HP/WA",
      required: true, placeholder: isAddress ? "Jl. Contoh No. 1, Kota, Provinsi" : "0812xxxxxxx" },
    { key: "description", label: isAddress
        ? "Link Google Maps (opsional — tempel dari tombol Share di Google Maps)"
        : "Catatan (opsional)",
      placeholder: isAddress ? "https://maps.app.goo.gl/..." : undefined },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "sort_order", label: "Urutan (angka)", type: "number" },
  ];
}

function renderContentTable(menu, items) {
  const isContacts = usesContactsTable(menu.content_type);
  const phoneColLabel = menu.content_type === "address" ? "Alamat" : "No. HP";
  const thead = document.querySelector("#content-table thead");
  const tbody = document.querySelector("#content-table tbody");

  thead.innerHTML = isContacts
    ? `<tr><th>Nama</th><th>Label</th><th>${phoneColLabel}</th><th>Status</th><th>Urutan</th><th></th></tr>`
    : "<tr><th>Nama</th><th>URL</th><th>Status</th><th>Urutan</th><th></th></tr>";

  tbody.innerHTML = "";
  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = isContacts
      ? `<td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.position || "")}</td>
         <td>${escapeHtml(item.phone)}</td><td>${item.status === "active" ? "Aktif" : "Nonaktif"}</td>
         <td>${item.sort_order}</td>`
      : `<td>${escapeHtml(item.name)}</td><td class="admin-cell-url">${escapeHtml(item.url)}</td>
         <td>${item.status === "active" ? "Aktif" : "Nonaktif"}</td><td>${item.sort_order}</td>`;

    const actionsTd = document.createElement("td");
    actionsTd.appendChild(buildRowButton("Edit", () => editContentItem(menu, item)));
    actionsTd.appendChild(buildRowButton("Hapus", () => deleteContentItem(menu, item), true));
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

contentAddBtn.addEventListener("click", async () => {
  const menu = currentMenu();
  if (!menu) return alert("Buat menu dulu di tab Menu.");
  const isContacts = usesContactsTable(menu.content_type);
  const spec = isContacts ? contactFieldsSpec(menu.content_type) : linkFieldsSpec();
  const values = await openModal(
    `Tambah ${contentTypeLabel(menu.content_type).toLowerCase()} ke ${menu.name}`,
    spec,
    { status: "active", sort_order: 1 }
  );
  if (!values) return;
  const action = isContacts ? "upsert_contact" : "upsert_link";
  const { ok, data } = await callAdminManage({ action, token: getToken(), menu_id: menu.id, ...values });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menyimpan.");
  loadAndRenderContent();
});

async function editContentItem(menu, item) {
  const isContacts = usesContactsTable(menu.content_type);
  const spec = isContacts ? contactFieldsSpec(menu.content_type) : linkFieldsSpec();
  const values = await openModal(`Edit: ${item.name}`, spec, item);
  if (!values) return;
  const action = isContacts ? "upsert_contact" : "upsert_link";
  const { ok, data } = await callAdminManage({ action, token: getToken(), id: item.id, menu_id: menu.id, ...values });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menyimpan.");
  loadAndRenderContent();
}

async function deleteContentItem(menu, item) {
  if (!confirmDelete(item.name)) return;
  const isContacts = usesContactsTable(menu.content_type);
  const action = isContacts ? "delete_contact" : "delete_link";
  const { ok, data } = await callAdminManage({ action, token: getToken(), id: item.id });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menghapus.");
  loadAndRenderContent();
}

// ============================================================
// TAB: PROFILES
// ============================================================
async function loadProfiles() {
  const { ok, data } = await callAdminManage({ action: "list_profiles", token: getToken() });
  if (ok && data?.ok) state.profiles = data.data || [];
}

function renderProfilesTable() {
  const tbody = document.querySelector("#profiles-table tbody");
  tbody.innerHTML = "";
  state.profiles.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.username)}</td>
      <td>${escapeHtml(p.role)}</td>
      <td>${p.status === "active" ? "Aktif" : "Nonaktif"}</td>
    `;
    const actionsTd = document.createElement("td");
    actionsTd.appendChild(buildRowButton("Edit", () => editProfile(p)));
    actionsTd.appendChild(buildRowButton("Hapus", () => deleteProfile(p), true));
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

function profileFieldsSpec(isNew) {
  return [
    { key: "name", label: "Nama", required: true },
    { key: "username", label: "Username", required: true },
    { key: "role", label: "Role", type: "select", options: [
      { value: "engineer", label: "Engineer" },
      { value: "pusat", label: "Pusat (akses semua menu, tanpa akses admin.html)" },
      { value: "admin", label: "Admin (akses penuh termasuk admin.html)" },
    ] },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "new_password", label: isNew ? "Password" : "Ganti password (kosongkan jika tidak diganti)", type: "password", required: !!isNew },
  ];
}

document.getElementById("profile-add-btn").addEventListener("click", async () => {
  const values = await openModal("Profile baru", profileFieldsSpec(true), { role: "engineer", status: "active" });
  if (!values) return;
  const { ok, data } = await callAdminManage({ action: "upsert_profile", token: getToken(), ...values });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menyimpan profile.");
  await loadProfiles();
  renderProfilesTable();
  await loadPermissions();
  renderPermissionsMatrix();
});

async function editProfile(p) {
  const values = await openModal(`Edit profile: ${p.name}`, profileFieldsSpec(false), p);
  if (!values) return;
  const { ok, data } = await callAdminManage({ action: "upsert_profile", token: getToken(), id: p.id, ...values });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menyimpan profile.");
  await loadProfiles();
  renderProfilesTable();
}

async function deleteProfile(p) {
  if (!confirmDelete(p.name)) return;
  const { ok, data } = await callAdminManage({ action: "delete_profile", token: getToken(), id: p.id });
  if (!ok || !data?.ok) return notifyError(data, "Gagal menghapus profile.");
  await loadProfiles();
  renderProfilesTable();
  await loadPermissions();
  renderPermissionsMatrix();
}

// ============================================================
// TAB: PERMISSIONS (matrix)
// ============================================================
async function loadPermissions() {
  const { ok, data } = await callAdminManage({ action: "list_permissions", token: getToken() });
  if (ok && data?.ok) state.permissions = data.data || [];
}

function hasPermission(profileId, menuId) {
  return state.permissions.some((p) => p.profile_id === profileId && p.menu_id === menuId);
}

function renderPermissionsMatrix() {
  const table = document.getElementById("permissions-table");
  table.innerHTML = "";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  state.menus.forEach((m) => {
    const th = document.createElement("th");
    th.textContent = m.name;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  state.profiles.forEach((p) => {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.textContent = p.name;
    nameTd.className = "admin-matrix-rowlabel";
    tr.appendChild(nameTd);

    state.menus.forEach((m) => {
      const td = document.createElement("td");
      td.className = "admin-matrix-cell";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = hasPermission(p.id, m.id);
      checkbox.addEventListener("change", () => togglePermission(p.id, m.id, checkbox));
      td.appendChild(checkbox);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

async function togglePermission(profileId, menuId, checkbox) {
  const grant = checkbox.checked;
  checkbox.disabled = true;
  const { ok, data } = await callAdminManage({
    action: "set_permission", token: getToken(), profile_id: profileId, menu_id: menuId, grant,
  });
  checkbox.disabled = false;
  if (!ok || !data?.ok) {
    checkbox.checked = !grant; // revert
    return notifyError(data, "Gagal mengubah permission.");
  }
  if (grant) {
    state.permissions.push({ profile_id: profileId, menu_id: menuId });
  } else {
    state.permissions = state.permissions.filter(
      (p) => !(p.profile_id === profileId && p.menu_id === menuId)
    );
  }
}

// ============================================================
// Util kecil
// ============================================================
function buildRowButton(label, onClick, danger) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = danger ? "admin-row-btn is-danger" : "admin-row-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

boot();