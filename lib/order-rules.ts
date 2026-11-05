/**
 * Commandes, statuts, factures, avoirs et retours — module 6.
 *
 * Module pur, sans dépendance base. Il porte les règles qui coûtent cher quand
 * elles sont fausses : une facture émise ne se modifie plus, un remboursement
 * ne dépasse jamais l'encaissé, un retour ne réintègre que ce qui a été vendu.
 *
 * Règles verrouillées ici (ne pas régresser) :
 *  - toute transition de statut passe par la machine à états : un saut direct
 *    (`awaiting_payment` → `delivered`) est refusé, pas « corrigé en silence » ;
 *  - un statut terminal ne revient jamais en arrière sans passer par le
 *    remboursement ou le litige ;
 *  - les totaux sont recalculés côté serveur : remise, port, taxe, arrondi ;
 *  - une facture émise est immuable : seule une annulation (avoir) la neutralise ;
 *  - un retour porte sur des quantités réellement livrées, et son montant ne
 *    peut pas dépasser le total encaissé de la commande ;
 *  - un remboursement partiel ne peut pas dépasser le reste remboursable.
 */

export type OrderStatus =
  | "awaiting_payment"
  | "paid_escrow"
  | "seller_confirmed"
  | "received_collection_point"
  | "shipped"
  | "arrived_abidjan"
  | "out_for_delivery"
  | "delivered"
  | "seller_paid"
  | "cancelled"
  | "dispute"
  | "refunded";

export const ORDER_STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "paid_escrow",
  "seller_confirmed",
  "received_collection_point",
  "shipped",
  "arrived_abidjan",
  "out_for_delivery",
  "delivered",
  "seller_paid",
  "cancelled",
  "dispute",
  "refunded",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "En attente de paiement",
  paid_escrow: "Paiement confirmé",
  seller_confirmed: "Confirmée par le vendeur",
  received_collection_point: "Reçue au point de retrait",
  shipped: "Expédiée",
  arrived_abidjan: "Arrivée à Abidjan",
  out_for_delivery: "En cours de livraison",
  delivered: "Livrée",
  seller_paid: "Vendeur payé",
  cancelled: "Annulée",
  dispute: "Litige ouvert",
  refunded: "Remboursée",
};

/** Statuts depuis lesquels aucune progression n'est possible. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["seller_paid", "cancelled", "refunded"];

/**
 * Transitions autorisées. Volontairement strictes : chaque flèche correspond à
 * un événement réel du parcours (paiement, confirmation, départ, arrivée,
 * livraison, paiement du vendeur).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["paid_escrow", "cancelled"],
  paid_escrow: ["seller_confirmed", "cancelled", "dispute", "refunded"],
  seller_confirmed: ["received_collection_point", "shipped", "cancelled", "dispute", "refunded"],
  received_collection_point: ["shipped", "dispute", "refunded"],
  shipped: ["arrived_abidjan", "dispute", "refunded"],
  arrived_abidjan: ["out_for_delivery", "delivered", "dispute", "refunded"],
  out_for_delivery: ["delivered", "dispute", "refunded"],
  delivered: ["seller_paid", "dispute", "refunded"],
  seller_paid: [],
  cancelled: [],
  dispute: ["refunded", "delivered", "seller_paid"],
  refunded: [],
};

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: "unknown_status" | "terminal" | "not_allowed"; message: string };

/**
 * Contexte facultatif d'une transition. Paiement à la livraison : la commande est préparée et
 * expédiée avant d'être payée, elle peut donc passer d'« en attente de paiement » à « confirmée
 * par le vendeur » ; l'encaissement est confirmé à la livraison.
 */
export type TransitionContext = { paymentMethod?: string | null };

const isCashOnDelivery = (context?: TransitionContext) => context?.paymentMethod === "cash_on_delivery";

/** Transitions propres au paiement à la livraison, en plus des transitions standard. */
const CASH_ON_DELIVERY_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  awaiting_payment: ["seller_confirmed"],
};

