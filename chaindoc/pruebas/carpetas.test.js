// Las carpetas de cada cuenta.
//
// Esto existe por un error concreto: la lista se guardaba en una sola
// clave del navegador, igual para todas las cuentas. Quien abria una
// cuenta nueva en un navegador ya usado se encontraba las carpetas de
// la cuenta anterior, y parecia que la aplicacion las creaba de oficio.
//
// Lo que se cuida aqui son las dos cosas que lo arreglan: que la clave
// lleve el uid, y que "no tiene lista" y "tiene una lista vacia" sean
// estados distintos. De lo segundo depende la sanacion: una cuenta sin
// lista adopta las carpetas que usen sus documentos, una con lista
// vacia se queda vacia porque alguien lo quiso asi.

import { describe, it, expect, beforeEach } from "vitest";
import {
  carpetasEnUso, claveCarpetas, leerCarpetas, tieneCarpetasPropias,
} from "../src/nucleo/carpetas";

/** El navegador no existe en estas pruebas; este es el minimo que usan. */
function memoria(){
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => { globalThis.localStorage = memoria(); });

describe("la clave de cada cuenta", () => {
  it("lleva el uid, asi que dos cuentas no se pisan", () => {
    expect(claveCarpetas("abc")).not.toBe(claveCarpetas("xyz"));
  });

  it("no es la clave vieja, compartida por todos", () => {
    expect(claveCarpetas("abc")).not.toBe("cd_folders");
  });

  it("sin cuenta no escribe en la clave de nadie", () => {
    expect(claveCarpetas(null)).toBe(claveCarpetas(undefined));
    expect(claveCarpetas(null)).not.toBe(claveCarpetas("abc"));
  });

  it("lo que guarda una cuenta no lo ve la otra", () => {
    localStorage.setItem(claveCarpetas("ana"), JSON.stringify(["Obra"]));
    expect(leerCarpetas("ana")).toEqual(["Obra"]);
    expect(leerCarpetas("beto")).toEqual([]);
  });
});

describe("leer la lista", () => {
  it("una cuenta nueva abre sin carpetas", () => {
    expect(leerCarpetas("nueva")).toEqual([]);
  });

  it("un valor roto no tumba la pantalla", () => {
    localStorage.setItem(claveCarpetas("rota"), "{esto no es json");
    expect(leerCarpetas("rota")).toEqual([]);
  });

  it("un null guardado tampoco", () => {
    localStorage.setItem(claveCarpetas("nula"), "null");
    expect(leerCarpetas("nula")).toEqual([]);
  });
});

describe("tener lista propia no es tenerla con algo dentro", () => {
  it("una cuenta que nunca guardo nada, no tiene", () => {
    expect(tieneCarpetasPropias("nueva")).toBe(false);
  });

  it("una lista vacia guardada a proposito, si cuenta", () => {
    localStorage.setItem(claveCarpetas("vacia"), "[]");
    expect(tieneCarpetasPropias("vacia")).toBe(true);
    // y por eso no se le vuelven a poner carpetas solas
    expect(leerCarpetas("vacia")).toEqual([]);
  });
});

describe("las carpetas que de verdad se estan usando", () => {
  it("saca las de los documentos, sin repetir y en orden", () => {
    expect(carpetasEnUso([
      { folder: "Recibos" }, { folder: "Contratos" }, { folder: "Recibos" },
    ])).toEqual(["Contratos", "Recibos"]);
  });

  it("ignora los documentos sin carpeta", () => {
    expect(carpetasEnUso([
      { folder: "Obra" }, { folder: "" }, { folder: null }, {}, null,
    ])).toEqual(["Obra"]);
  });

  it("sin documentos no hay carpetas: la cuenta nueva abre limpia", () => {
    expect(carpetasEnUso([])).toEqual([]);
    expect(carpetasEnUso()).toEqual([]);
  });

  it("no inventa las tres de antes", () => {
    const r = carpetasEnUso([{ folder: "Obra" }]);
    expect(r).not.toContain("Contratos");
    expect(r).not.toContain("Facturas");
    expect(r).not.toContain("Recibos");
  });
});
