import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: { default: "Administration | mybigmarket", template: "%s | mybigmarket admin" },
  description: "Espace d’administration privé de mybigmarket.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export const viewport: Viewport = { themeColor: "#101d2c", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><SessionProvider>{children}</SessionProvider></body></html>;
}
