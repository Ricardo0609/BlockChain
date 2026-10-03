// Enlaces de invitación: entregar sin tener cuenta.
//
// Es la pieza que reparte acceso sin sesión, así que estas pruebas
// cuidan sobre todo lo que NO debe poder hacerse con un enlace.
import { describe, it, expect } from "vitest";
import {
  nuevoTestigo, huellaDe, mismaHuella, armarInvitacion, revisarInvitacion,
  vistaPublica, autorDeInvitacion, rutaTemporal, rutaValidaDeInvitacion, cubre,
  MOTIVOS, DIAS_POR_OMISION, LIMITE_DIAS, MAX_ARCHIVOS,
} from "../functions/lib/invitaciones.js";

const AHORA = Date.parse("2026-09-27T12:00:00.000Z");
const dia = 86400000;

describe("el testigo", () => {
  it("nunca se repite", () => {
    const vistos = new Set(Array.from({ length: 200 }, () => nuevoTestigo()));
    expect(vistos.size).toBe(200);
  });

  it("es lo bastante largo para no adivinarse", () => {
    expect(nuevoTestigo().length).toBeGreaterThanOrEqual(40);
  });

  it("sirve en una dirección web sin escaparse", () => {
    const t = nuevoTestigo();
    expect(encodeURIComponent(t)).toBe(t);
  });

  it("su huella es estable y distinta para testigos distintos", () => {
    const t = nuevoTestigo();
    expect(huellaDe(t)).toBe(huellaDe(t));
    expect(huellaDe(t)).not.toBe(huellaDe(nuevoTestigo()));
    expect(huellaDe(t)).toHaveLength(64);
  });

  it("compara huellas sin filtrar por el tiempo de respuesta", () => {
    const h = huellaDe("abc");
    expect(mismaHuella(h, h)).toBe(true);
    expect(mismaHuella(h, huellaDe("abd"))).toBe(false);
    expect(mismaHuella(h, "corto")).toBe(false);
    expect(mismaHuella(null, null)).toBe(true);
  });
});

describe("crear la invitación", () => {
  const base = { opId: "op1", reqIds: ["r1", "r2"],
                 correo: " Luis@X.com ", creadaPor: "Ricardo", creadaPorUid: "U1", ahora: AHORA };

  it("guarda la huella, nunca el testigo", () => {
    const { testigo, registro } = armarInvitacion(base);
    expect(registro.huella).toBe(huellaDe(testigo));
    expect(JSON.stringify(registro)).not.toContain(testigo);
  });

  it("caduca a los siete días si no se dice otra cosa", () => {
    const { registro } = armarInvitacion(base);
    expect(Date.parse(registro.expiraEn) - AHORA).toBe(DIAS_POR_OMISION * dia);
  });

  it("respeta el plazo que se le pida, dentro de un tope", () => {
    expect(Date.parse(armarInvitacion({ ...base, dias: 2 }).registro.expiraEn) - AHORA).toBe(2 * dia);
    expect(Date.parse(armarInvitacion({ ...base, dias: 9999 }).registro.expiraEn) - AHORA)
      .toBe(LIMITE_DIAS * dia);
    expect(Date.parse(armarInvitacion({ ...base, dias: 0 }).registro.expiraEn) - AHORA)
      .toBe(DIAS_POR_OMISION * dia);
  });

  it("admite varios archivos, porque un proveedor debe varias facturas", () => {
    expect(armarInvitacion(base).registro.maxArchivos).toBe(MAX_ARCHIVOS);
    expect(armarInvitacion({ ...base, maxArchivos: 3 }).registro.maxArchivos).toBe(3);
    expect(armarInvitacion({ ...base, maxArchivos: 99999 }).registro.maxArchivos).toBe(MAX_ARCHIVOS);
    expect(armarInvitacion({ ...base, maxArchivos: -3 }).registro.maxArchivos).toBe(1);
  });

  it("cubre varios requisitos con un solo enlace", () => {
    const { registro } = armarInvitacion(base);
    expect(registro.reqIds).toEqual(["r1", "r2"]);
    expect(cubre(registro, "r1")).toBe(true);
    expect(cubre(registro, "r2")).toBe(true);
    expect(cubre(registro, "r9")).toBe(false);
    expect(cubre(registro, null)).toBe(false);
  });

  it("quita repetidos y acepta un requisito suelto", () => {
    expect(armarInvitacion({ ...base, reqIds: ["r1", "r1", "r2"] }).registro.reqIds)
      .toEqual(["r1", "r2"]);
    expect(armarInvitacion({ ...base, reqIds: "r1" }).registro.reqIds).toEqual(["r1"]);
  });

  it("sin requisitos no se crea: un enlace que no cubre nada no sirve", () => {
    expect(() => armarInvitacion({ ...base, reqIds: [] })).toThrow();
    expect(() => armarInvitacion({ ...base, reqIds: [null, ""] })).toThrow();
  });

  it("normaliza el correo", () => {
    expect(armarInvitacion(base).registro.correo).toBe("luis@x.com");
    expect(armarInvitacion({ ...base, correo: "" }).registro.correo).toBeNull();
  });

  it("queda atada a una sola operación", () => {
    expect(armarInvitacion(base).registro.opId).toBe("op1");
  });
});

