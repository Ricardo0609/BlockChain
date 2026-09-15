// ─────────────────────────────────────────────────────────────
// storage.js — Archivos de evidencia guardados en Firestore
//
// Firebase Storage exige plan Blaze (tarjeta). Mientras tanto,
// cada archivo vive en su propio documento de la colección
// "evidencias", codificado en base64.
//
// ⚠️ LÍMITE REAL: Firestore admite 1 MB por documento y base64
// infla el archivo ~33%, así que el techo son unos 700 KB.
// Las imágenes se comprimen solas para caber; los PDF no.
//
// Al migrar a Storage sólo cambian tres funciones: uploadEvidence,
// deleteEvidence y openEvidence. El resto de la app no se entera.
// ─────────────────────────────────────────────────────────────

import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

const COL = "evidencias";
const MAX_BYTES = 700 * 1024;        // margen seguro bajo el límite de 1 MB
const MAX_LADO  = 1600;              // px del lado mayor tras comprimir

const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── Compresión de imágenes ────────────────────────────────────

const loadImage = (file) =>
  new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Imagen ilegible")); };
    img.src = url;
  });

const toBlob = (canvas, q) =>
  new Promise((res) => canvas.toBlob(res, "image/jpeg", q));

/**
 * Reduce la imagen hasta que quepa: primero baja la calidad,
 * y si aun así no entra, también las dimensiones.
 */
async function compressImage(file) {
  const img = await loadImage(file);
  let ancho = img.width, alto = img.height;

  if (Math.max(ancho, alto) > MAX_LADO) {
    const f = MAX_LADO / Math.max(ancho, alto);
    ancho = Math.round(ancho * f);
    alto  = Math.round(alto * f);
  }

  for (let intento = 0; intento < 5; intento++) {
    const canvas = document.createElement("canvas");
    canvas.width = ancho; canvas.height = alto;
    canvas.getContext("2d").drawImage(img, 0, 0, ancho, alto);

    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    ancho = Math.round(ancho * 0.75);
    alto  = Math.round(alto * 0.75);
    if (ancho < 200) break;
  }
  throw new Error("La imagen es demasiado grande incluso comprimida.");
}

const toBase64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(blob);
  });

// ── API pública ───────────────────────────────────────────────

/** Guarda el archivo y devuelve la referencia que va en el expediente. */
export async function uploadEvidence({ uid, docId, reqId, file }) {
  let blob = file;
  let tipo = file.type || "application/octet-stream";
  let comprimida = false;

  if (tipo.startsWith("image/") && file.size > MAX_BYTES) {
    blob = await compressImage(file);
    tipo = "image/jpeg";
    comprimida = true;
  }

  if (blob.size > MAX_BYTES) {
    throw new Error(
      `El archivo pesa ${(blob.size / 1024).toFixed(0)} KB y el límite actual es 700 KB. ` +
      "Comprime el PDF, o actualiza a Firebase Storage para archivos grandes."
    );
  }

  const id = `${docId}-${reqId}-${rid()}`;
  await setDoc(doc(db, COL, id), {
    id, ownerUid: uid, docId, reqId,
    nombre: file.name, tipo, tam: blob.size, comprimida,
    data: await toBase64(blob),
    creadoEn: new Date().toISOString(),
  });

  return { path: id, url: null, tam: blob.size, tipo, comprimida };
}

export async function deleteEvidence(path) {
  if (!path) return true;
  try { await deleteDoc(doc(db, COL, path)); return true; }
  catch (e) { console.error(e); return false; }
}

/** Recupera el archivo guardado y lo abre o lo descarga. */
export async function openEvidence(path, nombre, descargar) {
  if (!path) throw new Error("Este comprobante se registró antes de habilitar el almacenamiento. Vuelve a adjuntarlo.");

  const snap = await getDoc(doc(db, COL, path));
  if (!snap.exists()) throw new Error("El archivo ya no está disponible.");
  const f = snap.data();

  // base64 → bytes → blob local
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: f.tipo }));

  if (descargar) {
    const a = document.createElement("a");
    a.href = url;
    a.download = f.nombre || nombre || "archivo";
    document.body.appendChild(a); a.click(); a.remove();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Miniatura ligera en data URI, para mostrar la galería sin tener que
 * leer el archivo completo desde Firestore. Se guarda dentro del propio
 * documento, así que debe pesar poco.
 */
export async function makeThumb(file, lado = 160) {
  if (!(file.type || "").startsWith("image/")) return null;
  try {
    const img = await loadImage(file);
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
  const c = err?.code;
  if (c === "permission-denied")
    return "Sin permiso. Revisa las reglas de Firestore para la colección «evidencias».";
  if (c === "resource-exhausted") return "Se agotó la cuota de Firestore por hoy.";
  if (/maximum|exceeds|1048576/i.test(err?.message || ""))
    return "El archivo excede el límite de 1 MB de Firestore. Comprímelo e inténtalo de nuevo.";
  return err?.message || "No se pudo procesar el archivo.";
};

export const isPreviewable = (tipo = "") =>
  tipo.startsWith("image/") || tipo === "application/pdf";

export const LIMITE_KB = MAX_BYTES / 1024;
