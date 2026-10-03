// ─────────────────────────────────────────────────────────────
// monitoreo.js — Aviso de errores con Sentry
//
// Si no hay VITE_SENTRY_DSN, no hace nada: la app funciona igual.
// Privacidad: no se envían IP, correos ni textos de contratos; las
// llaves que viajen en una URL (?key=…) se borran antes de salir.
// ─────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/react";

const LLAVE = /([?&](?:key|apiKey|api_key|token)=)[^&\s"'#]+/gi;

/** Oculta llaves en un texto. */
export function limpiar(texto){
  return typeof texto === "string" ? texto.replace(LLAVE, "$1[oculta]") : texto;
}

/** Recorre un objeto y oculta llaves en todos sus textos. */
export function limpiarProfundo(v, prof = 0){
  if(prof > 12) return v;
  if(typeof v === "string") return limpiar(v);
  if(Array.isArray(v)) return v.map(x => limpiarProfundo(x, prof + 1));
  if(v && typeof v === "object"){
    const out = {};
    for(const [k, val] of Object.entries(v)) out[k] = limpiarProfundo(val, prof + 1);
    return out;
  }
  return v;
}

/** Decide qué rastro (breadcrumb) se guarda y lo limpia. */
export function filtrarRastro(rastro){
  // Los console.log pueden llevar contenido de documentos: fuera.
  if(rastro?.category === "console" && rastro.level !== "error") return null;
  return limpiarProfundo(rastro);
}

export function iniciarMonitoreo({ dsn, entorno }){
  if(!dsn) return false;
  Sentry.init({
    dsn,
    environment: entorno,
    sendDefaultPii: false,
    // Los errores que la app atrapa y sólo escribe en consola
    // (console.error) también se reportan.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    tracesSampleRate: 0,
    beforeSend: (evento) => limpiarProfundo(evento),
    beforeBreadcrumb: filtrarRastro,
  });
  return true;
}
