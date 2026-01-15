import EditorJS from "@editorjs/editorjs";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import ImageTool from "@editorjs/image";
import { apiGet, apiPut, apiPost, jsonOrThrow, getErrorInfo, toErrorText } from "../lib/api";

const undefIfEmpty = (v?: string | null) => {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length ? t : undefined;
};

function showStatus(msg: string, type: "" | "ok" | "err" = "") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = `status show ${type}`;
  if (type === "ok") setTimeout(() => (el.className = "status"), 1400);
}

const $ = {
  titulo:    () => document.getElementById("titulo")     as HTMLInputElement | null,
  excerpt:   () => document.getElementById("excerpt")    as HTMLTextAreaElement | null,
  portadaUrl:() => document.getElementById("portadaUrl") as HTMLInputElement | null,
  destacado: () => document.getElementById("destacado")  as HTMLInputElement | null,
};

function clearFieldErrors() {
  document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
  document.querySelectorAll(".err-tip").forEach(el => el.remove());
}

function markFieldErrors(fieldErrors: { field: string; message: string }[]) {
  clearFieldErrors();
  for (const { field, message } of fieldErrors) {
    const el =
      (field === "titulo"     && $.titulo())     ||
      (field === "excerpt"    && $.excerpt())    ||
      (field === "portadaUrl" && $.portadaUrl()) ||
      (field === "destacado"  && $.destacado())  ||
      null;

    if (!el) continue;

    el.classList.add("invalid");
    const tip = document.createElement("div");
    tip.className = "err-tip";
    tip.textContent = message;
    el.insertAdjacentElement("afterend", tip);
  }
}

function slugify(s: string) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    .slice(0, 60) || "img";
}

async function requestSignature(payload: any) {
  const res = await apiPost("/v1/media/sign", payload);
  return jsonOrThrow(res);
}

async function uploadToCloudinary(file: File, sig: any, publicId?: string) {
  const cloudName = sig.cloudName;
  const resourceType = sig.resourceType || "image";
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", String(sig.apiKey));
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", String(sig.signature));
  if (sig.folder) form.append("folder", sig.folder);
  if (publicId) form.append("public_id", publicId);
  if (sig.transformation) form.append("transformation", sig.transformation);
  if (sig.eager) form.append("eager", sig.eager);

  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) throw new Error(`Error subiendo a Cloudinary (${r.status})`);
  return r.json();
}


(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";

  const cfg = document.getElementById("cfg") as HTMLElement | null;
  const CLOUD_NAME = cfg?.dataset.cloudName || "tu_cloud_name";
  const DEFAULT_FOLDER = cfg?.dataset.folder || "posts";
  const RESOURCE_TYPE = cfg?.dataset.resourceType || "image";

  const tituloEl    = $.titulo()!;
  const excerptEl   = $.excerpt()!;
  const portadaEl   = $.portadaUrl()!;
  const fileEl      = document.getElementById("portadaFile") as HTMLInputElement | null;
  const destacadoEl = $.destacado()!;
  const saveBtn     = document.getElementById("saveBtn") as HTMLButtonElement | null;

  let post: any = null;
  try {
    const res = await apiGet(`/v1/posts/${id}`);
    post = res.ok ? await res.json() : null;
  } catch {
  }
  if (!post) {
    const raw = localStorage.getItem("cms:postEdit");
    if (raw) post = JSON.parse(raw);
  }
  if (!post) {
    showStatus("No se pudo cargar la noticia", "err");
    return;
  }

  tituloEl.value = post.titulo || "";
  excerptEl.value = post.excerpt || "";
  portadaEl.value = post.portadaUrl || "";
  destacadoEl.checked = !!post.destacado;

  const editor = new EditorJS({
    holder: "editorjs",
    autofocus: true,
    placeholder: "Escribí acá…",
    tools: {
      header: { class: Header, inlineToolbar: true, config: { levels: [2, 3, 4], defaultLevel: 2 } },
      list: { class: List, inlineToolbar: true },
      image: {
        class: ImageTool,
        config: {
          captionPlaceholder: "Pie de imagen",
          uploader: {
            async uploadByFile(file: File) {
              if (!/^image\//.test(file.type)) throw new Error("Formato no soportado");
              if (file.size > 10 * 1024 * 1024) throw new Error("La imagen supera 10MB");

              showStatus("Subiendo imagen…");
              const titulo = (document.getElementById("titulo") as HTMLInputElement)?.value || "";
              const publicId = `${slugify(titulo)}-${Date.now()}`;
              const sig = await requestSignature({
                resourceType: "image",
                folder: "noticias",
                publicId,
                incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
              });
              const resp = await uploadToCloudinary(file, sig, publicId);
              showStatus("", "");
              return { success: 1, file: { url: resp.secure_url } };
            },
          },
        },
      },
    },
    data:
      post.blocksJson || {
        time: Date.now(),
        blocks: [{ type: "paragraph", data: { text: "" } }],
        version: "2.28.0",
      },
  });

  fileEl?.addEventListener("change", async (e: any) => {
  const file: File | undefined = e.target?.files?.[0];
  if (!file) return;
  try {
    showStatus("Subiendo imagen…");
    const titulo = (document.getElementById("titulo") as HTMLInputElement)?.value || "";
    const publicId = `portada-${slugify(titulo)}-${Date.now()}`;

    const sig = await requestSignature({
      resourceType: "image",
      folder: "noticias",
      publicId,
      incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
    });

    const resp = await uploadToCloudinary(file, sig, publicId);
    portadaEl.value = resp.secure_url;
    showStatus("Imagen subida ✅", "ok");
  } catch (err: any) {
    console.error(err);
    showStatus(err?.message || "No se pudo subir la imagen", "err");
  }
});

  saveBtn?.addEventListener("click", async () => {
    try {
      clearFieldErrors();
      showStatus("Guardando…");

      const blocks = await editor.save();
      const titulo = (tituloEl.value || "").trim();
      const excerpt = (excerptEl.value || "").trim();
      const portada = (portadaEl.value || "").trim();
      const destacado = !!destacadoEl.checked;

      if (!titulo) throw new Error("Falta el título");

       const body: any = {
        tipo: "noticia",
        titulo,
        destacado,
        blocksJson: blocks
      };

      if (excerpt) body.excerpt = excerpt;
      if (portada) body.portadaUrl = portada;

      const res = await apiPut(`/v1/posts/${id}`, body);
      
      if (!res.ok) {
        const { text, fieldErrors } = await getErrorInfo(res);
        markFieldErrors(fieldErrors);
        showStatus(text, "err");
        return;
      }

      localStorage.removeItem("cms:postEdit");
      showStatus("Guardado ✅", "ok");
    } catch (e: any) {
      console.error(e);
     showStatus(toErrorText(e) || "Error al guardar", "err");
    }
  });
})();
