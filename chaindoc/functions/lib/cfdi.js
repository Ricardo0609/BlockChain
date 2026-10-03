// ─────────────────────────────────────────────────────────────
// cfdi.js — Leer una factura de verdad
//
// Una factura son dos archivos: el PDF, que es una impresión bonita, y
// el XML, que es el documento fiscal. Lo que vale es el XML: trae el
// folio fiscal (UUID), los RFC, el total y el sello del SAT.
//
// Al leerlo, el requisito se llena solo. Nadie teclea el importe, así
// que nadie puede «ajustarlo» al capturarlo — que era el hueco que
// quedaba entre el papel y el expediente.
//
// Se lee con expresiones regulares en vez de un analizador de XML
// completo: un CFDI es un documento plano y cerrado por el SAT, y así
// este archivo es idéntico en el navegador y en el servidor, sin
// depender de librerías distintas en cada lado.
// ─────────────────────────────────────────────────────────────

/** Saca los atributos de una etiqueta, sin importar el prefijo del espacio de nombres. */
function atributosDe(xml, etiqueta) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${etiqueta}\\b([^>]*)>`, "i");
  const m = xml.match(re);
  if (!m) return null;

  const attrs = {};
  const rx = /([\w.:-]+)\s*=\s*"([^"]*)"|([\w.:-]+)\s*=\s*'([^']*)'/g;
  let a;
  while ((a = rx.exec(m[1])) !== null) {
    const nombre = (a[1] || a[3]).replace(/^[\w.-]+:/, "");
    attrs[nombre.toLowerCase()] = a[2] !== undefined ? a[2] : a[4];
  }
  return attrs;
}

/** Todas las apariciones de una etiqueta (los conceptos, por ejemplo). */
function todosLosAtributos(xml, etiqueta) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${etiqueta}\\b([^>]*)>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = {};
    const rx = /([\w.:-]+)\s*=\s*"([^"]*)"|([\w.:-]+)\s*=\s*'([^']*)'/g;
    let a;
    while ((a = rx.exec(m[1])) !== null) {
      const nombre = (a[1] || a[3]).replace(/^[\w.-]+:/, "");
      attrs[nombre.toLowerCase()] = a[2] !== undefined ? a[2] : a[4];
    }
    out.push(attrs);
  }
  return out;
}

/**
 * Un atributo por cualquiera de sus nombres. El CFDI 3.3 los escribe
 * en minúscula (`rfc`) y el 4.0 capitalizados (`Rfc`); aquí da igual.
 */
const at = (o, ...nombres) => {
  for (const n of nombres) {
    const v = o?.[n.toLowerCase()];
    if (v !== undefined && v !== "") return v;
  }
  return null;
};

const numero = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** ¿Este texto es un CFDI? Barato, para decidir antes de intentar leerlo. */
export function esCFDI(texto) {
  if (typeof texto !== "string" || texto.length < 40) return false;
  return /<(?:[\w.-]+:)?Comprobante\b/i.test(texto)
      && /cfd(?:i)?\/[34]|www\.sat\.gob\.mx\/cfd/i.test(texto);
}

/**
 * Lee un CFDI y devuelve sus datos fiscales.
 *
 * Devuelve `null` si el texto no es un CFDI. Si le falta el timbre
 * (el sello del SAT), lo devuelve igual pero marcado: un CFDI sin
 * timbrar es un borrador, no un comprobante.
 */
export function leerCFDI(xml) {
  if (!esCFDI(xml)) return null;

  const c = atributosDe(xml, "Comprobante");
  if (!c) return null;

  const emisor = atributosDe(xml, "Emisor") || {};
  const receptor = atributosDe(xml, "Receptor") || {};
  const timbre = atributosDe(xml, "TimbreFiscalDigital");

  const conceptos = todosLosAtributos(xml, "Concepto")
    .map((x) => ({
      descripcion: at(x, "Descripcion") || "",
      cantidad: numero(at(x, "Cantidad")),
      valorUnitario: numero(at(x, "ValorUnitario")),
      importe: numero(at(x, "Importe")),
      claveProdServ: at(x, "ClaveProdServ"),
    }))
    .filter((x) => x.descripcion);

  const fecha = at(c, "Fecha");

  return {
    version:     at(c, "Version"),
    uuid:        timbre ? String(at(timbre, "UUID") || "").toUpperCase() : null,
    timbrado:    Boolean(timbre),
    fechaTimbrado: timbre ? at(timbre, "FechaTimbrado") : null,
    sello:       at(c, "Sello"),
    selloSAT:    timbre ? at(timbre, "SelloSAT") : null,
    rfcEmisor:   String(at(emisor, "Rfc") || "").toUpperCase() || null,
    nombreEmisor: at(emisor, "Nombre"),
    rfcReceptor: String(at(receptor, "Rfc") || "").toUpperCase() || null,
    nombreReceptor: at(receptor, "Nombre"),
    fecha,
    fechaCorta:  fecha ? String(fecha).slice(0, 10) : null,
    serie:       at(c, "Serie"),
    folio:       at(c, "Folio"),
    subtotal:    numero(at(c, "SubTotal")),
    descuento:   numero(at(c, "Descuento")) ?? 0,
    total:       numero(at(c, "Total")),
    moneda:      at(c, "Moneda") || "MXN",
    tipo:        at(c, "TipoDeComprobante"),
    metodoPago:  at(c, "MetodoPago"),
    formaPago:   at(c, "FormaPago"),
    conceptos,
  };
}

/** Los tipos de comprobante, en palabras. */
export const TIPOS = {
  I: "Ingreso", E: "Egreso", T: "Traslado", N: "Nómina", P: "Pago",
};

/**
 * La «expresión impresa»: la cadena con la que se le pregunta al SAT.
 *
 * Es lo mismo que lleva el código QR de una factura impresa. Para el
 * CFDI 4.0 hay que agregar los últimos ocho caracteres del sello, que
 * es lo que evita que cualquiera consulte facturas ajenas conociendo
 * sólo el folio.
 */
export function expresionImpresa(d) {
  if (!d?.uuid || !d.rfcEmisor || !d.rfcReceptor || d.total == null) return null;
  const tt = Number(d.total).toFixed(6);
  let e = `?re=${encodeURIComponent(d.rfcEmisor)}`
        + `&rr=${encodeURIComponent(d.rfcReceptor)}`
        + `&tt=${tt}`
        + `&id=${d.uuid}`;
  const sello = d.sello || d.selloSAT;
  if (String(d.version || "").startsWith("4") && sello) {
    e += `&fe=${encodeURIComponent(String(sello).slice(-8))}`;
  }
  return e;
}

/**
 * Comprobaciones que se pueden hacer sin preguntarle a nadie: que el
 * XML esté completo y sea coherente consigo mismo.
 *
 * Devuelve la lista de problemas, vacía si todo cuadra.
 */
export function revisarCFDI(d) {
  const problemas = [];
  if (!d) return [{ clave: "ilegible", texto: "El archivo no es un CFDI que se pueda leer." }];

  if (!d.timbrado || !d.uuid) {
    problemas.push({ clave: "sin-timbre",
      texto: "El XML no está timbrado: es un borrador, no un comprobante fiscal." });
  }
  if (!d.rfcEmisor || !d.rfcReceptor) {
    problemas.push({ clave: "sin-rfc", texto: "Al CFDI le faltan los RFC del emisor o del receptor." });
  }
  if (d.total == null) {
    problemas.push({ clave: "sin-total", texto: "El CFDI no trae importe total." });
  }

  // El total debe cuadrar con la suma de los conceptos menos descuentos.
  // Se compara con un centavo de tolerancia por el redondeo del SAT.
  if (d.conceptos?.length && d.subtotal != null) {
    const suma = d.conceptos.reduce((t, c) => t + (c.importe || 0), 0);
    if (Math.abs(suma - d.subtotal) > 0.01) {
      problemas.push({ clave: "descuadre",
        texto: `Los conceptos suman ${suma.toFixed(2)} pero el subtotal dice ${d.subtotal.toFixed(2)}.` });
    }
  }
  return problemas;
}

/** ¿La factura corresponde a quien dice el expediente? */
export function coincideCon(d, { rfcEmisor, rfcReceptor, total } = {}) {
  const dif = [];
  const norm = (r) => String(r || "").toUpperCase().replace(/[\s-]/g, "");
  if (rfcEmisor && norm(d.rfcEmisor) !== norm(rfcEmisor)) {
    dif.push({ clave: "emisor", esperado: norm(rfcEmisor), encontrado: d.rfcEmisor });
  }
  if (rfcReceptor && norm(d.rfcReceptor) !== norm(rfcReceptor)) {
    dif.push({ clave: "receptor", esperado: norm(rfcReceptor), encontrado: d.rfcReceptor });
  }
  if (total != null && d.total != null && Math.abs(Number(total) - d.total) > 0.01) {
    dif.push({ clave: "total", esperado: Number(total), encontrado: d.total });
  }
  return dif;
}

/**
 * ¿Es LA factura que correspondía?
 *
 * Una factura puede estar perfectamente vigente ante el SAT y aun así
 * no ser la que iba en ese requisito: por el importe, o por llegar
 * fuera de plazo. Esto es lo que separa «existe» de «cumple».
 *
 * Sobre el importe: el monto pactado a veces se anota sin IVA y otras
 * con IVA, según quién capture. Comparar sólo contra el total llenaría
 * la pantalla de falsas alarmas, así que se acepta si cuadra con
 * cualquiera de los dos y sólo se avisa cuando no cuadra con ninguno.
 */
export function cotejarConRequisito(d, requisito){
  const avisos = [];
  if(!d || !requisito) return avisos;

  const esperado = Number(requisito.monto);
  if(Number.isFinite(esperado) && esperado > 0 && d.total != null){
    const cuadraTotal = Math.abs(esperado - d.total) <= 0.01;
    const cuadraSub = d.subtotal != null && Math.abs(esperado - d.subtotal) <= 0.01;
    if(!cuadraTotal && !cuadraSub){
      const dif = d.total - esperado;
      avisos.push({
        clave: dif > 0 ? "monto-mayor" : "monto-menor",
        esperado, encontrado: d.total, diferencia: dif,
        texto: `Se pactó ${esperado.toFixed(2)} y la factura dice ${d.total.toFixed(2)}`
             + (d.subtotal != null ? ` (subtotal ${d.subtotal.toFixed(2)})` : "") + ".",
      });
    }
  }

  if(requisito.fechaLimite && d.fechaCorta && d.fechaCorta > requisito.fechaLimite){
    avisos.push({
      clave: "fuera-de-plazo", esperado: requisito.fechaLimite, encontrado: d.fechaCorta,
      texto: `La factura es del ${d.fechaCorta} y el plazo vencía el ${requisito.fechaLimite}.`,
    });
  }

  // Un comprobante de nómina o de traslado no comprueba un pago.
  if(requisito.tipo === "comprobante" && d.tipo && !["I", "P"].includes(d.tipo)){
    avisos.push({
      clave: "tipo-raro", encontrado: d.tipo,
      texto: `Aquí se esperaba un comprobante de pago y este CFDI es de tipo ${TIPOS[d.tipo] || d.tipo}.`,
    });
  }

  return avisos;
}

/** Los campos del formulario de factura, llenados desde el CFDI. */
export function camposDesdeCFDI(d) {
  if (!d) return {};
  return {
    uuid: d.uuid || "",
    rfcEmisor: d.rfcEmisor || "",
    rfcReceptor: d.rfcReceptor || "",
    emisor: d.nombreEmisor || "",
    receptor: d.nombreReceptor || "",
    fecha: d.fechaCorta || "",
    folio: d.folio || "",
    subtotal: d.subtotal != null ? String(d.subtotal) : "",
    total: d.total != null ? String(d.total) : "",
    concepto: d.conceptos?.map((c) => c.descripcion).join("; ") || "",
  };
}