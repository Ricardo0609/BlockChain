// Por que no se pudo abrir un documento.
//
// La regla de Firestore para leer pregunta por los datos del
// documento. Si no hay documento no hay datos, asi que contesta
// «permiso denegado» en vez de «no existe». O sea que desde el
// navegador un documento BORRADO y uno al que te RETIRARON EL ACCESO
// se ven exactamente igual, y el aviso no puede afirmar ninguno de los
// dos: el segundo sigue existiendo y su dueño lo ve.
//
// Lo que si se puede separar es un tropiezo de red, y ese no merece
// ni refresco de la lista ni hablar de documentos que ya no estan.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/firebase", () => ({ db: {}, auth: {}, app: {}, ENTORNO: "prueba" }));

const getDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  getDoc, doc: (...a) => ({ ruta: a }), collection: (...a) => ({ ruta: a }),
  getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(), increment: vi.fn(), runTransaction: vi.fn(),
  writeBatch: vi.fn(), onSnapshot: vi.fn(), limit: vi.fn(), startAfter: vi.fn(),
  arrayUnion: vi.fn(), arrayRemove: vi.fn(), deleteField: vi.fn(), Timestamp: {},
}));

const { store } = await import("../src/nucleo/datos.js");

const fallo = (code) => Object.assign(new Error(code), { code });

beforeEach(() => {
  getDoc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("por que no se pudo abrir", () => {
  it("si las reglas lo niegan, el motivo es sin-acceso", () => {
    getDoc.mockRejectedValue(fallo("permission-denied"));
    return store.get("d1", { conMotivo: true }).then((r) => {
      expect(r).toEqual({ doc: null, motivo: "sin-acceso" });
    });
  });

  it("un tropiezo de red NO se confunde con eso", async () => {
    getDoc.mockRejectedValue(fallo("unavailable"));
    expect(await store.get("d1", { conMotivo: true }))
      .toEqual({ doc: null, motivo: "fallo" });
  });

  it("y un documento que de verdad no existe se distingue", async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    expect(await store.get("d1", { conMotivo: true }))
      .toEqual({ doc: null, motivo: "no-existe" });
  });

  it("sin conMotivo se comporta como siempre: solo el documento o null", async () => {
    getDoc.mockRejectedValue(fallo("permission-denied"));
    expect(await store.get("d1")).toBe(null);
    getDoc.mockResolvedValue({ exists: () => false });
    expect(await store.get("d1")).toBe(null);
  });

  it("cuando si existe, devuelve el documento y ningun motivo", async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ id: "d1", title: "Acta" }) });
    const r = await store.get("d1", { conMotivo: true });
    expect(r.motivo).toBe(null);
    expect(r.doc).toMatchObject({ id: "d1", title: "Acta" });
  });

  it("un error raro sin code tampoco pasa por sin-acceso", async () => {
    getDoc.mockRejectedValue(new Error("algo se rompio"));
    expect((await store.get("d1", { conMotivo: true })).motivo).toBe("fallo");
  });

  it("lo reconoce venga en code o en el mensaje", async () => {
    getDoc.mockRejectedValue(new Error("Missing or insufficient permissions."));
    expect((await store.get("d1", { conMotivo: true })).motivo).toBe("sin-acceso");
  });
});
