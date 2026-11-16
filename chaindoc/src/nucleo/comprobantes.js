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
 * EL ORIGINAL: el archivo del que salieron los datos.
 *
 * ← NUEVO (16 nov). Lo que hay detrás, dicho por Ricardo: «como yo no
 * emito ni recibos ni facturas, el proceso va a ser escanear o subir
 * archivo, los campos se van a llenar solos agarrando los datos de lo
 * subido y tú como usuario solo vas a poder corregir». Y la pregunta
 * que él mismo se hizo: «¿y si al corregir pongo datos que no son?».
 *
 * Su respuesta es la que manda aquí: «sí o sí se va a adjuntar la
 * foto o el archivo original para que quede como evidencia y coincida
 * con el original, y este archivo original no se va a poder quitar».
 *
 * Eso cambia lo que es un comprobante en OCTAVIN. Antes era un papel
 * que escribías y firmabas —una declaración tuya sobre ti mismo—.
 * Ahora es la LECTURA de un documento que ya existía, con el
 * documento al lado para que cualquiera coteje. Los campos no son lo
 * que se prueba: son el índice de lo que se prueba.
 *
 * Por eso el original se marca y se distingue de los demás adjuntos:
 * puedes añadir cuantas fotos quieras, pero una sola es la que vino
 * primero y esa no se retira.
 */
export const esElOriginal = (img) => Boolean(img?.esOriginal);

/** El original de este comprobante, o null si no tiene. */
export const originalDe = (doc) =>
  (Array.isArray(doc?.imagenes) ? doc.imagenes : []).find(esElOriginal) || null;

/**
 * Si le falta el respaldo: el documento original que prueba el pago.
 *
 * ← REESCRITO (16 nov), y conviene decir por qué, porque esto estaba
 * MAL y pasaba las pruebas.
 *
 * La versión de ayer aceptaba `doc.sourceFile` como respaldo. Pero
 * `sourceFile` nunca guardó un archivo: guarda el NOMBRE del archivo
 * —`impMeta?.name`, una cadena de texto— y el archivo se tiraba. Así
 * que un comprobante creado subiendo un PDF quedaba con el texto
 * extraído y la palabra «factura.pdf», y la regla que escribí el 10
 * de noviembre para exigir pruebas se cumplía con una cadena de
 * texto. La regla existía; lo que comprobaba no.
 *
 * Ahora se exige un archivo de verdad: subido, con su huella, con su
 * ruta en el almacén. `sourceFile` se queda sólo para reconocer a los
 * de antes y decirlo (ver `sinOriginalViejo`).
 */
export const faltaRespaldo = (doc) => {
  if (!esComprobante(doc)) return false;
  return !originalDe(doc);
};

/**
 * Un comprobante de los de antes: dice de dónde salió, pero el
 * archivo no está.
 *
 * No son culpables de nada —se crearon cuando el producto no
 * guardaba el original— pero tampoco se puede seguir diciendo que
 * tienen respaldo. Lo que se hace con ellos lo decidió Ricardo:
 * marcarlos, y pedir el original para volver a compartirlos o
 * adjuntarlos. Lo que ya se firmó y se mandó no se toca: deshacer el
 * pasado no está en nuestra mano y fingir que sí sería otra mentira.
 */
export const sinOriginalViejo = (doc) =>
  esComprobante(doc) && !originalDe(doc) && Boolean(doc?.sourceFile);

/**
 * Si un comprobante se puede repartir por un enlace, sin cuenta.
 *
 * Nunca. Y el motivo es de Ricardo, que lo explicó mejor de lo que yo
 * lo tenía: «no tiene sentido compartírselo a alguien que no tiene
 * cuenta porque no estás emitiendo una factura o recibo que quieras
 * mandar, solamente estás respaldando la información».
 *
 * Ahí está la diferencia con un documento de texto. Un acuerdo se
 * manda para que la otra parte lo lea y lo firme: el enlace es el
 * camino. Un comprobante no se manda a nadie —ya lo emitió quien lo
 * emitió, y OCTAVIN no emite ninguno—; se guarda, se respalda y se
 * enseña a quien tiene por qué verlo. Y «quien tiene por qué verlo»
 * es alguien con cuenta, porque es la única forma de saber quién lo
 * vio.
 */
export const soloConCuenta = (doc) => esComprobante(doc);

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
export const puedeSalir = (doc) =>
  !esComprobante(doc) || (estaFirmado(doc) && !faltaRespaldo(doc));

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
  if (!esComprobante(doc) || puedeSalir(doc)) return null;
  const faltan = faltanDatos(doc);
  const que = doc.tplId === "factura" ? "La factura" : "El recibo";
  const original = doc.tplId === "factura"
    ? "el XML del CFDI, el PDF o una foto de la factura"
    : "una foto del recibo, la transferencia o el pago";

  // ← NUEVO (16 nov): uno de los de antes, ya firmado, al que le
  // falta el archivo. Va el PRIMERO porque es el único caso en el que
  // el documento parece estar completo —tiene datos y tiene firma— y
  // aun así no puede salir: sin esta frase el botón apagado no se
  // explica por ningún lado.
  if (sinOriginalViejo(doc)) {
    return `${que} se creó cuando todavía no guardábamos el archivo original: `
      + `de «${doc.sourceFile}» sólo quedó el nombre. Adjunta ${original} `
      + `para poder compartirlo o adjuntarlo otra vez.`;
  }
  if (estaFirmado(doc) && faltaRespaldo(doc)) {
    return `${que} está firmado, pero no tiene el archivo original que lo respalde. `
      + `Adjunta ${original}.`;
  }
  if (estaFirmado(doc)) return null;

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
