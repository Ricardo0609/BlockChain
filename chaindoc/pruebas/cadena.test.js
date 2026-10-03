// Utilidades de la cadena y saneamiento antes de guardar.
// El formato de bloque se prueba en bloques.test.js.
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/firebase", () => ({ db: {}, auth: {}, app: {}, ENTORNO: "prueba" }));

import { genId, genNumId, sha256, verifyChain } from "../src/nucleo/cadena";
import { sinUndefined, quitarArchivoViejo, CAMPOS_EDITABLES } from "../src/nucleo/datos";

describe("sha256", () => {
  it("coincide con el valor conocido de 'abc'", async () => {
    expect(await sha256("abc"))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("identificadores", () => {
  it("no se repiten", () => {
    const ids = new Set(Array.from({ length: 500 }, genId));
    expect(ids.size).toBe(500);
  });
  it("el número de documento tiene 11 dígitos", () => {
    expect(genNumId()).toMatch(/^\d{11}$/);
  });
});

describe("verifyChain sigue disponible para la interfaz", () => {
  it("una cadena vacía es válida", async () => {
    expect(await verifyChain([])).toEqual({ valid: true });
  });
});

describe("saneamiento antes de guardar", () => {
  it("quita undefined en cualquier nivel y conserva null", () => {
    const r = sinUndefined({ a: 1, b: undefined, c: null, d: [{ x: undefined, y: 2 }], e: { f: undefined } });
    expect(r).toEqual({ a: 1, c: null, d: [{ y: 2 }], e: {} });
  });

  it("quita el campo archivo del formato viejo", () => {
    expect(quitarArchivoViejo({ id: "r1", archivo: { n: 1 }, archivos: [] })).toEqual({ id: "r1", archivos: [] });
  });

  it("la lista de campos editables no incluye nada que fije el servidor", () => {
    for(const prohibido of ["ownerUid", "bloques", "ultimoHash", "id", "numId", "version", "chain"]){
      expect(CAMPOS_EDITABLES).not.toContain(prohibido);
    }
  });
});
