// La campana: lo que OTRA GENTE hizo contigo.
//
// Lo que esto protege son dos reglas que es facil romper sin notarlo:
//
//   1. un PENDIENTE no se apaga por mirarlo. Abrir el contrato y salir
//      sin decidir no es haberlo firmado.
//   2. un AVISO si se apaga al abrir el documento, y eso sale de la
//      cadena (el bloque CONSULTA), no de una tabla de leidos.
import { describe, it, expect } from "vitest";
import {
  cuantas, cuantasPendientes, ICONO, notificacionesDe, ultimaConsulta,
} from "../src/nucleo/notificaciones.js";

const YO = { uid: "U2", email: "ana@x.com" };
// Relativas a hoy a proposito: un contrato mandado hace mas de 14 dias
// ya no espera firma, lo da por no contestado. Con fechas fijas estas
// pruebas se habrian puesto verdes hoy y rojas dentro de dos semanas.
const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
const ANTES = dias(3);
const DESPUES = dias(1);
const HOY = dias(0);

const consulta = (uid, timestamp) => ({ action: "CONSULTA", meta: { uid }, timestamp });
const compartido = (correo, timestamp, author = "Ricardo") =>
  ({ action: "COMPARTIDO", author, timestamp, meta: { tipo: "alta", correo } });

/** Un documento que Ricardo le compartio a Ana. */
const doc = (extra = {}) => ({
  id: "d1", title: "Acta de entrega", kind: "documento",
  owner: "Ricardo", ownerUid: "U1", ownerEmail: "ricardo@x.com",
  sharedWith: ["ana@x.com"], roles: { "ana@x.com": "lector" },
  chain: [compartido("ana@x.com", ANTES)],
  ...extra,
});

/** Un contrato que Ricardo mando a firmar a Ana. */
const contrato = (extra = {}) => ({
  ...doc(), id: "c1", title: "Remodelacion", kind: "expediente",
  requisitos: [{ id: "r1", titulo: "Factura del albanil" }],
  roles: { "ana@x.com": "involucrado" },
  acuerdo: {
    pedidoEn: ANTES, paraEmail: "ana@x.com",
    firmas: [{ parte: "emisor", momento: "aceptacion", email: "ricardo@x.com", fecha: ANTES }],
  },
  ...extra,
});

const tipos = (lista) => lista.map((n) => n.tipo);

describe("te compartieron algo", () => {
  it("aparece mientras no lo hayas abierto", () => {
    const n = notificacionesDe([doc()], YO);
    expect(tipos(n)).toEqual(["compartido"]);
    expect(n[0].texto).toContain("Ricardo te compartió");
    expect(n[0].texto).toContain("Acta de entrega");
    expect(n[0].docId).toBe("d1");
  });

  it("y se apaga en cuanto lo abres", () => {
    const d = doc({ chain: [compartido("ana@x.com", ANTES), consulta("U2", DESPUES)] });
    expect(notificacionesDe([d], YO)).toEqual([]);
  });

  it("la consulta de OTRO no te lo apaga a ti", () => {
    const d = doc({ chain: [compartido("ana@x.com", ANTES), consulta("U9", DESPUES)] });
    expect(tipos(notificacionesDe([d], YO))).toEqual(["compartido"]);
  });

  it("si te lo vuelven a compartir despues de que lo viste, vuelve", () => {
    const d = doc({ chain: [
      compartido("ana@x.com", ANTES), consulta("U2", "2026-10-03T10:00:00.000Z"),
      compartido("ana@x.com", DESPUES),
    ] });
    expect(tipos(notificacionesDe([d], YO))).toEqual(["compartido"]);
  });

  it("al dueño no se le avisa de su propio documento", () => {
    expect(notificacionesDe([doc()], { uid: "U1", email: "ricardo@x.com" })).toEqual([]);
  });

  it("a quien no tiene acceso no le llega nada", () => {
    expect(notificacionesDe([doc()], { uid: "U9", email: "otro@x.com" })).toEqual([]);
  });

  // Una baja en la cadena no contesta «quien te lo dio y cuando»: se
  // salta. Si se dejara como respuesta, la notificacion se quedaria
  // sin fecha y no se apagaria nunca.
  it("una baja por medio no le roba la fecha al aviso", () => {
    const d = doc({
      chain: [
        compartido("ana@x.com", ANTES),
        { action: "COMPARTIDO", timestamp: DESPUES, meta: { tipo: "baja", correo: "ana@x.com" } },
      ],
    });
    expect(notificacionesDe([d], YO)[0].fecha).toBe(ANTES);
    // y por tanto se apaga en cuanto lo abres, como cualquier aviso
    d.chain = [...d.chain, consulta("U2", HOY)];
    expect(notificacionesDe([d], YO)).toEqual([]);
  });

  it("si te retiraron el acceso, no se avisa de uno viejo", () => {
    const d = doc({
      sharedWith: [], roles: {},
      chain: [compartido("ana@x.com", ANTES),
              { action: "COMPARTIDO", timestamp: DESPUES, meta: { tipo: "baja", correo: "ana@x.com" } }],
    });
    expect(notificacionesDe([d], YO)).toEqual([]);
  });
});

