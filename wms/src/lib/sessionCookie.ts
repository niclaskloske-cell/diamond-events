/**
 * Nur der Cookie-Name — bewusst in einem eigenen Modul ohne Abhaengigkeiten.
 *
 * Die Middleware laeuft in der Edge-Runtime, in der node:crypto nicht zur
 * Verfuegung steht. Wuerde sie den Namen aus lib/session importieren, zoege sie
 * die Signaturfunktionen mit in das Edge-Bundle und der Build bricht ab.
 */
export const SESSION_COOKIE = "squishova_session";