/** Vérifie une transition avant de la proposer, puis de l'appliquer. */
export function canTransition(from: string, to: string, context?: TransitionContext): TransitionCheck {
  if (!ORDER_STATUSES.includes(from as OrderStatus)) {
    return { allowed: false, reason: "unknown_status", message: `Statut de départ inconnu : ${from}` };
  }
  if (!ORDER_STATUSES.includes(to as OrderStatus)) {
    return { allowed: false, reason: "unknown_status", message: `Statut d'arrivée inconnu : ${to}` };
  }
  const source = from as OrderStatus;
  const target = to as OrderStatus;
  if (source === target) return { allowed: false, reason: "not_allowed", message: "La commande est déjà dans ce statut." };
  if (TERMINAL_ORDER_STATUSES.includes(source)) {
    return { allowed: false, reason: "terminal", message: `Une commande « ${ORDER_STATUS_LABELS[source]} » ne change plus de statut.` };
  }
  if (!ORDER_TRANSITIONS[source].includes(target) && !(isCashOnDelivery(context) && CASH_ON_DELIVERY_TRANSITIONS[source]?.includes(target))) {
    return {
      allowed: false,
      reason: "not_allowed",
      message: `Transition refusée : « ${ORDER_STATUS_LABELS[source]} » ne peut pas passer directement à « ${ORDER_STATUS_LABELS[target]} ».`,
    };
  }
  return { allowed: true };
}

/** Transitions proposables depuis un statut, pour n'afficher que le possible. */
export function nextStatuses(from: string, context?: TransitionContext): OrderStatus[] {
  if (!ORDER_STATUSES.includes(from as OrderStatus)) return [];
  const source = from as OrderStatus;
  if (TERMINAL_ORDER_STATUSES.includes(source)) return [];
  const extra = isCashOnDelivery(context) ? CASH_ON_DELIVERY_TRANSITIONS[source] ?? [] : [];
  return [...ORDER_TRANSITIONS[source], ...extra.filter((status) => !ORDER_TRANSITIONS[source].includes(status))];
}

/**
 * Une commande non payée expire : elle libère le stock réservé. Le délai est
 * celui posé à la création (`payment_expires_at`), jamais recalculé à la volée.
 */
export function isPaymentExpired(order: { status: string; paymentExpiresAt?: Date | null }, now: Date): boolean {
  if (order.status !== "awaiting_payment") return false;
  if (!order.paymentExpiresAt) return false;
  return new Date(order.paymentExpiresAt).getTime() <= now.getTime();
}

/** Le stock n'est décrémenté qu'à partir du paiement confirmé. */
export function shouldDecrementStock(to: string): boolean {
  return to === "paid_escrow";
}

/** Le stock revient en vente quand la commande est annulée avant expédition. */
export function shouldRestoreStock(from: string, to: string): boolean {
  if (to !== "cancelled") return false;
  return ["awaiting_payment", "paid_escrow", "seller_confirmed"].includes(from);
}

/** Le vendeur n'est réglé qu'après livraison effective. */
export function canPaySeller(order: { status: string; deliveredAt?: Date | null }): boolean {
  return order.status === "delivered" && Boolean(order.deliveredAt);
}

export type OrderLineInput = {
  productId: string;
  title?: string;
  variantId?: number | null;
  quantity: number;
  /** Prix unitaire HT retenu à la commande (palier, remise groupe, prix spécifique). */
  unitPriceXof: number;
  taxRatePercent?: number | null;
  weightGrams?: number | null;
  ecotaxXof?: number | null;
};

export type TotalsInput = {
  lines: OrderLineInput[];
  /** Remise globale en points de base (500 = 5 %), appliquée après les lignes. */
  discountBasisPoints?: number;
  /** Frais de port HT, calculés par le module transport. */
  shippingXof?: number;
  /** Taux de taxe appliqué au port, souvent distinct de celui des produits. */
  shippingTaxRatePercent?: number | null;
  /** Arrondi commercial en FCFA (25 par défaut). */
  roundingMultiple?: number;
  /** Frais de paiement répercutés (mobile money), en FCFA. */
  paymentFeeXof?: number;
};

