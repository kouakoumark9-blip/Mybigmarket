import type { Metadata } from "next";
import { ThemeDemo } from "@/components/theme-demo";

export const metadata: Metadata = {
  title: "Thème dynamique",
  description: "Démonstration du thème de marque piloté par une seule variable CSS.",
  robots: { index: false, follow: false },
};

export default function ThemeDemoPage() {
  return <ThemeDemo/>;
}
