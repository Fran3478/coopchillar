import { apiPost, getErrorInfo, toErrorText } from "../lib/api";

document.addEventListener("DOMContentLoaded", () => {
  void main();
});

async function main() {
  const DEFAULT_FOLDER = "novedades";
  const RESOURCE_TYPE = "image";

  const tituloEl = document.getElementById("titulo") as HTMLInputElement | null;
  const portadaEl = document.getElementById("portadaUrl") as HTMLInputElement | null;
  const fileEl = document.getElementById("portadaFile") as HTMLInputElement | null;
  const linkUrlEl = document.getElementById("linkUrl") as HTMLInputElement | null;
  const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement | null;

  if (!tituloEl || !portadaEl || !fileEl || !linkUrlEl || !saveBtn) {
    console.warn("[admin-nueva-novedad] faltan elementos del DOM");
    return;
  }

  function toast(msg: string, type: "" | "ok" | "err" = "") {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = msg;
    el.className = `status show ${type}`;
    if (type === "ok") setTimeout(() => (el.className = "status"), 1600);
  }

  async function requestSignature(payload: {
    resourceType: string;
    folder?: string;
    publicId?: string;
    incomingTransform?: string;
    eager?: string;
  }) {
    const res = await apiPost("/v1/media/sign", payload);
    if (!res.ok) throw new Error("No se pudo obtener la firma");
    return res.json();
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

  fileEl.addEventListener("change", async () => {
    const file = fileEl.files?.[0];
    if (!file) return;

    if (!/^image\//.test(file.type)) return toast("Formato no soportado", "err");
    if (file.size > 10 * 1024 * 1024) return toast("La imagen supera 10MB", "err");

    try {
      toast("Subiendo imagen…");

      const sig = await requestSignature({
        resourceType: RESOURCE_TYPE,
        folder: DEFAULT_FOLDER,
        incomingTransform: "c_limit,w_2560/f_webp,q_auto:good",
        // eager: "c_fill,w_1200"
      });

      const resp = await uploadToCloudinary(file, sig);
      portadaEl.value = resp.secure_url || "";
      toast("Imagen subida ✅", "ok");
    } catch (err) {
      console.error(err);
      toast("No se pudo subir la imagen", "err");
    }
  });

  saveBtn.addEventListener("click", async () => {
    try {
      const titulo = (tituloEl.value || "").trim();
      const portada = (portadaEl.value || "").trim();
      const link = (linkUrlEl.value || "").trim();

      if (!titulo) throw new Error("Falta el título");
      if (!portada) throw new Error("Agregá una portada");

      const body: any = {
        tipo: "novedad",
        titulo,
        excerpt: "",
        destacado: true,
        blocksJson: { time: Date.now(), blocks: [] },
        ...(portada ? { portadaUrl: portada } : {}),
        ...(link ? { linkUrl: link } : {}),
      };

      toast("Guardando…");
      const res = await apiPost("/v1/posts", body);
      if (!res.ok) {
        const { text } = await getErrorInfo(res);
        throw new Error(text);
      }

      toast("Guardado ✅", "ok");
      localStorage.removeItem("cms:contenido:draft");
      location.href = "/admin/novedades";
    } catch (e) {
      console.error(e);
      toast(toErrorText(e), "err");
    }
  });
}
