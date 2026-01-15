export type CMSItem = {
  kind: "noticia" | "novedad";
  slug: string;
  title: string;
  imageUrl?: string | null;
  date?: string | null;
  excerpt?: string | null;
  externalUrl?: string | null;
  destacado?: boolean;
};

export type GalleryApiItem = {
  id: number;
  url: string;
  alt?: string | null;
  description?: string | null;
  album?: string | null;
};

export type GalleryItem = {
  id: number;
  src: string;
  alt?: string | null;
  description?: string | null;
  album?: string | null;
};

function toAbs(base: URL, path: string) {
  return new URL(path, base).toString();
}

function mapItem(x: any): CMSItem {
  return {
    kind: (x?.tipo === "noticia" ? "noticia" : "novedad") as "noticia" | "novedad",
    slug: x?.slug ?? "",
    title: x?.titulo ?? "",
    imageUrl: x?.portadaUrl ?? null,
    date: x?.publicadoEn ?? x?.createdAt ?? null,
    excerpt: x?.excerpt ?? null,
    externalUrl: x?.linkUrl ?? null,
    destacado: !!x?.destacado,
  };
}

function mapGalleryItem(x: any): GalleryItem {
  return {
    id: Number(x?.id),
    src: String(x?.url ?? ''),
    alt: x?.alt ?? null,
    description: x?.description ?? null,
    album: x?.album ?? null,
  };
}

async function getJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function fetchPublicPostsSSR(
  base: URL,
  tenantId: number,
  params: { tipo?: "noticia" | "novedad"; destacado?: boolean; pageSize?: number; page?: number; q?: string } = {}
): Promise<CMSItem[]> {
  const usp = new URLSearchParams();
  if (params.tipo) usp.set("tipo", params.tipo);
  if (params.destacado !== undefined) usp.set("destacado", String(params.destacado));
  if (params.pageSize) usp.set("pageSize", String(params.pageSize));
  if (params.page) usp.set("page", String(params.page));
  if (params.q) usp.set("q", params.q);

  const json = await getJSON(toAbs(base, `/v1/public/tenants/${tenantId}/posts?${usp.toString()}`));
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map(mapItem);
}


export async function fetchPublicBySlugSSR(base: URL, tenantId: number, slug: string) {
  const json = await getJSON(toAbs(base, `/v1/public/tenants/${tenantId}/posts/${encodeURIComponent(slug)}`));
  return json ? { item: mapItem(json), raw: json } : null;
}

export async function fetchPublicGallerySSR(
  base: URL,
  tenantId: number,
  params: { album?: string; pageSize?: number; page?: number; q?: string } = {}
): Promise<GalleryItem[]> {
  const usp = new URLSearchParams();
  if (params.album) usp.set('album', params.album);
  if (params.pageSize) usp.set('pageSize', String(params.pageSize));
  if (params.page) usp.set('page', String(params.page));
  if (params.q) usp.set('q', params.q);

  const url = toAbs(base, `/v1/public/tenants/${tenantId}/media/gallery?${usp.toString()}`);
  const json = await getJSON(url);

  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map(mapGalleryItem);
}