export type OrderTotals = {
  subtotalXof: number;
  discountXof: number;
  shippingXof: number;
  taxXof: number;
  paymentFeeXof: number;
  totalXof: number;
  itemCount: number;
  weightGrams: number;
};

const roundHalfUp = (value: number): number => Math.round(value);

const roundToMultiple = (value: number, multiple: number): number => {
  if (!Number.isFinite(value)) return 0;
  const step = Math.max(1, Math.trunc(multiple));
  return Math.round(value / step) * step;
};

/**
 * Totaux de commande, en HT + TVA calculée ligne par ligne.
 *
 * Ordre strict :
 *   1. sous-total HT des lignes (quantité × prix unitaire)
 *   2. remise globale en points de base, répartie au prorata des lignes
 *   3. taxe = somme des lignes taxées sur leur base remisée + taxe du port
 *   4. port, frais de paiement, arrondi commercial
 *
 * La remise ne crée jamais un montant négatif. Une ligne à quantité nulle est
 * ignorée. La taxe est arrondie au franc (pas de centimes en FCFA).
 */
export function computeOrderTotals(input: TotalsInput): OrderTotals {
  const lines = input.lines.filter((line) => Math.trunc(line.quantity) > 0);
  const discountPoints = Math.min(10_000, Math.max(0, Math.round(input.discountBasisPoints ?? 0)));

  let subtotalXof = 0;
  let itemCount = 0;
  let weightGrams = 0;
  const bases: Array<{ amount: number; rate: number }> = [];

  for (const line of lines) {
    const quantity = Math.trunc(line.quantity);
    const amount = Math.max(0, roundHalfUp(line.unitPriceXof)) * quantity;
    subtotalXof += amount;
    itemCount += quantity;
    weightGrams += Math.max(0, Math.trunc(line.weightGrams ?? 0)) * quantity;
    bases.push({ amount, rate: Math.max(0, Number(line.taxRatePercent ?? 0)) });
  }

  // Remise répartie au prorata : sans cela, la taxe serait calculée sur un
  // montant qui n'a jamais été facturé.
  const discountXof = Math.round((subtotalXof * discountPoints) / 10_000);
  let allocatedDiscount = 0;
  let taxXof = 0;
  bases.forEach((base, index) => {
    const isLast = index === bases.length - 1;
    const lineDiscount = subtotalXof === 0
      ? 0
      : isLast
        ? discountXof - allocatedDiscount
        : Math.round((discountXof * base.amount) / subtotalXof);
    allocatedDiscount += lineDiscount;
    const taxable = Math.max(0, base.amount - lineDiscount);
    taxXof += Math.round((taxable * base.rate) / 100);
  });

  const shippingXof = Math.max(0, roundHalfUp(input.shippingXof ?? 0));
  const shippingRate = Math.max(0, Number(input.shippingTaxRatePercent ?? 0));
  taxXof += Math.round((shippingXof * shippingRate) / 100);

  const paymentFeeXof = Math.max(0, roundHalfUp(input.paymentFeeXof ?? 0));
  const rawTotal = Math.max(0, subtotalXof - discountXof) + shippingXof + taxXof + paymentFeeXof;

  return {
    subtotalXof,
    discountXof,
    shippingXof,
    taxXof,
    paymentFeeXof,
    totalXof: roundToMultiple(rawTotal, input.roundingMultiple ?? 25),
    itemCount,
    weightGrams,
  };
}

/** Répartition d'un paiement partiel sur les lignes, au prorata des montants. */
export function allocateProRata(totalXof: number, parts: number[]): number[] {
  const sum = parts.reduce((acc, part) => acc + Math.max(0, part), 0);
  if (sum <= 0) return parts.map(() => 0);
  const target = Math.max(0, Math.round(totalXof));
  let allocated = 0;
  return parts.map((part, index) => {
    if (index === parts.length - 1) return target - allocated;
    const share = Math.round((target * Math.max(0, part)) / sum);
    allocated += share;
    return share;
  });
}

export type InvoiceLine = { label: string; quantity: number; unitPriceXof: number; taxRatePercent: number };

