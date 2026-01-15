import EditorJS, { type ToolConstructable } from "@editorjs/editorjs";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import ImageTool from "@editorjs/image";
import { apiPost, getErrorInfo, toErrorText, jsonOrThrow } from "../lib/api";
import { requestSignature, uploadToCloudinary, assertImage, markInvalid, clearFieldError } from "../lib/admin-uploader";
// import LinkTool from "@editorjs/link";

const HeaderTool: ToolConstructable = Header as unknown as ToolConstructable;
const ListTool:   ToolConstructable = List   as unknown as ToolConstructable;
const ImageToolC: ToolConstructable = ImageTool as unknown as ToolConstructable;

const CONTENT_KEY = "cms:contenido:draft";
const META_KEY    = "cms:postmeta:draft:new";

function getEl<T extends HTMLElement>(id: string) {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`No se encontró #${id}`);
  return el;
}

function isValidUrl(str: string) {
  if (!str) return false;
  try {
    new URL(str);
    return true;
  } catch (error) {
    return false;
  }
}



function showStatus(msg: string, type: "" | "ok" | "err" = "") {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `status show ${type}`;
  if (type === "ok") setTimeout(() => (statusEl.className = "status"), 1600);
}

function clearFieldErrors() {
  document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
  document.querySelectorAll(".err-tip").forEach(el => el.remove());
}

function toHumanLabel(field: string) {
  const map: Record<string, string> = {
    titulo: "Título",
    excerpt: "Resumen",
    portadaUrl: "URL de la portada",
    destacado: "Destacado",
    linkUrl: "Enlace",
    tipo: "Tipo",
    blocksJson: "Contenido",
  };
  return map[field] || field;
}

function markFieldErrors(fieldErrors: { field: string; message: string }[]) {
  document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid","is-invalid"));
  document.querySelectorAll(".err-tip").forEach(el => el.remove());

  for (const { field, message } of fieldErrors) {
    const el =
      (field === "titulo"     && document.getElementById("titulo"))     ||
      (field === "excerpt"    && document.getElementById("excerpt"))    ||
      (field === "portadaUrl" && document.getElementById("portadaUrl")) ||
      (field === "destacado"  && document.getElementById("destacado"))  ||
      (field === "linkUrl"    && document.getElementById("linkUrl"))    ||
      (field === "tipo"       && document.getElementById("tipo"))       ||
      null;

    if (el) {
      markInvalid(el, `${toHumanLabel(field)}: ${message || "Dato inválido"}`);
    }
  }
}


function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]!));
}

type MetaDraft = {
  tipo: "noticia" | "novedad";
  titulo: string;
  excerpt: string;
  portadaUrl: string;
  destacado: boolean;
  linkUrl: string | null;
};

let dirty = false;
let metaTimer: number | null = null;

function markDirty() {
  dirty = true;
  if (metaTimer) window.clearTimeout(metaTimer);
  metaTimer = window.setTimeout(saveMeta, 600);
}
function saveMeta() {
  metaTimer = null;
  const tipoEl = document.getElementById("tipo") as HTMLInputElement | null;
  const tituloEl = document.getElementById("titulo") as HTMLInputElement | null;
  const excerptEl = document.getElementById("excerpt") as HTMLTextAreaElement | null;
  const portadaEl = document.getElementById("portadaUrl") as HTMLInputElement | null;
  const destacadoEl = document.getElementById("destacado") as HTMLInputElement | null;
  const linkUrlEl = document.getElementById("linkUrl") as HTMLInputElement | null;

  const meta: MetaDraft = {
    tipo: (tipoEl?.value === "novedad" ? "novedad" : "noticia"),
    titulo: (tituloEl?.value || "").trim(),
    excerpt: (excerptEl?.value || "").trim(),
    portadaUrl: (portadaEl?.value || "").trim(),
    destacado: !!destacadoEl?.checked,
    linkUrl: (tipoEl?.value === "novedad") ? ((linkUrlEl?.value || "").trim() || null) : null,
  };
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}
function loadMeta(): MetaDraft | null {
  const raw = localStorage.getItem(META_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as MetaDraft; } catch { return null; }
}

