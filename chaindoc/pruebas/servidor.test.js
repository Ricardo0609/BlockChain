// Reglas del servidor: qué acepta y qué rechaza antes de tocar la cadena.
import { describe, it, expect } from "vitest";
import {
  limpiarCambios, validarEvento, revisarCambioDeAcceso,
  tieneAcceso, esDueno, debeRegistrarConsulta, ACCIONES, LIMITES,
} from "../functions/lib/permisos.js";

const op = {
  id: "op1", ownerUid: "U1", ownerEmail: "ana@x.com",
  sharedWith: ["luis@x.com"], title: "Contrato",
};

describe("quién puede qué", () => {
  it("el dueño y los compartidos tienen acceso; nadie más", () => {
    expect(esDueno(op, "U1")).toBe(true);
    expect(tieneAcceso(op, "U9", "luis@x.com")).toBe(true);
    expect(tieneAcceso(op, "U9", "otro@x.com")).toBe(false);
  });

  // ← ACTUALIZADO (Etapa 3): los accesos ya no viajan entre los campos
  // del documento. Se cambian sólo por las funciones de compartir, que
  // comprueban el rol de quien lo pide.
  it("nadie cambia los accesos editando el documento, ni el dueño", () => {
    expect(() => revisarCambioDeAcceso(op, { title: "Otro" })).not.toThrow();
    expect(() => revisarCambioDeAcceso(op, { sharedWith: ["eva@x.com"] })).toThrow(/Compartir/);
    expect(() => revisarCambioDeAcceso(op, { roles: { "eva@x.com": "editor" } })).toThrow(/Compartir/);
  });
});

describe("campos que llegan del navegador", () => {
  it("ignora en silencio lo que el cliente no puede cambiar", () => {
    const r = limpiarCambios({ title: "Nuevo", ownerUid: "U9", bloques: 999, ultimoHash: "falso" });
    expect(r).toEqual({ title: "Nuevo" });
  });

  it("los accesos no son un campo editable: se descartan", () => {
    const r = limpiarCambios({ title: "Nuevo", sharedWith: ["a@x.com"], roles: { "a@x.com": "editor" } });
    expect(r).toEqual({ title: "Nuevo" });
  });

  it("la contraseña tampoco: vive sellada aparte, no en el documento", () => {
    expect(limpiarCambios({ password: "1234" })).toEqual({});
  });
});

describe("evento del bloque", () => {
  it("acepta las acciones conocidas", () => {
    for(const a of ACCIONES){
      expect(validarEvento({ accion: a, contenido: "x" }).accion).toBe(a);
    }
  });

  it("rechaza una acción inventada", () => {
    expect(() => validarEvento({ accion: "BORRAR TODO", contenido: "x" })).toThrow(/desconocida/);
  });

  it("rechaza textos y metadatos gigantes", () => {
    expect(() => validarEvento({ accion: "EDICIÓN", contenido: "a".repeat(LIMITES.contenido + 1) })).toThrow();
    expect(() => validarEvento({ accion: "EDICIÓN", contenido: "x", meta: { t: "a".repeat(LIMITES.meta) } })).toThrow();
  });

  it("meta vacío queda en null, no en undefined (Firestore lo rechaza)", () => {
    expect(validarEvento({ accion: "FIRMA", contenido: "Firma" }).meta).toBeNull();
  });
});

describe("bitácora de consultas, decidida en el servidor", () => {
  const hoy = new Date().toISOString().slice(0, 10);

  it("no registra nada en un documento que no está compartido", () => {
    expect(debeRegistrarConsulta({ ...op, sharedWith: [] }, [], "U9", "x@x.com")).toBe(false);
  });

  it("registra una vez por persona y día", () => {
    expect(debeRegistrarConsulta(op, [], "U9", "luis@x.com")).toBe(true);
    const yaHoy = [{ action: "CONSULTA", meta: { uid: "U9" }, timestamp: `${hoy}T09:00:00.000Z` }];
    expect(debeRegistrarConsulta(op, yaHoy, "U9", "luis@x.com")).toBe(false);
  });

  it("una consulta de ayer no cuenta para hoy", () => {
    const ayer = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const bloques = [{ action: "CONSULTA", meta: { uid: "U9" }, timestamp: `${ayer}T09:00:00.000Z` }];
    expect(debeRegistrarConsulta(op, bloques, "U9", "luis@x.com")).toBe(true);
  });
});