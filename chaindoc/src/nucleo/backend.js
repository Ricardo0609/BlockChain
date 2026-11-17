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

  // ── ARREGLADO (17 nov): EL ORDEN ESTABA AL REVÉS ───────────
  //
  // El comentario de arriba dice «el mensaje del servidor manda sobre
  // el genérico» y el código hacía justo lo contrario: miraba
  // `DEL_TRANSPORTE` primero y se iba por ahí, tirando el mensaje que
  // la función había escrito con cuidado.
  //
  // Lo que veía Ricardo: analizar un contrato con la cuota de Gemini
  // agotada devuelve `unavailable` con el texto «Se agotó la cuota de
  // análisis por ahora, espera un minuto», y en pantalla salía «No se
  // pudo contactar al servidor. Revisa tu conexión». Su conexión
  // estaba perfecta. Mandamos a revisar lo que no estaba roto y
  // escondimos lo único que decía qué hacer.
  //
  // Ahora: si el mensaje lo escribió una función NUESTRA, esa gana.
  //
  // Y se sabe con certeza, no adivinando: la función lo marca al
  // lanzarlo. Mi primer intento fue mirar el texto y decidir si
  // «parecía» nuestro, y la primera prueba que corrió lo tumbó —«fetch
  // failed» tampoco está en ninguna lista y es del SDK—. Una lista de
  // frases ajenas que hay que mantener al día no es una regla: es una
  // deuda que se descubre el día que el SDK cambia una palabra.
  const propio = String(e?.message || "").trim();
  if(e?.details?.deOctavin && propio) return propio;

  if(DEL_TRANSPORTE[codigo]) return DEL_TRANSPORTE[codigo];

  // Y lo de siempre para los demás códigos: `permission-denied`,
  // `not-found` y compañía no están arriba, así que su mensaje -que
  // SÍ lo escribimos nosotros- sigue pasando por aquí. Esta línea
  // estaba y la quité sin querer al reordenar; la prueba que vigila
  // «Sólo el dueño puede eliminarlo» la trajo de vuelta.
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
