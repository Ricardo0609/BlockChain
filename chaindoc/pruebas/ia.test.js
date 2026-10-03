// Lo que el servidor hace con lo que devuelve el modelo.
//
// La llamada a Gemini no se prueba aquí (cuesta dinero y no es
// determinista); lo que sí se prueba es que nada de lo que conteste
// pueda llegar a la app con una forma que la rompa.
import { describe, it, expect } from "vitest";
import { normalizar, normalizarFases, SCHEMA, PROMPT, EXPLICA } from "../functions/lib/ia.js";

describe("fases", () => {
  it("las ordena por fecha cuando todas la tienen", () => {
    const r = normalizarFases({ fases: [
      { titulo: "Entrega", descripcion: "", fechaLimite: "2026-12-01" },
      { titulo: "Anticipo", descripcion: "", fechaLimite: "2026-10-01" },
    ]});
    expect(r.map((f) => f.titulo)).toEqual(["Anticipo", "Entrega"]);
    expect(r.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("si a alguna le falta la fecha, respeta el orden del contrato", () => {
    const r = normalizarFases({ fases: [
      { titulo: "Inicio de obra", descripcion: "" },
      { titulo: "Entrega", descripcion: "", fechaLimite: "2026-12-01" },
    ]});
    expect(r.map((f) => f.titulo)).toEqual(["Inicio de obra", "Entrega"]);
  });

  it("descarta las fases sin título y las fechas inventadas", () => {
    const r = normalizarFases({ fases: [
      { descripcion: "sin título" },
      { titulo: "Entrega", fechaLimite: "el mes que viene" },
    ]});
    expect(r).toHaveLength(1);
    expect(r[0].fechaLimite).toBeNull();
  });

  it("sin fases, lista vacía", () => {
    expect(normalizarFases({})).toEqual([]);
    expect(normalizarFases({ fases: "muchas" })).toEqual([]);
  });
});

describe("normalización del análisis", () => {
  const crudo = {
    titulo: "  Contrato de obra  ",
    resumen: "Barda de 20 metros",
    montoTotal: 50000,
    fases: [{ titulo: "Anticipo", descripcion: "50%", fechaLimite: "2026-10-01" }],
    requisitos: [
      { titulo: "Factura del anticipo", descripcion: "", tipo: "comprobante", fase: "anticipo" },
      { titulo: "Acta", descripcion: "", tipo: "inventado", obligatorio: false },
      { descripcion: "sin título" },
    ],
    partes: [{ nombre: " Ana ", rol: "" }, { rol: "sin nombre" }],
  };

  it("enlaza cada requisito con su fase aunque el título no coincida exacto", () => {
    const r = normalizar(crudo);
    expect(r.requisitos[0].fase).toBe("f1");
  });

  it("un tipo que no existe se trata como documento", () => {
    expect(normalizar(crudo).requisitos[1].tipo).toBe("documento");
  });

  it("descarta lo que viene sin título y limpia los espacios", () => {
    const r = normalizar(crudo);
    expect(r.requisitos).toHaveLength(2);
    expect(r.titulo).toBe("Contrato de obra");
    expect(r.partes).toEqual([{ nombre: "Ana", rol: "parte" }]);
  });

  it("los requisitos nacen pendientes y numerados", () => {
    const r = normalizar(crudo);
    expect(r.requisitos.map((x) => x.id)).toEqual(["r1", "r2"]);
    expect(r.requisitos.every((x) => x.estado === "pendiente")).toBe(true);
  });

  it("obligatorio por omisión: lo que no se diga, se exige", () => {
    const r = normalizar(crudo);
    expect(r.requisitos[0].obligatorio).toBe(true);
    expect(r.requisitos[1].obligatorio).toBe(false);
  });

  it("los montos y fechas que no son válidos quedan nulos, no inventados", () => {
    const r = normalizar({ requisitos: [
      { titulo: "X", monto: "cincuenta mil", fechaLimite: "pronto" },
    ]});
    expect(r.requisitos[0].monto).toBeNull();
    expect(r.requisitos[0].fechaLimite).toBeNull();
    expect(r.montoTotal).toBeNull();
  });

  it("la moneda por omisión es la del país donde se usa", () => {
    expect(normalizar({}).moneda).toBe("MXN");
  });

  it("una respuesta vacía no rompe nada", () => {
    const r = normalizar({});
    expect(r.requisitos).toEqual([]);
    expect(r.fases).toEqual([]);
    expect(r.titulo).toBe("Contrato inteligente");
  });
});

describe("lo que se le pide al modelo", () => {
  it("el prompt tiene sus dos huecos", () => {
    expect(PROMPT).toContain("{HOY}");
    expect(PROMPT).toContain("{TEXTO}");
  });

  it("el esquema exige lo que la app necesita", () => {
    expect(SCHEMA.required).toEqual(["titulo", "resumen", "partes", "requisitos", "fases"]);
  });

  it("cada motivo de falla tiene su explicación en español", () => {
    for(const motivo of ["llave", "cuota", "saturado", "conexion", "ilegible", "sin-requisitos"]){
      expect(EXPLICA[motivo]).toBeTruthy();
    }
  });
});