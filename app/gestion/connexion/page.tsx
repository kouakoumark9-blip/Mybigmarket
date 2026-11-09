import { redirect } from "next/navigation";
import { LoginForm } from "@/components/gestion/login-form";
import { currentAdmin } from "@/lib/gestion/session";

export default async function ConnexionPage() {
  if (await currentAdmin()) redirect("/gestion");
  return <div className="gs-login"><h1>Administration MyBigMarket</h1><LoginForm/></div>;
}
