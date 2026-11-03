// El orden de las fases de un contrato.
//
// La regla es simple y el riesgo tambien: si bloquea de mas, la otra
// parte se queda sin poder entregar y el contrato se atasca sin que
// nadie sepa por que. Casi todas estas pruebas son de eso.
import { describe, it, expect } from "vitest";
import {
  vanEnOrden, faseQueFalta, sePuedeEntregarEn, sePuedeEntregarEnReq, porQueEsperar,
  porQueEsperarLargo,
} from "../src/nucleo/fases";

// Lo que devuelve estadoFases(), que es de donde sale esto.
const fase = (id, n, completa, extra = {}) => ({
  id, n, titulo: `Fase ${n}`, completa,
  total: 2, hechos: completa ? 2 : 0, sinRequisitos: false, ...extra,
});
const TRES = [fase("f1", 1, false), fase("f2", 2, false), fase("f3", 3, false)];
const UNA_HECHA = [fase("f1", 1, true), fase("f2", 2, false), fase("f3", 3, false)];
const enOrden = { fases: [], fasesEnOrden: true };
const sueltas = { fases: [], fasesEnOrden: false };

describe("si el contrato va en orden", () => {
  it("por defecto si: es lo que es casi siempre", () => {
    expect(vanEnOrden({})).toBe(true);
    expect(vanEnOrden({ fasesEnOrden: true })).toBe(true);
    expect(vanEnOrden(null)).toBe(true);
  });

  it("para que no lo sea hay que decirlo", () => {
    // Asi los contratos de antes de esta regla no cambian de
    // significado por un campo que no traian.
    expect(vanEnOrden(sueltas)).toBe(false);
  });
});

describe("que fase hay que cerrar antes", () => {
  it("la primera no espera a nadie", () => {
    expect(faseQueFalta(enOrden, TRES, "f1")).toBe(null);
    expect(sePuedeEntregarEn(enOrden, TRES, "f1")).toBe(true);
  });

  it("la segunda espera a la primera", () => {
    expect(faseQueFalta(enOrden, TRES, "f2").id).toBe("f1");
    expect(sePuedeEntregarEn(enOrden, TRES, "f2")).toBe(false);
  });

  it("cerrada la primera, se abre la segunda y solo la segunda", () => {
    expect(sePuedeEntregarEn(enOrden, UNA_HECHA, "f2")).toBe(true);
    expect(sePuedeEntregarEn(enOrden, UNA_HECHA, "f3")).toBe(false);
  });

  it("nombra la PRIMERA que falta, no la ultima", () => {
    // La que toca hacer ahora. Nombrar otra manda a la persona al
    // sitio equivocado.
    expect(faseQueFalta(enOrden, TRES, "f3").id).toBe("f1");
  });

  it("si son independientes no espera ninguna", () => {
    for (const id of ["f1", "f2", "f3"]) {
      expect(faseQueFalta(sueltas, TRES, id)).toBe(null);
      expect(sePuedeEntregarEn(sueltas, TRES, id)).toBe(true);
    }
  });
});

describe("lo que NO puede bloquear", () => {
  it("un requisito sin fase entrega siempre", () => {
    // Hay contratos con fases donde algunos comprobantes no son de
    // ninguna. Esos no esperan a nadie.
    expect(sePuedeEntregarEnReq(enOrden, TRES, { fase: null })).toBe(true);
    expect(sePuedeEntregarEnReq(enOrden, TRES, {})).toBe(true);
  });

  it("una fase sin comprobantes asignados no atasca a las de atras", () => {
    // No se puede completar nunca, asi que si detuviera a las
    // siguientes el contrato entero se quedaria clavado en una fase
    // que nadie puede cerrar.
    const conHueco = [fase("f1", 1, false, { sinRequisitos: true, total: 0, hechos: 0 }),
                      fase("f2", 2, false)];
    expect(sePuedeEntregarEn(enOrden, conHueco, "f2")).toBe(true);
  });

  it("un contrato sin fases no bloquea nada", () => {
    expect(sePuedeEntregarEn(enOrden, [], "f1")).toBe(true);
    expect(faseQueFalta(enOrden, [], "loquesea")).toBe(null);
  });

  it("una fase que no esta en la lista no bloquea", () => {
    // Un requisito que apunta a una fase borrada no deja a nadie
    // encerrado.
    expect(sePuedeEntregarEn(enOrden, TRES, "fantasma")).toBe(true);
  });
});

describe("lo que se le dice al usuario", () => {
  it("dice cual es la fase y cuanto le falta", () => {
    const m = porQueEsperar(enOrden, TRES, "f2");
    expect(m).toMatch(/fase 1/);
    expect(m).toMatch(/Fase 1/);
    expect(m).toMatch(/2 de 2 comprobantes/);
  });

  it("lleva la cuenta de lo que ya se entrego", () => {
    const aMedias = [fase("f1", 1, false, { total: 3, hechos: 1 }), fase("f2", 2, false)];
    expect(porQueEsperar(enOrden, aMedias, "f2")).toMatch(/2 de 3 comprobantes/);
  });

  it("uno solo no se dice en plural", () => {
    const casi = [fase("f1", 1, false, { total: 2, hechos: 1 }), fase("f2", 2, false)];
    expect(porQueEsperar(enOrden, casi, "f2")).toMatch(/falta 1 comprobante\./);
    expect(porQueEsperar(enOrden, casi, "f2")).not.toMatch(/comprobantes/);
  });

  it("la version corta sale en pantalla; la larga, en el boton", () => {
    // La corta se repite en CADA comprobante bloqueado: un parrafo
    // seis veces no informa, estorba.
    const corto = porQueEsperar(enOrden, TRES, "f2");
    const largo = porQueEsperarLargo(enOrden, TRES, "f2");
    expect(corto.length).toBeLessThan(largo.length);
    expect(largo).toContain(corto);
    expect(largo).toMatch(/en orden/);
    expect(porQueEsperarLargo(enOrden, TRES, "f1")).toBe(null);
  });

  it("si no hay nada que esperar, no hay nada que explicar", () => {
    expect(porQueEsperar(enOrden, TRES, "f1")).toBe(null);
    expect(porQueEsperar(sueltas, TRES, "f3")).toBe(null);
  });
});
