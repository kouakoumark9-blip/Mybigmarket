export type DemoInquiry = {
  id: string;
  kind: "product" | "sourcing";
  productSlug?: string;
  productTitle: string;
  sellerName?: string;
  quantity: number;
  destination: string;
  contactPhone: string;
  message: string;
  createdAt: string;
  status: "En attente de réponse (démo)";
};

export type DemoOrder = {
  id: string;
  items: Array<{ slug: string; title: string; seller: string; qty: number; priceXof: number; minimumQuantity: number; leadTimeDays: number }>;
  totalXof: number;
  deliveryMethod: "delivery" | "pickup";
  deliveryCountryCode: string;
  deliveryCountryName: string;
  createdAt: string;
  status: "awaiting_payment";
};

const INQUIRY_KEY = "mybigmarket-demo-inquiries-v1";
const ORDER_KEY = "mybigmarket-demo-orders-v1";
const CHANGE_EVENT = "mybigmarket:demo-commerce-change";

export function subscribeDemoCommerce(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function getDemoInquiriesSnapshot() {
  if (typeof window === "undefined") return "[]";
  return window.localStorage.getItem(INQUIRY_KEY) || "[]";
}

export function getDemoOrdersSnapshot() {
  if (typeof window === "undefined") return "[]";
  return window.localStorage.getItem(ORDER_KEY) || "[]";
}

function notifyDemoCommerceChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function makeDemoId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function getDemoInquiries(): DemoInquiry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(INQUIRY_KEY) || "[]") as DemoInquiry[]; }
  catch { return []; }
}

export function saveDemoInquiry(input: Omit<DemoInquiry, "id" | "createdAt" | "status">): DemoInquiry {
  const entry: DemoInquiry = { ...input, id: makeDemoId("DEVIS"), createdAt: new Date().toISOString(), status: "En attente de réponse (démo)" };
  const current = getDemoInquiries();
  window.localStorage.setItem(INQUIRY_KEY, JSON.stringify([entry, ...current]));
  notifyDemoCommerceChange();
  return entry;
}

export function getDemoOrders(): DemoOrder[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(ORDER_KEY) || "[]") as DemoOrder[]; }
  catch { return []; }
}

export function getDemoOrder(id: string): DemoOrder | undefined {
  return getDemoOrders().find((order) => order.id === id);
}

export function saveDemoOrder(input: Omit<DemoOrder, "id" | "createdAt" | "status">): DemoOrder {
  const entry: DemoOrder = { ...input, id: makeDemoId("CMD"), createdAt: new Date().toISOString(), status: "awaiting_payment" };
  const current = getDemoOrders();
  window.localStorage.setItem(ORDER_KEY, JSON.stringify([entry, ...current]));
  notifyDemoCommerceChange();
  return entry;
}
