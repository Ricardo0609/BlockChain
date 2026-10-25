// Que pasa de verdad al eliminar un documento.
//
// La regla: se borra de verdad lo que SOLO es tuyo; lo que ya es de
// dos se te quita de la vista y sigue existiendo. Dos cosas hacen que
// deje de ser solo tuyo:
//
//   1. alguien mas lo firmo — desde ahi tambien es su prueba;
//   2. esta adjunto como evidencia en un contrato — desde ahi forma
//      parte de lo que ese contrato demuestra, y el contrato puede ser
//      de otro.
//
// Compartirlo para que lo lean NO cuenta: mirar no deja nada que
// perder. Eso es lo que separa un borrado legitimo de vaciarle el
// expediente a alguien.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  decidirBorrado, firmasDeOtros, ocultoPara, vinculosVivos,
} from "../src/nucleo/borrado.js";

const doc = (chain = [], extra = {}) => ({
  id: "d1", title: "Acta", owner: "Ricardo", ownerUid: "U1", ownerEmail: "ricardo@x.com",
  chain, ...extra,
});
const firma = (autorUid, author) => ({ action: "FIRMA", autorUid, author });
const vinc = (expId, tipo) => ({ action: "VINCULADO", meta: { expId, ...(tipo && { tipo }) } });

describe("un documento que solo es tuyo", () => {
  it("se borra de verdad", () => {
    expect(decidirBorrado(doc()).modo).toBe("borrar");
  });

  it("aunque lo hayas compartido para que lo lean", () => {
    const d = doc([], { sharedWith: ["ana@x.com"], roles: { "ana@x.com": "lector" } });
    expect(decidirBorrado(d).modo).toBe("borrar");
  });

  it("aunque lo hayas firmado TU", () => {
    expect(decidirBorrado(doc([firma("U1", "Ricardo")])).modo).toBe("borrar");
  });

  it("y sin cadena ni nada tampoco truena", () => {
    for (const v of [null, undefined, {}, { chain: "no es lista" }]) {
      expect(() => decidirBorrado(v)).not.toThrow();
      expect(decidirBorrado(v).modo).toBe("borrar");
    }
  });
});

// ── LO QUE IMPORTA ───────────────────────────────────────────────
describe("desde que otro lo firma, tambien es su prueba", () => {
  it("no se borra: se oculta", () => {
    const r = decidirBorrado(doc([firma("U2", "Ana Solis")]));
    expect(r.modo).toBe("ocultar");
    expect(r.firmaron).toEqual(["Ana Solis"]);
    expect(r.motivos[0]).toContain("Ana Solis");
    expect(r.motivos[0]).toContain("su prueba");
  });

  it("la aceptacion de un contrato cuenta como firma", () => {
    // No escribe bloque FIRMA: vive en el acuerdo. Si solo se miraran
    // los bloques, un contrato aceptado por la otra parte se podria
    // borrar entero.
    const d = doc([], { acuerdo: { pedidoEn: "2026-10-01", firmas: [
      { parte: "emisor", momento: "aceptacion", uid: "U1" },
      { parte: "receptor", momento: "aceptacion", nombre: "Ana Solis" },
    ] } });
    const r = decidirBorrado(d);
    expect(r.modo).toBe("ocultar");
    expect(r.firmaron).toEqual(["Ana Solis"]);
  });

  it("si solo firmo el emisor, sigue siendo tuyo", () => {
    const d = doc([], { acuerdo: { pedidoEn: "2026-10-01", firmas: [
      { parte: "emisor", momento: "aceptacion", uid: "U1" },
    ] } });
    expect(decidirBorrado(d).modo).toBe("borrar");
  });

  it("varios firmantes salen todos en el motivo", () => {
    const r = decidirBorrado(doc([firma("U2", "Ana"), firma("U3", "Luis")]));
    expect(r.firmaron).toEqual(["Ana", "Luis"]);
    expect(r.motivos[0]).toContain("Ana, Luis");
  });

  it("no se repite a quien firmo dos veces", () => {
    expect(firmasDeOtros(doc([firma("U2", "Ana"), firma("U2", "Ana")]))).toEqual(["Ana"]);
  });
});

describe("desde que es evidencia, es del contrato", () => {
  it("adjunto: no se borra", () => {
    const r = decidirBorrado(doc([vinc("exp1")]));
    expect(r.modo).toBe("ocultar");
    expect(r.adjuntoEn).toEqual(["exp1"]);
    expect(r.motivos[0]).toContain("evidencia");
  });

  it("retirado del contrato: vuelve a ser solo tuyo", () => {
    expect(vinculosVivos(doc([vinc("exp1"), vinc("exp1", "baja")]))).toEqual([]);
    expect(decidirBorrado(doc([vinc("exp1"), vinc("exp1", "baja")])).modo).toBe("borrar");
  });

  it("retirado de uno y puesto en otro: cuenta el que sigue vivo", () => {
    const d = doc([vinc("exp1"), vinc("exp2"), vinc("exp1", "baja")]);
    expect(vinculosVivos(d)).toEqual(["exp2"]);
    expect(decidirBorrado(d).modo).toBe("ocultar");
  });

  it("retirado y vuelto a adjuntar al mismo: sigue adjunto", () => {
    expect(vinculosVivos(doc([vinc("exp1"), vinc("exp1", "baja"), vinc("exp1")])))
      .toEqual(["exp1"]);
  });

  it("en dos contratos, el motivo dice cuantos", () => {
    const r = decidirBorrado(doc([vinc("exp1"), vinc("exp2")]));
    expect(r.motivos[0]).toContain("2 contratos");
  });

  it("un bloque sin expediente no cuenta", () => {
    expect(vinculosVivos(doc([{ action: "VINCULADO", meta: {} }]))).toEqual([]);
  });
});

describe("las dos razones a la vez", () => {
  it("salen los dos motivos", () => {
    const r = decidirBorrado(doc([firma("U2", "Ana"), vinc("exp1")]));
    expect(r.modo).toBe("ocultar");
    expect(r.motivos).toHaveLength(2);
  });
});

describe("ocultar es por persona, no para todos", () => {
  it("solo deja de verlo quien lo pidio", () => {
    const d = doc([], { ocultoPara: ["U1"] });
    expect(ocultoPara(d, "U1")).toBe(true);
    expect(ocultoPara(d, "U2")).toBe(false);
  });

  it("sin lista, nadie lo tiene oculto", () => {
    expect(ocultoPara(doc(), "U1")).toBe(false);
    expect(ocultoPara(null, "U1")).toBe(false);
    expect(ocultoPara(doc([], { ocultoPara: "no es lista" }), "U1")).toBe(false);
  });

  it("sin uid no se oculta nada: mejor verlo de mas que de menos", () => {
    expect(ocultoPara(doc([], { ocultoPara: ["U1"] }), null)).toBe(false);
  });
});

describe("el cliente y el servidor dicen lo mismo", () => {
  it("el cuerpo es identico", () => {
    const corte = (ruta) => {
      const t = readFileSync(new URL(ruta, import.meta.url), "utf8");
      return t.slice(t.indexOf("const BLOQUES = (d) =>"));
    };
    expect(corte("../functions/lib/borrado.js")).toBe(corte("../src/nucleo/borrado.js"));
  });
});