export type InvoiceDraft = {
  orderId: string;
  number: string;
  issuedAt: Date | null;
  lines: InvoiceLine[];
  subtotalXof: number;
  discountXof: number;
  shippingXof: number;
  taxXof: number;
  totalXof: number;
};

export type InvoiceIssueResult =
  | { ok: true; invoice: InvoiceDraft }
  | { ok: false; reason: "already_issued" | "empty" | "bad_total" | "no_number"; message: string };

/**
 * Émission d'une facture à partir d'une commande.
 * Une facture déjà émise n'est jamais régénérée : son numéro et ses montants
 * sont figés, conformément à l'obligation de séquence continue.
 */
export function buildInvoice(input: {
  orderId: string;
  number: string;
  issuedAt?: Date | null;
  lines: InvoiceLine[];
  subtotalXof: number;
  discountXof: number;
  shippingXof: number;
  taxXof: number;
  totalXof: number;
}): InvoiceIssueResult {
  const number = input.number.trim();
  if (!number) return { ok: false, reason: "no_number", message: "Numéro de facture obligatoire." };
  if (input.issuedAt) return { ok: false, reason: "already_issued", message: "Cette facture est déjà émise : elle ne peut plus être régénérée." };
  const lines = input.lines.filter((line) => Math.trunc(line.quantity) > 0);
  if (!lines.length) return { ok: false, reason: "empty", message: "Impossible de facturer une commande sans ligne." };
  const computedSubtotal = lines.reduce((acc, line) => acc + Math.round(line.unitPriceXof) * Math.trunc(line.quantity), 0);
  if (computedSubtotal !== input.subtotalXof) {
    return { ok: false, reason: "bad_total", message: "Le sous-total ne correspond pas aux lignes : la facture serait fausse." };
  }
  return {
    ok: true,
    invoice: {
      orderId: input.orderId,
      number,
      issuedAt: new Date(),
      lines,
      subtotalXof: input.subtotalXof,
      discountXof: Math.max(0, input.discountXof),
      shippingXof: Math.max(0, input.shippingXof),
      taxXof: Math.max(0, input.taxXof),
      totalXof: Math.max(0, input.totalXof),
    },
  };
}

/** Numérotation continue : `FAC-2026-000123`, sans trou ni doublon. */
export function invoiceNumber(year: number, sequence: number, prefix = "FAC"): string {
  const safeSequence = Math.max(1, Math.trunc(sequence));
  return `${prefix}-${year}-${String(safeSequence).padStart(6, "0")}`;
}

/** Une facture émise est immuable ; seule une annulation la neutralise. */
export function isInvoiceImmutable(invoice: { status: string; issuedAt: Date | null }): boolean {
  return invoice.status === "issued" && Boolean(invoice.issuedAt);
}

/** Une facture ne peut être annulée que si elle a été émise. */
export function canVoidInvoice(invoice: { status: string; issuedAt: Date | null }): boolean {
  return invoice.status === "issued" && Boolean(invoice.issuedAt);
}

export type ReturnLineInput = {
  productId: string;
  quantity: number;
  unitPriceXof: number;
  /** Quantité réellement livrée pour ce produit. */
  deliveredQuantity: number;
  /** Quantité déjà retournée (autres retours, tous confondus). */
  alreadyReturned?: number;
};

export type ReturnValidation =
  | { valid: true; lines: Array<{ productId: string; quantity: number; unitPriceXof: number }>; amountXof: number }
  | { valid: false; reason: "empty" | "exceeds_delivered" | "negative"; message: string; productIds?: string[] };

/**
 * Validation d'un retour : on ne réintègre et ne rembourse que ce qui a été
 * livré et pas déjà retourné.
 */
