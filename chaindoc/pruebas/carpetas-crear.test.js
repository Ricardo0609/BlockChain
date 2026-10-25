// Crear una carpeta.
//
// Hasta aqui se creaban con `mIn.trim()` y punto: sin tope de largo,
// sin mirar si ya existia y dejando llamarla «Sin carpeta», que es la
// etiqueta del boton de no-carpeta — o sea dos botones iguales que
// hacen cosas distintas. Se podia vivir con eso mientras hubiera UN
// sitio donde crearlas; ahora hay dos.
import { describe, it, expect } from "vitest";
import {
  LARGO_CARPETA, SIN_CARPETA, conCarpeta, normalizarCarpeta, revisarCarpeta,
} from "../src/nucleo/carpetas.js";

describe("el nombre, tal y como se guarda", () => {
  it("sin bordes ni dobles espacios", () => {
    expect(normalizarCarpeta("  Facturas   2026 ")).toBe("Facturas 2026");
    expect(normalizarCarpeta("\n Obra \t")).toBe("Obra");
  });

  it("ni nulo ni vacio truenan", () => {
    for (const v of ["", "   ", null, undefined]) expect(normalizarCarpeta(v)).toBe("");
  });
});

describe("que nombres valen", () => {
  it("uno normal vale", () => {
    expect(revisarCarpeta("Facturas", [])).toEqual({ ok: true, nombre: "Facturas", yaEsta: false });
  });

  it("vacio no, y lo dice", () => {
    const r = revisarCarpeta("   ", []);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Escribe un nombre/);
  });

  it("demasiado largo no, y dice cuanto cabe", () => {
    const r = revisarCarpeta("x".repeat(LARGO_CARPETA + 1), []);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(LARGO_CARPETA));
    // justo en el limite si
    expect(revisarCarpeta("x".repeat(LARGO_CARPETA), []).ok).toBe(true);
  });

  it("«Sin carpeta» no: ya es el boton de no guardar en ninguna", () => {
    for (const v of [SIN_CARPETA, "sin carpeta", "  SIN CARPETA  "]) {
      const r = revisarCarpeta(v, []);
      expect(r.ok, v).toBe(false);
      expect(r.error).toMatch(/sin carpeta/i);
    }
  });
});

// ── LO QUE IMPORTA ───────────────────────────────────────────────
describe("si ya existe no es un error", () => {
  it("devuelve la que ya habia, para seleccionarla", () => {
    const r = revisarCarpeta("Facturas", ["Contratos", "Facturas"]);
    expect(r).toEqual({ ok: true, nombre: "Facturas", yaEsta: true });
  });

  it("aunque se escriba distinto: mayusculas y espacios de mas", () => {
    for (const v of ["facturas", "  FACTURAS ", "Facturas  "]) {
      const r = revisarCarpeta(v, ["Facturas"]);
      expect(r.yaEsta, v).toBe(true);
      // la que se selecciona es la que YA existe, con su grafia
      expect(r.nombre, v).toBe("Facturas");
    }
  });

  it("y no se duplica en la lista", () => {
    expect(conCarpeta(["Facturas"], "facturas")).toEqual(["Facturas"]);
  });
});

describe("la lista resultante", () => {
  it("entra ordenada", () => {
    expect(conCarpeta(["Recibos", "Contratos"], "Facturas"))
      .toEqual(["Contratos", "Facturas", "Recibos"]);
  });

  it("ordena como se ordena en español", () => {
    expect(conCarpeta(["Zapatos", "Arboles"], "Ñandu"))
      .toEqual(["Arboles", "Ñandu", "Zapatos"]);
  });

  it("un nombre invalido no toca la lista", () => {
    const antes = ["Contratos"];
    expect(conCarpeta(antes, "   ")).toEqual(antes);
    expect(conCarpeta(antes, SIN_CARPETA)).toEqual(antes);
    expect(conCarpeta(antes, "x".repeat(LARGO_CARPETA + 1))).toEqual(antes);
  });

  it("no modifica la lista que recibe", () => {
    const antes = ["Contratos"];
    conCarpeta(antes, "Facturas");
    expect(antes).toEqual(["Contratos"]);
  });

  it("desde cero tambien", () => {
    expect(conCarpeta([], "Obra")).toEqual(["Obra"]);
    expect(conCarpeta(undefined, "Obra")).toEqual(["Obra"]);
  });
});
