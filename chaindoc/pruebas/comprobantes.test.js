// Las reglas de un recibo o una factura.
//
// El orden es llenar -> firmar -> compartir, y cada paso cierra el
// anterior. Si alguno se puede saltar, lo que acaba en el expediente
// de alguien es un papel en blanco con la autoridad de una prueba.
import { describe, it, expect } from "vitest";
import {
  esComprobante, faltanDatos, estaFirmado, sePuedeFirmar, puedeSalir,
  soloSuDueno, porQueNoSale, REQUERIDOS,
} from "../src/nucleo/comprobantes";

const recibo = (fields = {}, extra = {}) => ({
  id: "r1", tplId: "recibo", ownerUid: "U1", chain: [], fields, ...extra,
});
const LLENO = {
  fecha: "2026-11-03", recibiDe: "Constructora Solis", cantidad: "5000",
  concepto: "Compra de cemento", recibidoPor: "Pedro Ramirez",
};
const factura = (fields = {}, extra = {}) => ({
  id: "f1", tplId: "factura", ownerUid: "U1", chain: [], fields, ...extra,
});
const FACTURA_LLENA = {
  fecha: "2026-11-03", emisor: "Materiales del Bajio SA de CV",
  rfcEmisor: "MBA010101AA0", receptor: "Constructora Solis",
  rfcReceptor: "SOL960214GT0", concepto: "Cemento gris", total: "5800",
};
const firma = { action: "FIRMA", index: 1 };

describe("que es un comprobante", () => {
  it("recibos y facturas si; lo demas no", () => {
    expect(esComprobante(recibo())).toBe(true);
    expect(esComprobante(factura())).toBe(true);
    expect(esComprobante({ kind: "expediente" })).toBe(false);
    expect(esComprobante({ tplId: null })).toBe(false);
    expect(esComprobante(null)).toBe(false);
  });
});

describe("que le falta para poder firmarse", () => {
  it("vacio: falta todo lo obligatorio", () => {
    const f = faltanDatos(recibo());
    expect(f).toHaveLength(REQUERIDOS.recibo.length);
    expect(f.every((x) => x.motivo === "falta")).toBe(true);
  });

  it("lleno: no falta nada", () => {
    expect(faltanDatos(recibo(LLENO))).toEqual([]);
    expect(sePuedeFirmar(recibo(LLENO))).toBe(true);
  });

  it("a medias NO se puede firmar", () => {
    // La otra mitad de la regla: que diga «si» cuando esta lleno no
    // sirve de nada si tambien dice «si» cuando esta vacio.
    expect(sePuedeFirmar(recibo())).toBe(false);
    expect(sePuedeFirmar(recibo({ ...LLENO, cantidad: "" }))).toBe(false);
    expect(sePuedeFirmar(factura({ ...FACTURA_LLENA, rfcEmisor: "NO-ES-RFC" }))).toBe(false);
  });

  it("un campo en blancos no cuenta como lleno", () => {
    expect(faltanDatos(recibo({ ...LLENO, concepto: "   " }))
      .map((x) => x.k)).toEqual(["concepto"]);
  });

  it("devuelve la etiqueta que se ve en pantalla, no la clave", () => {
    // Quien lee esto tiene que poder ir y llenarlo.
    const f = faltanDatos(recibo({ ...LLENO, recibiDe: "" }));
    expect(f[0].etiqueta).toBe("Recibí de");
  });

  it("lo que NO es obligatorio no estorba", () => {
    // Un recibo sin folio, sin cantidad con letra y sin forma de pago
    // sigue siendo un recibo.
    expect(faltanDatos(recibo(LLENO))).toEqual([]);
    expect(REQUERIDOS.recibo).not.toContain("folio");
    expect(REQUERIDOS.recibo).not.toContain("cantidadTxt");
  });

  it("lo que no es comprobante no exige nada", () => {
    expect(faltanDatos({ kind: "documento" })).toEqual([]);
    expect(sePuedeFirmar({ kind: "documento" })).toBe(true);
  });
});

