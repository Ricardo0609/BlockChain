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

// ── EL «NO» DE ALGUIEN TAMBIEN ES SUYO (6 nov) ──────────────────
//
// El hueco mas feo que tenia esto: un contrato que la otra parte NO
// acepto no dejaba firmas ni vinculos, asi que `decidirBorrado` decia
// «borrar» y quien lo mando podia hacer desaparecer la constancia de
// que se lo rechazaron, con el motivo que la otra parte escribio.
//
// Un producto que existe para probar lo que paso no puede dejar que
// una parte borre la respuesta de la otra.
describe("un contrato rechazado no se borra", () => {
  const rechazado = (extra = {}) => ({
    id: "e1", kind: "expediente", title: "Contrato de obra",
    ownerUid: "U1", ownerEmail: "ana@x.com", owner: "Ana",
    chain: [{ action: "CREACIÓN", index: 0 }],
    acuerdo: {
      pedidoEn: "2026-11-01T10:00:00Z",
      firmas: [],
      rechazo: { motivo: "El plazo no me sirve", fecha: "2026-11-02T10:00:00Z",
                 porEmail: "luis@x.com", porNombre: "Luis" },
    },
    ...extra,
  });

  it("se oculta, no se borra", () => {
    const { modo } = decidirBorrado(rechazado());
    expect(modo).toBe("ocultar");
  });

  it("y dice quien fue y que fue un rechazo", () => {
    const { motivos, firmaron } = decidirBorrado(rechazado());
    expect(firmaron).toContain("Luis");
    expect(motivos.join(" ")).toMatch(/Luis no aceptó este contrato/);
  });

  it("NO dice que lo firmo: eso seria mentir", () => {
    // Es el unico sitio donde el producto no se puede permitir una
    // palabra imprecisa.
    expect(decidirBorrado(rechazado()).motivos.join(" ")).not.toMatch(/firmó/);
  });

  it("si ademas hay firmas de verdad, vuelve a hablar de firmas", () => {
    const con = rechazado({ chain: [{ action: "FIRMA", author: "Luis" }] });
    expect(decidirBorrado(con).motivos.join(" ")).toMatch(/firmó/);
  });

  it("un rechazo del propio dueno no le impide borrar lo suyo", () => {
    // Puede pasar si el dueno es a la vez la otra parte en una prueba.
    const mio = rechazado();
    mio.acuerdo.rechazo.porEmail = "ANA@x.com";
    expect(decidirBorrado(mio).modo).toBe("borrar");
  });

  it("sin rechazo, un contrato propio y sin tocar se borra entero", () => {
    const limpio = rechazado();
    limpio.acuerdo.rechazo = null;
    expect(decidirBorrado(limpio).modo).toBe("borrar");
  });
});

// ── UN COMPROBANTE, UN CONTRATO (6 nov) ─────────────────────────
//
// `vinculosVivos` es lo que usa el servidor para decidir si deja
// adjuntar. El navegador ya lo impedia, pero faltaba aqui, y no era un
// lujo: `adjuntoA` es UN campo y de el cuelga quien puede leer la
// evidencia, asi que un segundo vinculo lo sobrescribia y la gente del
// primer contrato se quedaba con un permission-denied al abrirlo.
describe("donde esta adjunto ahora mismo", () => {
  const vinc = (expId, tipo) => ({ action: "VINCULADO", meta: { expId, ...(tipo ? { tipo } : {}) } });

  it("sin adjuntar, en ningun sitio", () => {
    expect(vinculosVivos({ chain: [{ action: "CREACIÓN" }] })).toEqual([]);
    expect(vinculosVivos({})).toEqual([]);
    expect(vinculosVivos(null)).toEqual([]);
  });

  it("adjuntado, en uno", () => {
    expect(vinculosVivos({ chain: [vinc("e1")] })).toEqual(["e1"]);
  });

  it("retirado, otra vez en ninguno: ahi es donde se puede mover", () => {
    expect(vinculosVivos({ chain: [vinc("e1"), vinc("e1", "baja")] })).toEqual([]);
  });

  it("dos requisitos del MISMO contrato no son dos contratos", () => {
    // Es el caso legitimo: un comprobante que cubre dos obligaciones
    // del mismo acuerdo. No duplica ningun gasto.
    expect(vinculosVivos({ chain: [vinc("e1"), vinc("e1")] })).toEqual(["e1"]);
  });

  it("y si de verdad esta en dos, se ven los dos", () => {
    // Datos de antes de la regla. El servidor tiene que poder
    // reconocerlo para negarse a anadir un tercero.
    expect(vinculosVivos({ chain: [vinc("e1"), vinc("e2")] }).sort()).toEqual(["e1", "e2"]);
  });

  it("una baja solo levanta su propio vinculo", () => {
    expect(vinculosVivos({ chain: [vinc("e1"), vinc("e2"), vinc("e1", "baja")] })).toEqual(["e2"]);
  });

  it("y se puede volver a adjuntar donde se retiro", () => {
    expect(vinculosVivos({ chain: [vinc("e1"), vinc("e1", "baja"), vinc("e1")] })).toEqual(["e1"]);
  });
});

describe("la puerta del servidor esta puesta", () => {
  it("agregarBloque lo comprueba antes de asentar", () => {
    const cuerpo = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
    const i = cuerpo.indexOf("async function puertaDelVinculo");
    expect(i).toBeGreaterThan(-1);
    const dentro = cuerpo.slice(i, cuerpo.indexOf("\n}", i));
    expect(dentro).toMatch(/vinculosVivos\(/);
    expect(dentro).toMatch(/yaEn\.find\(\(x\) => x !== expId\)/);
    expect(dentro).toMatch(/failed-precondition/);
  });
});
