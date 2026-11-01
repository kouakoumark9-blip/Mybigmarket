/**
 * Système de hooks (module 14 — extensibilité).
 *
 * Principe : un module s'abonne à un hook déclaré, il ne modifie jamais le noyau.
 *
 * Deux garanties importantes :
 *  1. exécution APRÈS le commit métier — un module lent ou défaillant ne doit pas
 *     annuler une commande ni bloquer une requête utilisateur ;
 *  2. toute erreur est journalisée dans `module_events_log` et n'est jamais propagée.
 */

export const HOOKS = {
  actionOrderStatusUpdate: "Changement de statut de commande",
  actionProductSave: "Enregistrement d'un produit",
  actionCartSave: "Enregistrement du panier",
  actionPaymentConfirmation: "Paiement confirmé",
  actionCustomerCreate: "Création d'un client",
  actionCheckoutSubmit: "Validation du tunnel de commande",
  displayProductPage: "Affichage de la fiche produit",
  displayHeader: "Affichage de l'en-tête",
  displayFooter: "Affichage du pied de page",
  displayOrderDetail: "Affichage du détail de commande",
  actionEmailSend: "Envoi d'un e-mail",
} as const;

export type HookCode = keyof typeof HOOKS;

export type HookPayload = Record<string, unknown>;

export type HookHandler = (payload: HookPayload) => void | Promise<void>;

export type RegisteredHook = {
  moduleCode: string;
  handler: HookHandler;
  priority: number;
};

export type HookRunResult = {
  hookCode: HookCode;
  executed: number;
  failed: number;
  errors: Array<{ moduleCode: string; message: string }>;
  durationMs: number;
};

/**
 * Registre en mémoire, par processus. En production, les abonnements sont lus en base
 * (`module_hooks`) et le registre est reconstruit au démarrage : ce fichier ne contient
 * volontairement aucune requête SQL pour rester testable.
 */
const registry = new Map<HookCode, RegisteredHook[]>();

export function resetHooks(): void {
  registry.clear();
}

export function registerHook(hookCode: HookCode, moduleCode: string, handler: HookHandler, priority = 10): void {
  if (!(hookCode in HOOKS)) throw new Error(`Hook inconnu : ${hookCode}`);
  const list = registry.get(hookCode) ?? [];
  const withoutDuplicate = list.filter((entry) => entry.moduleCode !== moduleCode);
  withoutDuplicate.push({ moduleCode, handler, priority });
  withoutDuplicate.sort((a, b) => a.priority - b.priority || a.moduleCode.localeCompare(b.moduleCode));
  registry.set(hookCode, withoutDuplicate);
}

export function unregisterModule(moduleCode: string): void {
  for (const [hookCode, list] of registry) {
    registry.set(hookCode, list.filter((entry) => entry.moduleCode !== moduleCode));
  }
}

export function listSubscribers(hookCode: HookCode): string[] {
  return (registry.get(hookCode) ?? []).map((entry) => entry.moduleCode);
}

/** Empreinte non cryptographique, pour tracer un payload sans stocker de données personnelles. */
function payloadSignature(payload: HookPayload): string {
  const text = JSON.stringify(payload, Object.keys(payload).sort());
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0").slice(0, 16);
}

/**
 * Exécute un hook. Ne lève jamais : renvoie un bilan, y compris en cas d'échec d'un module.
 * `onError` permet de persister l'erreur dans `module_events_log` côté appelant.
 */
export async function runHook(
  hookCode: HookCode,
  payload: HookPayload,
  options: { onError?: (detail: { hookCode: HookCode; moduleCode: string; message: string; payloadHash: string }) => void } = {},
): Promise<HookRunResult> {
  const startedAt = Date.now();
  const subscribers = registry.get(hookCode) ?? [];
  const errors: Array<{ moduleCode: string; message: string }> = [];
  const payloadHash = payloadSignature(payload);

  for (const entry of subscribers) {
    try {
      await entry.handler(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur module inconnue";
      errors.push({ moduleCode: entry.moduleCode, message });
      options.onError?.({ hookCode, moduleCode: entry.moduleCode, message, payloadHash });
    }
  }

  return {
    hookCode,
    executed: subscribers.length,
    failed: errors.length,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Enveloppe « after-commit » : la fonction de déclenchement peut être planifiée
 * après une transaction sans en partager le cycle de vie.
 */
export function afterCommit(run: () => Promise<unknown>): void {
  queueMicrotask(() => {
    void run().catch(() => {
      // Volontairement silencieux : les erreurs de modules ne remontent jamais à l'utilisateur.
    });
  });
}
