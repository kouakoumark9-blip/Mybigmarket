import { categoryOverviews, productDescriptions } from "@/lib/storefront-copy";

export type DemoProduct = {
  slug: string; title: string; priceXof: number; minimumQuantity: number; leadTimeDays: number;
  category: string; categorySlug: string; seller: string; sellerSlug: string; university: string;
  city: string; rating: number; reviewCount: number; icon: string; tone: string; quantity: number; imageUrl?: string; description?: string;
};

export const categories = [
  { name: "Mode & accessoires", slug: "mode-accessoires", icon: "◈", count: 7, description: "Sacs, montres, lunettes et accessoires du quotidien.", overview: categoryOverviews["mode-accessoires"] },
  { name: "Téléphones & high-tech", slug: "electronique", icon: "▣", count: 6, description: "Audio, accessoires mobiles et équipements connectés.", overview: categoryOverviews.electronique },
  { name: "Maison & beauté", slug: "maison-cuisine", icon: "⌂", count: 7, description: "Éclairage, rangement, beauté et accessoires maison.", overview: categoryOverviews["maison-cuisine"] },
];

export const sellers = [
  { slug: "lina-k", name: "Lina K.", university: "Université de Guangzhou", city: "Guangzhou", rating: 4.9, orders: 126, initials: "LK" },
  { slug: "mamadou-d", name: "Mamadou D.", university: "Université de Wuhan", city: "Wuhan", rating: 4.8, orders: 94, initials: "MD" },
  { slug: "aya-t", name: "Aya T.", university: "Université de Zhejiang", city: "Hangzhou", rating: 4.9, orders: 83, initials: "AT" },
];

