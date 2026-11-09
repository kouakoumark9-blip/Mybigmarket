import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "Créer un compte" };
type Props = { searchParams: Promise<{ callbackUrl?: string }> };
export default async function RegisterPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams;
  return <AuthForm mode="register" callbackUrl={callbackUrl}/>;
}
