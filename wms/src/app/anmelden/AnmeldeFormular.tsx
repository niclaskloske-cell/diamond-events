"use client";

import { useActionState } from "react";
import { anmelden, type AnmeldeStatus } from "./actions";

const feldStil: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--farbe-rand)",
  background: "var(--farbe-flaeche)",
  color: "var(--farbe-text)",
};

export function AnmeldeFormular({ weiter }: { weiter?: string }) {
  const [status, formAction, laeuft] = useActionState<AnmeldeStatus, FormData>(
    anmelden,
    {},
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: "var(--abstand)" }}>
      <input type="hidden" name="weiter" value={weiter ?? ""} />

      <label style={{ display: "grid", gap: 6 }}>
        <span>E-Mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          style={feldStil}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span>Passwort</span>
        <input
          name="passwort"
          type="password"
          autoComplete="current-password"
          required
          style={feldStil}
        />
      </label>

      {/* role="alert" sorgt dafuer, dass Screenreader die Meldung ansagen. */}
      {status.fehler && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            background: "var(--farbe-fehler-flaeche)",
            color: "var(--farbe-fehler)",
          }}
        >
          {status.fehler}
        </p>
      )}

      <button
        type="submit"
        disabled={laeuft}
        style={{
          minHeight: 52,
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--farbe-akzent)",
          color: "var(--farbe-akzent-text)",
          fontWeight: 600,
          cursor: laeuft ? "progress" : "pointer",
        }}
      >
        {laeuft ? "Anmelden …" : "Anmelden"}
      </button>
    </form>
  );
}
