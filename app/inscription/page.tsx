import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";
import { AuthForm } from "@/components/auth-form";
export async function generateMetadata(): Promise<Metadata> { return { title: (await getTr())("Créer un compte") }; }
type Props = { searchParams: Promise<{ callbackUrl?: string }> };
export default async function RegisterPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams;
  return <AuthForm mode="register" callbackUrl={callbackUrl}/>;
}