function bindUnsavedChangesGuard() {
  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

async function boot() {
  const holder = getEl<HTMLDivElement>("editorjs");

  const DEFAULT_FOLDER = holder.dataset.folder || "pages";
  const rawType = holder.dataset.resourceType;
  const RESOURCE_TYPE: "image" | "video" = rawType === "video" ? "video" : "image";

  const saveBtn = document.getElementById("saveBtn");
  const previewBtn = document.getElementById("previewBtn");

  const tipoEl = document.getElementById("tipo") as HTMLInputElement | null;
  const tituloEl = document.getElementById("titulo") as HTMLInputElement | null;
  const excerptEl = document.getElementById("excerpt") as HTMLTextAreaElement | null;
  const portadaEl = document.getElementById("portadaUrl") as HTMLInputElement | null;
  const destacadoEl = document.getElementById("destacado") as HTMLInputElement | null;
  const linkUrlEl = document.getElementById("linkUrl") as HTMLInputElement | null;

  [tipoEl, tituloEl, excerptEl, portadaEl, destacadoEl, linkUrlEl].forEach((el) => {
    if (!el) return;
    const clear = () => {
       clearFieldError(el as HTMLElement);
      markDirty();
    };
    el.addEventListener("input", clear);
    el.addEventListener("change", clear);
  });

  const metaDraft = loadMeta();
  if (metaDraft) {
    if (tipoEl) tipoEl.value = metaDraft.tipo;
    if (tituloEl) tituloEl.value = metaDraft.titulo || "";
    if (excerptEl) excerptEl.value = metaDraft.excerpt || "";
    if (portadaEl) portadaEl.value = metaDraft.portadaUrl || "";
    if (destacadoEl) destacadoEl.checked = !!metaDraft.destacado;
    if (linkUrlEl && metaDraft.tipo === "novedad") linkUrlEl.value = metaDraft.linkUrl || "";
    dirty = true;
  }

  const imageToolConfig = {
    class: ImageToolC,
    config: {
      captionPlaceholder: "Pie de imagen",
      uploader: {
        async uploadByFile(file: File) {
          assertImage(file, 10);

          showStatus("Subiendo imagen…");

          const sig = await requestSignature({
            resourceType: RESOURCE_TYPE,
            folder: DEFAULT_FOLDER,
            incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
          });

          const resp = await uploadToCloudinary(file, sig);

          showStatus("", "");
          return { success: 1, file: { url: resp.secure_url } };
        },
      },
    },
  } as any;

  const editor = new EditorJS({
    holder: "editorjs",
    autofocus: true,
    placeholder: "Escribí acá…",
    i18n: {
      /**
      * @type {I18nDictionary}
      */
      messages: {
        ui: {
          toolbar: { toolbox: { "Add": "Añadir bloque", "Filter": "Buscar", "Nothing found": "Sin resultados" }, converter: { "Convert to": "Convertir a" } },
          blockTunes: { toggler: { "Click to tune": "Ajustes", "or move": "o mover" } },
          popover : {"Filter": "Buscar","Nothing found": "Sin resultados", "Convert to":"Convertir a"}
        },
        toolNames: {
          "Paragraph": "Párrafo", "Text": "Párrafo", "Header": "Título", "Heading": "Título",
          "Image": "Imagen", "Checklist": "Lista de tareas",
          "Unordered List": "Lista con viñetas", "Ordered List": "Lista numerada",
          "Unordered list": "Lista con viñetas", "Ordered list": "Lista numerada",
          "Warning": "Advertencia", "Quote": "Cita", "Italic": "Itálica", "Bold": "Negrita"
        },
        blockTunes: {
          delete: { "Delete": "Eliminar", "Click to delete": "Click para confirmar" },
          moveUp: { "Move up": "Mover arriba" }, moveDown: { "Move down": "Mover abajo" },
        },
        tools: {
          list: { "Ordered": "Numerada", "Unordered": "Viñetas" },
          image: { "Caption": "Pie de imagen", "Select an Image": "Seleccionar imagen",
                   "With border": "Con borde", "Stretch image": "Estirar imagen", "With background": "Con fondo" },
          header: { "Heading": "Título", "Heading 2": "Título 2", "Heading 3": "Título 3", "Heading 4": "Título 4" },
          "convertTo": {
            "Convert to": "Convertir a"
          },
          checklist: { "Checklist": "Lista de tareas", "Add an item": "Agregar ítem" },
          "link": { "Add a link": "Añadir un enlace" }
        },
      },
    },
    tools: {
      header: { 
        class: HeaderTool,
        inlineToolbar: true,
        toolbox: { title: "Título" },
        config: { levels: [2, 3, 4], defaultLevel: 2 }
      } as any,
      list: {
        class: ListTool,
        inlineToolbar: true,
        toolbox: { title: "Lista" } 
      } as any,
      image: imageToolConfig,
      // linkTool: { class: LinkTool as unknown as ToolConstructable, config: { endpoint: "/v1/links/preview" } } as any,
    },
    data: JSON.parse(
      localStorage.getItem(CONTENT_KEY) ||
      '{"time":0,"blocks":[{"type":"paragraph","data":{"text":""}}],"version":"2.29.0"}'
    ),
    onChange: async () => {
      try {
        const out = await editor.save();
        localStorage.setItem(CONTENT_KEY, JSON.stringify(out));
        dirty = true;
      } catch {}
    },
  });

  [tipoEl, tituloEl, excerptEl, portadaEl, destacadoEl, linkUrlEl].forEach((el) => {
    el?.addEventListener("input", markDirty);
    el?.addEventListener("change", markDirty);
  });

  bindUnsavedChangesGuard();

  saveBtn?.addEventListener("click", async () => {
    try {
      showStatus("Guardando…");

      const blocks = JSON.parse(localStorage.getItem(CONTENT_KEY) || "null") || await editor.save();

      const tipo = (tipoEl?.value === "novedad") ? "novedad" : "noticia";
      const titulo = (tituloEl?.value ?? "").trim();
      const excerpt = (excerptEl?.value ?? "").trim();
      const portada = (portadaEl?.value ?? "").trim();
      const destacado = (tipo === "novedad") ? true : !!destacadoEl?.checked;
      const linkUrl = (tipo === "novedad" ? (linkUrlEl?.value ?? "").trim() : "");

      clearFieldErrors();

      if (!titulo) {
        markInvalid(tituloEl, "El título es obligatorio");
        showStatus("Falta el título", "err");
        return;
      }

      if (portada && !isValidUrl(portada)) {
        markInvalid(portadaEl, "URL de portada inválida");
        showStatus("URL inválida: Portada", "err");
        return;
      }

      if (tipo === "novedad" && linkUrl && !isValidUrl(linkUrl)) {
        markInvalid(linkUrlEl, "URL inválida");
        showStatus("URL inválida: Enlace", "err");
        return;
      }

      if (excerpt && excerpt.length > 240) {
        markInvalid(excerptEl, "Máximo 240 caracteres");
        showStatus("Resumen demasiado largo (máx 240)", "err");
        return;
      }

      const body: any = { tipo, titulo, blocksJson: blocks };
      if (excerpt) body.excerpt = excerpt;
      if (destacado) body.destacado = true;
      if (portada) body.portadaUrl = portada;
      if (tipo === "novedad" && linkUrl) body.linkUrl = linkUrl;

      if (body.destacado && !body.portadaUrl) throw new Error("Si es destacada, agregá una portada");

      const res = await apiPost("/v1/posts", body);

      if (!res.ok) {
        const { text, fieldErrors } = await getErrorInfo(res);
        if (fieldErrors.length) {
          markFieldErrors(fieldErrors.map(fe => ({ field: fe.field, message: fe.message || "Dato inválido" })));
        }
        showStatus(text, "err");
        return;
      }

      localStorage.removeItem(CONTENT_KEY);
      localStorage.removeItem(META_KEY);
      dirty = false;

      showStatus("Guardado ✅", "ok");
      const next = tipo === "novedad" ? "/admin/novedades" : "/admin/noticias";
      location.href = next;
    } catch (e: any) {
      console.error(e);
      showStatus(toErrorText(e), "err");
    }
  });

  previewBtn?.addEventListener("click", async () => {
    try {
      const data = await editor.save();
      const w = window.open("", "_blank");
      w?.document.write(
        `<pre style="padding:16px;font-family:ui-monospace,Menlo,Consolas,monospace">${escapeHtml(
          JSON.stringify(data, null, 2)
        )}</pre>`
      );
      w?.document.close();
    } catch {}
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