export function validateReturn(lines: ReturnLineInput[]): ReturnValidation {
  const active = lines.filter((line) => Math.trunc(line.quantity) !== 0);
  if (!active.length) return { valid: false, reason: "empty", message: "Aucune ligne à retourner." };
  const negative = active.filter((line) => Math.trunc(line.quantity) < 0);
  if (negative.length) {
    return { valid: false, reason: "negative", message: "Une quantité retournée ne peut pas être négative.", productIds: negative.map((line) => line.productId) };
  }
  const excessive = active.filter((line) => {
    const available = Math.max(0, Math.trunc(line.deliveredQuantity) - Math.trunc(line.alreadyReturned ?? 0));
    return Math.trunc(line.quantity) > available;
  });
  if (excessive.length) {
    return {
      valid: false,
      reason: "exceeds_delivered",
      message: "La quantité retournée dépasse la quantité livrée non encore retournée.",
      productIds: excessive.map((line) => line.productId),
    };
  }
  const normalized = active.map((line) => ({ productId: line.productId, quantity: Math.trunc(line.quantity), unitPriceXof: Math.max(0, Math.round(line.unitPriceXof)) }));
  return { valid: true, lines: normalized, amountXof: normalized.reduce((acc, line) => acc + line.quantity * line.unitPriceXof, 0) };
}

export type RefundCheck =
  | { allowed: true; remainingXof: number }
  | { allowed: false; reason: "over_paid" | "not_paid" | "invalid_amount"; message: string; remainingXof: number };

/**
 * Contrôle d'un remboursement : jamais plus que l'encaissé, jamais deux fois
 * le même montant, jamais un montant négatif.
 */
export function canRefund(paidXof: number, refundedXof: number, requestedXof: number): RefundCheck {
  const paid = Math.max(0, Math.round(paidXof));
  const already = Math.max(0, Math.round(refundedXof));
  const remaining = Math.max(0, paid - already);
  if (paid === 0) return { allowed: false, reason: "not_paid", message: "Aucun paiement encaissé : rien à rembourser.", remainingXof: 0 };
  if (!Number.isFinite(requestedXof) || requestedXof <= 0) {
    return { allowed: false, reason: "invalid_amount", message: "Le montant du remboursement doit être positif.", remainingXof: remaining };
  }
  if (Math.round(requestedXof) > remaining) {
    return {
      allowed: false,
      reason: "over_paid",
      message: `Remboursement refusé : ${remaining} FCFA restent remboursables, ${Math.round(requestedXof)} FCFA demandés.`,
      remainingXof: remaining,
    };
  }
  return { allowed: true, remainingXof: remaining - Math.round(requestedXof) };
}

/** Motifs de retour proposés au client (et au service client). */
export const RETURN_REASONS = [
  "damaged",
  "wrong_item",
  "not_as_described",
  "late_delivery",
  "changed_mind",
  "other",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  damaged: "Article endommagé",
  wrong_item: "Article erroné",
  not_as_described: "Ne correspond pas à la description",
  late_delivery: "Livraison trop tardive",
  changed_mind: "Changement d'avis",
  other: "Autre motif",
};

/**
 * Délai de retour : 14 jours après livraison pour un changement d'avis,
 * 30 jours pour un article défectueux ou erroné (le défaut n'est pas imputable
 * au client).
 */
export function isReturnWithinWindow(reason: ReturnReason, deliveredAt: Date, now: Date): boolean {
  const elapsedDays = (now.getTime() - new Date(deliveredAt).getTime()) / 86_400_000;
  const limit = reason === "changed_mind" ? 14 : 30;
  return elapsedDays >= 0 && elapsedDays <= limit;
}

export type EmailTrigger =
  | "order_confirmation"
  | "payment_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "order_refunded"
  | "return_received"
  | "invoice_issued";

/** Quel e-mail envoyer pour une transition : jamais deux fois le même. */
export function emailTriggerForTransition(from: string, to: string): EmailTrigger | null {
  if (from === to) return null;
  switch (to) {
    case "paid_escrow":
      return "payment_confirmed";
    case "shipped":
      return "order_shipped";
    case "delivered":
      return "order_delivered";
    case "cancelled":
      return "order_cancelled";
    case "refunded":
      return "order_refunded";
    default:
      return null;
  }
}

/** Article à réapprovisionner après retour : seulement s'il est revendable. */
export function shouldRestockOnReturn(reason: ReturnReason, condition: "new" | "used" | "damaged" = "new"): boolean {
  if (reason === "damaged") return false;
  return condition === "new";
}
