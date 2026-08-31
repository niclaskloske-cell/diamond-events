import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AnmeldeFormular } from "./AnmeldeFormular";

export const metadata = { title: "Anmelden — Squishova WMS" };

export default async function AnmeldenSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string }>;
}) {
  // Bereits angemeldet: nicht erneut nach dem Passwort fragen.
  if (await getCurrentUser()) redirect("/");

  const { weiter } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--abstand)",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "var(--farbe-flaeche)",
          border: "1px solid var(--farbe-rand)",
          borderRadius: "var(--radius)",
          padding: "calc(var(--abstand) * 1.5)",
        }}
      >
        <h1 style={{ fontSize: 24 }}>Squishova WMS</h1>
        <p style={{ color: "var(--farbe-text-leise)", marginTop: 0 }}>
          Bitte anmelden, um fortzufahren.
        </p>
        <AnmeldeFormular weiter={weiter} />
      </div>
    </main>
  );
}
