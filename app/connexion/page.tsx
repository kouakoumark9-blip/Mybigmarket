import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "Connexion" };
type Props = { searchParams: Promise<{ callbackUrl?: string }> };
export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams;
  return <AuthForm mode="login" callbackUrl={callbackUrl}/>;
}