export const products: DemoProduct[] = [
  { slug:"sac-cabas-urbain",title:"Sac cabas urbain",priceXof:12500,minimumQuantity:2,leadTimeDays:35,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.8,reviewCount:24,icon:"👜",tone:"sand",imageUrl:"/product-bag.jpg",quantity:48 },
  { slug:"montre-minimaliste",title:"Montre minimaliste",priceXof:18000,minimumQuantity:1,leadTimeDays:30,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.9,reviewCount:38,icon:"⌚",tone:"rose",imageUrl:"/product-watch.jpg",quantity:27 },
  { slug:"lunettes-uv400",title:"Lunettes de soleil UV400",priceXof:6500,minimumQuantity:2,leadTimeDays:30,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.7,reviewCount:19,icon:"🕶️",tone:"blue",imageUrl:"/product-sunglasses.jpg",quantity:60 },
  { slug:"sac-a-dos-etudiant",title:"Sac à dos étudiant",priceXof:15500,minimumQuantity:2,leadTimeDays:35,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.8,reviewCount:16,icon:"🎒",tone:"lavender",imageUrl:"/product-backpack.jpg",quantity:32 },
  { slug:"portefeuille-compact",title:"Portefeuille compact",priceXof:5500,minimumQuantity:3,leadTimeDays:30,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.6,reviewCount:12,icon:"👛",tone:"sand",quantity:75 },
  { slug:"ecouteurs-bluetooth",title:"Écouteurs Bluetooth",priceXof:14500,minimumQuantity:2,leadTimeDays:35,category:"Téléphones & high-tech",categorySlug:"electronique",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.9,reviewCount:42,icon:"🎧",tone:"blue",imageUrl:"/product-audio.jpg",quantity:41 },
  { slug:"support-telephone",title:"Support téléphone pliable",priceXof:4000,minimumQuantity:5,leadTimeDays:25,category:"Téléphones & high-tech",categorySlug:"electronique",seller:"Lina K.",sellerSlug:"lina-k",university:"Université de Guangzhou",city:"Guangzhou",rating:4.5,reviewCount:31,icon:"📱",tone:"mint",imageUrl:"/product-phone-stand.jpg",quantity:100 },
  { slug:"lampe-led-bureau",title:"Lampe LED de bureau USB",priceXof:8500,minimumQuantity:2,leadTimeDays:35,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.8,reviewCount:21,icon:"💡",tone:"yellow",imageUrl:"/product-home.jpg",quantity:33 },
  { slug:"organiseur-bureau",title:"Organiseur de bureau",priceXof:6000,minimumQuantity:3,leadTimeDays:30,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.7,reviewCount:18,icon:"🗃️",tone:"mint",quantity:54 },
  { slug:"gourde-isotherme",title:"Gourde isotherme",priceXof:7500,minimumQuantity:2,leadTimeDays:35,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.9,reviewCount:36,icon:"🥤",tone:"blue",quantity:62 },
  { slug:"mini-ventilateur",title:"Mini ventilateur rechargeable",priceXof:9500,minimumQuantity:2,leadTimeDays:40,category:"Téléphones & high-tech",categorySlug:"electronique",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.6,reviewCount:17,icon:"🪭",tone:"mint",quantity:29 },
  { slug:"chargeur-usb-c",title:"Chargeur USB-C 30 W",priceXof:11000,minimumQuantity:2,leadTimeDays:35,category:"Téléphones & high-tech",categorySlug:"electronique",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.8,reviewCount:28,icon:"🔌",tone:"lavender",quantity:44 },
  { slug:"etui-ordinateur",title:"Étui ordinateur 15 pouces",priceXof:12000,minimumQuantity:2,leadTimeDays:35,category:"Téléphones & high-tech",categorySlug:"electronique",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.7,reviewCount:22,icon:"💻",tone:"rose",quantity:25 },
  { slug:"coffret-pinceaux",title:"Coffret de pinceaux maquillage",priceXof:9000,minimumQuantity:2,leadTimeDays:35,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Aya T.",sellerSlug:"aya-t",university:"Université de Zhejiang",city:"Hangzhou",rating:4.9,reviewCount:25,icon:"🖌️",tone:"rose",imageUrl:"/product-beauty.jpg",quantity:31 },
  { slug:"miroir-led",title:"Miroir LED de maquillage",priceXof:13500,minimumQuantity:1,leadTimeDays:40,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Aya T.",sellerSlug:"aya-t",university:"Université de Zhejiang",city:"Hangzhou",rating:4.8,reviewCount:14,icon:"🪞",tone:"lavender",quantity:18 },
  { slug:"rangement-cosmetiques",title:"Boîte de rangement cosmétique",priceXof:7000,minimumQuantity:2,leadTimeDays:35,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Aya T.",sellerSlug:"aya-t",university:"Université de Zhejiang",city:"Hangzhou",rating:4.7,reviewCount:11,icon:"🧴",tone:"sand",quantity:37 },
  { slug:"foulard-satin",title:"Foulard satin imprimé",priceXof:5000,minimumQuantity:3,leadTimeDays:30,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Aya T.",sellerSlug:"aya-t",university:"Université de Zhejiang",city:"Hangzhou",rating:4.8,reviewCount:20,icon:"🧣",tone:"rose",quantity:58 },
  { slug:"boucles-acier",title:"Boucles d’oreilles acier inoxydable",priceXof:4500,minimumQuantity:3,leadTimeDays:30,category:"Mode & accessoires",categorySlug:"mode-accessoires",seller:"Aya T.",sellerSlug:"aya-t",university:"Université de Zhejiang",city:"Hangzhou",rating:4.8,reviewCount:29,icon:"💎",tone:"lavender",quantity:77 },
  { slug:"veilleuse-led",title:"Veilleuse LED décorative",priceXof:8000,minimumQuantity:2,leadTimeDays:40,category:"Maison & beauté",categorySlug:"maison-cuisine",seller:"Aya T.",sellerSlug:"aya-t",university:"Université de Zhejiang",city:"Hangzhou",rating:4.6,reviewCount:13,icon:"🌙",tone:"blue",quantity:24 },
  { slug:"mini-imprimante",title:"Mini imprimante thermique Bluetooth",priceXof:26000,minimumQuantity:1,leadTimeDays:45,category:"Téléphones & high-tech",categorySlug:"electronique",seller:"Mamadou D.",sellerSlug:"mamadou-d",university:"Université de Wuhan",city:"Wuhan",rating:4.9,reviewCount:32,icon:"🖨️",tone:"yellow",quantity:12 },
];

export function getProductDescription(product: Pick<DemoProduct, "slug" | "title" | "category" | "description">): string {
  return product.description?.trim() || productDescriptions[product.slug] || `${product.title} est proposé dans la catégorie ${product.category}. Contactez le vendeur pour confirmer les caractéristiques, variantes et éléments inclus avant de passer commande.`;
}

export const orderStages = [
  { key: "paid_escrow", label: "Paiement reçu et fonds bloqués" },
  { key: "seller_confirmed", label: "Confirmée par le vendeur" },
  { key: "received_collection_point", label: "Reçue au point de collecte en Chine" },
  { key: "shipped", label: "Expédiée dans le lot" },
  { key: "arrived_abidjan", label: "Arrivée à Abidjan" },
  { key: "out_for_delivery", label: "En cours de livraison" },
  { key: "delivered", label: "Livrée" },
];

export const formatXof = (amount: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
