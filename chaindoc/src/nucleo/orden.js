// ─────────────────────────────────────────────────────────────
// orden.js — Ordenar y buscar en una lista de documentos
//
// Una carpeta con seis documentos se lee de un vistazo. Con sesenta,
// no: hay que recorrerla entera para encontrar el recibo de la semana
// pasada, y eso se vuelve el trabajo en vez de ser el camino hacia el
// trabajo.
//
// Dos cosas, las dos sin salir de la pantalla:
//
//   · El orden. Por fecha en los dos sentidos y por nombre en los dos.
//   · El buscador, que no busca en el texto del documento sino en lo
//     que se ve y se recuerda: el nombre, el folio, la carpeta y los
//     datos de un recibo o una factura (de quién, concepto, RFC). Es
//     lo que la gente teclea cuando busca un papel: «cemento»,
//     «Solís», «02».
//
// Puro y sin React a propósito: esto decide qué se ve y en qué orden,
// y eso tiene que poder probarse sin pintar nada.
// ─────────────────────────────────────────────────────────────

/** Sin acentos, sin mayúsculas y sin espacios de más. */
export const llave = (t) => String(t ?? "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Las formas de ordenar.
 *
 * La fecha es la ÚLTIMA EDICIÓN, que es la que lleva la tarjeta.
 * Ordenar por una fecha que no se ve deja al usuario con una lista
 * barajada y sin explicación.
 */
export const ORDENES = [
  { id: "recientes", txt: "Recientes primero" },
  { id: "antiguos",  txt: "Antiguos primero" },
  { id: "az",        txt: "Nombre (A–Z)" },
  { id: "za",        txt: "Nombre (Z–A)" },
];

export const ORDEN_POR_DEFECTO = "recientes";

/** La fecha por la que se ordena: la que dice la tarjeta. */
const cuando = (d) => d?.lastModified || d?.createdAt || "";

/**
 * Lo que se mira al buscar.
 *
 * El contenido del documento se queda fuera a propósito: en un
 * documento de texto largo haría que medio archivo valiera para
 * cualquier palabra, y una búsqueda que lo encuentra todo no
 * encuentra nada.
 */
function dondeBuscar(d) {
  const campos = d?.fields && typeof d.fields === "object" ? Object.values(d.fields) : [];
  return [d?.title, d?.numId, d?.folder, ...campos]
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map(llave);
}

/**
 * Si este documento responde a lo tecleado.
 *
 * Todas las palabras tienen que aparecer, pero no juntas ni en orden:
 * «solis cemento» encuentra el recibo de cemento de Constructora
 * Solís, que es justo lo que quien escribe eso está buscando.
 */
export function coincide(doc, texto) {
  const palabras = llave(texto).split(" ").filter(Boolean);
  if (!palabras.length) return true;
  const campos = dondeBuscar(doc);
  return palabras.every((p) => campos.some((c) => c.includes(p)));
}

/**
 * La lista tal y como hay que pintarla.
 *
 * No toca la lista que recibe: devuelve una nueva. La de fuera es
 * estado de React y ordenarla en el sitio la cambiaría por debajo.
 */
export function ordenarYBuscar(docs, { orden = ORDEN_POR_DEFECTO, busca = "" } = {}) {
  const lista = (Array.isArray(docs) ? docs : []).filter((d) => coincide(d, busca));
  const porNombre = (a, b) =>
    llave(a?.title).localeCompare(llave(b?.title), "es", { numeric: true });
  const porFecha = (a, b) => String(cuando(a)).localeCompare(String(cuando(b)));

  switch (orden) {
    case "antiguos": return lista.sort(porFecha);
    case "az":       return lista.sort(porNombre);
    case "za":       return lista.sort((a, b) => porNombre(b, a));
    // Recientes también es el respaldo: un orden que no existe no deja
    // la lista en un orden cualquiera.
    default:         return lista.sort((a, b) => porFecha(b, a));
  }
}

/** Una frase para cuando la búsqueda no encuentra nada. */
export const nadaEncontrado = (busca) =>
  `No hay ningún documento que cuadre con «${String(busca).trim()}».`;
