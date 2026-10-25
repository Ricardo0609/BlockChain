// Las carpetas con las que alguien ordena sus documentos.
//
// Son un rotulo del navegador, no del expediente: no viajan con el
// documento, no se comparten y el servidor no las conoce. Si algun dia
// tienen que viajar, esto se muda al servidor y el modulo desaparece.
//
// Va en su propio archivo, sin tocar Firebase, para poder probarlo.

/**
 * Dónde guarda el navegador la lista de carpetas de una cuenta.
 *
 * ← NUEVO (16 oct): antes era una sola clave, "cd_folders", compartida
 * por todas las cuentas que entraran en ese navegador. Quien abría una
 * cuenta nueva se encontraba las carpetas de la anterior ya puestas.
 * La clave lleva el uid para que eso no pueda volver a pasar.
 *
 * Las carpetas son un rótulo del navegador, no del expediente: no
 * viajan con el documento ni se comparten. Si algún día tienen que
 * hacerlo, esto se muda al servidor y esta función desaparece.
 */
export const claveCarpetas = (uid) => `cd_carpetas:${uid || "sin-cuenta"}`;

/** La lista guardada de esa cuenta; vacía si no hay o si está rota. */
export function leerCarpetas(uid){
  try{ return JSON.parse(localStorage.getItem(claveCarpetas(uid))) || []; }
  catch{ return []; }
}

/**
 * Si esta cuenta ya tiene lista propia. Distinto de tenerla vacía: una
 * lista vacía guardada a propósito se respeta, y una cuenta que nunca
 * ha guardado ninguna es la que adopta las carpetas que usen sus
 * documentos. Por eso se mira la clave y no su contenido.
 */
export const tieneCarpetasPropias = (uid) =>
  localStorage.getItem(claveCarpetas(uid)) !== null;

// ── CREAR UNA CARPETA ─────────────────────────────────────────
//
// ← NUEVO (25 oct). Hasta aquí una carpeta se creaba con
// `mIn.trim()` y punto: no había tope de largo, ni se miraba si ya
// existía, ni se impedía llamarla «Sin carpeta» —que es la etiqueta
// del botón de no-carpeta, así que habría dos botones iguales que
// hacen cosas distintas.
//
// Se podía vivir con eso mientras hubiera UN sitio donde crearlas.
// Ahora hay dos, y una regla repetida en dos sitios es una regla que
// dentro de un mes dice cosas distintas según por dónde entres.

export const LARGO_CARPETA = 40;

/** El nombre tal y como se va a guardar: sin bordes y sin dobles espacios. */
export const normalizarCarpeta = (nombre) =>
  String(nombre || "").replace(/\s+/g, " ").trim();

/** El nombre del botón que significa «ninguna». No se puede usar. */
export const SIN_CARPETA = "Sin carpeta";

/**
 * Si este nombre vale, y por qué no.
 *
 * Cuando ya existe NO es un error de verdad: lo que quiere quien lo
 * escribió es guardar ahí. Se devuelve `yaEsta` para que quien llama
 * la seleccione en vez de regañar por algo que no está mal.
 */
export function revisarCarpeta(nombre, existentes = []) {
  const limpio = normalizarCarpeta(nombre);
  if (!limpio) return { ok: false, error: "Escribe un nombre para la carpeta." };
  if (limpio.length > LARGO_CARPETA) {
    return { ok: false, error: `El nombre no puede pasar de ${LARGO_CARPETA} caracteres.` };
  }
  if (limpio.toLowerCase() === SIN_CARPETA.toLowerCase()) {
    return { ok: false, error: "Ese nombre ya lo usa el botón de «sin carpeta». Elige otro." };
  }
  const igual = existentes.find((f) => normalizarCarpeta(f).toLowerCase() === limpio.toLowerCase());
  if (igual) return { ok: true, nombre: igual, yaEsta: true };
  return { ok: true, nombre: limpio, yaEsta: false };
}

/** La lista con la carpeta nueva, en orden y sin repetir. */
export function conCarpeta(lista = [], nombre) {
  const r = revisarCarpeta(nombre, lista);
  if (!r.ok || r.yaEsta) return [...lista];
  return [...lista, r.nombre].sort((a, b) => a.localeCompare(b, "es"));
}

/** Las carpetas en las que de verdad hay algo guardado. */
export const carpetasEnUso = (lista = []) =>
  [...new Set(lista.map(x => x?.folder).filter(Boolean))].sort();
