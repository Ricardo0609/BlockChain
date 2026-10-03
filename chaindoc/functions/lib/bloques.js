// ─────────────────────────────────────────────────────────────
// bloques.js — Formato de bloque y verificación de la cadena
//
// Hay dos formatos y los dos se verifican:
//
//  v1 (el de hoy): el hash se calcula sobre un texto con campos
//      separados por "|". Los metadatos quedaban FUERA del hash, así
//      que alguien podía cambiar el importe anotado en un comprobante
//      sin romper la cadena.
//
//  v2 (el nuevo): el hash cubre TODO el bloque, incluidos los
//      metadatos y quién lo firmó, con un orden de campos fijo
//      (JSON canónico) y la hora puesta por el servidor, no por el
//      navegador.
//
// Cada bloque dice de qué versión es, así que una cadena vieja sigue
// verificando igual y los bloques nuevos se agregan encima.
//
// ⚠️ Este archivo está duplicado en functions/lib/bloques.js. Los dos
// tienen que ser idénticos: hay una prueba que lo comprueba.
// ─────────────────────────────────────────────────────────────

/** Orden fijo de los campos que entran al hash de un bloque v2. */
export const CAMPOS_V2 = [
  "v", "index", "timestamp", "action", "content", "author", "autorUid", "meta", "previousHash",
];

/**
 * JSON canónico: mismas llaves, mismo orden, siempre.
 * Sin esto, dos serializaciones del mismo bloque podrían dar hashes
 * distintos sólo por el orden en que se escribieron los campos.
 */
export function canonico(valor){
  if(valor === null || valor === undefined) return "null";
  if(typeof valor === "number") return Number.isFinite(valor) ? JSON.stringify(valor) : "null";
  if(typeof valor === "boolean" || typeof valor === "string") return JSON.stringify(valor);
  if(Array.isArray(valor)) return "[" + valor.map(canonico).join(",") + "]";
  if(typeof valor === "object"){
    const llaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
    return "{" + llaves.map((k) => JSON.stringify(k) + ":" + canonico(valor[k])).join(",") + "}";
  }
  return "null";
}

/** SHA-256 en hexadecimal. Funciona igual en el navegador y en el servidor. */
export async function sha256(texto){
  const bytes = new TextEncoder().encode(texto);
  const cripto = globalThis.crypto;
  if(cripto?.subtle){
    const b = await cripto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  // Node sin WebCrypto (versiones viejas).
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 de bytes (Uint8Array o Buffer). Lo usa el servidor con los archivos. */
export async function sha256Bytes(bytes){
  const cripto = globalThis.crypto;
  if(cripto?.subtle){
    const b = await cripto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

/** Texto que se hashea en v1. Se conserva para poder verificar lo ya sellado. */
export const textoV1 = (b) =>
  `${b.index}|${b.timestamp}|${b.action}|${b.content}|${b.author}|${b.previousHash}`;

/** Texto que se hashea en v2: el bloque entero, en orden fijo. */
export function textoV2(b){
  const payload = {};
  for(const k of CAMPOS_V2) payload[k] = b[k] === undefined ? null : b[k];
  payload.v = 2;
  return canonico(payload);
}

/** Recalcula el hash que le corresponde a un bloque, según su versión. */
export const hashDeBloque = (b) => sha256(b.v === 2 ? textoV2(b) : textoV1(b));

/**
 * Arma un bloque v2 ya sellado.
 * `timestamp` lo pone quien llama: en producción, el servidor.
 */
export async function armarBloqueV2({ previo, action, content, author, autorUid, meta, timestamp }){
  const b = {
    v: 2,
    index: previo ? previo.index + 1 : 0,
    timestamp: timestamp || new Date().toISOString(),
    action,
    content: content ?? "",
    author: author || "",
    autorUid: autorUid || null,
    meta: meta ?? null,
    previousHash: previo ? previo.hash : "0".repeat(64),
  };
  b.hash = await sha256(textoV2(b));
  return b;
}

/**
 * Verifica una cadena completa, mezclando bloques v1 y v2.
 * Devuelve { valid } o { valid:false, failedAt, motivo }.
 */
export async function verificarCadena(cadena = []){
  for(let i = 0; i < cadena.length; i++){
    const b = cadena[i];

    if(b.index !== i) return { valid: false, failedAt: i, motivo: "orden" };

    const esperado = await hashDeBloque(b);
    if(esperado !== b.hash) return { valid: false, failedAt: i, motivo: "contenido" };

    const anterior = i > 0 ? cadena[i - 1].hash : "0".repeat(64);
    if(b.previousHash !== anterior) return { valid: false, failedAt: i, motivo: "enlace" };

    // Una cadena no puede "regresar" a v1 después de tener bloques v2.
    if(i > 0 && cadena[i - 1].v === 2 && b.v !== 2) return { valid: false, failedAt: i, motivo: "version" };
  }
  return { valid: true };
}

/** Motivos en palabras, para la interfaz. */
export const MOTIVOS = {
  orden:     "el bloque no está en su lugar",
  contenido: "el contenido del bloque no coincide con su huella",
  enlace:    "el bloque no engancha con el anterior",
  version:   "aparece un bloque con formato viejo después de uno nuevo",
};

/** El sello de firma: en v2 viaja dentro de meta (y por eso queda hasheado). */
export const selloDe = (b) => b?.meta?.sello ?? b?.sello ?? null;

/** Los datos de la firma biométrica, en cualquiera de los dos formatos. */
export const firmaDe = (b) => b?.meta?.signature ?? b?.signature ?? null;