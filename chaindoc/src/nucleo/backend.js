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
  const mensajes = {
    "unauthenticated":    "Tu sesión expiró. Vuelve a iniciar sesión.",
    "permission-denied":  "No tienes permiso para hacer esto en este documento.",
    "not-found":          "El documento ya no existe.",
    "failed-precondition": "Alguien más acaba de modificar el documento. Vuelve a intentarlo.",
    "invalid-argument":   "Los datos enviados no son válidos.",
    "resource-exhausted": "Demasiados intentos seguidos. Espera un momento.",
    "unavailable":        "No se pudo contactar al servidor. Revisa tu conexión.",
    "internal":           "El servidor no pudo completar la operación.",
  };
  return mensajes[codigo] || e?.message || "No se pudo completar la operación.";
}

/** Llama a una función y devuelve sus datos. Lanza el error si falla. */
export async function llamar(nombre, datos = {}){
  const fn = httpsCallable(funciones(), nombre);
  const r = await fn(datos);
  return r.data;
}
