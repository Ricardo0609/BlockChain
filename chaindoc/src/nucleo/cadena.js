// Identificadores y hash de propósito general.
// El formato de bloque y la verificación de la cadena viven en bloques.js.

export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

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

// ── UN CONTADOR POR TIPO (10 nov) ─────────────────────────────
//
// Hasta hoy el contador era uno solo para toda la cuenta: un recibo,
// una factura, un documento de texto y un contrato se repartían la
// misma fila, así que el 03 de alguien podía ser cualquier cosa y el
// número no decía nada de lo que estabas citando.
//
// Ahora cada tipo lleva la suya, y una letra delante para que no
// choquen: el recibo 01 y el documento de texto 01 existen a la vez y
// se llaman R-01 y D-01.
//
// La letra sale del tipo con el que NACIÓ el documento. Un documento
// de texto convertido en contrato inteligente sigue siendo D-07: su
// identificador ya está citado dentro de bloques firmados, y
// renumerarlo haría que el texto sellado dijera una cosa y el
// documento otra.

export const PREFIJOS = { recibo: "R", factura: "F", contrato: "D", expediente: "C" };
export const PREFIJO_POR_DEFECTO = "D";

/**
 * De qué contador tira este documento.
 *
 * Manda la plantilla; `expediente` sólo para un contrato inteligente
 * creado desde cero, que no tiene plantilla de ninguna.
 */
export function tipoDeFolio(doc) {
  const t = doc?.tplId;
  if (t && PREFIJOS[t]) return t;
  // `destino` además de `kind`: un contrato recién empezado todavía no
  // es `kind: "expediente"` —lo será al analizarlo— pero nace para
  // serlo, y nacer como D-04 para pasar a ser un contrato dejaría la
  // letra mintiendo desde el primer día.
  if (doc?.kind === "expediente" || doc?.destino === "expediente") return "expediente";
  return "contrato";
}

/**
 * El identificador que se lee en pantalla.
 *
 * Dos cifras como mínimo: «R-01» se lee como un folio y «R-1» como un
 * descuido. Del cien en adelante crece solo.
 */
export const folioConPrefijo = (tipo, n) =>
  `${PREFIJOS[tipo] || PREFIJO_POR_DEFECTO}-${folioTexto(n)}`;

/**
 * El folio que le toca al siguiente documento de una lista ya cargada.
 *
 * Sólo cuenta los de SU tipo, y sólo los que ya llevan prefijo: los
 * documentos de antes del 10 de noviembre tienen folios de la fila
 * compartida, y dejarlos entrar aquí haría que el primer recibo nuevo
 * saliera R-08 en una cuenta sin ningún recibo.
 */
export function siguienteFolio(lista = [], tipo = "contrato") {
  const mayor = (Array.isArray(lista) ? lista : []).reduce((may, x) => {
    if (!x || tipoDeFolio(x) !== tipo) return may;
    if (!String(x.numId || "").includes("-")) return may;
    return Math.max(may, Math.trunc(Number(x.folio) || 0));
  }, 0);
  return mayor + 1;
}

export { sha256, verificarCadena as verifyChain } from "./bloques";
