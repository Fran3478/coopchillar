import EditorJS from "@editorjs/editorjs";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import ImageTool from "@editorjs/image";

import { apiGet, apiPut, getErrorInfo, toErrorText } from "../lib/api";
import {
  requestSignature,
  uploadToCloudinary,
  assertImage,
  makeToaster,
  markInvalid,
  clearFieldError,
  clearFileInput,
} from "../lib/admin-uploader";

const $ = {
  titulo: () => document.getElementById("titulo") as HTMLInputElement | null,
  excerpt: () => document.getElementById("excerpt") as HTMLTextAreaElement | null,
  portadaUrl: () => document.getElementById("portadaUrl") as HTMLInputElement | null,
  portadaFile: () => document.getElementById("portadaFile") as HTMLInputElement | null,
  destacado: () => document.getElementById("destacado") as HTMLInputElement | null,
  saveBtn: () => document.getElementById("saveBtn") as HTMLButtonElement | null,
  cfg: () => document.getElementById("cfg") as HTMLElement | null,
};

function clearFieldErrors() {
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  document.querySelectorAll(".err-tip").forEach((el) => el.remove());
}

function markFieldErrors(fieldErrors: { field: string; message: string }[]) {
  clearFieldErrors();

  for (const { field, message } of fieldErrors) {
    const el =
      (field === "titulo" && $.titulo()) ||
      (field === "excerpt" && $.excerpt()) ||
      (field === "portadaUrl" && $.portadaUrl()) ||
      (field === "destacado" && $.destacado()) ||
      null;

    if (!el) continue;

    el.classList.add("invalid");
    const tip = document.createElement("div");
    tip.className = "err-tip";
    tip.textContent = message || "Dato inválido";
    el.insertAdjacentElement("afterend", tip);
  }
}

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "img";
}

(async () => {
  const toast = makeToaster("status", { okMs: 1400, errMs: 5000 });

  const params = new URLSearchParams(location.search);
  const id = (params.get("id") || "").trim();
  if (!id) {
    toast.show("Falta el id en la URL", "err");
    return;
  }

  const cfg = $.cfg();
  const DEFAULT_FOLDER = cfg?.dataset.folder || "posts";
  const rawType = cfg?.dataset.resourceType;
  const RESOURCE_TYPE: "image" | "video" = rawType === "video" ? "video" : "image";

  const tituloEl = $.titulo();
  const excerptEl = $.excerpt();
  const portadaEl = $.portadaUrl();
  const fileEl = $.portadaFile();
  const destacadoEl = $.destacado();
  const saveBtn = $.saveBtn();

  if (!tituloEl || !excerptEl || !portadaEl || !destacadoEl) {
    toast.show("Faltan campos del formulario en el DOM", "err");
    return;
  }

  // ---- Cargar post ----
  let post: any = null;

  try {
    const res = await apiGet(`/v1/posts/${encodeURIComponent(id)}`);
    post = res.ok ? await res.json() : null;
  } catch {
    post = null;
  }

  if (!post) {
    const raw = localStorage.getItem("cms:postEdit");
    if (raw) {
      try {
        post = JSON.parse(raw);
      } catch {
        post = null;
      }
    }
  }

  if (!post) {
    toast.show("No se pudo cargar la noticia", "err");
    return;
  }

  // ---- Hydrate form ----
  tituloEl.value = post.titulo || "";
  excerptEl.value = post.excerpt || "";
  portadaEl.value = post.portadaUrl || "";
  destacadoEl.checked = !!post.destacado;

  // ---- EditorJS ----
  const editor = new EditorJS({
    holder: "editorjs",
    autofocus: true,
    placeholder: "Escribí acá…",
    tools: {
      header: {
        class: Header as any,
        inlineToolbar: true,
        config: { levels: [2, 3, 4], defaultLevel: 2 },
      },
      list: { class: List as any, inlineToolbar: true },
      image: {
        class: ImageTool as any,
        config: {
          captionPlaceholder: "Pie de imagen",
          uploader: {
            async uploadByFile(file: File) {
              // Validación unificada
              assertImage(file, 10);

              toast.show("Subiendo imagen…");

              const titulo = tituloEl.value || "";

              const sig = await requestSignature({
                resourceType: RESOURCE_TYPE,
                folder: DEFAULT_FOLDER,
                incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
              });

              const resp = await uploadToCloudinary(file, sig);
              toast.clear();

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

  // ---- Portada upload ----
  fileEl?.addEventListener("change", async (e) => {
    const input = e.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      assertImage(file, 10);
    } catch (err: any) {
      markInvalid(fileEl, err?.message || "Archivo inválido");
      clearFileInput(fileEl);
      return toast.show(err?.message || "Archivo inválido", "err");
    }

    try {
      toast.show("Subiendo portada…");

      const sig = await requestSignature({
        resourceType: RESOURCE_TYPE,
        folder: `${DEFAULT_FOLDER}/portadas`,
        incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
      });

      const resp = await uploadToCloudinary(file, sig);
      portadaEl.value = resp.secure_url;

      clearFieldError(fileEl);
      clearFileInput(fileEl);

      toast.show("Imagen subida ✅", "ok");
    } catch (err: any) {
      console.error(err);
      markInvalid(fileEl, err?.message || "No se pudo subir la imagen");
      clearFileInput(fileEl);
      toast.show(err?.message || "No se pudo subir la imagen", "err");
    }
  });

  // ---- Guardar ----
  saveBtn?.addEventListener("click", async () => {
    try {
      clearFieldErrors();
      toast.show("Guardando…");

      const blocks = await editor.save();
      const titulo = (tituloEl.value || "").trim();
      const excerpt = (excerptEl.value || "").trim();
      const portada = (portadaEl.value || "").trim();
      const destacado = !!destacadoEl.checked;

      if (!titulo) {
        markInvalid(tituloEl, "Falta el título");
        toast.show("Falta el título", "err");
        return;
      }

      const body: any = { tipo: "noticia", titulo, destacado, blocksJson: blocks };
      if (excerpt) body.excerpt = excerpt;
      if (portada) body.portadaUrl = portada;

      const res = await apiPut(`/v1/posts/${encodeURIComponent(id)}`, body);

      if (!res.ok) {
        const { text, fieldErrors } = await getErrorInfo(res);
        markFieldErrors(fieldErrors.map((fe) => ({ field: fe.field, message: fe.message })));
        toast.show(text, "err");
        return;
      }

      localStorage.removeItem("cms:postEdit");
      toast.show("Guardado ✅", "ok");
    } catch (err: any) {
      console.error(err);
      toast.show(toErrorText(err) || "Error al guardar", "err");
    }
  });
})();
