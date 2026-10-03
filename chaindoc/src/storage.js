// ─────────────────────────────────────────────────────────────
// storage.js — Archivos de evidencia en Firebase Storage
//
// Antes cada archivo se guardaba dentro de Firestore en base64, con
// un techo de 700 KB y comprimiendo las imágenes a la fuerza. Ahora:
//
//  1. El navegador sube el archivo a Storage, hasta 20 MB, sin tocarlo.
//  2. El servidor lo lee y calcula su huella él mismo. La huella que
//     queda en la cadena la calculó el servidor, no el navegador.
//  3. Para abrirlo, el archivo se pide al servidor, que comprueba que
//     quien lo pide tenga acceso al expediente. No hay enlaces
//     públicos que se puedan reenviar.
//
// Las miniaturas siguen viajando dentro del documento: pesan poco y
// hacen que la galería cargue de inmediato.
// ─────────────────────────────────────────────────────────────

import { getStorage, ref, uploadBytes, deleteObject } from "firebase/storage";
import { app, auth } from "./firebase";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
const REGION = ENV.VITE_FUNCTIONS_REGION || "us-central1";

export const LIMITE_MB = 20;
const MAX_BYTES = LIMITE_MB * 1024 * 1024;

let alm = null;
// ← Se exporta para que la pantalla de invitación pueda subir a su
// rincón temporal sin duplicar la inicialización del almacén.
export const almacen = () => (alm ||= getStorage(app));

const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Ruta donde vive el archivo. El servidor comprueba que empiece así. */
export const rutaDe = (uid, docId) => `evidencias/${uid}/${docId}/${rid()}`;

/** Sube el archivo y devuelve su ruta. El registro lo hace el servidor. */
export async function subirArchivo({ uid, docId, file }) {
  if (!file) throw new Error("No hay archivo que subir.");
  if (file.size > MAX_BYTES) {
    throw new Error(
      `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el límite es ${LIMITE_MB} MB.`
    );
  }
  const ruta = rutaDe(uid, docId);
  await uploadBytes(ref(almacen(), ruta), file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: { nombre: file.name || "archivo" },
  });
  return { ruta, tam: file.size, tipo: file.type || "application/octet-stream" };
}

/** Borra un archivo recién subido que no llegó a registrarse. */
export async function descartarSubida(ruta) {
  try { await deleteObject(ref(almacen(), ruta)); } catch { /* ya no estaba */ }
}

// Dirección de las funciones. Si algún día cambia (por ejemplo al usar
// un dominio propio), se ajusta con VITE_FUNCIONES_URL sin tocar código.
const baseFunciones = () =>
  (ENV.VITE_FUNCIONES_URL
    || `https://${REGION}-${app?.options?.projectId}.cloudfunctions.net`).replace(/\/$/, "");

const urlFuncion = (nombre) => `${baseFunciones()}/${nombre}`;

/**
 * Pide el archivo al servidor y lo abre o lo descarga.
 * `path` es el identificador que quedó guardado en el expediente.
 */
export async function abrirArchivo(path, nombre, descargar) {
  if (!path) throw new Error("Este comprobante se registró antes del almacenamiento. Vuelve a adjuntarlo.");
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

  const token = await usuario.getIdToken();
  const r = await fetch(`${urlFuncion("archivo")}?id=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text() || "No se pudo abrir el archivo.");

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);

  if (descargar) {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre || "archivo";
    document.body.appendChild(a); a.click(); a.remove();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── Miniaturas ────────────────────────────────────────────────

const cargarImagen = (file) =>
  new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Imagen ilegible")); };
    img.src = url;
  });

/** Miniatura ligera en data URI, para que la galería cargue sin bajar el original. */
export async function makeThumb(file, lado = 160) {
  if (!(file.type || "").startsWith("image/")) return null;
  try {
    const img = await cargarImagen(file);
    let w = img.width, h = img.height;
    const f = lado / Math.max(w, h);
    if (f < 1) { w = Math.round(w * f); h = Math.round(h * f); }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}

export const storageError = (err) => {
  const c = err?.code || "";
  if (c === "storage/unauthorized" || c === "functions/permission-denied")
    return "Sin permiso para guardar este archivo. Revisa que la sesión siga abierta.";
  if (c === "storage/canceled") return "Se canceló la subida.";
  if (c === "storage/retry-limit-exceeded")
    return "La subida tardó demasiado. Revisa tu conexión e inténtalo otra vez.";
  if (c === "storage/quota-exceeded") return "Se agotó el espacio de almacenamiento del proyecto.";
  if (/network|failed to fetch/i.test(err?.message || ""))
    return "No se pudo contactar al servidor. Revisa tu conexión.";
  return err?.message || "No se pudo procesar el archivo.";
};

export const isPreviewable = (tipo = "") =>
  tipo.startsWith("image/") || tipo === "application/pdf";