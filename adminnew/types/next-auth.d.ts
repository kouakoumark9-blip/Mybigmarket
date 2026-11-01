import type { DefaultSession } from "next-auth";


declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      roleCode: string;
      permissions: string[];
      passwordChangedAt: string;
    };
  }
  interface User {
    roleCode: string;
    permissions: string[];
    passwordChangedAt: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    roleCode?: string;
    permissions?: string[];
    lastActivityAt?: number;
    passwordChangedAt?: string;
  }
}
