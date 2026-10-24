// ─────────────────────────────────────────────────────────────
// texto.js — El contenido de un documento, ahora con formato
//
// Hasta aquí `content` era texto plano. Con la barra de estilos pasa a
// ser HTML, y eso toca lo más delicado que hay: `content` es lo que la
// cadena sella. Así que no vale cualquier HTML.
//
// LA REGLA: no se guarda lo que escribió el navegador, se guarda lo
// que sobrevive a pasar por aquí. Todo texto entra por `parsear`, que
// lo reduce a un modelo pequeño —bloques con alineación y trozos en
// negrita o cursiva—, y sale por `serializar`, que sólo sabe escribir
// esas etiquetas y ninguna otra. Lo que no cabe en el modelo, no
// existe.
//
// Eso hace tres cosas a la vez:
//
//   1. **No hay inyección posible.** El contenido lo escribe gente que
//      no eres tú: un documento compartido lo edita la otra parte. Si
//      se pintara su HTML tal cual, cualquiera podría meter un script
//      en el documento de otro. Aquí no se pinta HTML: se pinta el
//      modelo, con elementos de React, y React escapa el texto.
//   2. **El sellado es estable.** Dos ediciones que se ven igual dan
//      el mismo HTML, porque el serializador es canónico. Sin eso, el
//      mismo documento daría hashes distintos según el navegador.
//   3. **Los documentos de antes siguen valiendo.** Un `content` sin
//      etiquetas se lee como lo que es: párrafos separados por saltos
//      de línea. No hay que migrar nada.
//
// `parsear` usa el DOMParser del navegador, que es el único que lee
// HTML como lo lee un navegador. Es seguro: el resultado nunca se
// inserta en la página, sólo se recorre. El servidor no parsea; tiene
// su propio comprobador en `functions/lib/texto.js`, que no limpia:
// rechaza. Limpiar mal deja pasar; rechazar mal sólo molesta.
// ─────────────────────────────────────────────────────────────

/** Los bloques que existen. Nada más. */
export const BLOQUES = ["p", "h1", "h2", "h3", "li-vineta", "li-numero"];

/** Las alineaciones, con la clase que les toca. `null` es la de siempre. */
export const ALINEACIONES = { izquierda: null, centro: "al-centro", derecha: "al-derecha", justificado: "al-justificado" };

/** El id del papel editable. Lo comparten App.jsx y la pantalla. */
export const ID_PAPEL = "papel-editable";

const DE_CLASE = { "al-centro": "centro", "al-derecha": "derecha", "al-justificado": "justificado" };

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Si esto ya viene con formato o es de los de antes. */
export const tieneFormato = (s) => /^\s*<(p|h[1-3]|ul|ol)[\s>]/i.test(String(s || ""));

// ── DE TEXTO A MODELO ─────────────────────────────────────────

/** Un texto plano de los de siempre: cada línea, un párrafo. */
function deTextoPlano(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map((linea) => ({ tipo: "p", alineacion: "izquierda", trozos: linea ? [{ texto: linea }] : [] }));
}

/**
 * Etiquetas cuyo CONTENIDO tampoco se lee.
 *
 * No basta con no pintarlas: el texto de dentro de un <script> no es
 * prosa que alguien quisiera leer, es codigo. Quitar la etiqueta y
 * dejar el texto no es peligroso —acaba escapado— pero convierte
 * «alert(1)» en una linea del documento. Esto las salta enteras.
 */
const MUDAS = new Set(["script", "style", "noscript", "template", "head", "title"]);

/** Los trozos de texto de un elemento, con su negrita y su cursiva. */
function trozosDe(nodo, negrita = false, cursiva = false) {
  const fuera = [];
  for (const hijo of nodo.childNodes) {
    if (hijo.nodeType === 3) {
      const t = hijo.nodeValue.replace(/\s+/g, " ");
      if (t) fuera.push({ texto: t, ...(negrita && { negrita: true }), ...(cursiva && { cursiva: true }) });
      continue;
    }
    if (hijo.nodeType !== 1) continue;
    const et = hijo.tagName.toLowerCase();
    if (MUDAS.has(et)) continue;
    if (et === "br") { fuera.push({ texto: "\n" }); continue; }
    const estilo = hijo.getAttribute?.("style") || "";
    const n = negrita || et === "b" || et === "strong" || /font-weight:\s*(bold|[6-9]00)/i.test(estilo);
    const c = cursiva || et === "i" || et === "em" || /font-style:\s*italic/i.test(estilo);
    fuera.push(...trozosDe(hijo, n, c));
  }
  return fuera;
}

/** Junta trozos seguidos que visten igual, para que el HTML no se llene de costuras. */
function fundir(trozos) {
  const fuera = [];
  for (const t of trozos) {
    const ult = fuera[fuera.length - 1];
    if (ult && !!ult.negrita === !!t.negrita && !!ult.cursiva === !!t.cursiva) ult.texto += t.texto;
    else fuera.push({ ...t });
  }
  return fuera.filter((t) => t.texto !== "");
}

