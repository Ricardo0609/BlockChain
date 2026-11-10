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
// ── EL ENLACE DE ENTREGA ──────────────────────────────────────
//
// ← CAMBIADO (6 nov): de `?entrega=<testigo>` a `/e/<testigo>`.
//
// El viejo se rompía al pegarlo. Un enlace con `?` y un testigo largo
// lo parten en dos WhatsApp y Outlook, y lo que le llega al proveedor
// es media dirección que no abre nada. El corto aguanta.
//
// LOS VIEJOS SIGUEN FUNCIONANDO PARA SIEMPRE. Hay enlaces repartidos
// que viven en bandejas de entrada y no se pueden volver a mandar, así
// que leer `?entrega=` no es compatibilidad por pereza: es que la otra
// parte no tiene forma de conseguir el nuevo.
//
// OJO AL PUBLICAR: `/e/<testigo>` exige que el servidor devuelva
// index.html para cualquier ruta. Sin esa regla da 404 y el enlace no
// llega a abrir la aplicación. La prueba es entrar a /e/loquesea y ver
// si carga la página o un error del servidor.

const PREFIJO = "/e/";

export const testigoDeUrl = () => {
  try{
    const ruta = window.location.pathname || "";
    if(ruta.startsWith(PREFIJO)){
      const t = decodeURIComponent(ruta.slice(PREFIJO.length)).replace(/\/+$/, "");
      if(t) return t;
    }
    return new URLSearchParams(window.location.search).get("entrega") || null;
  }catch{ return null; }
};

export const enlaceDeEntrega = (testigo) =>
  `${window.location.origin}${PREFIJO}${encodeURIComponent(testigo)}`;

/** Limpia la dirección sin recargar, para que el testigo no quede a la vista. */
export function limpiarUrlDeEntrega(){
  try{
    const u = new URL(window.location.href);
    u.searchParams.delete("entrega");
    // La ruta corta lleva el testigo DENTRO del camino, así que
    // limpiarla es volver a la raíz, no quitar un parámetro.
    const ruta = u.pathname.startsWith(PREFIJO) ? "/" : u.pathname;
    window.history.replaceState({}, "", ruta + (u.search || ""));
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