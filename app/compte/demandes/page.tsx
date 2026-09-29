import type { Metadata } from "next";
import { DemoInquiriesView } from "@/components/demo-inquiries-view";

export const metadata: Metadata = { title: "Mes demandes de devis" };
export default function BuyerInquiriesPage() { return <DemoInquiriesView/>; }
