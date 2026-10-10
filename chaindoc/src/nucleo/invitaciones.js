// ─────────────────────────────────────────────────────────────
// invitaciones.js — El lado del navegador de los enlaces de entrega
//
// Quien recibe el enlace no tiene cuenta y no va a crearse una. Entra
// con una sesión anónima de Firebase —invisible para él— que sirve
// para una sola cosa: dejar el archivo en un rincón aislado del
// almacén. De ahí lo recoge el servidor.
// ─────────────────────────────────────────────────────────────

import { signInAnonymously } from "firebase/auth";
import { ref, uploadBytes } from "firebase/storage";
import { auth } from "../firebase";
import { almacen } from "../storage";
import { llamar } from "./backend";

/** El testigo viaja en la dirección: ?entrega=... */
export const testigoDeUrl = () => {
  try{ return new URLSearchParams(window.location.search).get("entrega") || null; }
  catch{ return null; }
};

export const enlaceDeEntrega = (testigo) =>
  `${window.location.origin}${window.location.pathname}?entrega=${encodeURIComponent(testigo)}`;

/** Limpia la dirección sin recargar, para que el testigo no quede a la vista. */
export function limpiarUrlDeEntrega(){
  try{
    const u = new URL(window.location.href);
    u.searchParams.delete("entrega");
    window.history.replaceState({}, "", u.pathname + (u.search || ""));
  }catch{ /* si el navegador no deja, no pasa nada */ }
}

export const verInvitacion = (testigo) => llamar("verInvitacion", { testigo });

/**
 * Entrega el archivo. Son tres pasos y el orden importa: primero la
 * sesión anónima (sin ella el almacén rechaza la subida), después el
 * archivo, y sólo entonces se le avisa al servidor para que lo
 * recoja, lo revise y lo asiente.
 */
export async function entregarArchivo(testigo, reqId, archivo, onPaso){
  onPaso?.("Preparando la entrega…");
  const sesion = auth.currentUser || (await signInAnonymously(auth)).user;

  const huella = await huellaDelTestigo(testigo);
  const limpio = (archivo.name || "archivo")
    .replace(/[^\w.-]/g, "_").replace(/\.{2,}/g, "_").slice(0, 80) || "archivo";
  const ruta = `invitaciones/${sesion.uid}/${huella}/${limpio}`;

  onPaso?.("Subiendo el archivo…");
  await uploadBytes(ref(almacen(), ruta), archivo, { contentType: archivo.type || undefined });

  onPaso?.("Registrando…");
  return await llamar("subirPorInvitacion", {
    testigo, reqId, ruta, nombre: archivo.name || limpio });
}

/**
 * ← NUEVO: entregar un enlace, no un archivo.
 *
 * No sube nada: la dirección viaja en la llamada y el servidor la
 * revisa, la normaliza y le saca la huella. Por eso no hay paso de
 * «Subiendo…» que avisar.
 */
export async function entregarEnlace(testigo, reqId, url, nombre){
  // La sesión anónima también hace falta aquí: la función exige estar
  // autenticado, aunque sea sin cuenta, para poder limitar el abuso.
  if(!auth.currentUser) await signInAnonymously(auth);
  return await llamar("entregarEnlacePorInvitacion", { testigo, reqId, url, nombre });
}

/**
 * La misma huella que calcula el servidor. Se usa sólo para armar la
 * ruta donde dejar el archivo; quien decide si el enlace vale es el
 * servidor, que la recalcula por su cuenta.
 */
export async function huellaDelTestigo(testigo){
  const datos = new TextEncoder().encode(String(testigo || ""));
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cuánto le queda al enlace, en palabras. */
export function tiempoRestante(expiraEn){
  if(!expiraEn) return "";
  const ms = Date.parse(expiraEn) - Date.now();
  if(ms <= 0) return "vencido";
  const dias = Math.floor(ms / 86400000);
  if(dias >= 1) return dias === 1 ? "1 día" : `${dias} días`;
  const horas = Math.max(1, Math.floor(ms / 3600000));
  return horas === 1 ? "1 hora" : `${horas} horas`;
}