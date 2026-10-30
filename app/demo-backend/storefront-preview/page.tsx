import { notFound } from "next/navigation";
import { DemoStorefrontPreview } from "@/components/demo-storefront-preview";
import { MOCK_ACTORS } from "@/lib/demo-backend";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ sellerId?: string }> };
export default async function DemoStorefrontPreviewPage({ searchParams }: Props) {
  const { sellerId = "" } = await searchParams;
  if (!isDemoBackendEnabled() || !MOCK_ACTORS.seller.some((actor) => actor.id === sellerId)) notFound();
  return <DemoStorefrontPreview sellerId={sellerId}/>;
}
