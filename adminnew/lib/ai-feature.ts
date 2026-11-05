/**
 * L'assistant IA est désactivé par défaut (service payant non souscrit).
 * Pour le réactiver : ADMIN_AI_ENABLED=true sur le projet Vercel du back-office,
 * et ANTHROPIC_API_KEY (avec du crédit) sur le projet de la boutique.
 */
export function isAiAssistantEnabled() {
  return process.env.ADMIN_AI_ENABLED === "true";
}