describe("los RFC de una factura", () => {
  it("llena y con RFC validos: lista", () => {
    expect(faltanDatos(factura(FACTURA_LLENA))).toEqual([]);
  });

  it("un RFC mal escrito es peor que uno vacio: parece que esta", () => {
    const f = faltanDatos(factura({ ...FACTURA_LLENA, rfcEmisor: "ESTO-NO-ES" }));
    expect(f).toHaveLength(1);
    expect(f[0].k).toBe("rfcEmisor");
    expect(f[0].motivo).toBe("invalido");
  });

  it("y uno vacio se distingue de uno invalido", () => {
    const f = faltanDatos(factura({ ...FACTURA_LLENA, rfcReceptor: "" }));
    expect(f[0].motivo).toBe("falta");
  });
});

describe("firmar y salir", () => {
  it("sin firma no sale: ni a un contrato ni compartido", () => {
    expect(puedeSalir(recibo(LLENO))).toBe(false);
  });

  it("firmado si sale", () => {
    expect(estaFirmado(recibo(LLENO, { chain: [firma] }))).toBe(true);
    expect(puedeSalir(recibo(LLENO, { chain: [firma] }))).toBe(true);
  });

  it("lo que no es comprobante sale siempre", () => {
    // Un documento de texto se comparte sin firmar; esta regla es de
    // los papeles que se usan como prueba.
    expect(puedeSalir({ kind: "documento", chain: [] })).toBe(true);
  });

  it("otros bloques no cuentan como firma", () => {
    const c = recibo(LLENO, { chain: [{ action: "EDICIÓN" }, { action: "EVIDENCIA" }] });
    expect(estaFirmado(c)).toBe(false);
    expect(puedeSalir(c)).toBe(false);
  });
});

describe("quien puede editarlo", () => {
  it("su dueno si", () => {
    expect(soloSuDueno(recibo(LLENO), "U1")).toBe(true);
  });

  it("nadie mas, por mucho acceso que tenga", () => {
    // Este es el caso real: alguien entra al contrato, abre el recibo
    // que le adjuntaron y puede cambiarle el monto. La firma de abajo
    // ampararia algo que su firmante no escribio.
    expect(soloSuDueno(recibo(LLENO), "U2")).toBe(false);
    expect(soloSuDueno(recibo(LLENO), null)).toBe(false);
  });

  it("un documento de texto se sigue editando entre varios", () => {
    expect(soloSuDueno({ kind: "documento", ownerUid: "U1" }, "U2")).toBe(true);
  });

  it("sin ownerUid vale el correo: los primeros recibos no lo traen", () => {
    // Si no, su propio dueño se quedaria sin poder editarlos.
    const viejo = { tplId: "recibo", ownerEmail: "Rg@X.mx", chain: [], fields: LLENO };
    expect(soloSuDueno(viejo, null, "rg@x.mx")).toBe(true);
    expect(soloSuDueno(viejo, "U9", "otro@x.mx")).toBe(false);
  });

  it("dos huecos no son la misma persona", () => {
    // undefined === undefined seria «si» y abriria el documento a
    // cualquiera que todavia no haya terminado de identificarse.
    expect(soloSuDueno({ tplId: "recibo", chain: [], fields: LLENO }, undefined)).toBe(false);
    expect(soloSuDueno({ tplId: "recibo", chain: [], fields: LLENO }, null, null)).toBe(false);
    expect(soloSuDueno({ tplId: "recibo", ownerUid: "", chain: [] }, "")).toBe(false);
  });
});

describe("lo que se le dice al usuario", () => {
  it("si falta llenarlo, dice QUE falta", () => {
    const m = porQueNoSale(recibo({ ...LLENO, cantidad: "", recibidoPor: "" }));
    expect(m).toMatch(/no está firmado/);
    expect(m).toMatch(/cantidad/);
    expect(m).toMatch(/recibido por/);
  });

  it("si solo falta firmar, lo dice y ya", () => {
    const m = porQueNoSale(recibo(LLENO));
    expect(m).toMatch(/Fírmalo/);
    expect(m).not.toMatch(/llenar/);
  });

  it("una factura se llama factura", () => {
    expect(porQueNoSale(factura(FACTURA_LLENA))).toMatch(/^La factura/);
    expect(porQueNoSale(recibo(LLENO))).toMatch(/^El recibo/);
  });

  it("si ya se puede, no hay nada que explicar", () => {
    expect(porQueNoSale(recibo(LLENO, { chain: [firma] }))).toBe(null);
    expect(porQueNoSale({ kind: "documento" })).toBe(null);
  });
});
