// Un contador por tipo de documento.
//
// Antes era uno solo para toda la cuenta: un recibo, una factura, un
// documento de texto y un contrato se repartian la misma fila, asi que
// el «03» de alguien podia ser cualquier cosa. Citar un documento por
// su numero no servia de nada, que es justo para lo que esta el numero.
//
// Lo que se vigila aqui, por orden de gravedad:
//
//   1. Que dos documentos de la cuenta NO acaben con el mismo ID.
//   2. Que los documentos de ANTES no cambien de numero: sus IDs ya
//      estan citados dentro de bloques firmados.
//   3. Que el navegador y el servidor asignen lo mismo.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PREFIJOS, tipoDeFolio, folioConPrefijo, siguienteFolio, folioTexto,
} from "../src/nucleo/cadena";

describe("de que contador tira cada documento", () => {
  it("manda la plantilla", () => {
    expect(tipoDeFolio({ tplId: "recibo" })).toBe("recibo");
    expect(tipoDeFolio({ tplId: "factura" })).toBe("factura");
  });

  it("un contrato inteligente ya analizado", () => {
    expect(tipoDeFolio({ kind: "expediente", tplId: null })).toBe("expediente");
  });

  it("y uno recien empezado, que todavia no lo es", () => {
    // Nace para serlo. Nacer como D-04 para pasar a ser un contrato
    // dejaria la letra mintiendo desde el primer dia.
    expect(tipoDeFolio({ destino: "expediente", tplId: null })).toBe("expediente");
  });

  it("lo demas es documento de texto", () => {
    expect(tipoDeFolio({ tplId: null })).toBe("contrato");
    expect(tipoDeFolio({})).toBe("contrato");
    expect(tipoDeFolio(null)).toBe("contrato");
  });

  it("una plantilla que no conocemos no inventa un contador", () => {
    expect(tipoDeFolio({ tplId: "loquesea" })).toBe("contrato");
  });
});

describe("como se lee el ID", () => {
  it("la letra de cada tipo", () => {
    expect(folioConPrefijo("recibo", 1)).toBe("R-01");
    expect(folioConPrefijo("factura", 1)).toBe("F-01");
    expect(folioConPrefijo("contrato", 1)).toBe("D-01");
    expect(folioConPrefijo("expediente", 1)).toBe("C-01");
  });

  it("dos cifras minimo, y crece solo", () => {
    expect(folioConPrefijo("recibo", 9)).toBe("R-09");
    expect(folioConPrefijo("recibo", 10)).toBe("R-10");
    expect(folioConPrefijo("recibo", 100)).toBe("R-100");
  });

  it("un tipo desconocido no se queda sin letra", () => {
    expect(folioConPrefijo("loquesea", 3)).toBe("D-03");
    expect(folioConPrefijo(undefined, 3)).toBe("D-03");
  });

  it("LOS CUATRO SON DISTINTOS CON EL MISMO NUMERO", () => {
    // La razon de ser de los prefijos. Si esto se cae, dos documentos
    // de la cuenta se llaman igual.
    const ids = Object.keys(PREFIJOS).map((t) => folioConPrefijo(t, 1));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a que numero le toca", () => {
  const doc = (tipo, folio) => ({
    ...(tipo === "recibo" || tipo === "factura" ? { tplId: tipo } : {}),
    ...(tipo === "expediente" ? { kind: "expediente" } : {}),
    folio, numId: folioConPrefijo(tipo, folio),
  });

  it("cada tipo cuenta lo suyo y nada mas", () => {
    const lista = [doc("recibo", 1), doc("recibo", 2), doc("factura", 1), doc("contrato", 1)];
    expect(siguienteFolio(lista, "recibo")).toBe(3);
    expect(siguienteFolio(lista, "factura")).toBe(2);
    expect(siguienteFolio(lista, "contrato")).toBe(2);
    expect(siguienteFolio(lista, "expediente")).toBe(1);
  });

  it("borrar el de en medio no hace que se repita el ultimo", () => {
    expect(siguienteFolio([doc("recibo", 1), doc("recibo", 3)], "recibo")).toBe(4);
  });

  it("LOS DOCUMENTOS VIEJOS NO ARRASTRAN EL CONTADOR NUEVO", () => {
    // Un documento de la fila compartida tiene folio 7 y numId «07».
    // Si contara, el primer recibo de una cuenta SIN recibos saldria
    // R-08, y el usuario se preguntaria donde estan los siete de antes.
    const viejos = [{ folio: 7, numId: "07", tplId: "recibo" },
                    { folio: 5, numId: "05", tplId: null }];
    expect(siguienteFolio(viejos, "recibo")).toBe(1);
    expect(siguienteFolio(viejos, "contrato")).toBe(1);
  });

  it("ni los de antes del folio, que no tenian ninguno", () => {
    expect(siguienteFolio([{ numId: "52040808831" }], "contrato")).toBe(1);
  });

  it("aguanta una lista que no es una lista", () => {
    expect(siguienteFolio(null, "recibo")).toBe(1);
    expect(siguienteFolio(undefined)).toBe(1);
    expect(siguienteFolio([null, undefined, {}], "recibo")).toBe(1);
  });
});

// El servidor lleva su propia copia de esto, igual que ya pasaba con
// `folioTexto`. Si una cambia sin la otra, el ID que ensena el
// navegador deja de ser el que se guarda.
describe("el navegador y el servidor dicen lo mismo", () => {
  const servidor = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

  it("las mismas letras", () => {
    const m = servidor.match(/const PREFIJOS = \{([^}]*)\}/);
    expect(m).not.toBe(null);
    const suyos = Object.fromEntries(
      m[1].split(",").map((p) => p.split(":").map((x) => x.trim().replace(/"/g, ""))).filter((p) => p[0]));
    expect(suyos).toEqual(PREFIJOS);
  });

  it("la misma forma de armar el ID", () => {
    expect(servidor).toContain('`${PREFIJOS[tipo] || "D"}-${folioTexto(n)}`');
    expect(folioConPrefijo("recibo", 4)).toBe(`R-${folioTexto(4)}`);
  });

  it("y la misma regla para elegir el contador", () => {
    expect(servidor).toMatch(/kind === "expediente" \|\| doc\?\.destino === "expediente"/);
  });

  it("el servidor guarda la cuenta POR TIPO, no una sola", () => {
    expect(servidor).toMatch(/porTipo\[tipoFolio\]/);
    expect(servidor).toMatch(/porTipo: \{ \.\.\.porTipo, \[tipoFolio\]: folio \}/);
  });
});
