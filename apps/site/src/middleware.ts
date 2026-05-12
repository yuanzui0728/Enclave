import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  resolveLocaleFromAcceptLanguage,
} from "@/lib/locales";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSeg = pathname.split("/")[1] ?? "";

  if (isSupportedLocale(firstSeg)) {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const negotiated =
    (cookieLocale && isSupportedLocale(cookieLocale) ? cookieLocale : null) ??
    resolveLocaleFromAcceptLanguage(request.headers.get("accept-language")) ??
    DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = `/${negotiated}${pathname === "/" ? "" : pathname}`;
  // rewrite 而非 redirect：URL 保留原样（如 /），内部渲染 negotiated locale 的 SSG HTML，
  // 省掉 308 那一次公网隧道 RTT（实测 ~1.3s）。SEO 由 generateMetadata 里已有的 hreflang
  // + canonical 保证：每个 locale 页面 canonical 指向具体 /{locale}/...。
  const headers = new Headers(request.headers);
  headers.set("x-pathname", url.pathname);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: [
    "/((?!api|telemetry|_next/static|_next/image|favicon\\..*|favicon-.*|apple-touch-icon\\..*|icon-.*|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|manifest\\.json|opengraph-image|screenshots|animations|press-kit|og|sw\\.js).*)",
  ],
};
