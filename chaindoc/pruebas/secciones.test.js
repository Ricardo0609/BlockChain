// Las secciones de debajo del papel: cuáles se ven y cuáles se pueden
// quitar.
//
// Lo que esto protege de verdad es una sola regla: una firma o una
// foto YA PUESTAS no se pueden esconder. Todo lo demás es comodidad;
// eso es la tesis del producto.
import { describe, it, expect } from "vitest";
import {
  SECCIONES, limpiarSecciones, motivoOcupada, sePuedeQuitar, seVe, seccionesDe,
} from "../src/nucleo/secciones.js";

const VACIO = { imagenes: 0, firmas: 0 };

describe("qué secciones se ven", () => {
  it("un documento de los de antes las ve las dos", () => {
    // Ninguno tiene el campo, asi que ninguno cambia: eso es lo que
    // evita tener que migrar nada.
    expect(seccionesDe({ id: "d1" })).toEqual({ evidencia: true, firmas: true });
    expect(seccionesDe(null)).toEqual({ evidencia: true, firmas: true });
  });

  it("solo se esconde lo que esta apagado a proposito", () => {
    const d = { secciones: { evidencia: false } };
    expect(seVe(d, "evidencia")).toBe(false);
    expect(seVe(d, "firmas")).toBe(true);
  });

  it("true es lo mismo que no decir nada", () => {
    expect(seVe({ secciones: { firmas: true } }, "firmas")).toBe(true);
  });

  it("un campo con basura no esconde nada", () => {
    for (const basura of ["no", 0, null, undefined, {}]) {
      expect(seVe({ secciones: { firmas: basura } }, "firmas")).toBe(basura !== false);
    }
  });
});

describe("lo que se guarda", () => {
  it("solo guarda lo apagado, y nada si no hay nada apagado", () => {
    expect(limpiarSecciones({ evidencia: true, firmas: true })).toBe(null);
    expect(limpiarSecciones({ evidencia: false, firmas: true })).toEqual({ evidencia: false });
    expect(limpiarSecciones({ evidencia: false, firmas: false }))
      .toEqual({ evidencia: false, firmas: false });
  });

  it("no se cuela nada que no sea una seccion", () => {
    expect(limpiarSecciones({ inventada: false, firmas: false })).toEqual({ firmas: false });
  });

  it("guardar y volver a leer da lo mismo", () => {
    for (const antes of [
      { evidencia: true, firmas: true },
      { evidencia: false, firmas: true },
      { evidencia: false, firmas: false },
    ]) {
      expect(seccionesDe({ secciones: limpiarSecciones(antes) })).toEqual(antes);
    }
  });
});

// ── LA REGLA QUE IMPORTA ─────────────────────────────────────────
describe("una prueba ya puesta no se esconde", () => {
  it("vacias, las dos se quitan", () => {
    expect(sePuedeQuitar("evidencia", VACIO)).toBe(true);
    expect(sePuedeQuitar("firmas", VACIO)).toBe(true);
  });

  it("con una sola firma, la seccion de firmas se queda", () => {
    expect(sePuedeQuitar("firmas", { imagenes: 0, firmas: 1 })).toBe(false);
    expect(motivoOcupada("firmas", { imagenes: 0, firmas: 1 })).toMatch(/parte de la prueba/);
  });

  it("con una sola foto, la de evidencia se queda", () => {
    expect(sePuedeQuitar("evidencia", { imagenes: 1, firmas: 0 })).toBe(false);
    expect(motivoOcupada("evidencia", { imagenes: 1, firmas: 0 })).toMatch(/Retiralas|Retíralas/);
  });

  it("cada una mira lo suyo y no lo de la otra", () => {
    expect(sePuedeQuitar("firmas", { imagenes: 5, firmas: 0 })).toBe(true);
    expect(sePuedeQuitar("evidencia", { imagenes: 0, firmas: 5 })).toBe(true);
  });

  it("sin contarle nada, no da permiso de quitar lo que no sabe", () => {
    expect(sePuedeQuitar("inventada", VACIO)).toBe(false);
    expect(motivoOcupada("inventada", VACIO)).toBe(null);
  });

  it("cuando si se puede, no hay motivo que enseñar", () => {
    expect(motivoOcupada("firmas", VACIO)).toBe(null);
    expect(motivoOcupada("evidencia", VACIO)).toBe(null);
  });
});

describe("el catalogo", () => {
  it("las dos traen titulo, boton y motivo", () => {
    expect(SECCIONES.map((s) => s.id)).toEqual(["evidencia", "firmas"]);
    for (const s of SECCIONES) {
      expect(s.titulo, s.id).toBeTruthy();
      expect(s.agregar, s.id).toMatch(/^Agregar seccion|^Agregar sección/);
      expect(s.ocupada, s.id).toBeTruthy();
    }
  });

  it("y el catalogo manda sobre lo que se lee y se guarda", () => {
    const todas = Object.fromEntries(SECCIONES.map((s) => [s.id, false]));
    expect(Object.keys(seccionesDe({}))).toEqual(SECCIONES.map((s) => s.id));
    expect(limpiarSecciones(todas)).toEqual(todas);
  });
});
