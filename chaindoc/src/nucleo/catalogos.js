// Catálogos fijos: tipos de documento, métodos de creación y sellos.

// ── TIPOS DE DOCUMENTO (paso 1) ───────────────────────────────
// ← ACTUALIZADO: cuatro, y ninguna decisión más antes del método.
// Llegaron a ser siete —renta, obra, servicios y convenio ocupaban su
// propia tarjeta— y luego cuatro con las clases como pastillas. Las
// dos formas obligaban a decidir de qué clase es el contrato antes de
// haber escrito una línea, que es justo cuando menos se sabe. Ahora
// hay un solo contrato con la estructura común, y quien necesite algo
// distinto lo escribe encima: escribir es más fácil que elegir.
//
// "carpeta", "subir", "escanear" y "en blanco" salieron de aquí: el
// método de creación es el paso 2 y las carpetas tienen su propio modal.
export const TEMPLATES = [
  { id:"contrato",    ico:"contract",     name:"Contrato", body:"CONTRATO\n\nEntre las partes:\n\nPRIMERA PARTE: [Nombre o razón social]\nRFC: [RFC]\nDomicilio: [Domicilio]\n\nSEGUNDA PARTE: [Nombre o razón social]\nRFC: [RFC]\nDomicilio: [Domicilio]\n\nOBJETO\n[Qué se contrata, con el detalle suficiente para saber si se cumplió:\nqué se entrega o se hace, dónde, con qué alcance]\n\nPRECIO Y FORMA DE PAGO\nTotal: $[cantidad] MXN más IVA.\n[Anticipo / pagos parciales / pago único: cuánto y cuándo]\nCada pago se hará dentro de los [X] días siguientes a la recepción del\ncomprobante fiscal correspondiente.\n\nPLAZO\nDel [fecha] al [fecha].\n[Penas por retraso, si las hay]\n\nCOMPROBANTES\nCada pago se documentará con comprobante fiscal digital (CFDI). Ambas\npartes conservarán copia de los comprobantes que amparen el cumplimiento.\n\nOBLIGACIONES DE LA PRIMERA PARTE\n1. [Obligación]\n2. [Obligación]\n\nOBLIGACIONES DE LA SEGUNDA PARTE\n1. [Obligación]\n2. [Obligación]\n\nENTREGA Y ACEPTACIÓN\n[Cómo se da por entregado, y cuántos días hay para observar]\n\nTERMINACIÓN\nCualquiera de las partes puede darlo por terminado avisando por escrito\ncon [X] días de anticipación, pagando lo devengado hasta esa fecha.\n\nINCUMPLIMIENTO\nSi alguna de las partes incumple, la otra podrá exigir el cumplimiento o\ndar por terminado el contrato, sin perjuicio de los daños causados.\n\nFIRMAS\n[Nombre]                            [Nombre]\nFecha: [fecha]" },
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

// ── SELLOS DE FIRMA ───────────────────────────────────────────
// ← NUEVO: cada cuenta recibe un sello fijo la primera vez y no
// vuelve a cambiar, aunque después agregues más imágenes al catálogo.
// Las imágenes van en: public/sellos/LG1.png, LG2.png, …
export const SELLOS = ["LG1","LG2","LG3","LG4","LG5","LG6","LG7","LG8"];

export const selloUrl = (id) => `/sellos/${id}.png`;

/** Deriva un sello desde el uid: estable, sin necesidad de azar. */
export function selloDesdeUid(uid=""){
  let h = 0;
  for(let i=0;i<uid.length;i++) h = (h*31 + uid.charCodeAt(i)) >>> 0;
  return SELLOS[h % SELLOS.length];
}

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