describe("cuándo se puede usar", () => {
  const { registro } = armarInvitacion({ opId: "op1", reqIds: ["r1"], ahora: AHORA });

  it("recién creada, sí", () => {
    expect(revisarInvitacion(registro, AHORA)).toEqual({ ok: true });
  });

  it("después de su fecha, no", () => {
    const r = revisarInvitacion(registro, AHORA + 8 * dia);
    expect(r).toMatchObject({ ok: false, motivo: "vencida" });
  });

  it("justo en el límite todavía sirve", () => {
    expect(revisarInvitacion(registro, AHORA + 7 * dia - 1000).ok).toBe(true);
  });

  it("revocada, no; y no importa que aún no venza", () => {
    expect(revisarInvitacion({ ...registro, revocada: true }, AHORA).motivo).toBe("revocada");
  });

  it("al llegar al tope de archivos deja de servir", () => {
    expect(revisarInvitacion({ ...registro, entregas: MAX_ARCHIVOS }, AHORA).motivo).toBe("agotada");
    expect(revisarInvitacion({ ...registro, maxArchivos: 3, entregas: 2 }, AHORA).ok).toBe(true);
    expect(revisarInvitacion({ ...registro, maxArchivos: 3, entregas: 3 }, AHORA).motivo).toBe("agotada");
  });

  it("un enlace inventado no existe", () => {
    expect(revisarInvitacion(null).motivo).toBe("no-existe");
    expect(revisarInvitacion(undefined).motivo).toBe("no-existe");
  });

  it("cada motivo tiene una explicación que se le puede enseñar a alguien", () => {
    for(const m of ["no-existe", "revocada", "vencida", "agotada"]){
      expect(MOTIVOS[m]).toBeTruthy();
      expect(MOTIVOS[m].length).toBeGreaterThan(20);
    }
  });
});

