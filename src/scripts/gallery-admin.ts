import { apiGet, apiPost, apiDel, getErrorInfo, toErrorText, apiPatch } from "../lib/api";

type MediaItem = {
  id: number;
  url: string;
  album: string | null;
  estado: "draft" | "published" | "archived";
  alt: string | null;
  description: string | null;
  descripcion?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CloudinaryUploadInfo = {
  public_id?: string;
  resource_type?: string;
  secure_url?: string;
};

const cfg = document.getElementById("cfg-media") as HTMLDivElement | null;
const DEFAULT_FOLDER = cfg?.dataset.folder || "gallery";
const RESOURCE_TYPE = cfg?.dataset.resourceType || "image";

const cardsEl = document.getElementById("cards") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const btnNew = document.getElementById("btn-new") as HTMLButtonElement;
const btnReload = document.getElementById("btn-reload") as HTMLButtonElement;
const btnMore = document.getElementById("btn-load-more") as HTMLButtonElement;

const qEl = document.getElementById("q") as HTMLInputElement;
const fStatusEl = document.getElementById("f-status") as HTMLSelectElement;
const fAlbumEl = document.getElementById("f-album") as HTMLInputElement;

const dlgEdit = document.getElementById("dlg-edit") as HTMLDialogElement;
const formEdit = document.getElementById("form-edit") as HTMLFormElement;
const dlgTitle = document.getElementById("dlg-title") as HTMLHeadingElement;

const fileEl = document.getElementById("file") as HTMLInputElement;
const urlEl = document.getElementById("url") as HTMLInputElement;
const albumEl = document.getElementById("album") as HTMLInputElement;
const estadoEl = document.getElementById("estado") as HTMLSelectElement;
const altEl = document.getElementById("alt") as HTMLInputElement;
const descEl = document.getElementById("descripcion") as HTMLTextAreaElement;
const btnUpload = document.getElementById("btn-upload") as HTMLButtonElement;
const btnCancel = document.getElementById("btn-cancel") as HTMLButtonElement;

const dlgView = document.getElementById("dlg-view") as HTMLDialogElement;
const viewBody = document.getElementById("view-body") as HTMLDivElement;
const btnCloseV = document.getElementById("btn-close-view") as HTMLButtonElement;

const dlgDel = document.getElementById("dlg-del") as HTMLDialogElement;
const delMsg = document.getElementById("del-msg") as HTMLParagraphElement;
const btnCancelDel = document.getElementById("btn-cancel-del") as HTMLButtonElement;
const btnConfirmDel = document.getElementById("btn-confirm-del") as HTMLButtonElement;

const uploadBlock = document.getElementById("upload-block") as HTMLDivElement;
const editNote = document.getElementById("edit-note") as HTMLElement;

let editingId: number | null = null;
let page = 1;
let hasMore = false;

let lastUpload: CloudinaryUploadInfo | null = null;

function fmtDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleString("es-AR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toast(msg: string, type: "" | "ok" | "err" = "") {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `status show ${type}`;
  if (type === "ok") setTimeout(() => (statusEl.className = "status"), 1600);
}

function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function requestSignature(payload: {
  resourceType: string;
  folder?: string;
  publicId?: string;
  incomingTransform?: string;
}) {
  const res = await apiPost("/v1/media/sign", payload);
  if (!res.ok) throw new Error("No se pudo obtener la firma");
  return res.json();
}

async function uploadToCloudinary(file: File, sig: any) {
  const resourceType = sig.resourceType || "image";
  const url = `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", String(sig.apiKey));
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", String(sig.signature));
  if (sig.folder)         form.append("folder", sig.folder);
  if (sig.publicId)       form.append("public_id", sig.publicId);
  if (sig.transformation) form.append("transformation", sig.transformation);
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) throw new Error(`Error subiendo a Cloudinary (${r.status})`);
  return r.json();
}

async function load(reset = true) {
  if (reset) { page = 1; cardsEl.innerHTML = ""; }
  const params = new URLSearchParams();
  if (qEl.value.trim()) params.set("q", qEl.value.trim());
  if (fStatusEl.value)  params.set("estado", fStatusEl.value);
  if (fAlbumEl.value.trim()) params.set("album", fAlbumEl.value.trim());
  params.set("page", String(page));
  params.set("limit", "24");

  const res = await apiGet(`/v1/media/gallery/assets?${params.toString()}`);
  if (!res.ok) {
    const { text } = await getErrorInfo(res);
    toast(text, "err");
    return;
  }
  const j = await res.json();
  const items: MediaItem[] = j.items ?? j.data ?? j.results ?? [];
  hasMore = !!j.hasMore || (Array.isArray(items) && items.length === 24);
  btnMore.hidden = !hasMore;

  for (const m of items) cardsEl.insertAdjacentHTML("beforeend", renderCard(m));
}

function renderCard(m: MediaItem) {
  const album  = m.album ?? "—";
  const estado = m.estado ?? "draft";
  const alt    = m.alt ?? "";
  const desc   = m.description ?? m.descripcion ?? "";

  return `
  <div class="card clickable" role="button" tabindex="0" data-id="${m.id}">
    <div class="thumb">${m.url ? `<img src="${m.url}" alt="${escapeHtml(alt || "")}">` : "Sin imagen"}</div>
    <div class="body">
      <div class="chips">
        <span class="chip">Álbum: ${escapeHtml(album)}</span>
        <span class="chip">Estado: ${escapeHtml(estado === "published" ? "Publicado" : estado === "draft" ? "Borrador" : "Archivado")}</span>
      </div>
      ${desc ? `<div style="font-size:.9rem;color:var(--muted)">${escapeHtml(desc)}</div>` : ""}
      <div class="row" style="margin-top:.6rem">
        <button class="btn" data-variant="ghost" data-size="sm" data-act="edit">Editar</button>
        <div class="grow"></div>
        <button class="btn" data-variant="danger" data-size="sm" data-act="del">Eliminar</button>
      </div>
    </div>
  </div>`;
}

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]!));
}

btnNew?.addEventListener("click", () => openEdit(null));
btnReload?.addEventListener("click", () => load(true));
btnMore?.addEventListener("click", () => { page += 1; load(false); });

cardsEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest("button");
  const card = target.closest(".card") as HTMLElement | null;
  if (!card) return;
  const id = Number(card.dataset.id);

  if (btn) {
    const act = btn.dataset.act;
    if (act === "edit") openEdit(id);
    else if (act === "del") confirmDelete(id, false);
    return;
  }

  openView(id);
});

cardsEl.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("card")) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const id = Number(target.dataset.id);
    openView(id);
  }
});

function setEditMode(isEdit: boolean) {
  if (isEdit) {
    uploadBlock.hidden = true;
    editNote.hidden = false;
    fileEl.disabled = true;
    urlEl.disabled = true;
    btnUpload.disabled = true;
    btnUpload.hidden = true;
  } else {
    uploadBlock.hidden = false;
    editNote.hidden = true;
    fileEl.disabled = false;
    urlEl.disabled = false;
    btnUpload.disabled = false;
    btnUpload.hidden = false;
  }
}

function fillEditForm(m?: MediaItem) {
  urlEl.value    = m?.url ?? "";
  albumEl.value  = m?.album ?? "";
  estadoEl.value = (m?.estado ?? "draft") as any;
  altEl.value    = m?.alt ?? "";
  descEl.value   = m?.description ?? m?.descripcion ?? "";
  fileEl.value   = "";
  lastUpload = null;
}

async function openEdit(id: number | null) {
  editingId = id;
  dlgTitle.textContent = id ? "Editar imagen" : "Nueva imagen";

  if (id) {
    setEditMode(true);
    const res = await apiGet(`/v1/media/gallery/assets/${id}`);
    if (!res.ok) { toast((await getErrorInfo(res)).text, "err"); return; }
    const m: MediaItem = await res.json();
    fillEditForm(m);
  } else {
    setEditMode(false);
    fillEditForm(undefined);
  }
  (dlgEdit as any).showModal();
}

btnCancel?.addEventListener("click", () => {
  dlgEdit.close();
  lastUpload = null;
  setEditMode(false);
});

btnUpload?.addEventListener("click", async () => {
  if (editingId) { toast("En edición no se puede cambiar la imagen.", "err"); return; }
  const file = fileEl.files?.[0];
  if (!file) { toast("Seleccioná un archivo", "err"); return; }
  if (!/^image\//.test(file.type)) { toast("Formato no soportado", "err"); return; }
  if (file.size > 10 * 1024 * 1024) { toast("La imagen supera 10MB", "err"); return; }

  try {
    toast("Subiendo imagen…");
    const album = albumEl.value.trim();
    const folder = album ? `${DEFAULT_FOLDER}/${slugify(album)}` : DEFAULT_FOLDER;
    const sig = await requestSignature({
      resourceType: RESOURCE_TYPE,
      folder,
      incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
    });
    const r = await uploadToCloudinary(file, sig);
    lastUpload = { public_id: r.public_id, resource_type: r.resource_type, secure_url: r.secure_url };
    urlEl.value = r.secure_url;
    toast("Imagen subida ✅", "ok");
  } catch (e) {
    console.error(e);
    toast("No se pudo subir la imagen", "err");
  }
});

formEdit?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (editingId) {
      const body = {
        alt: (altEl.value ?? ""),
        description: (descEl.value ?? ""),
        album: (albumEl.value ?? ""),
        estado: estadoEl.value as MediaItem["estado"],
      };
      const res = await apiPatch(`/v1/media/gallery/assets/${editingId}`, body);
      if (!res.ok) {
        const { text, fieldErrors } = await getErrorInfo(res);
        if (fieldErrors.length) highlightFieldErrors(fieldErrors);
        throw new Error(text);
      }
    } else {
      const meta = {
        alt: (altEl.value || "").trim() || null,
        description: (descEl.value || "").trim() || null,
        album: (albumEl.value || "").trim() || null,
        estado: estadoEl.value as MediaItem["estado"],
      };
      const upload: CloudinaryUploadInfo = {};
      if (lastUpload?.secure_url) upload.secure_url = lastUpload.secure_url;
      if (lastUpload?.public_id) upload.public_id = lastUpload.public_id;
      if (lastUpload?.resource_type) upload.resource_type = lastUpload.resource_type;
      if (!upload.secure_url && urlEl.value.trim()) upload.secure_url = urlEl.value.trim();
      if (!upload.secure_url) throw new Error("Subí una imagen o pegá una URL.");

      const body: any = { items: [{ upload, meta }] };
      const res = await apiPost(`/v1/media/gallery/assets`, body);
      if (!res.ok) {
        const { text, fieldErrors } = await getErrorInfo(res);
        if (fieldErrors.length) highlightFieldErrors(fieldErrors);
        throw new Error(text);
      }
    }

    dlgEdit.close();
    lastUpload = null;
    toast("Guardado ✅", "ok");
    await load(true);
  } catch (err) {
    console.error(err);
    toast(toErrorText(err), "err");
  }
});

function highlightFieldErrors(list: { field: string; message?: string }[]) {
  const map: Record<string, HTMLElement | null> = {
    album: albumEl,
    estado: estadoEl,
    alt: altEl,
    description: descEl,
    descripcion: descEl,
    url: urlEl,
  };
  list.forEach(({ field }) => {
    const el = map[field];
    el?.classList.add("invalid");
    setTimeout(() => el?.classList.remove("invalid"), 1800);
  });
}

async function openView(id: number) {
  const res = await apiGet(`/v1/media/gallery/assets/${id}`);
  if (!res.ok) { toast((await getErrorInfo(res)).text, "err"); return; }
  const m: MediaItem = await res.json();

  const album  = m.album ?? "—";
  const estado = m.estado ?? "draft";
  const alt    = m.alt ?? "";
  const desc   = m.description ?? m.descripcion ?? "";

  viewBody.innerHTML = `
    <div style="height:240px; background:#fafafa; border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:.75rem;">
      ${m.url ? `<img src="${m.url}" alt="${escapeHtml(alt||"")}" style="width:100%;height:100%;object-fit:contain;background:#fff">` : ""}
    </div>

    <div class="view-kv"><div class="k">Álbum</div><div class="v">${escapeHtml(album)}</div></div>
    <div class="view-kv"><div class="k">Estado</div><div class="v">${escapeHtml(estado === "published" ? "Publicado" : estado === "draft" ? "Borrador" : "Archivado")}</div></div>
    <div class="view-kv"><div class="k">Texto alternativo</div><div class="v">${escapeHtml(alt)}</div></div>
    <div class="view-kv"><div class="k">Descripción</div><div class="v">${escapeHtml(desc)}</div></div>
    <div class="view-kv"><div class="k">Creación</div><div class="v">${escapeHtml(fmtDate(m.createdAt))}</div></div>
    <div class="view-kv"><div class="k">Actualización</div><div class="v">${escapeHtml(fmtDate(m.updatedAt))}</div></div>
  `;
  (dlgView as any).showModal();
}
btnCloseV?.addEventListener("click", () => dlgView.close());

let deletingId: number | null = null;
function confirmDelete(id: number, force: boolean) {
  deletingId = id;
  delMsg.textContent = force
    ? "La imagen está publicada. ¿Eliminar de todos modos?"
    : "¿Seguro que querés eliminar esta imagen?";
  (dlgDel as any).showModal();
  btnConfirmDel.onclick = async () => {
    try {
      const url = force ? `/v1/media/gallery/assets/${id}?force=true` : `/v1/media/gallery/assets/${id}`;
      const res = await apiDel(url);
      if (res.status === 409 && !force) {
        dlgDel.close();
        confirmDelete(id, true);
        return;
      }
      if (!res.ok) {
        const { text } = await getErrorInfo(res);
        throw new Error(text);
      }
      dlgDel.close();
      toast("Eliminado ✅", "ok");
      await load(true);
    } catch (e) {
      console.error(e);
      dlgDel.close();
      toast(toErrorText(e), "err");
    }
  };
}
btnCancelDel?.addEventListener("click", () => dlgDel.close());

load(true);
