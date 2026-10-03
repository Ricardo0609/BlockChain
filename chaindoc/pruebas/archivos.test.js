// Reglas con que el servidor acomoda los comprobantes en los requisitos.
import { describe, it, expect } from "vitest";
import {
  archivosDe, aidDe, sinArchivoViejo,
  agregarArchivo, quitarArchivo, cerrarSolicitudes,
} from "../functions/lib/expediente.js";
import { sha256Bytes } from "../src/nucleo/bloques";

const pdf = (aid, extra = {}) =>
  ({ aid, path: aid, nombre: `${aid}.pdf`, tipo: "application/pdf", tam: 1000, ...extra });

const expediente = () => ({
  id: "op1",
  requisitos: [
    { id: "r1", titulo: "Materiales", obligatorio: true, archivos: [pdf("a1")] },
    { id: "r2", titulo: "Electricista", obligatorio: true, archivos: [] },
  ],
  solicitudes: [
    { sid: "s1", reqId: "r2", estado: "pendiente", paraEmail: "luis@x.com" },
    { sid: "s2", reqId: "r1", estado: "cumplida", paraEmail: "eva@x.com" },
  ],
});

describe("lista de comprobantes", () => {
  it("entiende el formato viejo de un solo archivo", () => {
    expect(archivosDe({ archivo: { nombre: "x" } })).toHaveLength(1);
    expect(archivosDe({ archivos: [1, 2] })).toHaveLength(2);
    expect(archivosDe({})).toEqual([]);
  });

  it("al migrar quita la clave vieja en vez de dejarla vacía", () => {
    expect(sinArchivoViejo({ id: "r1", archivo: {}, archivos: [] })).toEqual({ id: "r1", archivos: [] });
  });

  it("identifica un comprobante aunque le falte el aid", () => {
    expect(aidDe({ path: "p1" })).toBe("p1");
    expect(aidDe({ origen: "interno", docId: "F1" })).toBe("F1");
  });
});

describe("agregar", () => {
  it("suma el comprobante y deja el requisito cumplido", () => {
    const { requisitos, encontrado } = agregarArchivo(expediente().requisitos, "r2", pdf("nuevo"));
    expect(encontrado).toBe(true);
    const r2 = requisitos.find((r) => r.id === "r2");
    expect(r2.archivos).toHaveLength(1);
    expect(r2.estado).toBe("cumplido");
  });

  it("no reemplaza los que ya estaban", () => {
    const { requisitos } = agregarArchivo(expediente().requisitos, "r1", pdf("a2"));
    expect(requisitos[0].archivos.map((a) => a.aid)).toEqual(["a1", "a2"]);
  });

  it("avisa si el requisito no existe, en vez de perder el archivo", () => {
    expect(agregarArchivo(expediente().requisitos, "inventado", pdf("x")).encontrado).toBe(false);
  });
});

describe("quitar", () => {
  it("devuelve el comprobante retirado y deja el requisito pendiente", () => {
    const { requisitos, quitado } = quitarArchivo(expediente().requisitos, "r1", "a1");
    expect(quitado.aid).toBe("a1");
    expect(requisitos[0].archivos).toEqual([]);
    expect(requisitos[0].estado).toBe("pendiente");
  });

  it("si quedan otros, el requisito sigue cumplido", () => {
    const base = agregarArchivo(expediente().requisitos, "r1", pdf("a2")).requisitos;
    const { requisitos } = quitarArchivo(base, "r1", "a1");
    expect(requisitos[0].estado).toBe("cumplido");
  });

  it("no inventa nada si el comprobante ya no está", () => {
    expect(quitarArchivo(expediente().requisitos, "r1", "fantasma").quitado).toBeNull();
  });
});

describe("solicitudes", () => {
  it("cierra sólo las pendientes de ese requisito", () => {
    const { solicitudes, cerradas } = cerrarSolicitudes(expediente(), "r2", "Luis");
    expect(cerradas).toBe(1);
    expect(solicitudes.find((s) => s.sid === "s1")).toMatchObject({ estado: "cumplida", cumplidaPor: "Luis" });
    expect(solicitudes.find((s) => s.sid === "s2").estado).toBe("cumplida");
  });

  it("si no hay pendientes, no toca nada", () => {
    expect(cerrarSolicitudes(expediente(), "r1", "Ana").cerradas).toBe(0);
  });
});

describe("huella de los archivos (la calcula el servidor)", () => {
  it("coincide con el valor conocido de 'abc'", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Bytes(bytes))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("dos archivos distintos dan huellas distintas", async () => {
    const a = await sha256Bytes(new TextEncoder().encode("factura 1000"));
    const b = await sha256Bytes(new TextEncoder().encode("factura 1001"));
    expect(a).not.toBe(b);
  });
});