// ── LA REGLA QUE IMPORTA ─────────────────────────────────────────
describe("un pendiente no se apaga por mirarlo", () => {
  it("un contrato para firmar te avisa", () => {
    const n = notificacionesDe([contrato()], YO);
    expect(tipos(n)).toEqual(["para-firmar"]);
    expect(n[0].pendiente).toBe(true);
  });

  it("y SIGUE avisando aunque lo hayas abierto y salido sin decidir", () => {
    const c = contrato();
    c.chain = [...c.chain, consulta("U2", DESPUES)];
    expect(tipos(notificacionesDe([c], YO))).toEqual(["para-firmar"]);
  });

  it("se apaga cuando decides, no antes", () => {
    const c = contrato();
    c.acuerdo.firmas.push(
      { parte: "receptor", momento: "aceptacion", email: "ana@x.com", fecha: DESPUES });
    expect(notificacionesDe([c], YO)).toEqual([]);
  });

  it("rechazarlo tambien lo apaga para quien rechazo", () => {
    const c = contrato();
    c.acuerdo.rechazo = { motivo: "El importe no es el que acordamos", fecha: DESPUES, porNombre: "Ana" };
    expect(notificacionesDe([c], YO)).toEqual([]);
  });

  it("un comprobante pedido no se apaga por abrir el expediente", () => {
    const c = contrato({
      acuerdo: undefined,
      solicitudes: [{ sid: "s1", reqId: "r1", paraEmail: "ana@x.com", estado: "pendiente", pedidaEn: ANTES }],
    });
    c.chain = [...c.chain, consulta("U2", DESPUES)];
    const n = notificacionesDe([c], YO);
    expect(tipos(n)).toEqual(["comprobante"]);
    expect(n[0].texto).toContain("Factura del albanil");
  });

  it("y si se apaga cuando se cumple", () => {
    const c = contrato({
      acuerdo: undefined,
      solicitudes: [{ sid: "s1", reqId: "r1", paraEmail: "ana@x.com", estado: "cumplida" }],
    });
    c.chain = [...c.chain, consulta("U2", HOY)];
    expect(notificacionesDe([c], YO)).toEqual([]);
  });

  it("lo que le pidieron a otro no es asunto tuyo", () => {
    const c = contrato({
      acuerdo: undefined,
      solicitudes: [{ sid: "s1", reqId: "r1", paraEmail: "luis@x.com", estado: "pendiente" }],
    });
    c.chain = [...c.chain, consulta("U2", HOY)];
    expect(notificacionesDe([c], YO)).toEqual([]);
  });
});

