import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  if (isLogin) {
    if (request.auth) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!request.auth) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  // L'export CSV fait sa propre vérification (session + permission + statut employé en base)
  // et doit répondre en JSON/CSV, pas par une redirection HTML vers /login.
  matcher: ["/((?!api/auth|api/commandes/export|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
