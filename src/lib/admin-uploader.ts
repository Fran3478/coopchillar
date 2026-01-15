import { apiPost, jsonOrThrow } from "./api";

export function makeToaster(statusElId = "status", opts?: { okMs?: number, errMs: number }) {
    const okMs = opts?.okMs ?? 1600;
    const errMs = opts?.errMs ?? 5000;
    const el = document.getElementById(statusElId);
    let timer: number | null = null;

    function show(msg: string, type: "" | "ok" | "err" = "", ms?:number) {
        if (!el) return;
        el.textContent = msg;
        el.className = `status show ${type}`;
        if (timer) window.clearTimeout(timer);
        const dur = ms ?? (type === "err" ? errMs : okMs);
        if (dur > 0) timer = window.setTimeout(clear, dur);
    }
    function clear() {
        if(!el) return;
        el.className = "status";
        el.textContent = "";
    }
    return { show, clear};
}

export type SignPayload = {
    resourceType?: "image" | "video";
    folder?: string;
    publicId?: string;
    eager?: string;
    incomingTransform?: string;
};
export type Signature = {
    cloudName: string;
    apiKey: string;
    signature: string;
    timestamp: string;
    folder?: string;
    publicId?: string;
    transformation?: string;
    eager?: string;
    resourceType?: "image" | "video";
}

export async function requestSignature(payload: SignPayload): Promise<Signature> {
    const res = await apiPost("/v1/media/sign", payload);
    return jsonOrThrow<Signature>(res);
}

export async function uploadToCloudinary(file: File, sig: Signature): Promise<any> {
    const resourceType = sig.resourceType || "image";
    const url = `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`;

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", String(sig.apiKey));
    form.append("timestamp", String(sig.timestamp));
    form.append("signature", String(sig.signature));
    if (sig.folder) form.append("folder", String(sig.folder));
    if (sig.publicId) form.append("public_id", String(sig.publicId));
    if (sig.transformation) form.append("transformation", String(sig.transformation));
    if(sig.eager) form.append("eager", sig.eager);

    const r = await fetch(url, { method: "POST", body: form });
    if(!r.ok) throw new Error(`Error subiendo a Cloudinary (${r.status})`);
    return r.json();
}

export function markInvalid(input: HTMLElement | null, msg= "Dato inválido") {
    if(!input) return;
    input.classList.add("is-invalid", "invalid");
    input.setAttribute("aria-invalid", "true");
    
    const label = input.closest("label") || input.parentElement;
    label?.querySelectorAll(".err-tip").forEach(n => n.remove());

    const tip = document.createElement("small");
    tip.className = "err-tip";
    tip.role = "alert";
    tip.textContent = msg;
    
    const tipId = `${(input as HTMLInputElement).id || "field"}-err`;
    tip.id = tipId;

    const prev = (input as HTMLInputElement).getAttribute("aria-describedby");
    const described = prev ? new Set(prev.split(" ").filter(Boolean)) : new Set<string>();
    described.add(tipId);
    (input as HTMLInputElement).setAttribute("aria-describedby", Array.from(described).join(" "));

    (label || input.parentElement || input).appendChild(tip);
}

export function clearFieldError(input: HTMLElement | null) {
    if (!input) return;
    input.classList.remove("is-invalid", "invalid");
    const label = input.closest("label") || input.parentElement;
    const tip = label?.querySelector?.(".err-tip") as HTMLElement | null;
    
    if (tip) {
        const tipId = tip.id || `${(input as HTMLInputElement).id || "field"}-err`;
        tip.remove();
        
        const prev = (input as HTMLInputElement).getAttribute("aria-describedby");
        if (prev) {
            const left = prev.split(" ").filter(p => p && p !== tipId);
            if (left.length) {
                (input as HTMLInputElement).setAttribute("aria-describedby", left.join(" "));
            } else {
                (input as HTMLInputElement).removeAttribute("aria-describedby");
            }
        }
    }
    const hasMore = (label || input.parentElement)?.querySelector(".err-tip");
    if (!hasMore) {
        input.removeAttribute("aria-invalid");
    }
}

export function bindClearOnInput(elements: Array<HTMLElement | null>) {
    elements.forEach((el) => {
        if (!el) return;
        ["input", "change"].forEach((ev) => 
            el.addEventListener(ev, () => clearFieldError(el as HTMLElement))
        );
    })
}

export function clearFileInput(fileEl: HTMLInputElement | null) {
    if (!fileEl) return;
    fileEl.value = "";
}

export function assertImage(file: File, maxMB = 10) {
  if (!/^image\//.test(file.type)) {
    throw new Error("Formato no soportado");
  }
  const mb = file.size / (1024 * 1024);
  if (mb > maxMB) {
    throw new Error(`La imagen supera ${maxMB}MB`);
  }
}