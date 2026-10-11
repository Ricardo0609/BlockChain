// ─────────────────────────────────────────────────────────────
// backend.js — Llamadas a las Cloud Functions
//
// Una sola puerta para hablar con el servidor. Firebase se encarga de
// mandar la sesión del usuario, así que las funciones saben quién
// llama sin que el navegador se lo diga.
// ─────────────────────────────────────────────────────────────

import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
const REGION = ENV.VITE_FUNCTIONS_REGION || "us-central1";

let fns = null;
const funciones = () => (fns ||= getFunctions(app, REGION));

/** Mensajes en español para los errores que devuelve el servidor. */
export function errorBackend(e){
  const codigo = (e?.code || "").replace("functions/", "");

  // ← ACTUALIZADO (11 oct): el mensaje del servidor manda sobre el
  // genérico.
  //
  // Nuestras funciones ya explican el motivo en español y con el caso
  // concreto: «Sólo el dueño puede eliminarlo», «No tienes una
  // solicitud abierta para ese requisito». Traducirlos todos a «No
  // tienes permiso para hacer esto en este documento» le quitaba al
  // usuario justo lo que necesita para saber qué hacer.
  //
  // Los de abajo sí se traducen, porque no los escribimos nosotros:
  // son del transporte y vienen en inglés y en jerga.
  const DEL_TRANSPORTE = {
    "unauthenticated":    "Tu sesión expiró. Vuelve a iniciar sesión.",
    "resource-exhausted": "Demasiados intentos seguidos. Espera un momento.",
    "unavailable":        "No se pudo contactar al servidor. Revisa tu conexión.",
    "internal":           "El servidor no pudo completar la operación.",
    "deadline-exceeded":  "El servidor tardó demasiado. Vuelve a intentarlo.",
  };
  if(DEL_TRANSPORTE[codigo]) return DEL_TRANSPORTE[codigo];

  const propio = String(e?.message || "").trim();
  if(propio && propio.toLowerCase() !== "internal") return propio;

  const RESPALDO = {
    "permission-denied":   "No tienes permiso para hacer esto en este documento.",
    "not-found":           "El documento ya no existe.",
    "failed-precondition": "Alguien más acaba de modificar el documento. Vuelve a intentarlo.",
    "invalid-argument":    "Los datos enviados no son válidos.",
  };
  return RESPALDO[codigo] || "No se pudo completar la operación.";
}

/** Llama a una función y devuelve sus datos. Lanza el error si falla. */
export async function llamar(nombre, datos = {}){
  const fn = httpsCallable(funciones(), nombre);
  const r = await fn(datos);
  return r.data;
}
