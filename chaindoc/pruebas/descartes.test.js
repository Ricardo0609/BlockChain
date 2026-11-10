// Los avisos que quitaste con la X.
//
// La regla que esto protege: se guarda la clave CON SU FECHA. Si se
// guardara la clave a secas, el dia que te vuelvan a compartir ese
// mismo documento la notificacion nueva naceria descartada y no te
// enterarias nunca.
import { describe, it, expect, beforeEach } from "vitest";
import {
  TOPE, claveDescartes, descartar, estaDescartada, fundir, guardarLocales,
  leerLocales, podar, recuperar,
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
    expect(estaDescartada(descartar({}, n), n)).toBe(true);
  });

  it("deshacer lo devuelve", () => {
    const n = noti("comp:d1", AYER);
    expect(estaDescartada(recuperar(descartar({}, n), "comp:d1"), n)).toBe(false);
  });

  it("no toca el mapa que recibe", () => {
    // Es estado de React. Cambiarlo en el sitio lo movería por debajo
    // y la campana no se enteraria de repintar.
    const antes = { "comp:d1": AYER };
    const copia = { ...antes };
    descartar(antes, noti("otra", HOY));
    recuperar(antes, "comp:d1");
    expect(antes).toEqual(copia);
  });

  it("cada cuenta tiene su caja en el navegador", () => {
    expect(claveDescartes("U1")).not.toBe(claveDescartes("U2"));
    guardarLocales("U1", { a: AYER });
    expect(leerLocales("U2")).toEqual({});
  });

  it("sin cuenta no truena", () => {
    expect(() => descartar(null, noti("x", AYER))).not.toThrow();
    expect(descartar(null, noti("x", AYER))).toHaveProperty("x");
    expect(() => recuperar(null, "x")).not.toThrow();
  });
});

// ── LO DE LA CUENTA Y LO DEL NAVEGADOR, JUNTOS (6 nov) ───────────
//
// Antes esto vivia solo en el navegador, asi que lo que quitabas en la
// computadora seguia saliendo en el telefono. Ahora va en la cuenta y
// las dos cajas se funden. Lo que se vigila aqui es que fundir no
// RESUCITE un aviso quitado ni TAPE uno nuevo.
describe("juntar lo de la cuenta con lo del navegador", () => {
  it("lo que solo esta en un lado, entra", () => {
    expect(fundir({ a: AYER }, { b: HOY })).toEqual({ a: AYER, b: HOY });
  });

  it("si esta en los dos, gana la fecha mas nueva", () => {
    // No gana «el perfil» ni «el navegador»: gana la respuesta mas
    // reciente, venga de donde venga.
    expect(fundir({ a: HOY }, { a: AYER })).toEqual({ a: HOY });
    expect(fundir({ a: AYER }, { a: HOY })).toEqual({ a: HOY });
  });

  it("asi lo que ya tenias guardado aqui sube solo", () => {
    // Es la migracion entera: no hay un paso aparte que pueda fallar
    // a medias y dejar a alguien con la campana llena otra vez.
    const local = { "comp:d1": AYER, "comp:d2": AYER };
    expect(fundir(local, undefined)).toEqual(local);
    expect(fundir(local, null)).toEqual(local);
  });

  it("y un aviso nuevo con la misma clave NO queda tapado al fundir", () => {
    const juntos = fundir({ "comp:d1": AYER }, { "comp:d1": AYER });
    expect(estaDescartada(juntos, noti("comp:d1", HOY))).toBe(false);
  });

  it("dos cajas vacias dan una vacia", () => {
    expect(fundir({}, {})).toEqual({});
    expect(fundir(null, null)).toEqual({});
  });

  it("al juntar tambien se respeta el tope", () => {
    const uno = {}, otro = {};
    for (let i = 0; i < TOPE; i++) uno[`a${i}`] = HOY;
    for (let i = 0; i < TOPE; i++) otro[`b${i}`] = AYER;
    expect(Object.keys(fundir(uno, otro))).toHaveLength(TOPE);
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

  it("quitar de mas no revienta la caja", () => {
    let m = {};
    for (let i = 0; i < TOPE + 20; i++) m = descartar(m, noti(`k${i}`, HOY));
    expect(Object.keys(m).length).toBeLessThanOrEqual(TOPE);
  });
});

describe("si el navegador no deja guardar", () => {
  it("lee vacio en vez de tronar", () => {
    globalThis.localStorage.getItem = () => "{esto no es json";
    expect(leerLocales("U1")).toEqual({});
    globalThis.localStorage.getItem = () => '["una","lista"]';
    expect(leerLocales("U1")).toEqual({});
  });

  it("si no puede escribir, sigue adelante", () => {
    // El bueno es el de la cuenta; esto solo evita el parpadeo.
    globalThis.localStorage.setItem = () => { throw new Error("sin sitio"); };
    expect(() => guardarLocales("U1", { x: HOY })).not.toThrow();
  });
});