function alineacionDe(el) {
  const clase = (el.getAttribute?.("class") || "").split(/\s+/).find((c) => DE_CLASE[c]);
  if (clase) return DE_CLASE[clase];
  // execCommand escribe `style="text-align:center"`; se normaliza aquí.
  const m = /text-align:\s*(center|right|justify|left)/i.exec(el.getAttribute?.("style") || "");
  return m ? ({ center: "centro", right: "derecha", justify: "justificado", left: "izquierda" })[m[1].toLowerCase()] : "izquierda";
}

/**
 * De lo que sea a bloques. Es la única puerta de entrada.
 *
 * Sin DOMParser —en el servidor, o en una prueba— cae a texto plano,
 * que es lo seguro: menos bonito, nunca peligroso.
 */
export function parsear(contenido) {
  const bruto = String(contenido || "");
  if (!tieneFormato(bruto)) return deTextoPlano(bruto);
  if (typeof DOMParser === "undefined") return deTextoPlano(aTextoPlano(bruto));

  const doc = new DOMParser().parseFromString(`<div id="raiz">${bruto}</div>`, "text/html");
  const raiz = doc.getElementById("raiz");
  const fuera = [];

  const mete = (tipo, el, alineacion) => {
    const trozos = fundir(trozosDe(el));
    fuera.push({ tipo, alineacion: alineacion || alineacionDe(el), trozos });
  };

  const recorrer = (padre) => {
    for (const el of padre.children) {
      const et = el.tagName.toLowerCase();
      if (et === "p" || et === "div") mete("p", el);
      else if (et === "h1" || et === "h2" || et === "h3") mete(et, el);
      else if (et === "ul" || et === "ol") {
        const tipo = et === "ul" ? "li-vineta" : "li-numero";
        for (const li of el.children) if (li.tagName.toLowerCase() === "li") mete(tipo, li, alineacionDe(el));
      } else recorrer(el);
    }
  };
  recorrer(raiz);

  return fuera.length ? fuera : deTextoPlano("");
}

// ── DE MODELO A TEXTO ─────────────────────────────────────────

/** El HTML canónico. Sólo sabe escribir lo que hay en el modelo. */
export function serializar(bloques) {
  const fuera = [];
  let lista = null;

  const cerrar = () => { if (lista) { fuera.push(`</${lista}>`); lista = null; } };

  for (const b of bloques || []) {
    const tipo = BLOQUES.includes(b?.tipo) ? b.tipo : "p";
    const clase = ALINEACIONES[b?.alineacion] || null;
    const attr = clase ? ` class="${clase}"` : "";
    const dentro = fundir(b?.trozos || [])
      .map((t) => {
        let s = esc(t.texto).replace(/\n/g, "<br>");
        if (t.cursiva) s = `<em>${s}</em>`;
        if (t.negrita) s = `<strong>${s}</strong>`;
        return s;
      })
      .join("");

    if (tipo === "li-vineta" || tipo === "li-numero") {
      const quiero = tipo === "li-vineta" ? "ul" : "ol";
      if (lista !== quiero) { cerrar(); fuera.push(`<${quiero}>`); lista = quiero; }
      fuera.push(`<li${attr}>${dentro}</li>`);
      continue;
    }
    cerrar();
    fuera.push(`<${tipo}${attr}>${dentro}</${tipo}>`);
  }
  cerrar();
  return fuera.join("");
}

/**
 * Lo que de verdad se guarda: lo que sobrevivió al viaje de ida y
 * vuelta. Si entró algo que el modelo no conoce, aquí ya no está.
 */
export const normalizar = (contenido) => serializar(parsear(contenido));

/**
 * El texto sin etiquetas.
 *
 * Lo necesitan la tarjeta del inicio, el resumen del bloque en la
 * cadena, el paquete de evidencia y —sobre todo— la IA que lee el
 * contrato: mandarle `<p>` y `</strong>` a Gemini es gastar tokens en
 * ruido y empeorar lo que extrae.
 */
export function aTextoPlano(contenido) {
  const bruto = String(contenido || "");
  if (!tieneFormato(bruto)) return bruto;
  return bruto
    // Primero las mudas con todo lo que llevan dentro, antes de que
    // quitar las etiquetas deje su contenido suelto como si fuera texto.
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-3]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Si el documento está vacío de verdad, con formato o sin él. */
export const estaVacio = (contenido) => aTextoPlano(contenido).trim() === "";

/** Para la vista previa de la tarjeta: texto plano y de un tirón. */
export const resumenDe = (contenido, n = 300) => {
  const t = aTextoPlano(contenido).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
