// Ordenar y buscar en una carpeta.
//
// Lo que se rompe aqui no se nota: una lista mal ordenada sigue
// pareciendo una lista, y una busqueda que se come un documento
// parece una carpeta donde ese documento no esta. Por eso las dos
// orillas: que encuentre lo que hay, y que no invente coincidencias.
import { describe, it, expect } from "vitest";
import {
  llave, coincide, ordenarYBuscar, ORDENES, ORDEN_POR_DEFECTO, nadaEncontrado,
} from "../src/nucleo/orden";

const doc = (title, lastModified, extra = {}) => ({
  id: title, title, lastModified, numId: "01", folder: "Obra", ...extra,
});
const LISTA = [
  doc("Recibo de cemento", "2026-11-01T10:00:00Z", { numId: "02",
      fields: { recibiDe: "Constructora Solís", concepto: "Cemento gris" } }),
  doc("Acta de entrega",   "2026-10-15T10:00:00Z", { numId: "03" }),
  doc("Zapata corrida",    "2026-11-03T10:00:00Z", { numId: "01" }),
];
const titulos = (l) => l.map((d) => d.title);

describe("la llave de comparacion", () => {
  it("ignora acentos, mayusculas y espacios de mas", () => {
    expect(llave("  Constructora   SOLÍS ")).toBe("constructora solis");
    expect(llave(null)).toBe("");
    expect(llave(42)).toBe("42");
  });
});

describe("el orden", () => {
  it("por defecto, lo ultimo que tocaste arriba", () => {
    expect(titulos(ordenarYBuscar(LISTA)))
      .toEqual(["Zapata corrida", "Recibo de cemento", "Acta de entrega"]);
  });

  it("y al reves", () => {
    expect(titulos(ordenarYBuscar(LISTA, { orden: "antiguos" })))
      .toEqual(["Acta de entrega", "Recibo de cemento", "Zapata corrida"]);
  });

  it("por nombre, en los dos sentidos", () => {
    expect(titulos(ordenarYBuscar(LISTA, { orden: "az" })))
      .toEqual(["Acta de entrega", "Recibo de cemento", "Zapata corrida"]);
    expect(titulos(ordenarYBuscar(LISTA, { orden: "za" })))
      .toEqual(["Zapata corrida", "Recibo de cemento", "Acta de entrega"]);
  });

  it("el nombre no se ordena por el codigo de la letra", () => {
    // «Álvarez» va antes que «Benitez», y «avance 10» despues de
    // «avance 9». Ordenar por bytes pondria las dos donde no van.
    const l = [doc("Benitez", "2026-01-01"), doc("Álvarez", "2026-01-02"),
               doc("avance 10", "2026-01-03"), doc("avance 9", "2026-01-04")];
    expect(titulos(ordenarYBuscar(l, { orden: "az" })))
      .toEqual(["Álvarez", "avance 9", "avance 10", "Benitez"]);
  });

  it("un orden que no existe no baraja la lista", () => {
    expect(titulos(ordenarYBuscar(LISTA, { orden: "loquesea" })))
      .toEqual(titulos(ordenarYBuscar(LISTA, { orden: ORDEN_POR_DEFECTO })));
  });

  it("no toca la lista que recibe", () => {
    // Es estado de React: ordenarla en el sitio la cambiaria por debajo.
    const copia = [...LISTA];
    ordenarYBuscar(LISTA, { orden: "az" });
    expect(LISTA).toEqual(copia);
  });

  it("los cuatro ordenes tienen nombre para el menu", () => {
    expect(ORDENES.map((o) => o.id)).toEqual(["recientes", "antiguos", "az", "za"]);
    expect(ORDENES.every((o) => o.txt && o.txt.length < 30)).toBe(true);
  });
});

describe("el buscador", () => {
  it("sin nada escrito, estan todos", () => {
    expect(ordenarYBuscar(LISTA, { busca: "" })).toHaveLength(3);
    expect(ordenarYBuscar(LISTA, { busca: "   " })).toHaveLength(3);
  });

  it("busca en el nombre", () => {
    expect(titulos(ordenarYBuscar(LISTA, { busca: "acta" }))).toEqual(["Acta de entrega"]);
  });

  it("y en el folio, que es como se citan entre ellos", () => {
    expect(titulos(ordenarYBuscar(LISTA, { busca: "03" }))).toEqual(["Acta de entrega"]);
  });

  it("y en los datos de un recibo", () => {
    // «cemento» esta en el concepto, no solo en el titulo; «solis»
    // solo esta en el campo de quien pago.
    expect(titulos(ordenarYBuscar(LISTA, { busca: "solis" }))).toEqual(["Recibo de cemento"]);
  });

  it("sin acentos encuentra lo acentuado, y al reves", () => {
    expect(titulos(ordenarYBuscar(LISTA, { busca: "SOLÍS" }))).toEqual(["Recibo de cemento"]);
    expect(titulos(ordenarYBuscar(LISTA, { busca: "solis" }))).toEqual(["Recibo de cemento"]);
  });

  it("varias palabras: todas, pero ni juntas ni en orden", () => {
    // Quien escribe «solis cemento» busca el recibo de cemento de
    // Solis, aunque esas dos palabras no esten pegadas en ningun sitio.
    expect(titulos(ordenarYBuscar(LISTA, { busca: "solis cemento" })))
      .toEqual(["Recibo de cemento"]);
    expect(titulos(ordenarYBuscar(LISTA, { busca: "cemento solis" })))
      .toEqual(["Recibo de cemento"]);
  });

  it("si una palabra no esta, no cuadra", () => {
    expect(ordenarYBuscar(LISTA, { busca: "solis varilla" })).toEqual([]);
  });

  it("no busca en el texto del documento", () => {
    // En un documento largo medio archivo valdria para cualquier
    // palabra, y una busqueda que lo encuentra todo no encuentra nada.
    const largo = doc("Contrato", "2026-11-02", { content: "<p>cemento a mansalva</p>" });
    expect(coincide(largo, "cemento")).toBe(false);
    expect(coincide(largo, "contrato")).toBe(true);
  });

  it("buscar y ordenar a la vez", () => {
    const l = [doc("Pago B", "2026-01-01"), doc("Pago A", "2026-02-01"), doc("Otro", "2026-03-01")];
    expect(titulos(ordenarYBuscar(l, { busca: "pago", orden: "az" })))
      .toEqual(["Pago A", "Pago B"]);
  });

  it("aguanta lo que no deberia llegarle", () => {
    expect(ordenarYBuscar(null)).toEqual([]);
    expect(ordenarYBuscar(undefined, { busca: "x" })).toEqual([]);
    expect(coincide(null, "x")).toBe(false);
    expect(coincide({}, "")).toBe(true);
    expect(() => ordenarYBuscar([{ }, null], { busca: "x" })).not.toThrow();
  });

  it("dice que se busco cuando no hay nada", () => {
    expect(nadaEncontrado(" varilla ")).toMatch(/«varilla»/);
  });
});
