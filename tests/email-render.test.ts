import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_TEMPLATES,
  escapeHtml,
  extractVariables,
  htmlToText,
  renderEmail,
  type EmailTemplate,
} from "../lib/email-render";

const template: EmailTemplate = {
  code: "order_confirmation",
  subject: "Commande {{orderReference}} confirmée",
  bodyHtml: "<p>Bonjour {{customerName}},</p><p>Votre commande <b>{{orderReference}}</b> d'un montant de {{orderTotal}} est enregistrée.</p>",
};

describe("échappement HTML", () => {
  it("neutralise les balises", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("neutralise les guillemets et apostrophes", () => {
    expect(escapeHtml(`"l'été"`)).toBe("&quot;l&#39;été&quot;");
  });

  it("neutralise l'esperluette", () => {
    expect(escapeHtml("R&D")).toBe("R&amp;D");
  });
});

describe("rendu", () => {
  it("remplace les variables du sujet et du corps", () => {
    const rendered = renderEmail(template, { orderReference: "MBM-2026-000123", customerName: "Aya", orderTotal: "45 000 FCFA" });
    expect(rendered.subject).toBe("Commande MBM-2026-000123 confirmée");
    expect(rendered.html).toContain("Bonjour Aya");
    expect(rendered.html).toContain("MBM-2026-000123");
    expect(rendered.missingVariables).toEqual([]);
  });

  it("échappe une valeur utilisateur dans le HTML", () => {
    const rendered = renderEmail(template, { orderReference: "<img src=x onerror=alert(1)>", customerName: "Aya", orderTotal: "1" });
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;img");
  });

  it("signale une variable manquante au lieu de laisser un vide", () => {
    const rendered = renderEmail(template, { orderReference: "MBM-1", customerName: "Aya" });
    expect(rendered.missingVariables).toContain("orderTotal");
    expect(rendered.html).toContain("[orderTotal]");
  });

  it("tolère les espaces dans les accolades", () => {
    const spaced: EmailTemplate = { code: "t", subject: "{{ orderReference }}", bodyHtml: "{{customerName}}" };
    expect(renderEmail(spaced, { orderReference: "X", customerName: "Y" }).subject).toBe("X");
  });

  it("produit une version texte automatiquement", () => {
    const rendered = renderEmail(template, { orderReference: "MBM-1", customerName: "Aya", orderTotal: "1 000" });
    expect(rendered.text).toContain("Bonjour Aya,");
    expect(rendered.text).not.toContain("<p>");
  });

  it("privilégie un corps texte explicite s'il existe", () => {
    const withText: EmailTemplate = { ...template, bodyText: "Bonjour {{customerName}}" };
    expect(renderEmail(withText, { customerName: "Aya" }).text).toBe("Bonjour Aya");
  });

  it("n'échappe pas les entités dans la version texte", () => {
    const rendered = renderEmail({ code: "t", subject: "s", bodyHtml: "", bodyText: "R&D <b>" }, {});
    expect(rendered.text).toBe("R&D <b>");
  });

  it("tolère un modèle sans corps HTML", () => {
    const rendered = renderEmail({ code: "brouillon", subject: "Test {{name}}" }, { name: "Aya" });
    expect(rendered.subject).toBe("Test Aya");
    expect(rendered.html).toBe("");
    expect(rendered.text).toBe("");
  });
});

describe("extraction de variables", () => {
  it("liste les variables sans doublon", () => {
    expect(extractVariables("{{a}} {{b}} {{a}}").sort()).toEqual(["a", "b"]);
  });

  it("ignore les accolades non conformes", () => {
    expect(extractVariables("{{ a-b }} {{ok}}")).toEqual(["ok"]);
  });
});

describe("htmlToText", () => {
  it("supprime les balises et garde les sauts de ligne", () => {
    const text = htmlToText("<p>Ligne 1</p><p>Ligne 2</p>");
    expect(text).toBe("Ligne 1\nLigne 2");
  });

  it("supprime les blocs script et style", () => {
    const text = htmlToText("<style>b{}</style><script>evil()</script><p>Texte</p>");
    expect(text).toBe("Texte");
  });

  it("décode les entités courantes", () => {
    expect(htmlToText("<p>R&amp;D &quot;ok&quot;</p>")).toBe('R&D "ok"');
  });
});

describe("modèles par défaut", () => {
  it("couvre les e-mails exigés par le cahier des charges", () => {
    const codes = DEFAULT_EMAIL_TEMPLATES.map((item) => item.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "order_confirmation",
        "order_status_update",
        "invoice_available",
        "account_created",
        "password_reset",
        "return_status_update",
        "customer_message",
      ]),
    );
  });

  it("déclare des variables cohérentes avec les modèles", () => {
    for (const item of DEFAULT_EMAIL_TEMPLATES) {
      expect(item.variables.length).toBeGreaterThan(0);
      expect(new Set(item.variables).size).toBe(item.variables.length);
    }
  });
});
