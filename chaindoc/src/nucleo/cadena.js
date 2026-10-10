// Identificadores y hash de propósito general.
// El formato de bloque y la verificación de la cadena viven en bloques.js.

export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
export const genNumId = () => String(Math.floor(Math.random() * 90000000000) + 10000000000);

// ← NUEVO (10 oct): el folio consecutivo de la cuenta.
//
// Antes el identificador visible era un número de once cifras al azar:
// no decía nada, no se podía dictar por teléfono y daba la impresión de
// que el documento venía de otra parte. Ahora el primero de cada cuenta
// es el 01, el siguiente el 02, y así. Quien asigna el número es el
// servidor, en la misma transacción que crea el documento, para que dos
// pestañas abiertas a la vez no se peleen por el mismo folio.
//
// Dos cifras como mínimo: «01» se lee como un folio y «1» como un
// descuido. Del cien en adelante crece solo.
export const folioTexto = (n) => String(Math.max(1, Math.trunc(Number(n) || 1))).padStart(2, "0");

/** El folio que le toca al siguiente documento de una lista ya cargada. */
export const siguienteFolio = (lista = []) =>
  lista.reduce((mayor, x) => Math.max(mayor, Math.trunc(Number(x?.folio) || 0)), 0) + 1;

export { sha256, verificarCadena as verifyChain } from "./bloques";
