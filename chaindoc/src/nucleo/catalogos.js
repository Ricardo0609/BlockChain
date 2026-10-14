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
//
// ← NUEVO (14 oct): cada tipo lleva su recomendación.
//
// Cuatro tarjetas con un ícono y un nombre no dicen cuál te conviene, y
// el nombre es justo lo que menos ayuda: alguien que nunca ha usado
// esto no sabe qué es un «contrato inteligente» ni por qué un recibo
// sería distinto de una factura. El texto va detrás de una ⓘ y no a la
// vista: quien ya sabe elige en dos segundos, y quien no, pregunta sin
// salir de la pantalla.
export const TEMPLATES = [
  { id:"contrato",    ico:"contract",     name:"Documento de texto", body:"",
    info:"Una hoja en blanco para lo que no cabe en un formulario: un contrato sencillo, "
       + "un acuerdo entre dos partes, una minuta, unas condiciones de servicio. Escribe "
       + "lo que necesites y fírmalo.\n\n"
       + "Cada cambio queda registrado con su fecha y su autor, así que después puedes "
       + "probar qué decía el documento y desde cuándo.\n\n"
       + "Si mientras lo escribes resulta que sí es un contrato con entregas y pagos, lo "
       + "puedes convertir en contrato inteligente sin perder su historial, sus firmas ni su ID." },

  { id:"factura",     ico:"receipt_long", name:"Factura",  form:"factura", body:"",
    info:"Para guardar una factura que YA existe: la que te emitieron o la que emitiste.\n\n"
       + "Si subes el XML del CFDI, aquí se le pregunta al SAT si sigue vigente, se cruzan "
       + "los RFC contra la lista 69-B de empresas señaladas, y el importe se lee solo del "
       + "archivo. Nadie teclea cifras, así que nadie las puede ajustar al capturarlas.\n\n"
       + "Y se vuelve a preguntar cada día: si el SAT la cancela dentro de tres meses, te "
       + "enteras antes de deducirla.\n\n"
       + "Esto no emite facturas. Registra las que ya están timbradas." },

  { id:"recibo",      ico:"receipt",      name:"Recibo",   form:"recibo",  body:"",
    info:"Para los pagos que no llevan factura: un recibo de honorarios, un anticipo en "
       + "efectivo, el pago de un día de trabajo.\n\n"
       + "Sirve para dejar constancia de un gasto que existió aunque no tenga un CFDI "
       + "detrás, con su importe, su fecha, quién lo recibió y la huella del comprobante "
       + "que lo respalda.\n\n"
       + "Si el pago sí tiene factura, usa Factura: comprueba mucho más." },

  // No crea un documento: crea un expediente con lista de comprobantes.
  { id:"inteligente", ico:"rule",         name:"Contrato inteligente", smart:true, body:"",
    destacado:"Lo que nos distingue",
    info:"Pega el contrato y la IA lee qué se prometió: las partes, los montos, las fechas "
       + "límite y la lista de comprobantes que habrá que reunir para demostrar que se cumplió.\n\n"
       + "A partir de ahí el expediente se llena solo. Pides cada comprobante con un enlace "
       + "—quien lo entrega no necesita cuenta—, el sistema compara lo pactado contra lo "
       + "comprobado, avisa de lo que está por vencer y detecta si un mismo comprobante se "
       + "usó dos veces en dos contratos distintos.\n\n"
       + "Al final exportas un paquete que un tercero puede verificar por su cuenta, sin "
       + "entrar aquí y sin internet.\n\n"
       + "Un contrato dice lo que se prometió. Esto prueba lo que se cumplió." },
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
