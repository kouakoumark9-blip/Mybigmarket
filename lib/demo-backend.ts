export type MockRole = "buyer" | "seller" | "admin";
export type MockRequestKind = "product" | "sourcing";
export type MockRequestStatus = "new" | "in_review" | "quoted" | "closed";
export type MockMessage = { id: string; senderId: string; senderName: string; body: string; createdAt: string };
export type MockQuoteRequest = {
  id: string; buyerId: string; buyerName: string; kind: MockRequestKind; status: MockRequestStatus;
  sellerId: string | null; sellerName: string | null; productTitle: string; quantity: number;
  destination: string; contactPhone: string; message: string; createdAt: string; messages: MockMessage[];
};
export type MockStorefront = { sellerId:string; sellerName:string; slug:string; storeName:string; headline:string; description:string; announcement:string; isPublished:boolean; university:string; city:string; rating:number };

const makeFixtures = (): MockQuoteRequest[] => {
  const now = Date.now();
  const stamp = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  return [
    { id: "DEV-2601", buyerId: "buyer-aminata", buyerName: "Aminata K.", kind: "product", status: "in_review", sellerId: "seller-lina", sellerName: "Lina Kouamé", productTitle: "Sacs à dos scolaires — lot de 100", quantity: 100, destination: "Abidjan", contactPhone: "+225 07 00 00 01 01", message: "Souhaite deux couleurs et un délai avant la rentrée.", createdAt: stamp(42), messages: [
      { id: "m-1", senderId: "buyer-aminata", senderName: "Aminata K.", body: "Bonjour, pouvez-vous confirmer le délai pour 100 pièces ?", createdAt: stamp(41) },
      { id: "m-2", senderId: "seller-lina", senderName: "Lina Kouamé", body: "Bonjour Aminata, je vérifie le stock et le coût d’expédition vers Abidjan.", createdAt: stamp(31) },
    ] },
    { id: "DEV-2602", buyerId: "buyer-koffi", buyerName: "Koffi D.", kind: "sourcing", status: "new", sellerId: null, sellerName: null, productTitle: "Powerbanks USB-C 20 000 mAh", quantity: 250, destination: "Bouaké", contactPhone: "+225 05 00 00 02 02", message: "Certification et emballage individuel requis.", createdAt: stamp(18), messages: [] },
    { id: "DEV-2603", buyerId: "buyer-aminata", buyerName: "Aminata K.", kind: "product", status: "quoted", sellerId: "seller-lina", sellerName: "Lina Kouamé", productTitle: "Gourdes isothermes personnalisables", quantity: 60, destination: "Abidjan", contactPhone: "+225 07 00 00 01 01", message: "Logo fourni après confirmation du devis.", createdAt: stamp(310), messages: [
      { id: "m-3", senderId: "seller-lina", senderName: "Lina Kouamé", body: "J’ai préparé une première estimation. Le prix final reste à valider selon le logo et le transport.", createdAt: stamp(295) },
    ] },
    { id: "DEV-2604", buyerId: "buyer-yaya", buyerName: "Yaya T.", kind: "product", status: "new", sellerId: "seller-aya", sellerName: "Aya Touré", productTitle: "Lampes solaires rechargeables", quantity: 80, destination: "Yamoussoukro", contactPhone: "+225 01 00 00 03 03", message: "Merci de proposer les options de batterie.", createdAt: stamp(7), messages: [] },
  ];
};
let requests: MockQuoteRequest[] | null = null;
let storefronts: MockStorefront[] | null = null;
const getStore = () => requests ??= makeFixtures();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const getStorefrontStore = () => storefronts ??= [
  { sellerId:"seller-lina",sellerName:"Lina Kouamé",slug:"lina-k",storeName:"Lina K.",headline:"Des accessoires du quotidien, sélectionnés en Chine",description:"Une sélection soignée de mode et d’accessoires. Profil et produits présentés à titre de démonstration.",announcement:"Nouvelle sélection disponible · stock à confirmer",isPublished:true,university:"Université de Guangzhou",city:"Guangzhou",rating:4.9 },
  { sellerId:"seller-aya",sellerName:"Aya Touré",slug:"aya-t",storeName:"Atelier Aya",headline:"Maison, beauté et petits essentiels",description:"Des trouvailles utiles pour le quotidien, expédiées de Chine vers la Côte d’Ivoire.",announcement:"Tarifs de transport à confirmer avec le vendeur",isPublished:true,university:"Université de Zhejiang",city:"Hangzhou",rating:4.9 },
];

export function listMockRequests(role: MockRole, actorId: string) {
  const rows = getStore();
  const visible = role === "admin" ? rows : role === "seller" ? rows.filter((row) => row.sellerId === actorId) : rows.filter((row) => row.buyerId === actorId);
  return clone(visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}
export function createMockRequest(input: Omit<MockQuoteRequest, "id" | "status" | "sellerId" | "sellerName" | "createdAt" | "messages">) {
  const sellerId = input.kind === "product" ? "seller-lina" : null;
  const row: MockQuoteRequest = { ...input, id: `DEV-${Date.now().toString(36).toUpperCase()}`, status: "new", sellerId, sellerName: sellerId ? "Lina Kouamé" : null, createdAt: new Date().toISOString(), messages: [] };
  getStore().unshift(row);
  return clone(row);
}
export function getMockStorefrontForSeller(sellerId: string) {
  const storefront = getStorefrontStore().find((store) => store.sellerId === sellerId);
  return storefront ? clone(storefront) : null;
}
export function getMockStorefrontBySlug(slug: string) {
  const storefront = getStorefrontStore().find((store) => store.slug === slug);
  return storefront ? clone(storefront) : null;
}
export function saveMockStorefront(sellerId: string, values: Pick<MockStorefront, "slug" | "storeName" | "headline" | "description" | "announcement" | "isPublished">) {
  const stores = getStorefrontStore();
  const store = stores.find((item) => item.sellerId === sellerId);
  if (!store || stores.some((item) => item.sellerId !== sellerId && item.slug === values.slug)) return null;
  Object.assign(store, values);
  return clone(store);
}

export function updateMockRequest(id: string, status: MockRequestStatus, role: MockRole, actorId: string) {
  const request = getStore().find((row) => row.id === id);
  if (!request || request.status === "closed") return null;
  if (role === "seller" && request.sellerId !== actorId) return null;
  if (role !== "seller" && role !== "admin") return null;
  request.status = status;
  return clone(request);
}
export function addMockMessage(id: string, role: "buyer" | "seller", actorId: string, body: string) {
  const request = getStore().find((row) => row.id === id);
  if (!request || !request.sellerId || request.status === "closed") return null;
  const allowed = role === "buyer" ? request.buyerId === actorId : request.sellerId === actorId;
  if (!allowed) return null;
  const senderName = role === "buyer" ? request.buyerName : request.sellerName || "Vendeur démo";
  const message: MockMessage = { id: `msg-${Date.now().toString(36)}`, senderId: actorId, senderName, body, createdAt: new Date().toISOString() };
  request.messages.push(message);
  return clone(message);
}
export function resetMockRequests() {
  requests = makeFixtures();
  storefronts = null;
  return clone(requests);
}
export const MOCK_ACTORS = {
  buyer: [{ id: "buyer-aminata", name: "Aminata K." }, { id: "buyer-koffi", name: "Koffi D." }, { id: "buyer-yaya", name: "Yaya T." }],
  seller: [{ id: "seller-lina", name: "Lina Kouamé" }, { id: "seller-aya", name: "Aya Touré" }],
  admin: [{ id: "admin-demo", name: "Équipe mybigmarket" }],
} as const;
