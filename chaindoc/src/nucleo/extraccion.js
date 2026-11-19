// ─────────────────────────────────────────────────────────────
// extraccion.js — De dónde salen los datos de un comprobante
//
// LA REGLA, EN PALABRAS DE RICARDO (19 nov):
//
//   «Para llenar la información se lee el archivo y no a mano. Lo
//    que puede hacer el usuario es corregir la información una vez
//    llenada. ¿Y cómo sabremos que es verdadera? Porque se adjunta
//    sí o sí el archivo original y no se puede quitar, y así la otra
//    persona puede corroborar los datos y que no fueron alterados.»
//
// De ahí salen las tres reglas de este archivo:
//
//   1. Los campos los llena el ARCHIVO. Escribir es corregir, no
//      llenar.
//   2. Por eso cada campo dice DE DÓNDE salió. Sin eso, la promesa
//      de arriba no se puede comprobar: quien lee el comprobante ve
//      números y no sabe cuáles venían del papel.
//   3. Un campo mal leído es PEOR que uno vacío. Un hueco se ve y se
//      corrige; un número equivocado que parece bien se firma. Por
//      eso, cuando una expresión duda, no inventa: deja el campo.
//
// ── LAS DOS VELOCIDADES, Y POR QUÉ IMPORTAN ──────────────────
//
// No todos los archivos se leen igual de bien, y el producto no
// puede fingir que sí:
//
//   · EXACTO — el XML de un CFDI. Los datos no se adivinan: están
//     en atributos con nombre, puestos ahí por quien timbró la
//     factura. Si el XML dice que el total son 11,600.00, son
//     11,600.00. `leerCFDI` ya sabía hacer esto desde hace semanas;
//     lo que faltaba era usarlo.
//
//   · APROXIMADO — un PDF o una foto. Ahí sólo hay texto suelto, y
//     lo que se hace es reconocer formas: un RFC parece un RFC, una
//     fecha parece una fecha. Acierta mucho y falla a veces, y por
//     eso el original sigue pegado al comprobante.
//
// Todo corre EN EL NAVEGADOR: el PDF con pdf.js, la foto con
// Tesseract, el XML aquí mismo. Ningún comprobante de nadie sale del
// equipo ni pasa por una IA.
// ─────────────────────────────────────────────────────────────

import { esCFDI, leerCFDI } from "./cfdi";

const num = (m) => (m ? m[1].replace(/,/g, "") : "");

/** Quita la puntuación y los espacios que arrastran las etiquetas. */
const limpiar = (s) => String(s).trim().replace(/^[:\-–—\s]+/, "").replace(/[.,;:\s]+$/, "");

// Un valor sólo cuenta como leído si de verdad hay algo. `0` sí
// cuenta: una factura a tasa cero tiene un IVA de cero, y dejar ese
// campo vacío sería perder un dato que el archivo sí trae.
const hay = (v) => v !== undefined && v !== null && String(v).trim() !== "";

const poner = (campos, k, v) => { if (hay(v)) campos[k] = typeof v === "number" ? String(v) : v; };

// ══════════════════════════════════════════════════════════════
// EL XML DE UN CFDI — EXACTO
// ══════════════════════════════════════════════════════════════

/**
 * Las tres formas de pago que la pantalla ofrece, contra el catálogo
 * del SAT.
 *
 * El catálogo tiene más de veinte claves y el formulario tres
 * botones, así que esto es una traducción con pérdida y hay que
 * decirlo: lo que no encaja en las tres NO se mete a la fuerza en la
 * más parecida, se deja vacío. Meter una tarjeta de crédito en
 * «Depósito» sería escribir en el comprobante algo que el CFDI no
 * dice.
 */
const FORMA_PAGO = {
  "01": "Efectivo",
  "02": "Cheque",
  // 03 es «transferencia electrónica de fondos», que es como la
  // mayoría de la gente paga y como casi nadie la llama. De las tres
  // opciones de la pantalla, «Depósito» es la que esa persona busca.
  "03": "Depósito",
};

