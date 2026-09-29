"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function MessagesAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <button className="messages-refresh" type="button" onClick={() => router.refresh()} aria-label="Actualiser les messages"><RefreshCw size={14}/> Actualiser</button>;
}
