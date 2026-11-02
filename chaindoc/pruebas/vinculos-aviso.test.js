// Que la alerta de los vinculos diga la verdad.
//
// Hasta el 2 de noviembre decia SIEMPRE «la huella que se registro ya
// no corresponde con su historia actual», tambien cuando lo unico que
// pasaba era que no tenias acceso al documento de origen. A quien
// abria el contrato desde la otra cuenta le acusaba de tener evidencia
// alterada sin que nada hubiera cambiado.
//
// En un producto cuyo argumento entero es «si algo cambia, te
// enteras», una falsa alarma hace mas daño que no avisar: enseña a
// desconfiar del aviso. De ahi que esto tenga pruebas propias.
import { describe, it, expect } from "vitest";
import { explicarVinculos, estadoVinculo, resumenVinculos } from "../src/smartContract";

const r = (extra = {}) => ({ alterados: 0, faltantes: 0, ampliados: 0, vigentes: 0, ...extra });

describe("sin nada que reportar", () => {
  it("no hay alerta", () => {
    expect(explicarVinculos(r())).toBe(null);
    expect(explicarVinculos(r({ vigentes: 5, ampliados: 2 }))).toBe(null);
    expect(explicarVinculos(null)).toBe(null);
  });
});

describe("solo falta acceso", () => {
  const av = explicarVinculos(r({ faltantes: 4 }));

  it("lo cuenta sin acusar a nadie de alterar nada", () => {
    expect(av.titulo).toBe("4 sin acceso");
    expect(av.detalle).toMatch(/no tienes acceso/);
    expect(av.detalle).toMatch(/no quiere decir que hayan cambiado/);
  });

  it("y NO habla de huellas que no cuadran", () => {
    expect(av.detalle).not.toMatch(/huella/i);
    expect(av.detalle).not.toMatch(/no corresponde/i);
    expect(av.detalle).not.toMatch(/rehecha|reemplazada/i);
  });

  it("no es una alarma: es un permiso que falta", () => {
    expect(av.grave).toBe(false);
  });

  it("uno solo se dice en singular", () => {
    const uno = explicarVinculos(r({ faltantes: 1 }));
    expect(uno.titulo).toBe("1 sin acceso");
    expect(uno.detalle).toMatch(/Del otro no tienes acceso/);
    expect(uno.detalle).toMatch(/no quiere decir que haya cambiado/);
    expect(uno.detalle).not.toMatch(/hayan cambiado/);
  });
});

describe("algo alterado de verdad", () => {
  const av = explicarVinculos(r({ alterados: 1 }));

  it("eso si lo dice, y sin rodeos", () => {
    expect(av.titulo).toBe("1 comprobante que ya no coincide con su documento");
    expect(av.detalle).toMatch(/ya no es el documento que se adjunt/);
  });

  it("y si es una alarma", () => {
    expect(av.grave).toBe(true);
  });
});

describe("las dos cosas a la vez", () => {
  const av = explicarVinculos(r({ alterados: 2, faltantes: 3 }));

  it("se cuentan por separado", () => {
    expect(av.titulo).toBe("2 comprobantes que ya no coinciden con su documento · 3 sin acceso");
  });

  it("y cada una se explica por lo suyo", () => {
    expect(av.detalle).toMatch(/ya no son los documentos que se adjuntaron/);
    expect(av.detalle).toMatch(/no tienes acceso/);
  });

  it("habiendo algo alterado, es alarma", () => {
    expect(av.grave).toBe(true);
  });
});

describe("de donde sale «faltante»", () => {
  const adjunto = { origen: "interno", docId: "d1", hash: "aaa" };

  it("no poder leer el documento es «faltante», no «alterado»", () => {
    // Es exactamente lo que le pasaba a la segunda cuenta: store.get
    // devuelve null porque las reglas lo rechazan.
    const v = estadoVinculo(adjunto, null);
    expect(v.estado).toBe("faltante");
    expect(resumenVinculos({ a: v })).toMatchObject({ faltantes: 1, alterados: 0 });
  });

  it("un documento cuya historia ya no contiene la huella si es «alterado»", () => {
    const otro = { chain: [{ hash: "zzz" }] };
    expect(estadoVinculo(adjunto, otro).estado).toBe("alterado");
  });

  it("y si sigue en su historia, solo crecio", () => {
    const crecido = { chain: [{ hash: "aaa" }, { hash: "bbb", action: "FIRMA" }] };
    expect(estadoVinculo(adjunto, crecido).estado).toBe("ampliado");
  });
});
