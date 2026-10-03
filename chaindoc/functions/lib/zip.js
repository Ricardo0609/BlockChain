// ─────────────────────────────────────────────────────────────
// zip.js — Lector mínimo de archivos ZIP
//
// El SAT publica sus certificados raíz en un .zip, y Node no sabe
// abrir zips por su cuenta. Son unas cien líneas contra una
// dependencia entera, y lo que hay dentro son los certificados con los
// que se decide si una firma es de verdad: conviene poder leer el
// código que los saca.
//
// Sólo lee, y sólo lo que el formato usa aquí: entradas guardadas tal
// cual (método 0) o comprimidas con deflate (método 8), que es lo que
// produce cualquier herramienta. No descomprime zips cifrados ni
// partidos en varios archivos.
//
// Protegido contra las dos travesuras clásicas: nombres con «..» o con
// ruta absoluta, y entradas que dicen pesar poco y al descomprimirse
// llenan la memoria.
// ─────────────────────────────────────────────────────────────

import { inflateRawSync } from "node:zlib";

const FIRMA_DIRECTORIO = 0x02014b50;   // cabecera de una entrada del índice
const FIRMA_FINAL      = 0x06054b50;   // cabecera del final del índice

/** Tope de lo que se acepta descomprimir, por entrada y en total. */
const TOPE_ENTRADA = 8 * 1024 * 1024;
const TOPE_TOTAL   = 64 * 1024 * 1024;

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i+1] << 8) | (b[i+2] << 16) | (b[i+3] << 24)) >>> 0;

/**
 * Devuelve las entradas del zip como { nombre, datos }.
 *
 * Se lee por el índice del final y no recorriendo el archivo de
 * principio a fin, que es como manda el formato: los tamaños de la
 * cabecera local pueden venir en cero y estar sólo en el índice.
 */
export function leerZip(bytes, { soloQueTermineEn = null } = {}){
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fin = buscarFinal(b);
  if(fin < 0) throw new Error("zip-sin-indice");

  const cuantas = u16(b, fin + 10);
  let i = u32(b, fin + 16);          // dónde empieza el índice
  const salida = [];
  let total = 0;

  for(let n = 0; n < cuantas; n++){
    if(i + 46 > b.length || u32(b, i) !== FIRMA_DIRECTORIO) break;

    const metodo     = u16(b, i + 10);
    const comprimido = u32(b, i + 20);
    const original   = u32(b, i + 24);
    const largoN     = u16(b, i + 28);
    const largoExtra = u16(b, i + 30);
    const largoCom   = u16(b, i + 32);
    const desplazado = u32(b, i + 42);

    const nombre = new TextDecoder().decode(b.subarray(i + 46, i + 46 + largoN));
    i += 46 + largoN + largoExtra + largoCom;

    // Una carpeta no trae datos.
    if(nombre.endsWith("/")) continue;
    if(soloQueTermineEn && !nombre.toLowerCase().endsWith(soloQueTermineEn)) continue;

    if(!nombreSeguro(nombre)) throw new Error(`zip-nombre-peligroso:${nombre}`);
    if(original > TOPE_ENTRADA) throw new Error("zip-entrada-demasiado-grande");
    total += original;
    if(total > TOPE_TOTAL) throw new Error("zip-demasiado-grande");

    salida.push({ nombre, datos: sacar(b, desplazado, metodo, comprimido, original) });
  }
  return salida;
}

/** Saca los datos de una entrada, saltándose su cabecera local. */
function sacar(b, desplazado, metodo, comprimido, original){
  if(desplazado + 30 > b.length) throw new Error("zip-truncado");
  const largoN = u16(b, desplazado + 26);
  const largoExtra = u16(b, desplazado + 28);
  const inicio = desplazado + 30 + largoN + largoExtra;
  const crudo = b.subarray(inicio, inicio + comprimido);

  if(metodo === 0) return crudo;
  if(metodo === 8){
    // maxOutputLength corta a un zip que miente sobre su tamaño.
    const salida = inflateRawSync(Buffer.from(crudo),
      { maxOutputLength: Math.max(original, 1) + 1024 });
    return new Uint8Array(salida);
  }
  throw new Error(`zip-metodo-no-soportado:${metodo}`);
}

/**
 * El índice está al final, pero puede haber un comentario después, así
 * que hay que buscar su cabecera hacia atrás.
 */
function buscarFinal(b){
  const desde = Math.max(0, b.length - 65557);   // 64 KiB de comentario + la cabecera
  for(let i = b.length - 22; i >= desde; i--){
    if(u32(b, i) === FIRMA_FINAL) return i;
  }
  return -1;
}

/**
 * Un nombre dentro del zip no debería poder salirse de su carpeta.
 * Aquí no se escribe nada en disco, pero la comprobación va de todos
 * modos: el día que alguien use esto para extraer a un directorio, ya
 * está puesta.
 */
export function nombreSeguro(nombre){
  if(!nombre || nombre.length > 250) return false;
  if(nombre.startsWith("/") || nombre.startsWith("\\")) return false;
  if(/^[a-zA-Z]:/.test(nombre)) return false;
  if(nombre.split(/[/\\]/).includes("..")) return false;
  if(nombre.includes("\0")) return false;
  return true;
}