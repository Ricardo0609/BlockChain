// ─────────────────────────────────────────────────────────────
// lista69b.js — La lista negra del SAT
//
// El artículo 69-B del Código Fiscal: el SAT publica los
// contribuyentes que emiten facturas de operaciones inexistentes. En
// la calle se les dice factureros. Si uno de tus proveedores aparece
// ahí, las facturas que te dio pueden no servirte para deducir, y el
// problema es tuyo, no suyo.
//
// La lista es pública y se descarga a diario. Cruzarla contra cada RFC
// del expediente es de las cosas más útiles que hace el sistema: te
// enteras tú antes que el auditor.
//
// Las cuatro situaciones, de peor a mejor:
//   Definitivo          — el SAT lo confirmó. Sus facturas no sirven.
//   Presunto            — está en proceso; todavía puede desvirtuarlo.
//   Desvirtuado         — se defendió y ganó. Sus facturas sirven.
//   Sentencia favorable — un tribunal le dio la razón.
// ─────────────────────────────────────────────────────────────

export const SITUACIONES = {
  definitivo: { riesgo: "alto",    texto: "Definitivo" },
  presunto:   { riesgo: "medio",   texto: "Presunto" },
  desvirtuado:{ riesgo: "ninguno", texto: "Desvirtuado" },
  sentencia:  { riesgo: "ninguno", texto: "Sentencia favorable" },
};

/** Normaliza cómo escribe el SAT cada situación, que no es constante. */
export function claveDeSituacion(texto) {
  const t = String(texto || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (t.includes("definitiv")) return "definitivo";
  if (t.includes("desvirtuad")) return "desvirtuado";
  if (t.includes("sentencia")) return "sentencia";
  if (t.includes("presunt")) return "presunto";
  return null;
}

/** Parte una línea de CSV respetando las comillas. */
function celdas(linea) {
  const out = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else entreComillas = !entreComillas;
    } else if (c === "," && !entreComillas) {
      out.push(actual.trim()); actual = "";
    } else actual += c;
  }
  out.push(actual.trim());
  return out;
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

/**
 * Lee el CSV que publica el SAT.
 *
 * El archivo trae encabezados que cambian de un mes a otro, así que en
 * vez de confiar en la posición de las columnas se busca en cada línea
 * la celda que tenga forma de RFC y la que nombre una situación. Es
 * más lento y mucho más difícil de romper.
 */
export function parsear69B(csv) {
  const salida = [];
  if (typeof csv !== "string") return salida;

  for (const linea of csv.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const c = celdas(linea);

    const rfc = c.find((x) => RFC.test(x.toUpperCase()));
    if (!rfc) continue;                                  // encabezado o línea suelta

    const situacion = c.map(claveDeSituacion).find(Boolean);
    if (!situacion) continue;

    const iRfc = c.findIndex((x) => x.toUpperCase() === rfc.toUpperCase());
    salida.push({
      rfc: rfc.toUpperCase(),
      nombre: c[iRfc + 1] || null,
      situacion,
      riesgo: SITUACIONES[situacion].riesgo,
    });
  }
  return salida;
}

/**
 * De la lista a un índice por RFC. Si un RFC aparece varias veces —pasa,
 * cuando alguien fue presunto y luego se desvirtuó— se queda la
 * situación más reciente, que es la que manda.
 */
export function indexar(lista) {
  const idx = {};
  for (const e of lista) idx[e.rfc] = { situacion: e.situacion, riesgo: e.riesgo, nombre: e.nombre };
  return idx;
}

const normalizar = (rfc) => String(rfc || "").toUpperCase().replace(/[\s-]/g, "");

/** ¿Este RFC está en la lista? Devuelve null si no aparece, que es lo normal. */
export function buscar(indice, rfc) {
  return indice?.[normalizar(rfc)] || null;
}

/**
 * Revisa de golpe todos los RFC de un expediente.
 *
 * Se normaliza ANTES de quitar repetidos: el mismo proveedor puede
 * venir escrito de tres formas distintas entre los requisitos, y
 * avisarlo tres veces sólo consigue que se ignore el aviso.
 */
export function revisarRFCs(indice, rfcs = []) {
  const hallazgos = [];
  for (const rfc of [...new Set(rfcs.filter(Boolean).map(normalizar))]) {
    const e = buscar(indice, rfc);
    if (e && e.riesgo !== "ninguno") {
      hallazgos.push({ rfc, ...e, texto: EXPLICA[e.situacion] });
    }
  }
  return hallazgos;
}

export const EXPLICA = {
  definitivo: "El SAT lo tiene como emisor de facturas de operaciones inexistentes (definitivo). Sus comprobantes no sirven para deducir.",
  presunto:   "El SAT lo tiene como presunto emisor de facturas de operaciones inexistentes. Todavía puede desvirtuarlo, pero conviene revisarlo.",
  desvirtuado:"Estuvo en la lista y logró desvirtuarlo. Sus comprobantes son válidos.",
  sentencia:  "Estuvo en la lista y un tribunal le dio la razón. Sus comprobantes son válidos.",
};