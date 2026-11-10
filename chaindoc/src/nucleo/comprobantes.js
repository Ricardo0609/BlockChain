// ─────────────────────────────────────────────────────────────
// comprobantes.js — Las reglas de un recibo o una factura
//
// Un recibo a medio llenar no prueba nada, y uno sin firmar prueba
// menos todavía. Hasta hoy los dos podían salir del cajón: se
// adjuntaban a un contrato o se compartían igual que cualquier
// documento, y quien los recibía se encontraba un papel en blanco con
// la autoridad de una prueba.
//
// Aquí vive la regla, no en los botones. Tres cosas:
//
//   1. Qué datos hacen falta para que el papel diga algo.
//   2. Que no se firma hasta tenerlos.
//   3. Que no se comparte ni se adjunta hasta estar firmado.
//
// El orden no es casual: llenar → firmar → compartir. Cada paso cierra
// el anterior, y por eso la cadena vale algo al final.
//
// NO es una puerta de seguridad: vive en el navegador y nadie se hace
// daño saltándosela. Es el orden del trabajo, no un permiso.
// ─────────────────────────────────────────────────────────────

import { FORMS, allFields } from "../ui/formularios";
import { rfcValido } from "./rfc";

/** Un documento que se llena con una plantilla: recibo o factura. */
export const esComprobante = (doc) =>
  doc?.tplId === "recibo" || doc?.tplId === "factura";

/**
 * Lo que no puede faltar en cada uno.
 *
 * No están TODOS los campos a propósito. Lo que se exige es lo que
 * hace falta para saber quién le pagó a quién, cuánto y por qué: sin
 * eso el papel no prueba nada. El folio, la cantidad con letra o la
 * forma de pago se quedan fuera porque un recibo sigue siendo un
 * recibo sin ellos.
 */
export const REQUERIDOS = {
  recibo:  ["fecha", "recibiDe", "cantidad", "concepto", "recibidoPor"],
  factura: ["fecha", "emisor", "rfcEmisor", "receptor", "rfcReceptor", "concepto", "total"],
};

/** Los que además tienen que ser un RFC de verdad. */
const SON_RFC = new Set(["rfcEmisor", "rfcReceptor"]);

const vacio = (v) =>
  v === undefined || v === null || v === false || String(v).trim() === "";

/**
 * Qué le falta a este comprobante para poder firmarse.
 *
 * Devuelve la lista con la etiqueta que el usuario ve en pantalla, no
 * el nombre del campo: quien lee esto tiene que poder ir y llenarlo.
 */
export function faltanDatos(doc) {
  if (!esComprobante(doc)) return [];
  const esquema = FORMS[doc.tplId];
  if (!esquema) return [];

  const campos = allFields(esquema);
  const valores = doc.fields || {};

  return (REQUERIDOS[doc.tplId] || []).flatMap((k) => {
    const campo = campos.find((c) => c.k === k);
    const etiqueta = campo?.label || k;
    const v = valores[k];

    if (vacio(v)) return [{ k, etiqueta, motivo: "falta" }];
    // Un RFC mal escrito es peor que uno vacío: parece que está.
    if (SON_RFC.has(k) && !rfcValido(v)) return [{ k, etiqueta, motivo: "invalido" }];
    return [];
  });
}

/** Si ya lo firmó alguien. */
export const estaFirmado = (doc) =>
  (doc?.chain || []).some((b) => b?.action === "FIRMA");

