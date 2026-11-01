import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  afterCommit,
  HOOKS,
  listSubscribers,
  registerHook,
  resetHooks,
  runHook,
  unregisterModule,
} from "../lib/hooks";

beforeEach(() => resetHooks());

describe("registre", () => {
  it("déclare les hooks attendus", () => {
    expect(Object.keys(HOOKS)).toEqual(
      expect.arrayContaining([
        "actionOrderStatusUpdate",
        "actionProductSave",
        "actionCartSave",
        "actionPaymentConfirmation",
        "displayProductPage",
      ]),
    );
  });

  it("refuse un hook inconnu", () => {
    expect(() => registerHook("actionInexistante" as never, "mod", () => undefined)).toThrow(/Hook inconnu/);
  });

  it("abonne un module et le liste", () => {
    registerHook("actionOrderStatusUpdate", "avis", () => undefined);
    expect(listSubscribers("actionOrderStatusUpdate")).toEqual(["avis"]);
  });

  it("ne duplique pas un même module sur un hook", () => {
    registerHook("actionProductSave", "whatsapp", () => undefined);
    registerHook("actionProductSave", "whatsapp", () => undefined);
    expect(listSubscribers("actionProductSave")).toEqual(["whatsapp"]);
  });

  it("désabonne un module de tous ses hooks", () => {
    registerHook("actionProductSave", "whatsapp", () => undefined);
    registerHook("displayHeader", "whatsapp", () => undefined);
    unregisterModule("whatsapp");
    expect(listSubscribers("actionProductSave")).toEqual([]);
    expect(listSubscribers("displayHeader")).toEqual([]);
  });
});

describe("exécution", () => {
  it("appelle tous les abonnés", async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerHook("actionOrderStatusUpdate", "sms", first);
    registerHook("actionOrderStatusUpdate", "email", second);
    const result = await runHook("actionOrderStatusUpdate", { orderId: "o-1" });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ executed: 2, failed: 0 });
  });

  it("respecte l'ordre de priorité", async () => {
    const order: string[] = [];
    registerHook("displayHeader", "tard", () => void order.push("tard"), 50);
    registerHook("displayHeader", "tot", () => void order.push("tot"), 1);
    await runHook("displayHeader", {});
    expect(order).toEqual(["tot", "tard"]);
  });

  it("isole un module défaillant sans bloquer les suivants", async () => {
    const ok = vi.fn();
    registerHook("actionPaymentConfirmation", "casse", () => {
      throw new Error("module cassé");
    }, 1);
    registerHook("actionPaymentConfirmation", "ok", ok, 2);
    const result = await runHook("actionPaymentConfirmation", { orderId: "o-2" });
    expect(ok).toHaveBeenCalledOnce();
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toEqual({ moduleCode: "casse", message: "module cassé" });
  });

  it("ne propage jamais l'erreur d'un module", async () => {
    registerHook("actionCartSave", "casse", () => {
      throw new Error("boom");
    });
    await expect(runHook("actionCartSave", {})).resolves.toBeDefined();
  });

  it("remonte l'erreur au journal via onError", async () => {
    const onError = vi.fn();
    registerHook("actionProductSave", "casse", () => {
      throw new Error("journalise-moi");
    });
    await runHook("actionProductSave", { productId: "p-1" }, { onError });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ hookCode: "actionProductSave", moduleCode: "casse", message: "journalise-moi" }),
    );
  });

  it("gère les handlers asynchrones", async () => {
    const asyncHandler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    registerHook("actionEmailSend", "async-mod", asyncHandler);
    const result = await runHook("actionEmailSend", { to: "client@example.test" });
    expect(asyncHandler).toHaveBeenCalledOnce();
    expect(result.failed).toBe(0);
  });

  it("renvoie un bilan vide sans abonné", async () => {
    const result = await runHook("displayFooter", {});
    expect(result).toMatchObject({ executed: 0, failed: 0 });
  });

  it("ne déclenche plus les modules désactivés", async () => {
    const handler = vi.fn();
    registerHook("displayProductPage", "newsletter", handler);
    unregisterModule("newsletter");
    await runHook("displayProductPage", {});
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("after-commit", () => {
  it("n'exécute pas le module dans le cycle de la transaction", async () => {
    const handler = vi.fn();
    afterCommit(async () => handler());
    expect(handler).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("avale l'erreur d'un module pour ne pas casser la requête", async () => {
    await expect(async () => {
      afterCommit(async () => {
        throw new Error("silencieux");
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }).not.toThrow();
  });
});