/** Los conceptos del CFDI, juntos, para el campo de texto. */
function conceptoDe(datos) {
  const ds = (datos.conceptos || []).map((c) => c.descripcion).filter(Boolean);
  if (!ds.length) return "";
  if (ds.length === 1) return ds[0];
  // Varios conceptos no caben en una línea y resumirlos sería
  // decidir por el usuario cuál importa. Se ponen todos, numerados,
  // y que él recorte si quiere.
  return ds.map((d, i) => `${i + 1}. ${d}`).join("\n");
}

/** Los campos de la pantalla de factura, sacados de un CFDI leído. */
export function camposDeCFDI(datos) {
  if (!datos) return {};
  const f = {};

  poner(f, "fecha", datos.fechaCorta);
  // Serie y folio son dos atributos distintos y juntos son «el
  // número» que la gente dice. Serie sola no identifica nada.
  poner(f, "folio", [datos.serie, datos.folio].filter(Boolean).join("") || null);
  poner(f, "emisor", datos.nombreEmisor);
  poner(f, "rfcEmisor", datos.rfcEmisor);
  poner(f, "receptor", datos.nombreReceptor);
  poner(f, "rfcReceptor", datos.rfcReceptor);
  poner(f, "concepto", conceptoDe(datos));
  poner(f, "subtotal", datos.subtotal);
  // Leído del nodo Impuestos, nunca restando total menos subtotal:
  // ver el comentario en `leerCFDI`. Con retenciones, la resta miente.
  poner(f, "iva", datos.trasladados);
  poner(f, "total", datos.total);
  poner(f, "uuid", datos.uuid);
  poner(f, "formaPago", FORMA_PAGO[String(datos.formaPago || "").padStart(2, "0")]);

  return f;
}

// ══════════════════════════════════════════════════════════════
// UN PDF O UNA FOTO — APROXIMADO
// ══════════════════════════════════════════════════════════════

