import {
  apiGet,
  apiPost,
  apiPut,
  getErrorInfo,
  toErrorText,
  clientGetMe,
} from "../lib/api";

import { makeToaster, markInvalid } from "../lib/admin-uploader";

type AnyUser = any;

document.addEventListener("DOMContentLoaded", () => {
  void boot();
});

const toast = makeToaster("status", { okMs: 1600, errMs: 5000 });

let me: any = null;
let canEdit = false;

let page = 1;
const pageSize = 10;
let total = 0;
let q = "";
let roleFilter = "";
let items: AnyUser[] = [];

const rowsEl = document.getElementById("rows") as HTMLTableSectionElement | null;
const pageInfo = document.getElementById("pageInfo") as HTMLSpanElement | null;
const prevBtn = document.getElementById("prev") as HTMLButtonElement | null;
const nextBtn = document.getElementById("next") as HTMLButtonElement | null;

const newBtn = document.getElementById("newBtn") as HTMLButtonElement | null;
const qEl = document.getElementById("q") as HTMLInputElement | null;
const roleFilterEl = document.getElementById("roleFilter") as HTMLSelectElement | null;

const userModal = document.getElementById("userModal") as HTMLDialogElement | null;
const userForm = document.getElementById("userForm") as HTMLFormElement | null;
const userFormTitle = document.getElementById("userFormTitle") as HTMLElement | null;
const userIdEl = document.getElementById("userId") as HTMLInputElement | null;
const emailEl = document.getElementById("email") as HTMLInputElement | null;
const roleEl = document.getElementById("role") as HTMLSelectElement | null;
const cancelUser = document.getElementById("cancelUser") as HTMLButtonElement | null;

const resetModal = document.getElementById("resetModal") as HTMLDialogElement | null;
const resetTokenEl = document.getElementById("resetToken") as HTMLInputElement | null;
const copyTokenBtn = document.getElementById("copyToken") as HTMLButtonElement | null;
const tokenExpEl = document.getElementById("tokenExp") as HTMLElement | null;
const closeReset = document.getElementById("closeReset") as HTMLButtonElement | null;

function isPrivileged(role: string) {
  return role === "admin" || role === "owner";
}
function isUserActive(u: any) {
  if (typeof u?.active === "boolean") return u.active;
  const st = String(u?.status || "").toLowerCase();
  if (!st) return true;
  return st !== "blocked";
}
function statusBadge(u: any) {
  const st = String(u?.status || (isUserActive(u) ? "active" : "blocked")).toLowerCase();
  if (st === "blocked") return '<span class="badge inactive">Bloqueado</span>';
  return '<span class="badge active">Activo</span>';
}
function roleBadge(role: string) {
  return `<span class="badge role-${role}">${escapeHtml(role)}</span>`;
}

function clearFormErrors() {
  if (!emailEl || !roleEl) return;
  [emailEl, roleEl].forEach((el) => {
    el.classList.remove("invalid", "is-invalid");
    const label = el.closest("label") || el.parentElement;
    label?.querySelectorAll(".err-tip")?.forEach((n) => n.remove());
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  });
}

let modalOriginal = { email: "", role: "editor" };

async function boot() {
  try {
    me = await clientGetMe();
    canEdit = isPrivileged(String(me?.user?.role || ""));
    if (canEdit) newBtn?.removeAttribute("disabled");
    bindEvents();
    await loadUsers();
  } catch (e) {
    toast.show("No se pudo cargar usuarios", "err");
    console.error(e);
  }
}

function bindEvents() {
  qEl?.addEventListener(
    "input",
    debounce(() => {
      q = (qEl.value || "").trim();
      page = 1;
      void loadUsers();
    }, 300)
  );

  roleFilterEl?.addEventListener("change", () => {
    roleFilter = roleFilterEl.value;
    page = 1;
    void loadUsers();
  });

  prevBtn?.addEventListener("click", () => {
    if (page > 1) {
      page--;
      void loadUsers();
    }
  });

  nextBtn?.addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page < maxPage) {
      page++;
      void loadUsers();
    }
  });

  newBtn?.addEventListener("click", () => openUserModal());

  cancelUser?.addEventListener("click", () => userModal?.close());
  userForm?.addEventListener("submit", onSubmitUser);

  userModal?.addEventListener("click", (e) => {
    if (e.target === userModal) userModal.close();
  });
  resetModal?.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.close();
  });

  copyTokenBtn?.addEventListener("click", async () => {
    try {
      if (!resetTokenEl) return;
      await navigator.clipboard.writeText(resetTokenEl.value);
      toast.show("Copiado ✅", "ok");
    } catch {
      toast.show("No se pudo copiar", "err");
    }
  });

  closeReset?.addEventListener("click", () => resetModal?.close());
}

