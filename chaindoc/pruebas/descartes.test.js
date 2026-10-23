// Los avisos que quitaste con la X.
//
// La regla que esto protege: se guarda la clave CON SU FECHA. Si se
// guardara la clave a secas, el dia que te vuelvan a compartir ese
// mismo documento la notificacion nueva naceria descartada y no te
// enterarias nunca.
import { describe, it, expect, beforeEach } from "vitest";
import {
  TOPE, claveDescartes, descartar, estaDescartada, leerDescartes, podar, recuperar,
} from "../src/nucleo/descartes.js";
import { notificacionesDe } from "../src/nucleo/notificaciones.js";

const AYER = "2026-10-22T10:00:00.000Z";
const HOY = "2026-10-23T10:00:00.000Z";
const noti = (clave, fecha) => ({ clave, fecha, texto: "x", docId: "d1" });

// localStorage de mentira, que en Node no hay.
beforeEach(() => {
  const caja = new Map();
  globalThis.localStorage = {
    getItem: (k) => (caja.has(k) ? caja.get(k) : null),
    setItem: (k, v) => caja.set(k, String(v)),
    removeItem: (k) => caja.delete(k),
  };
});

describe("quitar y volver a poner", () => {
  it("lo quitado se queda quitado", () => {
    const n = noti("comp:d1", AYER);
    const m = descartar("U1", n);
    expect(estaDescartada(m, n)).toBe(true);
    expect(leerDescartes("U1")).toEqual(m);
  });

  it("deshacer lo devuelve", () => {
    const n = noti("comp:d1", AYER);
    descartar("U1", n);
    const m = recuperar("U1", "comp:d1");
    expect(estaDescartada(m, n)).toBe(false);
    expect(leerDescartes("U1")).toEqual({});
  });

  it("cada cuenta tiene su caja", () => {
    descartar("U1", noti("comp:d1", AYER));
    expect(leerDescartes("U2")).toEqual({});
    expect(claveDescartes("U1")).not.toBe(claveDescartes("U2"));
  });

  it("sin cuenta no truena", () => {
    expect(() => descartar(null, noti("x", AYER))).not.toThrow();
    expect(leerDescartes(null)).toHaveProperty("x");
  });
});

// ── LA REGLA QUE IMPORTA ─────────────────────────────────────────
describe("un hecho nuevo con la misma clave vuelve a salir", () => {
  it("quitar el aviso de ayer no tapa el de hoy", () => {
    const m = descartar("U1", noti("comp:d1", AYER));
    expect(estaDescartada(m, noti("comp:d1", AYER))).toBe(true);
    expect(estaDescartada(m, noti("comp:d1", HOY))).toBe(false);
  });

  it("y el de la misma fecha si sigue tapado", () => {
    const m = descartar("U1", noti("comp:d1", HOY));
    expect(estaDescartada(m, noti("comp:d1", HOY))).toBe(true);
  });

  it("de punta a punta: te lo vuelven a compartir y te enteras", () => {
    const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const comp = (ts) => ({ action: "COMPARTIDO", author: "Ricardo", timestamp: ts,
                            meta: { tipo: "alta", correo: "ana@x.com" } });
    const d = {
      id: "d1", title: "Acta", owner: "Ricardo", ownerUid: "U1", ownerEmail: "r@x.com",
      sharedWith: ["ana@x.com"], roles: { "ana@x.com": "lector" },
      chain: [comp(dias(5))],
    };
    const quien = { uid: "U2", email: "ana@x.com" };

    const primera = notificacionesDe([d], quien);
    expect(primera).toHaveLength(1);

    const descartes = descartar("U2", primera[0]);
    expect(notificacionesDe([d], { ...quien, descartes })).toHaveLength(0);

    // se lo vuelven a compartir hoy
    d.chain = [...d.chain, comp(dias(0))];
    expect(notificacionesDe([d], { ...quien, descartes })).toHaveLength(1);
  });

  it("un aviso sin fecha se tapa y se queda tapado", () => {
    const m = descartar("U1", noti("raro", null));
    expect(estaDescartada(m, noti("raro", null))).toBe(true);
  });

  it("lo que nunca se quito no esta tapado", () => {
    expect(estaDescartada({}, noti("comp:d1", HOY))).toBe(false);
    expect(estaDescartada(null, noti("comp:d1", HOY))).toBe(false);
    expect(estaDescartada({ otra: HOY }, noti("comp:d1", HOY))).toBe(false);
  });
});

describe("no crece para siempre", () => {
  it("se queda con los mas nuevos al pasar del tope", () => {
    // Fechas estrictamente crecientes: k0 la mas vieja, la ultima la
    // mas nueva. Asi se puede exigir EXACTAMENTE cuales sobreviven, y
    // no solo «alguna de las nuevas».
    const total = TOPE + 50;
    const mapa = {};
    for (let i = 0; i < total; i++) {
      mapa[`k${i}`] = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString();
    }
    const corto = podar(mapa);
    expect(Object.keys(corto)).toHaveLength(TOPE);
    // sobreviven k50..k349, y ni uno de los 50 primeros
    const esperados = Array.from({ length: TOPE }, (_, i) => `k${total - TOPE + i}`);
    expect(Object.keys(corto).sort()).toEqual(esperados.sort());
    for (let i = 0; i < total - TOPE; i++) expect(corto[`k${i}`], `k${i}`).toBeUndefined();
  });

  it("por debajo del tope no toca nada", () => {
    const mapa = { a: HOY, b: AYER };
    expect(podar(mapa)).toEqual(mapa);
    expect(podar({})).toEqual({});
  });

  it("guardar de mas no revienta la caja", () => {
    for (let i = 0; i < TOPE + 20; i++) descartar("U1", noti(`k${i}`, HOY));
    expect(Object.keys(leerDescartes("U1")).length).toBeLessThanOrEqual(TOPE);
  });
});

describe("si el navegador no deja guardar", () => {
  it("lee vacio en vez de tronar", () => {
    globalThis.localStorage.getItem = () => "{esto no es json";
    expect(leerDescartes("U1")).toEqual({});
    globalThis.localStorage.getItem = () => '["una","lista"]';
    expect(leerDescartes("U1")).toEqual({});
  });

  it("si no puede escribir, sigue adelante", () => {
    globalThis.localStorage.setItem = () => { throw new Error("sin sitio"); };
    expect(() => descartar("U1", noti("x", HOY))).not.toThrow();
  });
});
