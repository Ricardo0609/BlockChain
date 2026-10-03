// Catálogo de creación.
//
// La primera pantalla del flujo de creación llegó a tener siete
// tarjetas, y después cuatro más una fila de pastillas para elegir la
// clase de contrato. Las dos formas hacían decidir de qué clase es el
// contrato antes de escribir una línea. Estas pruebas sujetan la
// decisión final: cuatro tarjetas, y nada más entre el tipo y el
// método. Si alguien vuelve a meter un paso intermedio, esto falla y
// obliga a decidirlo a propósito.

import { describe, expect, it } from "vitest";
import { aceptaEfirma, METHODS, TEMPLATES } from "../src/nucleo/catalogos.js";

describe("tipos de documento (paso 1)", () => {
  it("son exactamente cuatro", () => {
    expect(TEMPLATES).toHaveLength(4);
  });

  it("son contrato, factura, recibo y contrato inteligente", () => {
    expect(TEMPLATES.map((t) => t.id))
      .toEqual(["contrato", "factura", "recibo", "inteligente"]);
  });

  it("cada uno trae icono y nombre, que es lo que dibuja la tarjeta", () => {
    for(const t of TEMPLATES){
      expect(t.ico).toBeTruthy();
      expect(t.name).toBeTruthy();
    }
  });

  // El paso 1 elige el tipo y el paso 2 el método. No hay un paso 1.5.
  it("ninguno pide una decisión extra antes del método", () => {
    for(const t of TEMPLATES){
      expect(t.tipos).toBeUndefined();
      expect(t.variantes).toBeUndefined();
    }
  });

  it("factura y recibo son formularios, no texto libre", () => {
    expect(TEMPLATES.find((t) => t.id === "factura").form).toBe("factura");
    expect(TEMPLATES.find((t) => t.id === "recibo").form).toBe("recibo");
    // Y por eso su cuerpo va vacío: lo arma el formulario.
    expect(TEMPLATES.find((t) => t.id === "factura").body).toBe("");
    expect(TEMPLATES.find((t) => t.id === "recibo").body).toBe("");
  });

  it("el contrato inteligente sigue marcado como tal", () => {
    expect(TEMPLATES.find((t) => t.id === "inteligente").smart).toBe(true);
  });
});

describe("la plantilla de contrato", () => {
  const contrato = TEMPLATES.find((t) => t.id === "contrato");

  it("trae un texto de partida, no una hoja en blanco", () => {
    expect(contrato.body.length).toBeGreaterThan(600);
  });

  it("nombra a las dos partes y les pide RFC", () => {
    expect(contrato.body).toMatch(/PRIMERA PARTE/);
    expect(contrato.body).toMatch(/SEGUNDA PARTE/);
    expect(contrato.body).toMatch(/RFC/);
  });

  // Es lo que distingue a chaindoc de un editor de texto: el contrato
  // tiene que decir con qué se comprueba cada pago.
  it("habla de comprobantes fiscales", () => {
    expect(contrato.body).toMatch(/CFDI|comprobante fiscal/i);
    expect(contrato.body).toMatch(/COMPROBANTES/);
  });

  it("tiene las secciones que el análisis de IA busca", () => {
    for(const s of ["OBJETO", "PRECIO Y FORMA DE PAGO", "PLAZO", "FIRMAS"]){
      expect(contrato.body).toContain(s);
    }
  });

  it("no se quedó con el encabezado de una clase concreta", () => {
    expect(contrato.body.split("\n")[0]).toBe("CONTRATO");
    expect(contrato.body).not.toMatch(/ARRENDAMIENTO|PRECIO ALZADO/);
  });
});

describe("métodos de creación (paso 2)", () => {
  it("siguen siendo los tres de siempre", () => {
    expect(METHODS.map((m) => m.id)).toEqual(["escanear", "subir", "cero"]);
  });

  it("cada uno explica qué hace, que es lo que se lee bajo la tarjeta", () => {
    for(const m of METHODS){
      expect(m.name).toBeTruthy();
      expect(m.desc).toBeTruthy();
      expect(m.ico).toBeTruthy();
    }
  });
});

// ── e.firma (Etapa 5) ─────────────────────────────────────────

describe("a quien se le ofrece la e.firma", () => {
  it("a un contrato si", () => {
    expect(aceptaEfirma({ tplId: "contrato" })).toBe(true);
    expect(aceptaEfirma({ tplId: "inteligente" })).toBe(true);
    expect(aceptaEfirma({ tplId: "recibo" })).toBe(true);
  });

  // Un CFDI ya viene sellado por quien lo emitio y timbrado por el SAT.
  it("a una factura no", () => {
    expect(aceptaEfirma({ tplId: "factura" })).toBe(false);
  });

  it("a un documento sin plantilla si, y a nada no", () => {
    expect(aceptaEfirma({ tplId: null })).toBe(true);
    expect(aceptaEfirma(null)).toBe(false);
  });
});
