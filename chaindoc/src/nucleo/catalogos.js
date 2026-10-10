// Catálogos fijos: tipos de documento, métodos de creación y sellos.

// ── TIPOS DE DOCUMENTO (paso 1) ───────────────────────────────
// ← ACTUALIZADO: cuatro, y ninguna decisión más antes del método.
// Llegaron a ser siete —renta, obra, servicios y convenio ocupaban su
// propia tarjeta— y luego cuatro con las clases como pastillas. Las
// dos formas obligaban a decidir de qué clase es el contrato antes de
// haber escrito una línea, que es justo cuando menos se sabe. Ahora
// hay un solo tipo de texto libre y quien necesite algo distinto lo
// escribe: escribir es más fácil que elegir.
//
// ← ACTUALIZADO (7 oct): se llama «Documento de texto», no «Contrato»,
// porque el producto no es sólo para contratos, y empieza EN BLANCO.
// La plantilla que traía antes llenaba la hoja de corchetes que había
// que borrar; una hoja limpia con una invitación a escribir pesa menos.
// El identificador sigue siendo "contrato" para no romper lo ya creado.
//
// "carpeta", "subir", "escanear" y "en blanco" salieron de aquí: el
// método de creación es el paso 2 y las carpetas tienen su propio modal.
export const TEMPLATES = [
  { id:"contrato",    ico:"contract",     name:"Documento de texto", body:"" },
  { id:"factura",     ico:"receipt_long", name:"Factura",  form:"factura", body:"" },
  { id:"recibo",      ico:"receipt",      name:"Recibo",   form:"recibo",  body:"" },
  // No crea un documento: crea un expediente con lista de comprobantes.
  { id:"inteligente", ico:"rule",         name:"Contrato inteligente", smart:true, body:"" },
];

// ← NUEVO: paso 2 del flujo de creación.
export const METHODS = [
  { id:"escanear", ico:"photo_camera", name:"Escanear con foto", desc:"Usa la cámara y extraemos el texto" },
  { id:"subir",    ico:"upload_file",  name:"Subir archivo",     desc:"PDF, DOCX o TXT desde tu dispositivo" },
  { id:"cero",     ico:"draft", name:"Crear desde cero",  desc:"Empieza con la plantilla en blanco" },
];

// ── SELLOS DE FIRMA (sistema viejo) ───────────────────────────
//
// ← RETIRADO (10 oct). Repartía una de ocho imágenes según el uid.
// Dos problemas que no se arreglaban agregando archivos:
//
//   - Con ocho opciones, a partir de CINCO cuentas había un 79% de
//     probabilidad de que dos personas compartieran sello, y a partir
//     de ocho era seguro. Un «sello personal» que se repite no es un
//     sello personal.
//   - LG8 estaba en la lista sin tener PNG, así que una de cada ocho
//     cuentas firmaba y no le salía nada: el <img> fallaba y se
//     escondía, sin caer siquiera al nombre.
//
// Lo que se estampa ahora lo decide el servidor y se dibuja: ver
// nucleo/sello.js y ui/trazoSello.js.
//
// Esto se queda SÓLO para que las firmas ya asentadas sigan
// enseñando su sello viejo. No se le agregan entradas nuevas, y el
// día que no queden firmas con LG* se puede borrar junto con
// public/sellos/.
export const selloUrl = (id) => `/sellos/${id}.png`;

// ── e.firma (Etapa 5) ─────────────────────────────────────────

/**
 * ¿A este documento se le ofrece firmar con la e.firma del SAT?
 *
 * A una factura no. Un CFDI ya viene sellado por quien lo emitió y
 * timbrado por el SAT: volver a firmarlo no agrega nada y sí agrega un
 * paso. Esto es para el contrato, que es lo que alguien puede querer
 * oponer ante un tercero.
 */
export const aceptaEfirma = (doc) => Boolean(doc) && doc.tplId !== "factura";

// ── TIPOS DE DOCUMENTO, PARA RECONOCERLOS DE UN VISTAZO ───────
//
// Tres tarjetas seguidas se veían iguales: mismo tamaño, mismo borde
// gris, y para saber cuál era cuál había que leer el contenido. Ahora
// cada tipo tiene su color y su etiqueta debajo del título, y los
// comprobantes (factura y recibo) son apaisados en vez de verticales:
// la forma se reconoce antes que el color, y antes aún que el texto.
export const TIPOS_DOC = {
  texto:   { nombre: "Documento de texto",   color: "azul" },
  factura: { nombre: "Factura",              color: "verde" },
  recibo:  { nombre: "Recibo",               color: "morado" },
  smart:   { nombre: "Contrato inteligente", color: "amarillo" },
};

/** De qué tipo es un documento ya guardado. */
export function tipoDeDocumento(doc){
  if(doc?.kind === "expediente") return "smart";
  if(doc?.tplId === "factura")   return "factura";
  if(doc?.tplId === "recibo")    return "recibo";
  return "texto";
}

/** Los comprobantes se dibujan acostados; el texto y el expediente, de pie. */
export const esApaisado = (tipo) => tipo === "factura" || tipo === "recibo";
