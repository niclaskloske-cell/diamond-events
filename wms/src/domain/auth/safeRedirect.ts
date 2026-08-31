/**
 * Prueft das Weiterleitungsziel nach der Anmeldung.
 *
 * Ohne diese Pruefung liesse sich ueber den Parameter "weiter" auf eine fremde
 * Seite umleiten (Open Redirect) — ein beliebter Weg, Anmeldedaten auf einer
 * nachgebauten Maske abzugreifen. Erlaubt sind ausschliesslich seiteninterne
 * absolute Pfade.
 */

// Steuerzeichen und Leerzeichen: koennen Pruefungen weiter unten in der Kette
// aushebeln, etwa wenn ein Browser sie stillschweigend entfernt.
function enthaeltVerboteneZeichen(wert: string): boolean {
  for (const zeichen of wert) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeRedirectTarget(
  weiter: string | null | undefined,
  fallback = "/",
): string {
  if (!weiter) return fallback;

  const ziel = weiter.trim();
  if (!ziel.startsWith("/")) return fallback;
  // "//host" und "/\host" werden vom Browser als absolute URL gelesen.
  if (ziel.startsWith("//") || ziel.startsWith("/\\")) return fallback;
  if (enthaeltVerboteneZeichen(ziel)) return fallback;

  return ziel;
}