async function loadUsers() {
  try {
    if (!rowsEl || !pageInfo || !prevBtn || !nextBtn) return;

    rowsEl.innerHTML = `<tr><td colspan="4" class="empty">Cargando…</td></tr>`;

    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(q ? { q } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
    }).toString();

    const res = await apiGet(`/v1/users?${qs}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    total = data.total || 0;
    items = Array.isArray(data.items) ? data.items : [];

    if (!items.length) {
      rowsEl.innerHTML = `<tr><td colspan="4" class="empty">Sin resultados</td></tr>`;
    } else {
      rowsEl.innerHTML = items.map((u) => renderRow(u)).join("");

      rowsEl.querySelectorAll("[data-action='edit']").forEach((btn) =>
        btn.addEventListener("click", () =>
          openUserModal(
            (btn as HTMLElement).dataset.id || null,
            items.find((x) => String(x.id) === String((btn as HTMLElement).dataset.id))
          )
        )
      );

      rowsEl.querySelectorAll(".act-block").forEach((btn) =>
        btn.addEventListener("click", () => onToggleStatus((btn as HTMLElement).dataset.id || "", false))
      );

      rowsEl.querySelectorAll(".act-unblock").forEach((btn) =>
        btn.addEventListener("click", () => onToggleStatus((btn as HTMLElement).dataset.id || "", true))
      );

      rowsEl.querySelectorAll(".act-reset").forEach((btn) =>
        btn.addEventListener("click", () => onResetToken((btn as HTMLElement).dataset.id || ""))
      );
    }

    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    pageInfo.textContent = `Página ${page} de ${maxPage} • ${total} usuarios`;

    const prevDisabled = page <= 1;
    const nextDisabled = page >= maxPage;
    prevBtn.disabled = prevDisabled;
    nextBtn.disabled = nextDisabled;
    prevBtn.setAttribute("aria-disabled", String(prevDisabled));
    nextBtn.setAttribute("aria-disabled", String(nextDisabled));
  } catch (e) {
    console.error(e);
    if (rowsEl) rowsEl.innerHTML = `<tr><td colspan="4" class="empty">Error cargando usuarios</td></tr>`;
  }
}

function renderRow(u: any) {
  const active = isUserActive(u);

  const blockBtn = active
    ? `<button class="kbtn danger solid act-block" data-id="${u.id}">Bloquear</button>`
    : `<button class="kbtn success solid act-unblock" data-id="${u.id}">Desbloquear</button>`;

  const actions = canEdit
    ? `<div class="row-actions">
        <button class="kbtn" data-action="edit" data-id="${u.id}">Editar</button>
        ${blockBtn}
        <button class="kbtn ghost act-reset" data-id="${u.id}">Blanquear</button>
      </div>`
    : `<span class="muted">—</span>`;

  return `<tr>
    <td>${escapeHtml(u.email || "")}</td>
    <td>${roleBadge(u.role || "editor")}</td>
    <td class="hidem">${statusBadge(u)}</td>
    <td class="td actions">${actions}</td>
  </tr>`;
}

function openUserModal(id: string | null = null, data: any = null) {
  if (!userIdEl || !emailEl || !roleEl || !userFormTitle || !userModal) return;

  clearFormErrors();
  userIdEl.value = id ? String(id) : "";
  emailEl.value = data?.email || "";
  roleEl.value = data?.role || "editor";

  modalOriginal = { email: emailEl.value, role: String(roleEl.value || "editor") };

  const meId = me?.user?.id ? String(me.user.id) : null;
  const isSelf = meId && id && String(id) === meId;

  if (isSelf && me?.user?.role !== "owner") {
    roleEl.setAttribute("disabled", "true");
  } else {
    roleEl.removeAttribute("disabled");
  }

  userFormTitle.textContent = id ? "Editar usuario" : "Nuevo usuario";
  if (!canEdit) return;
  userModal.showModal();
}

async function onSubmitUser(e: Event) {
  e.preventDefault();
  if (!emailEl || !roleEl || !userIdEl || !userModal) return;

  clearFormErrors();

  const id = userIdEl.value || null;
  const email = (emailEl.value || "").trim();
  const role = String(roleEl.value || "editor");

  if (!email) {
    markInvalid(emailEl, "El email es obligatorio");
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    markInvalid(emailEl, "Email inválido");
    return;
  }

  try {
    if (!id) {
      toast.show("Creando…");
      const res = await apiPost(`/v1/users`, { email, role });
      if (!res.ok) {
        const { text, fieldErrors } = await getErrorInfo(res);
        fieldErrors.forEach((fe: any) => {
          const el = fe.field === "email" ? emailEl : fe.field === "role" ? roleEl : null;
          if (el) markInvalid(el, fe.message || "Dato inválido");
        });
        return toast.show(text || "Error", "err");
      }
      toast.show("Creado ✅", "ok");
      userModal.close();
      await loadUsers();
      return;
    }

    const meId = me?.user?.id ? String(me.user.id) : null;
    const isSelf = meId && String(id) === meId;

    if (email !== modalOriginal.email) {
      toast.show("Actualizando email…");
      const r = await apiPut(`/v1/users/${id}/email`, { email });
      if (!r.ok) {
        const { text, fieldErrors } = await getErrorInfo(r);
        fieldErrors.forEach((fe: any) => fe.field === "email" && markInvalid(emailEl, fe.message || "Dato inválido"));
        return toast.show(text || "No se pudo actualizar el email", "err");
      }
    }

    if (role !== modalOriginal.role) {
      if (!canEdit) return toast.show("No autorizado para cambiar rol", "err");
      if (isSelf && me?.user?.role !== "owner") {
        return toast.show("No podés cambiar tu propio rol (salvo owner)", "err");
      }

      toast.show("Actualizando rol…");
      const r = await apiPut(`/v1/users/${id}/role`, { role });
      if (!r.ok) {
        const { text, fieldErrors } = await getErrorInfo(r);
        fieldErrors.forEach((fe: any) => fe.field === "role" && markInvalid(roleEl, fe.message || "Dato inválido"));
        return toast.show(text || "No se pudo actualizar el rol", "err");
      }
    }

    toast.show("Guardado ✅", "ok");
    userModal.close();
    await loadUsers();
  } catch (err) {
    console.error(err);
    toast.show(toErrorText(err), "err");
  }
}

async function onToggleStatus(id: string, nextActive: boolean) {
  if (!canEdit) return toast.show("No autorizado", "err");

  const u = items.find((x) => String(x.id) === String(id));
  if (!u) return;

  const meId = me?.user?.id ? String(me.user.id) : null;
  const isSelf = meId && String(u.id) === meId;
  if (isSelf) return toast.show("No podés bloquearte a vos mismo", "err");
  if (u.role === "owner" && nextActive === false) return toast.show("No se puede bloquear un Owner", "err");

  const ok = confirm(`${nextActive ? "Desbloquear" : "Bloquear"} a ${u.email}?`);
  if (!ok) return;

  try {
    toast.show(nextActive ? "Desbloqueando…" : "Bloqueando…");
    const status = nextActive ? "active" : "blocked";
    const res = await apiPut(`/v1/users/${id}/status`, { status });
    if (!res.ok) {
      const { text } = await getErrorInfo(res);
      return toast.show(text || "No se pudo actualizar el estado", "err");
    }
    await loadUsers();
    toast.show("Estado actualizado ✅", "ok");
  } catch (e) {
    console.error(e);
    toast.show("No se pudo actualizar el estado", "err");
  }
}

async function onResetToken(id: string) {
  if (!canEdit) return;
  const ok = confirm("¿Generar token de blanqueo para este usuario?");
  if (!ok) return;

  try {
    toast.show("Generando token…");
    const res = await apiPost(`/v1/users/${id}/recovery-token`);
    if (!res.ok) {
      const { text } = await getErrorInfo(res);
      toast.show(text || "No se pudo generar el token", "err");
      return;
    }
    const { token, expiresAt } = await res.json();
    if (resetTokenEl) resetTokenEl.value = token || "";
    if (tokenExpEl) tokenExpEl.textContent = expiresAt ? "Vence: " + new Date(expiresAt).toLocaleString() : "";
    resetModal?.showModal();
    toast.clear();
  } catch (e) {
    console.error(e);
    toast.show("No se pudo generar el token", "err");
  }
}

function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let t: any;
  return (...a: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function escapeHtml(str: string) {
  return String(str || "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      } as any)[m]
  );
}