describe("lo que ve quien abre el enlace", () => {
  const { registro } = armarInvitacion({
    opId: "op1", reqIds: ["r1", "r3"],
    correo: "luis@x.com", creadaPor: "Ricardo García", ahora: AHORA });
  const op = {
    title: "Barda de concreto", montoTotal: 20000, content: "CONTRATO CONFIDENCIAL...",
    partes: [{ nombre: "Ana Solís" }],
    fases: [{ id: "f1", titulo: "Anticipo secreto" }],
    chain: [{ action: "FIRMA", author: "Ana Solís" }],
    requisitos: [
      { id: "r1", titulo: "Factura de cemento", descripcion: "Del proveedor", tipo: "comprobante",
        monto: 15000, archivos: [] },
      { id: "r2", titulo: "Acta secreta", descripcion: "No debe verse", monto: 5000 },
      { id: "r3", titulo: "Factura de grava", descripcion: "Con el desglose", monto: 3000,
        archivos: [{ aid: "a1", nombre: "grava.pdf" }] },
    ],
  };

  const v = vistaPublica(registro, op);

  it("ve la lista de lo que le toca, con un solo enlace", () => {
    expect(v.requisitos).toHaveLength(2);
    expect(v.requisitos.map((r) => r.titulo))
      .toEqual(["Factura de cemento", "Factura de grava"]);
    expect(v.pedidoPor).toBe("Ricardo García");
    expect(v.documento).toBe("Barda de concreto");
  });

  it("sabe qué ya entregó y qué le falta", () => {
    expect(v.requisitos.find((r) => r.id === "r1").entregado).toBe(false);
    expect(v.requisitos.find((r) => r.id === "r3").entregado).toBe(true);
  });

  it("NO ve los requisitos que no le tocan", () => {
    expect(JSON.stringify(v)).not.toContain("Acta secreta");
  });

  it("NO ve el contrato, los montos, las partes, las fases ni la cadena", () => {
    const texto = JSON.stringify(v);
    expect(texto).not.toContain("CONTRATO CONFIDENCIAL");
    expect(texto).not.toContain("Ana Solís");
    expect(texto).not.toContain("Anticipo secreto");
    expect(texto).not.toContain("15000");
    expect(texto).not.toContain("20000");
    expect(texto).not.toContain("FIRMA");
  });

  it("tampoco ve los archivos que ya subieron otros, sólo que hay algo", () => {
    expect(JSON.stringify(v)).not.toContain("grava.pdf");
  });

  it("sabe cuándo vence y cuántos archivos le quedan", () => {
    expect(v.expiraEn).toBe(registro.expiraEn);
    expect(v.archivosRestantes).toBe(MAX_ARCHIVOS);
    expect(vistaPublica({ ...registro, entregas: 18 }, op).archivosRestantes).toBe(2);
  });
});

describe("cómo queda firmado en la cadena", () => {
  it("dice que vino por invitación, no que lo firmó una persona", () => {
    const { registro } = armarInvitacion({ opId: "o", reqIds: ["r"], correo: "luis@x.com" });
    const autor = autorDeInvitacion(registro);
    expect(autor).toMatch(/invitación/i);
    expect(autor).toContain("luis@x.com");
    expect(autor).not.toMatch(/firmado/i);
  });

  it("sin correo, tampoco inventa un nombre", () => {
    expect(autorDeInvitacion({})).toBe("Entrega por invitación");
  });
});

describe("dónde deja el archivo el invitado", () => {
  it("cada invitación tiene su propia carpeta", () => {
    expect(rutaTemporal("anon1", "abc123", "factura.pdf"))
      .toBe("invitaciones/anon1/abc123/factura.pdf");
  });

  it("un nombre de archivo raro no se sale de su carpeta", () => {
    const r = rutaTemporal("anon1", "abc123", "../../otro/../evidencias/robo.pdf");
    expect(r.startsWith("invitaciones/anon1/abc123/")).toBe(true);
    expect(r).not.toContain("..");
  });

  it("sólo se acepta la ruta que le toca", () => {
    expect(rutaValidaDeInvitacion("invitaciones/anon1/abc/f.pdf", "anon1", "abc")).toBe(true);
    expect(rutaValidaDeInvitacion("invitaciones/otro/abc/f.pdf", "anon1", "abc")).toBe(false);
    expect(rutaValidaDeInvitacion("invitaciones/anon1/otra/f.pdf", "anon1", "abc")).toBe(false);
    expect(rutaValidaDeInvitacion("evidencias/anon1/abc/f.pdf", "anon1", "abc")).toBe(false);
    expect(rutaValidaDeInvitacion("invitaciones/anon1/abc/../../../f.pdf", "anon1", "abc")).toBe(false);
    expect(rutaValidaDeInvitacion(null, "anon1", "abc")).toBe(false);
  });
});