describe("lo que le pasa a TU contrato", () => {
  const DUENO = { uid: "U1", email: "ricardo@x.com" };

  it("te avisan si no lo aceptaron, con el motivo", () => {
    const c = contrato();
    c.acuerdo.rechazo = { motivo: "El importe no es el que acordamos", fecha: DESPUES, porNombre: "Ana" };
    const n = notificacionesDe([c], DUENO);
    expect(tipos(n)).toEqual(["rechazado"]);
    expect(n[0].grave).toBe(true);
    expect(n[0].texto).toContain("Ana no aceptó");
    expect(n[0].texto).toContain("El importe no es el que acordamos");
  });

  it("y si lo aceptaron, tambien", () => {
    const c = contrato();
    c.acuerdo.firmas.push(
      { parte: "receptor", momento: "aceptacion", nombre: "Ana Solis", fecha: DESPUES });
    const n = notificacionesDe([c], DUENO);
    expect(tipos(n)).toEqual(["aceptado"]);
    expect(n[0].texto).toContain("Ana Solis aceptó");
  });

  it("los dos se apagan al abrir el contrato", () => {
    const c = contrato();
    c.acuerdo.rechazo = { motivo: "La fecha no me funciona", fecha: DESPUES, porNombre: "Ana" };
    c.chain = [...c.chain, consulta("U1", HOY)];
    expect(notificacionesDe([c], DUENO)).toEqual([]);
  });

  it("al que rechazo no se le recuerda que rechazo", () => {
    const c = contrato();
    c.acuerdo.rechazo = { motivo: "La fecha no me funciona", fecha: DESPUES, porNombre: "Ana" };
    expect(notificacionesDe([c], YO)).toEqual([]);
  });

  it("un contrato en borrador no avisa de nada", () => {
    expect(notificacionesDe([contrato({ acuerdo: { paraEmail: "ana@x.com" } })], DUENO)).toEqual([]);
  });
});

describe("la lista", () => {
  it("lo mas reciente va arriba", () => {
    const a = doc({ id: "a", chain: [compartido("ana@x.com", ANTES)] });
    const b = doc({ id: "b", chain: [compartido("ana@x.com", DESPUES)] });
    expect(notificacionesDe([a, b], YO).map((n) => n.docId)).toEqual(["b", "a"]);
  });

  it("cada una trae clave distinta, para poder pintarlas", () => {
    const c = contrato({
      solicitudes: [{ sid: "s1", reqId: "r1", paraEmail: "ana@x.com", estado: "pendiente" }],
    });
    const n = notificacionesDe([c, doc()], YO);
    expect(new Set(n.map((x) => x.clave)).size).toBe(n.length);
    expect(n.length).toBeGreaterThan(1);
  });

  it("cuenta el total y aparte lo que te toca hacer", () => {
    const c = contrato();
    const n = notificacionesDe([c, doc()], YO);
    expect(cuantas(n)).toBe(n.length);
    expect(cuantasPendientes(n)).toBe(1);
    expect(n.filter((x) => !x.pendiente).length).toBe(cuantas(n) - 1);
  });

  it("sin documentos, ni sin quien, no truena", () => {
    expect(notificacionesDe([], YO)).toEqual([]);
    expect(notificacionesDe(null, YO)).toEqual([]);
    expect(notificacionesDe([doc()], {})).toEqual([]);
    expect(notificacionesDe([null, { sinId: 1 }], YO)).toEqual([]);
  });

  it("todo tipo que se produzca tiene icono", () => {
    const c = contrato({
      solicitudes: [{ sid: "s1", reqId: "r1", paraEmail: "ana@x.com", estado: "pendiente" }],
    });
    const d = contrato();
    d.acuerdo.rechazo = { motivo: "x", fecha: DESPUES };
    const e = contrato();
    e.acuerdo.firmas.push({ parte: "receptor", momento: "aceptacion", fecha: DESPUES });
    const todas = [
      ...notificacionesDe([c, doc()], YO),
      ...notificacionesDe([d, e], { uid: "U1", email: "ricardo@x.com" }),
    ];
    expect(todas.length).toBeGreaterThanOrEqual(4);
    for (const n of todas) expect(ICONO[n.tipo], n.tipo).toBeTruthy();
  });
});

describe("la ultima vez que lo abriste", () => {
  it("sale de la cadena y se queda con la mas nueva", () => {
    const d = doc({ chain: [consulta("U2", ANTES), consulta("U2", DESPUES), consulta("U9", "2026-11-01")] });
    expect(ultimaConsulta(d, "U2")).toBe(DESPUES);
  });

  it("null si nunca entraste", () => {
    expect(ultimaConsulta(doc(), "U2")).toBe(null);
    expect(ultimaConsulta({}, "U2")).toBe(null);
  });
});
