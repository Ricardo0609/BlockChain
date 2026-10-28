// Los enlaces de entrega, leidos de la cadena.
//
// Un enlace reparte acceso a alguien que no tiene cuenta, asi que es
// acceso concedido igual que compartirle a una persona — y hasta ahora
// era lo unico que no salia en la pestaña de «Con acceso». Lo que se
// cuida aqui es que el rastro no mienta: que un enlace retirado no
// cuente como acceso, que uno vencido tampoco, y que quien aparece
// como responsable sea quien de verdad lo compartio.
import { describe, it, expect } from "vitest";
import {
  enlacesCompartidos, enlacesVivos, ESTADO_ENLACE,
} from "../src/nucleo/enlacesCompartidos";

const HOY = new Date("2026-10-28T12:00:00Z");
const dias = (n) => new Date(HOY.getTime() + n * 86400000).toISOString();

const alta = (i, huella, extra = {}) => ({
  index: i, action: "SOLICITUD", author: "Ricardo Cabrera", autorUid: "U1",
  timestamp: dias(-1), content: "Enlace de entrega para 6 comprobantes",
  meta: { tipo: "invitacion", huella, correo: "pepe@obra.mx",
          expiraEn: dias(7), requisitos: ["r1","r2","r3","r4","r5","r6"], ...extra },
});
const baja = (i, huella) => ({
  index: i, action: "SOLICITUD", author: "Ricardo Cabrera", timestamp: dias(0),
  content: "Enlace de entrega retirado", meta: { tipo: "invitacion-baja", huella },
});

describe("leer los enlaces de la cadena", () => {
  it("un enlace recien creado esta vigente y lleva quien lo compartio", () => {
    const l = enlacesCompartidos([alta(1, "aaa")], { hoy: HOY });
    expect(l).toHaveLength(1);
    expect(l[0].creadoPor).toBe("Ricardo Cabrera");
    expect(l[0].correo).toBe("pepe@obra.mx");
    expect(l[0].requisitos).toBe(6);
    expect(l[0].estado).toBe("vigente");
  });

  it("retirado deja de dar acceso pero NO desaparece", () => {
    // El rastro es el motivo de que esto exista: esconder el enlace
    // retirado seria perder justo lo que se queria registrar.
    const l = enlacesCompartidos([alta(1, "aaa"), baja(2, "aaa")], { hoy: HOY });
    expect(l).toHaveLength(1);
    expect(l[0].estado).toBe("retirado");
    expect(enlacesVivos([alta(1, "aaa"), baja(2, "aaa")], { hoy: HOY })).toEqual([]);
  });

  it("una baja solo alcanza a SU enlace", () => {
    const l = enlacesCompartidos([alta(1, "aaa"), alta(2, "bbb"), baja(3, "aaa")], { hoy: HOY });
    expect(l.map((x) => [x.huella, x.estado]).sort())
      .toEqual([["aaa", "retirado"], ["bbb", "vigente"]]);
  });

  it("vencido por fecha, sin que nadie lo retire", () => {
    const l = enlacesCompartidos([alta(1, "aaa", { expiraEn: dias(-1) })], { hoy: HOY });
    expect(l[0].estado).toBe("vencido");
    expect(enlacesVivos([alta(1, "aaa", { expiraEn: dias(-1) })], { hoy: HOY })).toEqual([]);
  });

  it("retirado manda sobre vencido: dice lo que paso, no lo que caduco", () => {
    const c = [alta(1, "aaa", { expiraEn: dias(-1) }), baja(2, "aaa")];
    expect(enlacesCompartidos(c, { hoy: HOY })[0].estado).toBe("retirado");
  });

  it("sin fecha de vencimiento no se da por vencido", () => {
    const l = enlacesCompartidos([alta(1, "aaa", { expiraEn: null })], { hoy: HOY });
    expect(l[0].estado).toBe("vigente");
  });

  it("del mas nuevo al mas viejo", () => {
    const a = alta(1, "aaa"); a.timestamp = dias(-5);
    const b = alta(2, "bbb"); b.timestamp = dias(-1);
    expect(enlacesCompartidos([a, b], { hoy: HOY }).map((x) => x.huella))
      .toEqual(["bbb", "aaa"]);
  });
});

describe("lo que no es un enlace", () => {
  it("los demas bloques no entran", () => {
    const otros = [
      { index: 1, action: "EVIDENCIA", author: "Ana", timestamp: dias(-1), meta: { tipo: "alta" } },
      { index: 2, action: "COMPARTIDO", author: "Ana", timestamp: dias(-1) },
      { index: 3, action: "SOLICITUD", author: "Ana", timestamp: dias(-1), meta: { tipo: "otra-cosa" } },
      { index: 4, action: "SOLICITUD", author: "Ana", timestamp: dias(-1) },
    ];
    expect(enlacesCompartidos(otros, { hoy: HOY })).toEqual([]);
  });

  it("manda la ACCION del bloque, no solo lo que diga su meta", () => {
    // Un bloque que no es una SOLICITUD no reparte ningun enlace, por
    // mucho que su meta diga «invitacion». Si bastara con el meta, una
    // accion cualquiera podria inventarse un acceso en esta lista — o,
    // peor, retirar uno de verdad.
    const falso = { index: 1, action: "EVIDENCIA", author: "Ana", timestamp: dias(-1),
                    meta: { tipo: "invitacion", huella: "xxx", expiraEn: dias(7) } };
    expect(enlacesCompartidos([falso], { hoy: HOY })).toEqual([]);

    const bajaFalsa = { index: 3, action: "EVIDENCIA", author: "Ana", timestamp: dias(0),
                        meta: { tipo: "invitacion-baja", huella: "aaa" } };
    const l = enlacesCompartidos([alta(1, "aaa"), bajaFalsa], { hoy: HOY });
    expect(l[0].estado).toBe("vigente");
  });

  it("una cadena vacia o ausente no revienta", () => {
    expect(enlacesCompartidos([], { hoy: HOY })).toEqual([]);
    expect(enlacesCompartidos(null, { hoy: HOY })).toEqual([]);
    expect(enlacesCompartidos(undefined)).toEqual([]);
  });
});

describe("los bloques viejos, sin huella", () => {
  it("se enseñan igual, cada uno por su cuenta", () => {
    // Antes de que la huella viajara en el bloque. Siguen siendo parte
    // del rastro; lo unico que no se puede es emparejarles una baja.
    const a = alta(1, null); const b = alta(2, null);
    const l = enlacesCompartidos([a, b], { hoy: HOY });
    expect(l).toHaveLength(2);
    expect(l[0].huella).toBe(null);
  });

  it("y no se los lleva por delante la baja de otro", () => {
    const l = enlacesCompartidos([alta(1, null), baja(2, "aaa")], { hoy: HOY });
    expect(l[0].estado).toBe("vigente");
  });
});

describe("como se lee en pantalla", () => {
  it("cada estado dice lo que paso, empezando por compartir", () => {
    for (const [estado, texto] of Object.entries(ESTADO_ENLACE)) {
      expect(texto.startsWith("Compartió un enlace"), estado).toBe(true);
    }
    expect(ESTADO_ENLACE.vigente).toBe("Compartió un enlace");
    expect(ESTADO_ENLACE.retirado).toMatch(/retirado/);
    expect(ESTADO_ENLACE.vencido).toMatch(/vencido/);
  });
});
