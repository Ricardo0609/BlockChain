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

/** Las carpetas en las que de verdad hay algo guardado. */
export const carpetasEnUso = (lista = []) =>
  [...new Set(lista.map(x => x?.folder).filter(Boolean))].sort();
