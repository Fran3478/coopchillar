import { apiFetch } from "../lib/api";

const FOLDERS_URL = "/v1/media/folders";
const ASSETS_URL = "/v1/media/assets";
const DELETE_URL = "/v1/media/asset";

document.addEventListener("DOMContentLoaded", () => {
  void main();
});

async function main() {
  const treeEl = document.getElementById("folderTree") as HTMLElement | null;
  const grid = document.getElementById("grid") as HTMLElement | null;

  const reloadBtn = document.getElementById("reload") as HTMLButtonElement | null;
  const prevBtn = document.getElementById("prev") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("next") as HTMLButtonElement | null;
  const info = document.getElementById("info") as HTMLElement | null;

  const toast = document.getElementById("toast") as HTMLElement | null;
  const usedSeg = document.querySelector(".used-filter") as HTMLElement | null;

  const previewModal = document.getElementById("previewModal") as HTMLDialogElement | null;
  const previewTitle = document.getElementById("previewTitle") as HTMLElement | null;
  const previewBody = document.getElementById("previewBody") as HTMLElement | null;
  const previewMeta = document.getElementById("previewMeta") as HTMLElement | null;
  const previewCopy = document.getElementById("previewCopy") as HTMLButtonElement | null;
  const previewOpen = document.getElementById("previewOpen") as HTMLButtonElement | null;
  const previewClose = document.getElementById("previewClose") as HTMLButtonElement | null;

  if (!treeEl || !grid || !reloadBtn || !prevBtn || !nextBtn || !info || !toast || !previewModal || !previewTitle || !previewBody || !previewMeta || !previewCopy || !previewOpen || !previewClose) {
    console.warn("[admin-medios] Faltan elementos del DOM. Abortando init.");
    return;
  }

  function toastMsg(msg: string) {
    toast.textContent = msg;
    toast.className = "toast show";
    setTimeout(() => (toast.className = "toast"), 1600);
  }

  const state = {
    folder: "all",
    cursor: null as string | null,
    prevStack: [] as (string | null)[],
    totalApprox: 0,
    lastItems: [] as any[],
    used: "all",
  };

  function buildTree(folders: any[]) {
    const root: any = { children: new Map<string, any>() };
    const labelByPath = new Map(
      folders.map((f) => [f.path, f.name || String(f.path).split("/").pop()])
    );

    for (const f of folders) {
      const parts = String(f.path).split("/");
      let node = root;
      const acc: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        acc.push(part);
        const p = acc.join("/");
        if (!node.children.has(part)) {
          node.children.set(part, {
            key: p,
            label: labelByPath.get(p) || part,
            children: new Map<string, any>(),
          });
        }
        node = node.children.get(part);
      }
    }
    return root;
  }

  function renderTreeNode(node: any, parent: HTMLElement) {
    const entries = Array.from(node.children.values()).sort((a: any, b: any) =>
      a.label.localeCompare(b.label, "es")
    );

    for (const n of entries) {
      const li = document.createElement("li");
      const hasChildren = n.children.size > 0;
      li.innerHTML = `
        <button class="node ${state.folder === n.key ? "active" : ""}" data-path="${n.key}">
          ${hasChildren ? `<span class="chev">▾</span>` : `<span class="leaf" aria-hidden="true"></span>`}
          <span class="label">${escapeHtml(n.label)}</span>
        </button>
      `;
      parent.appendChild(li);

      if (hasChildren) {
        const ul = document.createElement("ul");
        li.appendChild(ul);
        renderTreeNode(n, ul);
      }
    }
  }

  async function loadFolders() {
    treeEl.innerHTML = "";

    const rootBtn = document.createElement("button");
    rootBtn.className = "node " + (state.folder === "all" ? "active" : "");
    rootBtn.dataset.path = "all";
    rootBtn.innerHTML = `<span class="chev" aria-hidden="true">●</span><span class="label">Todas</span>`;
    treeEl.appendChild(rootBtn);

    try {
      const res = await apiFetch(FOLDERS_URL, { method: "GET" });
      if (!res.ok) throw new Error(await res.text());
      const { folders = [] } = await res.json();
      const t = buildTree(folders);
      const ul = document.createElement("ul");
      treeEl.appendChild(ul);
      renderTreeNode(t, ul);
    } catch (err) {
      console.error(err);
      const div = document.createElement("div");
      div.className = "sub";
      div.style.padding = ".4rem .6rem";
      div.textContent = "No se pudieron cargar carpetas";
      treeEl.appendChild(div);
    }
  }

  treeEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".node") as HTMLButtonElement | null;
    if (!b) return;

    const path = b.dataset.path || "all";
    if (path === state.folder) return;

    state.folder = path;
    state.cursor = null;
    state.prevStack = [];

    treeEl.querySelectorAll(".node").forEach((n) =>
      n.classList.toggle("active", n === b)
    );

    void listAssets();
  });

  async function listAssets({ cursor = null as string | null } = {}) {
    grid.innerHTML = `<div class="media-card" style="padding:1rem">Cargando…</div>`;
    try {
      const params = new URLSearchParams();
      if (state.folder && state.folder !== "all") params.set("folder", state.folder);
      if (state.used !== "all") params.set("used", state.used);
      if (cursor) params.set("cursor", cursor);

      const res = await apiFetch(`${ASSETS_URL}?${params.toString()}`, { method: "GET" });

      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        grid.innerHTML = `<div class="media-card" style="padding:1rem;color:#a3122a">Error: ${escapeHtml(j.error || String(res.status))}</div>`;
        nextBtn.disabled = prevBtn.disabled = true;
        info.textContent = "";
        return;
      }

      const j = await res.json();
      let items: any[] = Array.isArray(j.items) ? j.items : [];

      // si querés filtrar client-side por "used" (además del server)
      if (state.used !== "all") {
        const want = state.used === "true";
        items = items.filter((it) => !!it.used === want);
      }

      state.lastItems = items;
      state.totalApprox = j.totalCountApprox ?? 0;

      renderGrid(items);

      nextBtn.disabled = !j.nextCursor;
      (nextBtn as any).dataset.cursor = j.nextCursor || "";

      prevBtn.disabled = state.prevStack.length === 0;

      info.textContent = state.totalApprox ? `~${state.totalApprox} elementos` : "";
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<div class="media-card" style="padding:1rem;color:#a3122a">Error listando medios</div>`;
      nextBtn.disabled = prevBtn.disabled = true;
      info.textContent = "";
    }
  }

  function renderGrid(items: any[]) {
    if (items.length === 0) {
      grid.innerHTML = `<div class="media-card" style="padding:1rem">Sin resultados</div>`;
      return;
    }

    grid.innerHTML = "";
    for (const it of items) {
      const id = it.publicId || it.public_id || "";
      const url = it.secureUrl || it.secure_url || it.url || "";
      const w = it.width || 0;
      const h = it.height || 0;
      const fmt = it.format || "";
      const folder = it.folder || "";
      const rtype = it.resourceType || it.resource_type || "image";
      const used = !!it.used;
      const name = String(id || "").split("/").pop();

      const card = document.createElement("div");
      card.className = "media-card";
      (card as any).dataset.publicId = id;
      (card as any).dataset.url = url;
      (card as any).dataset.kind = rtype;

      card.innerHTML = `
        <div class="thumb">
          ${
            rtype === "video"
              ? `<video src="${escapeAttr(url)}" muted playsinline preload="metadata"></video>`
              : url
                ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(name || "")}">`
                : `<span>sin vista</span>`
          }
        </div>
        <div class="meta">
          <div class="name" title="${escapeAttr(id)}">${escapeHtml(name || "(sin nombre)")}</div>
          <div class="sub">${escapeHtml(String(w || "?"))}×${escapeHtml(String(h || "?"))} · ${escapeHtml(fmt || "?")}</div>
          <div class="row">
            ${folder ? `<span class="tag">${escapeHtml(folder)}</span>` : ""}
            ${rtype === "video" ? `<span class="tag">video</span>` : ""}
            <span class="badge ${used ? "is-used" : "is-unused"}">${used ? "En uso" : "Libre"}</span>
          </div>
          <div class="ops">
            <button class="kbtn" data-act="copy" data-url="${escapeAttr(url)}">Copiar URL</button>
            <button class="kbtn danger solid" data-act="del" data-id="${encodeURIComponent(id)}">Eliminar</button>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        openPreview(it);
      });

      grid.appendChild(card);
    }
  }

  grid.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!btn) return;

    const act = (btn as any).dataset.act;

    if (act === "copy") {
      const u = (btn as any).dataset.url || "";
      if (!u) return;
      await navigator.clipboard.writeText(u);
      toastMsg("URL copiada");
      e.stopPropagation();
      return;
    }

    if (act === "del") {
      const id = (btn as any).dataset.id ? decodeURIComponent((btn as any).dataset.id) : "";
      if (!id) return;

      e.stopPropagation();
      if (!confirm(`¿Eliminar "${id}"?`)) return;

      const res = await apiFetch(`${DELETE_URL}?publicId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        toastMsg("Eliminado");
        await listAssets();
      } else {
        const j = await res.json().catch(() => ({} as any));
        alert(j.error || "No se pudo eliminar");
      }
    }
  });

  nextBtn.addEventListener("click", () => {
    const cur = (nextBtn as any).dataset.cursor as string | undefined;
    if (cur) {
      state.prevStack.push(cur);
      void listAssets({ cursor: cur });
    }
  });

  prevBtn.addEventListener("click", () => {
    state.prevStack.pop();
    const prev = state.prevStack[state.prevStack.length - 1] || null;
    void listAssets({ cursor: prev || null });
  });

  usedSeg?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".seg-btn") as HTMLElement | null;
    if (!btn) return;

    usedSeg.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );

    state.used = (btn as any).dataset.used || "all";
    state.cursor = null;
    state.prevStack = [];
    void listAssets();
  });

  reloadBtn.addEventListener("click", () => void listAssets());

  function openPreview(it: any) {
    const id = it.publicId || it.public_id || "";
    const url = it.secureUrl || it.secure_url || it.url || "";
    const w = it.width || 0;
    const h = it.height || 0;
    const fmt = it.format || "";
    const folder = it.folder || "";
    const used = !!it.used;
    const rtype = it.resourceType || it.resource_type || "image";
    const created = it.createdAt || it.created_at || "";

    previewTitle.textContent = String(id || "").split("/").pop() || "Vista previa";
    previewBody.innerHTML = "";

    if (rtype === "video") {
      const v = document.createElement("video");
      v.src = url;
      v.controls = true;
      v.playsInline = true;
      previewBody.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = url;
      img.alt = previewTitle.textContent || "";
      previewBody.appendChild(img);
    }

    const usages = Array.isArray(it.usages) ? it.usages : [];
    const usageText = usages.length
      ? usages
          .map((u: any) => `${escapeHtml(u.kind || "")}${u.titulo ? ` — ${escapeHtml(u.titulo)}` : ""}`)
          .join("<br>")
      : "—";

    previewMeta.innerHTML = [
      ["Archivo", id || "—"],
      ["Carpeta", folder || "—"],
      ["Tamaño", `${w || "?"} × ${h || "?"}`],
      ["Formato", fmt || "—"],
      ["Creado", created ? new Date(created).toLocaleString("es-AR") : "—"],
      ["Estado", used ? "En uso" : "Libre"],
      ["Usos", usageText],
    ]
      .map(([k, v]) => `<div class="row"><b>${escapeHtml(k)}</b><div>${String(v)}</div></div>`)
      .join("");

    (previewCopy as any).dataset.url = url;
    (previewOpen as any).dataset.url = url;

    previewModal.showModal();
  }

  previewCopy.addEventListener("click", async () => {
    const u = (previewCopy as any).dataset.url || "";
    if (!u) return;
    await navigator.clipboard.writeText(u);
    toastMsg("URL copiada");
  });

  previewOpen.addEventListener("click", () => {
    const u = (previewOpen as any).dataset.url || "";
    if (!u) return;
    window.open(u, "_blank", "noopener,noreferrer");
  });

  previewClose.addEventListener("click", () => previewModal.close());
  previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) previewModal.close();
  });

  await loadFolders();
  await listAssets();
}

function escapeHtml(str: any) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] as string));
}
function escapeAttr(str: any) {
  return String(str || "").replace(/"/g, "&quot;");
}