/**
 * Si le falta el respaldo: el documento original que prueba el pago.
 *
 * ← NUEVO (10 nov). El agujero que tapa esto, dicho por Ricardo: «es
 * muy fácil crear un recibo, llenarlo y adjuntarlo, pero realmente
 * cómo se comprueba que ese recibo es real».
 *
 * Tenía razón. Hasta hoy un recibo hecho aquí era una declaración y
 * nada más: lo escribe quien lo firma, sobre sí mismo. Toda la
 * cadena de bloques de debajo prueba CUÁNDO se escribió y que nadie
 * lo tocó después, que no es poco, pero no prueba que el pago
 * ocurriera. Firmar un papel que uno mismo acaba de redactar no lo
 * convierte en prueba de nada.
 *
 * El respaldo es lo que ata el papel al mundo: la foto del recibo de
 * la tienda, el comprobante de la transferencia, el XML del CFDI. A
 * partir de aquí no se firma sin él, y como sin firma no se adjunta
 * ni se comparte, no hay forma de que uno sin respaldo llegue a
 * manos de nadie.
 *
 * Mira `imagenes`, que es donde viven los adjuntos de un documento, y
 * también `sourceFile`, que es donde queda el original cuando el
 * comprobante se llenó leyéndolo. Cualquiera de los dos vale: lo que
 * se exige es que exista algo detrás, no de qué forma llegó.
 */
export const faltaRespaldo = (doc) => {
  if (!esComprobante(doc)) return false;
  const adjuntos = Array.isArray(doc?.imagenes) ? doc.imagenes : [];
  if (adjuntos.length > 0) return false;
  return !doc?.sourceFile;
};

/**
 * Si se puede firmar: con todos los datos Y con el respaldo detrás.
 *
 * Los dos, no uno. Un recibo completo sin respaldo está bien escrito
 * y no prueba nada; uno con respaldo y sin datos no dice qué prueba.
 */
export const sePuedeFirmar = (doc) =>
  faltanDatos(doc).length === 0 && !faltaRespaldo(doc);

/**
 * Si puede salir de aquí: adjuntarse a un contrato o compartirse.
 *
 * Lo que no es un comprobante sale siempre; esta regla es de los
 * recibos y las facturas, que son los que se usan como prueba.
 */
export const puedeSalir = (doc) => !esComprobante(doc) || estaFirmado(doc);

/**
 * Quién puede cambiar el contenido.
 *
 * ← NUEVO (3 nov): en un recibo o una factura, sólo su dueño. Para
 * todo lo demás manda el rol de siempre.
 *
 * El motivo no es de permisos, es de qué significa el papel: un recibo
 * dice «yo recibí esto». Si quien lo recibe compartido pudiera
 * cambiarle el monto o el concepto, la firma de abajo ampararía algo
 * que su firmante no escribió. Y con el acceso derivado de los
 * contratos —cualquiera que entre al contrato abre su evidencia— eso
 * dejó de ser una hipótesis.
 */
export const soloSuDueno = (doc, uid, correo) => {
  if (!esComprobante(doc)) return true;
  if (uid && doc?.ownerUid) return doc.ownerUid === uid;
  // Un documento de los primeros no trae ownerUid. Sin este respaldo su
  // propio dueño se quedaría sin poder editarlo. Y sin el `if` de
  // arriba, dos undefined se darían por iguales y cualquiera pasaría.
  if (correo && doc?.ownerEmail) {
    return String(doc.ownerEmail).toLowerCase() === String(correo).toLowerCase();
  }
  return false;
};

/** Una frase que explica por qué no se puede, para el botón. */
export function porQueNoSale(doc) {
  if (!esComprobante(doc) || estaFirmado(doc)) return null;
  const faltan = faltanDatos(doc);
  const que = doc.tplId === "factura" ? "La factura" : "El recibo";
  const original = doc.tplId === "factura"
    ? "el XML del CFDI o una foto de la factura"
    : "una foto del recibo, la transferencia o el pago";

  // El orden no es casual: primero los datos, que es lo que se arregla
  // escribiendo, y el respaldo después, que es lo que hay que ir a
  // buscar. Decirle a alguien que le falta una foto cuando además
  // tiene el papel a medias lo manda a buscar algo que todavía no va
  // a poder usar.
  if (faltan.length) {
    return `${que} todavía no está firmado, y no se puede firmar hasta llenar: `
      + faltan.map((f) => f.etiqueta.toLowerCase()).join(", ") + ".";
  }
  if (faltaRespaldo(doc)) {
    return `${que} está completo, pero no se puede firmar sin el documento `
      + `original que lo respalde. Adjunta ${original}.`;
  }
  return `${que} todavía no está firmado. Fírmalo y entonces podrás compartirlo.`;
}
