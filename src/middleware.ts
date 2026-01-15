import type { MiddlewareHandler } from "astro";

function getCookie(header: string | null | undefined, name: string) {
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const url = new URL(context.request.url);
  const isAdmin = url.pathname.startsWith("/admin");

  if (!isAdmin) return next();

  const cookies = context.request.headers.get("cookie") ?? "";
  const token = getCookie(cookies, "access_token");

  const meUrl = new URL("/v1/me", url).toString();

   const meRes = await fetch(meUrl, {
    method: "GET",
    headers: { 
      cookie: cookies,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
  });

  if (meRes.ok) return next();

  const returnTo = encodeURIComponent(url.pathname + url.search);
  return context.redirect(`/login?returnTo=${returnTo}`);
};
