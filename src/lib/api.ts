function getCookie(name: string) {
  const pairs = document.cookie ? document.cookie.split("; ") : [];
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    const key = eq > -1 ? pair.slice(0, eq) : pair;
    if (key === name) return decodeURIComponent(eq > -1 ? pair.slice(eq + 1) : "");
  }
  return null;
}
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
}

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const res = await fetch("/v1/auth/refresh", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const token: string | undefined = j?.token;
  if (!token) return null;
  setCookie("access_token", token);
  return token;
}
function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Contraseña",
  tipo: "Tipo de publicación",
  titulo: "Título",
  excerpt: "Resumen",
  portadaUrl: "URL de la portada",
  linkUrl: "Enlace externo",
  destacado: "Destacado",
  blocksJson: "Contenido",
  estado: "Estado",
  slug: "Slug",
};

export function humanizeField(raw: string | undefined): string {
  if (!raw) return "Campo";
  const last = raw.split(".").pop()!;
  if (FIELD_LABELS[last]) return FIELD_LABELS[last];
  const pretty = last.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
  return pretty.replace(/\burl\b/i, "URL").replace(/^\w/, (m) => m.toUpperCase());
}

export function toErrorText(e: unknown): string {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || "Error";
  try {
    const j = typeof e === "object" ? (e as any) : JSON.parse(String(e));
    if (j?.error) {
      const msg = j.error.message || "Error";
      const det = Array.isArray(j.error.details) ? j.error.details[0] : null;
      if (det) {
        const field = det.field || (Array.isArray(det.path) ? det.path.at(-1) : "");
        const label = humanizeField(field);
        const m = det.message || msg;
        return `${m}: ${label}`;
      }
      return msg;
    }
    if (j?.message) return j.message;
    return JSON.stringify(j);
  } catch {
    return String(e);
  }
}

export async function getErrorInfo(
  res: Response
): Promise<{ text: string; fieldErrors: Array<{ field: string; label: string; message: string }> }> {
  let text = `Error ${res.status}`;
  const fieldErrors: Array<{ field: string; label: string; message: string }> = [];
  try {
    const j = await res.json();
    const err = j?.error ?? j;
    const baseMsg = err?.message || text;

    if (Array.isArray(err?.details) && err.details.length) {
      for (const d of err.details) {
        const field = d.field || (Array.isArray(d.path) ? d.path.at(-1) : "");
        const label = humanizeField(field);
        const message = d.message || baseMsg || "Dato inválido";
        fieldErrors.push({ field, label, message });
      }
      const first = fieldErrors[0];
      text = `${first.message}: ${first.label}`;
    } else if (typeof baseMsg === "string") {
      text = baseMsg;
    }
  } catch {
  }
  return { text, fieldErrors };
}

export async function getErrorText(res: Response): Promise<string> {
  const { text } = await getErrorInfo(res);
  return text;
}

export function applyFieldErrors(
  errors: Array<{ field: string; label: string; message: string }>,
  opts: { root?: ParentNode; scroll?: boolean } = {}
) {
  const root = opts.root || document;
  root.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  root.querySelectorAll(".err-tip").forEach((el) => el.remove());

  for (const { field, message } of errors) {
    if (!field) continue;
    const sel = [
      `#${CSS.escape(field)}`,
      `[name="${CSS.escape(field)}"]`,
      `[data-field="${CSS.escape(field)}"]`,
    ].join(",");

    const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(sel);
    if (!input) continue;

    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");

    const tip = document.createElement("small");
    tip.className = "err-tip";
    tip.textContent = message;
    const fieldWrap = input.closest(".field") || input.parentElement || input;
    fieldWrap.appendChild(tip);

    if (opts.scroll) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (!isForm && init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getCookie("access_token");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res = await fetch(path, { ...init, headers, credentials: init.credentials ?? "include" });

  if (res.status !== 401 || path.startsWith("/v1/auth/")) return res;

  const newToken = await refreshAccessToken();
  if (!newToken) return res;

  const retriedHeaders = new Headers(headers);
  retriedHeaders.set("Authorization", `Bearer ${newToken}`);
  return fetch(path, { ...init, headers: retriedHeaders, credentials: init.credentials ?? "include" });
}

export const apiGet = (path: string, init: RequestInit = {}) =>
  apiFetch(path, { ...init, method: "GET" });

export const apiPost = (path: string, body?: unknown, init: RequestInit = {}) =>
  apiFetch(path, {
    ...init,
    method: "POST",
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
  });

export const apiPut = (path: string, body?: unknown, init: RequestInit = {}) =>
  apiFetch(path, {
    ...init,
    method: "PUT",
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
  });

export const apiPatch = (path: string, body?: unknown, init: RequestInit = {}) =>
  apiFetch(path, {
    ...init,
    method: "PATCH",
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
});

export const apiDel = (path: string, init: RequestInit = {}) =>
  apiFetch(path, { ...init, method: "DELETE" });

export async function jsonOrThrow<T = any>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await getErrorText(res));
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function clientGetMe<T = any>() {
  const res = await apiGet("/v1/me");
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}