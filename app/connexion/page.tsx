import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";
import { AuthForm } from "@/components/auth-form";
export async function generateMetadata(): Promise<Metadata> { return { title: (await getTr())("Connexion") }; }
type Props = { searchParams: Promise<{ callbackUrl?: string }> };
export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams;
  return <AuthForm mode="login" callbackUrl={callbackUrl}/>;
}
