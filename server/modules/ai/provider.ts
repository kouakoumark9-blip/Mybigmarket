/**
 * Accès au modèle de l'assistant IA (Claude, API Anthropic). La clé ne vit que dans
 * l'environnement (ANTHROPIC_API_KEY) ; elle n'est jamais enregistrée ni renvoyée.
 *
 * Le modèle ne rend qu'un objet JSON conforme au schéma demandé (sorties structurées) : il n'a
 * aucun outil, aucun accès à la base, il ne peut que proposer. Les tests remplacent ce fournisseur.
 */
import Anthropic from "@anthropic-ai/sdk";

export type AiEffort = "low" | "medium" | "high";
export type AiRequest = { model: string; system: string; prompt: string; schema: Record<string, unknown>; maxTokens: number; effort: AiEffort };
export type AiResult = { output: unknown; model: string; inputTokens: number; outputTokens: number };

/** Le modèle a décliné la demande (règles de sécurité du fournisseur). */
export class AiRefusalError extends Error {
  constructor(message = "L'assistant a décliné cette demande.", public readonly tokens = { input: 0, output: 0 }) { super(message); }
}
/** Réponse inexploitable (tronquée, JSON invalide) ou fournisseur indisponible. */
export class AiProviderError extends Error {
  constructor(message: string, public readonly retryable = false, public readonly tokens = { input: 0, output: 0 }) { super(message); }
}

export interface AiProvider {
  generate(request: AiRequest): Promise<AiResult>;
}

/** Modèles pour lesquels le repli automatique du fournisseur (refus de sécurité) est disponible. */
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function tokensOf(usage: Anthropic.Beta.BetaUsage | undefined): { input: number; output: number } {
  if (!usage) return { input: 0, output: 0 };
  // Avec repli, chaque tentative est facturée : la somme des itérations fait foi.
  const iterations = usage.iterations ?? [];
  if (iterations.length) {
    return iterations.reduce((sum, entry) => ({ input: sum.input + ((entry as { input_tokens?: number }).input_tokens ?? 0), output: sum.output + ((entry as { output_tokens?: number }).output_tokens ?? 0) }), { input: 0, output: 0 });
  }
  return { input: usage.input_tokens, output: usage.output_tokens };
}

class AnthropicProvider implements AiProvider {
  // Délai et nouvelles tentatives bornés : une proposition doit tenir dans une requête HTTP.
  private readonly client = new Anthropic({ timeout: 55_000, maxRetries: 1 });

  async generate(request: AiRequest): Promise<AiResult> {
    const fallback = SERVER_FALLBACK_MODELS.has(request.model);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { effort: request.effort, format: { type: "json_schema", schema: request.schema } },
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AiProviderError("Clé de l'API de l'assistant refusée : vérifiez ANTHROPIC_API_KEY.");
      if (error instanceof Anthropic.RateLimitError) throw new AiProviderError("L'assistant est momentanément saturé : réessayez dans une minute.", true);
      if (error instanceof Anthropic.BadRequestError) throw new AiProviderError(`Demande refusée par le fournisseur de l'assistant : ${error.message}`);
      if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIConnectionError) throw new AiProviderError("Le fournisseur de l'assistant ne répond pas : réessayez.", true);
      if (error instanceof Anthropic.APIError) throw new AiProviderError(`Erreur du fournisseur de l'assistant (${error.status ?? "?"}).`, true);
      throw error;
    }
    const tokens = tokensOf(response.usage);
    if (response.stop_reason === "refusal") throw new AiRefusalError(undefined, tokens);
    if (response.stop_reason === "max_tokens") throw new AiProviderError("Réponse de l'assistant tronquée : précisez ou raccourcissez la demande.", false, tokens);
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new AiProviderError("Réponse de l'assistant illisible.", true, tokens);
    }
    return { output, model: response.model, inputTokens: tokens.input, outputTokens: tokens.output };
  }
}

let override: AiProvider | null = null;
let instance: AiProvider | null = null;

/** Tests : fournisseur simulé (null pour revenir au fournisseur réel). */
export function setAiProviderForTests(provider: AiProvider | null) {
  override = provider;
}

export function aiProviderConfigured(): boolean {
  return Boolean(override || process.env.ANTHROPIC_API_KEY);
}

export function aiProvider(): AiProvider | null {
  if (override) return override;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  instance ??= new AnthropicProvider();
  return instance;
}
