import type { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "buyer" | "seller" | "admin" } & NonNullable<DefaultSession["user"]>;
  }
  interface User { role?: "buyer" | "seller" | "admin"; }
}

declare module "next-auth/jwt" {
  interface JWT { id?: string; role?: "buyer" | "seller" | "admin"; }
}
