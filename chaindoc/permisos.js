// El formato de bloque v2 y la verificación de cadenas mezcladas.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonico, textoV1, armarBloqueV2, verificarCadena,
  hashDeBloque, sha256, selloDe, firmaDe,
} from "../src/nucleo/bloques";

/** Cadena v1 como las que ya existen en Firestore. */
async function cadenaV1(n){
  const chain = [];
  for(let i = 0; i < n; i++){
    const b = {
      index: i, timestamp: `2026-09-0${i + 1}T10:00:00.000Z`,
      action: i ? "EDICIÓN" : "CREACIÓN", content: `texto ${i}`, author: "Ana",
      previousHash: i ? chain[i - 1].hash : "0".repeat(64),
    };
    b.hash = await sha256(textoV1(b));
    chain.push(b);
  }
  return chain;
}

describe("JSON canónico", () => {
  it("no depende del orden en que se escribieron las llaves", () => {
    expect(canonico({ b: 1, a: 2 })).toBe(canonico({ a: 2, b: 1 }));
  });
  it("ordena también dentro de los objetos anidados", () => {
    expect(canonico({ x: { z: 1, y: [3, { b: 1, a: 0 }] } }))
      .toBe('{"x":{"y":[3,{"a":0,"b":1}],"z":1}}');
  });
  it("trata undefined como ausente y conserva null", () => {
    expect(canonico({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe("bloques v2", () => {
  it("el primero apunta a 64 ceros y el siguiente al anterior", async () => {
    const g = await armarBloqueV2({ previo: null, action: "CREACIÓN", content: "alta", author: "Ana" });
    const b = await armarBloqueV2({ previo: g, action: "FIRMA", content: "Firma", author: "Ana" });
    expect(g.previousHash).toBe("0".repeat(64));
    expect(b.previousHash).toBe(g.hash);
    expect(b.index).toBe(1);
    expect(b.v).toBe(2);
  });

  it("los metadatos SÍ entran al hash (era el hueco de v1)", async () => {
    const b = await armarBloqueV2({
      previo: null, action: "EVIDENCIA", content: "recibo", author: "Ana",
      meta: { requisito: "r1", monto: 7000 },
    });
    expect(await verificarCadena([b])).toEqual({ valid: true });

    const alterado = { ...b, meta: { requisito: "r1", monto: 70000 } };
    const r = await verificarCadena([alterado]);
    expect(r.valid).toBe(false);
    expect(r.motivo).toBe("contenido");
  });

  it("en v1, en cambio, cambiar meta no rompía nada", async () => {
    const [b] = await cadenaV1(1);
    expect(await verificarCadena([{ ...b, meta: { inventado: true } }])).toEqual({ valid: true });
  });

  it("cambiar quién firmó rompe la cadena", async () => {
    const b = await armarBloqueV2({ previo: null, action: "FIRMA", content: "Firma",
                                    author: "Ana", autorUid: "U1" });
    expect((await verificarCadena([{ ...b, autorUid: "U2" }])).valid).toBe(false);
  });

  it("la hora del bloque la pone quien lo sella", async () => {
    const b = await armarBloqueV2({ previo: null, action: "CREACIÓN", content: "x",
                                    author: "Ana", timestamp: "2026-09-21T00:00:00.000Z" });
    expect(b.timestamp).toBe("2026-09-21T00:00:00.000Z");
    expect(await hashDeBloque(b)).toBe(b.hash);
  });
});

describe("cadenas mezcladas (v1 abajo, v2 encima)", () => {
  it("una migración real verifica completa", async () => {
    const vieja = await cadenaV1(3);
    const sello = await armarBloqueV2({
      previo: vieja[2], action: "MIGRACIÓN", content: "Historia trasladada",
      author: "Ana", meta: { desde: "v1", bloques: 3 },
    });
    const b4 = await armarBloqueV2({ previo: sello, action: "FIRMA", content: "Firma", author: "Ana" });
    expect(await verificarCadena([...vieja, sello, b4])).toEqual({ valid: true });
  });

  it("detecta un bloque viejo insertado después de uno nuevo", async () => {
    const vieja = await cadenaV1(2);
    const sello = await armarBloqueV2({ previo: vieja[1], action: "MIGRACIÓN", content: "m", author: "Ana" });
    const falso = {
      index: 3, timestamp: "2026-09-10T10:00:00.000Z", action: "FIRMA",
      content: "Firma falsificada", author: "Ana", previousHash: sello.hash,
    };
    falso.hash = await sha256(textoV1(falso));
    const r = await verificarCadena([...vieja, sello, falso]);
    expect(r).toMatchObject({ valid: false, failedAt: 3, motivo: "version" });
  });

  it("detecta un bloque quitado de en medio", async () => {
    const c = await cadenaV1(4);
    c.splice(2, 1);
    expect((await verificarCadena(c)).valid).toBe(false);
  });
});

describe("sello y firma", () => {
  it("se leen igual en los dos formatos", () => {
    expect(selloDe({ sello: "LG1" })).toBe("LG1");
    expect(selloDe({ meta: { sello: "LG3" } })).toBe("LG3");
    expect(firmaDe({ meta: { signature: { method: "webauthn" } } }).method).toBe("webauthn");
    expect(firmaDe({ action: "EDICIÓN" })).toBeNull();
  });
});

describe("cliente y servidor comparten el mismo archivo", () => {
  it("functions/lib/bloques.js es idéntico a src/nucleo/bloques.js", () => {
    const a = readFileSync(new URL("../src/nucleo/bloques.js", import.meta.url), "utf8");
    const b = readFileSync(new URL("../functions/lib/bloques.js", import.meta.url), "utf8");
    expect(b).toBe(a);
  });

  it("el verificador del paquete de evidencia usa la misma fórmula", () => {
    const paquete = readFileSync(new URL("../src/paquete.js", import.meta.url), "utf8");
    expect(paquete).toContain('const CAMPOS_V2 = ["v","index","timestamp","action","content","author","autorUid","meta","previousHash"]');
    expect(paquete).toContain("chaindoc-evidencia/2");
  });
});