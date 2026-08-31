import { requireUser } from "@/lib/auth";
import { can } from "@/domain/auth/permissions";
import { abmelden } from "./anmelden/actions";

/**
 * Startseite nach der Anmeldung.
 *
 * Vorlaeufig eine Einstiegsseite, die zeigt, wer angemeldet ist und was diese
 * Rolle darf. Die Kacheln werden in den folgenden Schritten durch das
 * Lager-Dashboard und die Scanner-Oberflaeche ersetzt.
 */
export default async function StartSeite() {
  const user = await requireUser();

  const bereiche = [
    { titel: "Aufträge", pfad: "/auftraege", recht: "auftrag.lesen" as const },
    { titel: "Picken", pfad: "/scan", recht: "auftrag.picken" as const },
    { titel: "Verpackungsmaterial", pfad: "/material", recht: "material.lesen" as const },
    { titel: "Lagerplätze", pfad: "/lagerplaetze", recht: "lagerplatz.lesen" as const },
  ].filter((bereich) => can(user, bereich.recht));

  return (
    <main style={{ padding: "calc(var(--abstand) * 1.5)", maxWidth: 960, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--abstand)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Squishova WMS</h1>
          <p style={{ margin: 0, color: "var(--farbe-text-leise)" }}>
            Angemeldet als <strong>{user.role}</strong>
          </p>
        </div>

        <form action={abmelden}>
          <button
            type="submit"
            style={{
              minHeight: 44,
              padding: "0 18px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--farbe-rand)",
              background: "var(--farbe-flaeche)",
              cursor: "pointer",
            }}
          >
            Abmelden
          </button>
        </form>
      </header>

      <section
        style={{
          marginTop: "calc(var(--abstand) * 2)",
          display: "grid",
          gap: "var(--abstand)",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {bereiche.map((bereich) => (
          <article
            key={bereich.pfad}
            style={{
              background: "var(--farbe-flaeche)",
              border: "1px solid var(--farbe-rand)",
              borderRadius: "var(--radius)",
              padding: "var(--abstand)",
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>{bereich.titel}</h2>
            <p style={{ margin: 0, color: "var(--farbe-text-leise)" }}>
              Wird im nächsten Schritt umgesetzt.
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