const RFC = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** La primera fecha que parezca una fecha, en ISO. */
function fechaDe(t) {
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dmy = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

/** Extrae campos de factura desde texto de OCR o PDF. */
export function parseFactura(text) {
  const t = text.replace(/\s+/g, " ");
  const rfcs = [...t.matchAll(RFC)].map((m) => m[1]);
  const f = {};

  const uuid = t.match(UUID);
  if (uuid) f.uuid = uuid[0].toUpperCase();

  if (rfcs[0]) f.rfcEmisor = rfcs[0];
  if (rfcs[1]) f.rfcReceptor = rfcs[1];

  const folio = t.match(/folio\s*(?:interno)?[:\s]*([A-Z0-9][A-Z0-9-]{0,15})/i);
  if (folio && !/fiscal/i.test(folio[0])) f.folio = folio[1];

  const fecha = fechaDe(t);
  if (fecha) f.fecha = fecha;

  // Se permite texto intermedio sin '$' para tolerar etiquetas como "IVA (16%)"
  const total    = t.match(/\btotal\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  const subtotal = t.match(/\bsub\s?total\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  const iva      = t.match(/\biva\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  if (total)    f.total    = num(total);
  if (subtotal) f.subtotal = num(subtotal);
  if (iva)      f.iva      = num(iva);

  const emisor = text.match(/emisor[:\s]*\n?\s*([^\n]{3,60})/i);
  if (emisor) f.emisor = emisor[1].trim();
  const receptor = text.match(/receptor[:\s]*\n?\s*([^\n]{3,60})/i);
  if (receptor) f.receptor = receptor[1].trim();

  const concepto = text.match(/(?:concepto|descripci[oó]n)[:\s]*\n?\s*([^\n]{3,120})/i);
  if (concepto) f.concepto = concepto[1].trim();

  return f;
}

/**
 * Extrae campos de recibo desde texto de OCR o PDF.
 *
 * ← NUEVO (19 nov). Hasta hoy esto NO EXISTÍA: `parseFactura` sólo
 * corría si la plantilla era factura, así que un recibo nacía con
 * todos los campos vacíos y se escribía entero a mano. Justo lo que
 * Ricardo dice que no puede pasar.
 *
 * Un recibo es mucho menos predecible que una factura: puede ser el
 * ticket de una ferretería, la captura de una transferencia o un
 * papel que alguien escribió en Word. No hay un formato que seguir,
 * así que esto reconoce ETIQUETAS —las palabras con las que la gente
 * encabeza cada dato— y no posiciones.
 *
 * Y cuando no encuentra la etiqueta, NO adivina. La única excepción
 * es la fecha, que tiene forma propia y no se confunde con nada.
 * Para el importe hay una regla de respaldo, y está acotada a
 * propósito: ver abajo.
 */
export function parseRecibo(text) {
  const t = text.replace(/\s+/g, " ");
  const f = {};

  const fecha = fechaDe(t);
  if (fecha) f.fecha = fecha;

  // El número tiene que LLEVAR un número. Sin esta condición,
  // «RECIBO No. 0042» daba folio «No»: la etiqueta se comía a la
  // etiqueta siguiente y el campo llegaba lleno de basura creíble.
  const folio = t.match(/\b(?:folio|recibo|no\.?|n[úu]m(?:ero)?\.?)\s*[:#]?\s*([A-Z0-9-]*\d[A-Z0-9-]*)\b/i);
  if (folio) f.folio = folio[1];

  // ── LOS NOMBRES SE LEEN POR LÍNEAS, NO POR EL TEXTO APLASTADO ──
  //
  // `t` tiene los saltos de línea convertidos en espacios, que va
  // bien para buscar importes y fechas. Para un NOMBRE no: el salto
  // de línea es lo que marca dónde acaba, y sin él el valor sigue
  // tragando la línea siguiente. Salía «Juan Pérez Soto Pago por
  // transferencia» en «Recibido por», que es de los errores que no
  // se notan revisando por encima.
  const DETIENE = "(?=\\s(?:la|el|los|las|por|cantidad|suma|importe|monto|concepto|\\$)|\\n|$)";
  const porLinea = (etiquetas) =>
    text.match(new RegExp(`\\b(?:${etiquetas})[:\\s]+([^\\n,;]{3,60}?)${DETIENE}`, "i"));

  // «Recibí de», «Recibimos de», «Cliente», «Pagado por».
  const deQuien = porLinea("recib[ií](?:mos)?\\s+de")
    || porLinea("cliente|pagado por|paga");
  if (deQuien) f.recibiDe = limpiar(deQuien[1]);

  // El importe. Se buscan primero las etiquetas, que son seguras.
  const etiquetado = t.match(/\b(?:cantidad|importe|monto|total|suma)\b[^$\n]{0,20}\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (etiquetado) f.cantidad = etiquetado[1].replace(/,/g, "");
  else {
    // RESPALDO ACOTADO: el ÚNICO número con pinta de dinero del
    // texto. Si hay dos, no se elige: en un ticket el más grande
    // puede ser el total, pero también el número de cuenta o el
    // folio, y poner el equivocado es el error caro —el que se firma
    // sin mirar porque el campo ya venía lleno—.
    const montos = [...t.matchAll(/\$\s*([\d,]+\.\d{2})\b/g)].map((m) => m[1]);
    const unicos = [...new Set(montos)];
    if (unicos.length === 1) f.cantidad = unicos[0].replace(/,/g, "");
  }

  // La cantidad con letra suele venir entre paréntesis o tras «son».
  const letra = t.match(/\(\s*([a-zñáéíóú][^)]{8,80}?(?:pesos|m\.?n\.?|mxn)[^)]{0,20})\)/i)
    || t.match(/\b(?:son|cantidad con letra)[:\s]+([a-zñáéíóú][^.,;]{8,80}?pesos[^.,;]{0,20})/i);
  if (letra) f.cantidadTxt = limpiar(letra[1]);

  const concepto = text.match(/(?:por concepto de|concepto|por pago de|descripci[oó]n)[:\s]*\n?\s*([^\n]{3,120})/i);
  if (concepto) f.concepto = limpiar(concepto[1]);

  // ── QUIÉN RECIBE, QUE NO ES QUIEN PAGA ──
  //
  // Aquí había un `recib[ií]` suelto entre las alternativas, y en un
  // recibo normal —«Recibí de Constructora García…»— ganaba esa, por
  // estar antes en el texto. Resultado: el PAGADOR acababa escrito en
  // «Recibido por». Un nombre real, bien escrito, en el campo
  // equivocado: nadie lo nota al revisar.
  //
  // «Recibí» a secas no dice quién recibe, dice quién habla. Sólo
  // cuentan las etiquetas que de verdad señalan al que cobra.
  const quien = porLinea("recibi[oó] por|recib[ií] por|nombre y firma|firma del? que recibe|entregado a");
  if (quien && limpiar(quien[1]) !== f.recibiDe) f.recibidoPor = limpiar(quien[1]);

  const forma = /\btransferencia|dep[oó]sito\b/i.test(t) ? "Depósito"
    : /\bcheque\b/i.test(t) ? "Cheque"
      : /\befectivo\b/i.test(t) ? "Efectivo"
        : "";
  if (forma) f.formaPago = forma;

  return f;
}

// ══════════════════════════════════════════════════════════════
// LA PUERTA: QUÉ SE LEE Y CÓMO DE BIEN
// ══════════════════════════════════════════════════════════════

/**
 * Lee un archivo ya convertido a texto y devuelve los campos, de
 * dónde salió cada uno y cómo de fiable es la lectura.
 *
 * Devuelve siempre la misma forma, llene o no llene:
 *
 *   campos  — lo que se pudo leer, con los nombres del formulario.
 *   origen  — por campo, "archivo". Lo que el usuario toque después
 *             pasa a "mano", y eso se decide donde se edita, no aquí.
 *   exacto  — true sólo con el XML de un CFDI.
 *   nada    — true si no se reconoció NI UN campo. Quien llame
 *             enseña el aviso; aquí no se decide qué ve nadie.
 */
// ══════════════════════════════════════════════════════════════
// LO QUE PASA CUANDO ALGUIEN CORRIGE
// ══════════════════════════════════════════════════════════════

/**
 * Compara lo que había con lo que se va a guardar y dice qué campos
 * tocó una persona.
 *
 * Por qué existe: sin esto, `origenCampos` miente en cuanto alguien
 * edita. Diría «archivo» de un número que ya no es el del archivo, y
 * un registro que miente es peor que no tenerlo —se cree—.
 *
 * Devuelve también QUÉ DECÍA ANTES de cada campo tocado, porque es
 * lo único que hace comprobable la promesa de Ricardo. Que un campo
 * esté marcado «a mano» avisa; saber que el archivo decía 11,600 y
 * ahora dice 11,650 es lo que deja a la otra persona decidir.
 */
export function marcarCorrecciones(antes = {}, ahora = {}, origen = {}) {
  const nuevo = { ...origen };
  const corregidos = [];

  for (const k of new Set([...Object.keys(antes), ...Object.keys(ahora)])) {
    const a = antes[k] ?? "";
    const b = ahora[k] ?? "";
    if (String(a) === String(b)) continue;
    corregidos.push({ k, antes: String(a), ahora: String(b), era: origen[k] || null });
    nuevo[k] = "mano";
  }

  // Un campo que ya no existe no tiene origen que contar.
  for (const k of Object.keys(nuevo)) if (!hay(ahora[k])) delete nuevo[k];

  return { origen: nuevo, corregidos };
}

/** Cuántos campos de este comprobante vinieron del archivo. */
export const delArchivo = (origen = {}) =>
  Object.values(origen).filter((v) => v === "archivo").length;

export function extraerCampos({ tplId, texto }) {
  const t = String(texto || "");
  const vacio = { campos: {}, origen: {}, exacto: false, nada: true };
  if (!t.trim() || (tplId !== "factura" && tplId !== "recibo")) return vacio;

  // El XML manda: si lo que subieron es un CFDI, los datos salen de
  // sus atributos y no de reconocer formas en el texto. Da igual que
  // la plantilla elegida sea «recibo» —un CFDI es un CFDI— pero sus
  // campos son los de factura, así que sólo se usa ahí.
  if (tplId === "factura" && esCFDI(t)) {
    const datos = leerCFDI(t);
    const campos = camposDeCFDI(datos);
    const ks = Object.keys(campos);
    return {
      campos, exacto: ks.length > 0, nada: ks.length === 0,
      origen: Object.fromEntries(ks.map((k) => [k, "archivo"])),
    };
  }

  const campos = tplId === "factura" ? parseFactura(t) : parseRecibo(t);
  const ks = Object.keys(campos);
  return {
    campos, exacto: false, nada: ks.length === 0,
    origen: Object.fromEntries(ks.map((k) => [k, "archivo"])),
  };
}
