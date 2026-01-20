import { apiGet, apiPut, getErrorInfo, toErrorText } from "../lib/api";
import { makeToaster } from "../lib/admin-uploader";

type ContactItem = any;
type EbillingItem = any;

function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300) {
  let t: number | undefined;
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

const badge = (s: string) => {
  const map: Record<string, string> = { pending: "is-pending", resolved: "is-resolved" };
  const label = s === "resolved" ? "Resuelto" : "Pendiente";
  return `<span class="badge ${map[s] || "is-pending"}">${label}</span>`;
};

const fullName = (n?: string, a?: string) => (n || "") + (a ? " " + a : "");

const escapeHtml = (str: string) =>
  (str || "").replace(/[&<>\"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" } as Record<string, string>)[m]
  );

function qsFrom(obj: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && String(v).length) qs.set(k, String(v));
  }
  return qs.toString();
}

function must<T extends HTMLElement>(id: string) {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`No se encontró #${id}`);
  return el;
}

document.addEventListener("DOMContentLoaded", () => {
  const toast = makeToaster("status", { okMs: 1600, errMs: 5000 });

  let cPage = 1,
    cPageSize = 10,
    cTotal = 0;

  let cItems: ContactItem[] = [];
  let cQ = "",
    cCat = "",
    cStatus = "";

  const cRows = must<HTMLTableSectionElement>("c-rows");
  const cInfo = must<HTMLSpanElement>("c-info");
  const cPrev = must<HTMLButtonElement>("c-prev");
  const cNext = must<HTMLButtonElement>("c-next");
  const cQEl = must<HTMLInputElement>("c-q");
  const cCatEl = must<HTMLSelectElement>("c-cat");
  const cStatusEl = must<HTMLSelectElement>("c-status");

  const contactModal = must<HTMLDialogElement>("contactModal");
  const contactDetail = must<HTMLDivElement>("contactDetail");
  const closeContactModal = must<HTMLButtonElement>("closeContactModal");

  let ePage = 1,
    ePageSize = 10,
    eTotal = 0;

  let eItems: EbillingItem[] = [];
  let eQ = "",
    eStatus = "";

  const eRows = must<HTMLTableSectionElement>("e-rows");
  const eInfo = must<HTMLSpanElement>("e-info");
  const ePrev = must<HTMLButtonElement>("e-prev");
  const eNext = must<HTMLButtonElement>("e-next");
  const eQEl = must<HTMLInputElement>("e-q");
  const eStatusEl = must<HTMLSelectElement>("e-status");

  const ebillingModal = must<HTMLDialogElement>("ebillingModal");
  const ebillingDetail = must<HTMLDivElement>("ebillingDetail");
  const closeEbillingModal = must<HTMLButtonElement>("closeEbillingModal");

  function renderContactRow(c: any) {
    const nombre = fullName(c.nombre, c.apellido);
    const cat = c.categoria || "—";
    const email = c.email || "—";
    const tel = c.telefono || "—";
    const st = c.status || "pending";
    const handled = c.handledByUserId != null ? `#${c.handledByUserId}` : "—";

    const actions =
      st === "pending"
        ? `<button class="kbtn success solid c-resolve" data-id="${c.id}">Resolver</button>`
        : `<button class="kbtn ghost c-reopen" data-id="${c.id}">Reabrir</button>`;

    return `<tr>
      <td>${escapeHtml(nombre || "—")}</td>
      <td class="hidem">${escapeHtml(cat)}</td>
      <td class="hidem">${escapeHtml(email)}</td>
      <td class="hidem">${escapeHtml(tel)}</td>
      <td class="hidem">${badge(st)}</td>
      <td class="hidem">${escapeHtml(handled)}</td>
      <td class="td actions">
        <div class="row-actions">
          <button class="kbtn c-view" data-id="${c.id}">Ver</button>
          ${actions}
        </div>
      </td>
    </tr>`;
  }

  function openContactModalById(id: string) {
    const c = cItems.find((x: any) => String(x.id) === String(id));
    if (!c) return;

    const rows: Array<[string, any]> = [
      ["Nombre", fullName(c.nombre, c.apellido) || "—"],
      ["Categoría", c.categoria || "—"],
      ["Email", c.email || "—"],
      ["Teléfono", c.telefono || "—"],
      ["Socio Nº", c.socioNumero ?? "—"],
      ["DNI", c.dni ?? "—"],
      ["Estado", c.status === "resolved" ? "Resuelto" : "Pendiente"],
      ["Resuelto por", c.handledByUserId != null ? `#${c.handledByUserId}` : "—"],
      ["Detalle", c.detalle || "—"],
    ];

    contactDetail.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="row"><b>${escapeHtml(k)}</b><div>${escapeHtml(String(v))}</div></div>`
      )
      .join("");

    contactModal.showModal();
  }

  async function onContactStatus(id: string, status: "pending" | "resolved") {
    const ok = confirm(status === "resolved" ? "¿Marcar como resuelto?" : "¿Reabrir contacto?");
    if (!ok) return;

    try {
      toast.show("Actualizando…");
      const r = await apiPut(`/v1/contacts/${encodeURIComponent(id)}/status`, { status });
      if (!r.ok) {
        const { text } = await getErrorInfo(r);
        return toast.show(text || "No se pudo actualizar", "err");
      }
      await loadContacts();
      toast.show("Actualizado ✅", "ok");
    } catch (err) {
      console.error(err);
      toast.show(toErrorText(err) || "No se pudo actualizar", "err");
    }
  }

  async function loadContacts() {
    try {
      cRows.innerHTML = `<tr><td colspan="7" class="empty">Cargando…</td></tr>`;

      const qs = qsFrom({
        page: String(cPage),
        pageSize: String(cPageSize),
        q: cQ || undefined,
        categoria: cCat || undefined,
        status: cStatus || undefined,
      });

      const res = await apiGet(`/v1/contacts?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      cTotal = data.total || 0;
      cItems = Array.isArray(data.items) ? data.items : [];

      if (!cItems.length) {
        cRows.innerHTML = `<tr><td colspan="7" class="empty">Sin resultados</td></tr>`;
      } else {
        cRows.innerHTML = cItems.map(renderContactRow).join("");

        cRows.querySelectorAll<HTMLButtonElement>(".c-view").forEach((btn) =>
          btn.addEventListener("click", () => openContactModalById(btn.dataset.id || ""))
        );
        cRows.querySelectorAll<HTMLButtonElement>(".c-resolve").forEach((btn) =>
          btn.addEventListener("click", () => onContactStatus(btn.dataset.id || "", "resolved"))
        );
        cRows.querySelectorAll<HTMLButtonElement>(".c-reopen").forEach((btn) =>
          btn.addEventListener("click", () => onContactStatus(btn.dataset.id || "", "pending"))
        );
      }

      const maxPage = Math.max(1, Math.ceil(cTotal / cPageSize));
      const first = cTotal ? (cPage - 1) * cPageSize + 1 : 0;
      const last = Math.min(cPage * cPageSize, cTotal);

      cInfo.textContent = cTotal ? `${first}-${last} de ${cTotal}` : "0 resultados";

      const prevDisabled = cPage <= 1;
      const nextDisabled = cPage >= maxPage;

      cPrev.disabled = prevDisabled;
      cNext.disabled = nextDisabled;
      cPrev.setAttribute("aria-disabled", String(prevDisabled));
      cNext.setAttribute("aria-disabled", String(nextDisabled));
    } catch (e) {
      console.error(e);
      cRows.innerHTML = `<tr><td colspan="7" class="empty">Error cargando</td></tr>`;
      toast.show("Error cargando contactos", "err");
    }
  }

  function renderEbillingRow(r: any) {
    const nombre = fullName(r.nombre, r.apellido);
    const st = r.status || "pending";

    const actions =
      st === "pending"
        ? `<button class="kbtn success solid e-resolve" data-id="${r.id}">Resolver</button>`
        : `<button class="kbtn ghost e-reopen" data-id="${r.id}">Reabrir</button>`;

    return `<tr>
      <td>${escapeHtml(String(r.abonadoNumero ?? "—"))}</td>
      <td>${escapeHtml(nombre || "—")}</td>
      <td class="hidem">${escapeHtml(String(r.dniCuit ?? "—"))}</td>
      <td class="hidem">${escapeHtml(r.email || "—")}</td>
      <td class="hidem">${escapeHtml(r.telefono || "—")}</td>
      <td class="hidem">${badge(st)}</td>
      <td class="td actions">
        <div class="row-actions">
          <button class="kbtn e-view" data-id="${r.id}">Ver</button>
          ${actions}
        </div>
      </td>
    </tr>`;
  }

  function openEbillingModalById(id: string) {
    const r = eItems.find((x: any) => String(x.id) === String(id));
    if (!r) return;

    const rows: Array<[string, any]> = [
      ["Abonado Nº", r.abonadoNumero ?? "—"],
      ["DNI/CUIT", r.dniCuit ?? "—"],
      ["Nombre", fullName(r.nombre, r.apellido) || "—"],
      ["Email", r.email || "—"],
      ["Teléfono", r.telefono || "—"],
      ["Estado", r.status === "resolved" ? "Resuelto" : "Pendiente"],
    ];

    ebillingDetail.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="row"><b>${escapeHtml(k)}</b><div>${escapeHtml(String(v))}</div></div>`
      )
      .join("");

    ebillingModal.showModal();
  }

  async function onEbillingStatus(id: string, status: "pending" | "resolved") {
    const ok = confirm(status === "resolved" ? "¿Marcar como resuelto?" : "¿Reabrir solicitud?");
    if (!ok) return;

    try {
      toast.show("Actualizando…");
      const r = await apiPut(`/v1/ebilling-requests/${encodeURIComponent(id)}/status`, { status });
      if (!r.ok) {
        const { text } = await getErrorInfo(r);
        return toast.show(text || "No se pudo actualizar", "err");
      }
      await loadEbilling();
      toast.show("Actualizado ✅", "ok");
    } catch (err) {
      console.error(err);
      toast.show(toErrorText(err) || "No se pudo actualizar", "err");
    }
  }

  async function loadEbilling() {
    try {
      eRows.innerHTML = `<tr><td colspan="7" class="empty">Cargando…</td></tr>`;

      const qs = qsFrom({
        page: String(ePage),
        pageSize: String(ePageSize),
        q: eQ || undefined,
        status: eStatus || undefined,
      });

      const res = await apiGet(`/v1/ebilling-requests?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      eTotal = data.total || 0;
      eItems = Array.isArray(data.items) ? data.items : [];

      if (!eItems.length) {
        eRows.innerHTML = `<tr><td colspan="7" class="empty">Sin resultados</td></tr>`;
      } else {
        eRows.innerHTML = eItems.map(renderEbillingRow).join("");

        eRows.querySelectorAll<HTMLButtonElement>(".e-view").forEach((btn) =>
          btn.addEventListener("click", () => openEbillingModalById(btn.dataset.id || ""))
        );
        eRows.querySelectorAll<HTMLButtonElement>(".e-resolve").forEach((btn) =>
          btn.addEventListener("click", () => onEbillingStatus(btn.dataset.id || "", "resolved"))
        );
        eRows.querySelectorAll<HTMLButtonElement>(".e-reopen").forEach((btn) =>
          btn.addEventListener("click", () => onEbillingStatus(btn.dataset.id || "", "pending"))
        );
      }

      const maxPage = Math.max(1, Math.ceil(eTotal / ePageSize));
      const first = eTotal ? (ePage - 1) * ePageSize + 1 : 0;
      const last = Math.min(ePage * ePageSize, eTotal);

      eInfo.textContent = eTotal ? `${first}-${last} de ${eTotal}` : "0 resultados";

      const prevDisabled = ePage <= 1;
      const nextDisabled = ePage >= maxPage;

      ePrev.disabled = prevDisabled;
      eNext.disabled = nextDisabled;
      ePrev.setAttribute("aria-disabled", String(prevDisabled));
      eNext.setAttribute("aria-disabled", String(nextDisabled));
    } catch (e) {
      console.error(e);
      eRows.innerHTML = `<tr><td colspan="7" class="empty">Error cargando</td></tr>`;
      toast.show("Error cargando adhesiones", "err");
    }
  }

  cQEl.addEventListener(
    "input",
    debounce(() => {
      cQ = (cQEl.value || "").trim();
      cPage = 1;
      loadContacts();
    }, 300)
  );

  cCatEl.addEventListener("change", () => {
    cCat = cCatEl.value || "";
    cPage = 1;
    loadContacts();
  });

  cStatusEl.addEventListener("change", () => {
    cStatus = cStatusEl.value || "";
    cPage = 1;
    loadContacts();
  });

  cPrev.addEventListener("click", () => {
    if (cPage > 1) {
      cPage--;
      loadContacts();
    }
  });

  cNext.addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(cTotal / cPageSize));
    if (cPage < maxPage) {
      cPage++;
      loadContacts();
    }
  });

  eQEl.addEventListener(
    "input",
    debounce(() => {
      eQ = (eQEl.value || "").trim();
      ePage = 1;
      loadEbilling();
    }, 300)
  );

  eStatusEl.addEventListener("change", () => {
    eStatus = eStatusEl.value || "";
    ePage = 1;
    loadEbilling();
  });

  ePrev.addEventListener("click", () => {
    if (ePage > 1) {
      ePage--;
      loadEbilling();
    }
  });

  eNext.addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(eTotal / ePageSize));
    if (ePage < maxPage) {
      ePage++;
      loadEbilling();
    }
  });

  contactModal.addEventListener("click", (e) => {
    if (e.target === contactModal) contactModal.close();
  });
  ebillingModal.addEventListener("click", (e) => {
    if (e.target === ebillingModal) ebillingModal.close();
  });

  closeContactModal.addEventListener("click", () => contactModal.close());
  closeEbillingModal.addEventListener("click", () => ebillingModal.close());

  loadContacts();
  loadEbilling();
});
