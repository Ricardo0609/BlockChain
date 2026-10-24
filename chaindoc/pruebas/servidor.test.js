// Reglas del servidor: qué acepta y qué rechaza antes de tocar la cadena.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  limpiarCambios, validarEvento, revisarCambioDeAcceso,
  tieneAcceso, esDueno, debeRegistrarConsulta, ACCIONES, LIMITES,
  CAMPOS_EDITABLES, permisoDeEvento, PERMISOS_QUE_CAMBIAN, PERMISOS, puede,
} from "../functions/lib/permisos.js";

const op = {
  id: "op1", ownerUid: "U1", ownerEmail: "ana@x.com",
  sharedWith: ["luis@x.com"], title: "Contrato",
};

// ── QUE BLOQUES PUEDEN CAMBIAR EL DOCUMENTO ─────────────────────
//
// De aqui salio un 403 en la cara de Ricardo. `agregarBloque` pedia
// «editar» siempre que la llamada trajera campos, fuera cual fuera el
// evento. Subir un comprobante cambia `requisitos`, o sea que lleva
// campos, o sea que pedia editar — y quien tiene que entregar es justo
// quien NO puede editar.
//
// Ahora el permiso lo pone el evento. Pero quitar aquella puerta sin
// mas abriria otra: un bloque de CONSULTA solo pide «ver», y con eso
// un lector colaria cambios disfrazados de visita. De eso va esta
// lista.
describe("que bloques pueden traer cambios en los campos", () => {
  const permisoDe = (accion, tipo) => permisoDeEvento({ accion, meta: { tipo } });

  it("entregar si: es justo para lo que existen esos bloques", () => {
    for (const [accion, tipo] of [
      ["EVIDENCIA", "alta"], ["EVIDENCIA", "imagen"], ["EVIDENCIA", "baja"],
      ["EVIDENCIA", "imagen-baja"], ["EVIDENCIA", "vinculo"], ["VINCULADO", null],
      ["EDICIÓN", null], ["FIRMA", null], ["ACUERDO", null], ["SOLICITUD", null],
    ]) {
      const p = permisoDe(accion, tipo);
      expect(PERMISOS_QUE_CAMBIAN.has(p), `${accion}/${tipo} -> ${p}`).toBe(true);
    }
  });

  it("mirar no: una visita no cambia el documento", () => {
    for (const [accion, tipo] of [
      ["CONSULTA", null], ["VALIDACIÓN", null], ["EXPORTACIÓN", null],
    ]) {
      const p = permisoDe(accion, tipo);
      expect(PERMISOS_QUE_CAMBIAN.has(p), `${accion} -> ${p}`).toBe(false);
    }
  });

  it("un lector no puede colar campos por la puerta de la consulta", () => {
    // tiene «ver», pero «ver» no esta entre los que cambian: las dos
    // condiciones tienen que fallarle, no solo una.
    expect(puede("lector", permisoDe("CONSULTA"))).toBe(true);
    expect(PERMISOS_QUE_CAMBIAN.has(permisoDe("CONSULTA"))).toBe(false);
  });

  it("y la otra parte SI puede entregar, que era el bug", () => {
    for (const [accion, tipo] of [["EVIDENCIA", "alta"], ["EVIDENCIA", "vinculo"]]) {
      const p = permisoDe(accion, tipo);
      expect(puede("involucrado", p), p).toBe(true);
      expect(PERMISOS_QUE_CAMBIAN.has(p), p).toBe(true);
    }
  });

  it("ningun permiso inventado se cuela en la lista", () => {
    const reales = new Set(Object.values(PERMISOS).flat());
    for (const p of PERMISOS_QUE_CAMBIAN) expect(reales.has(p), p).toBe(true);
  });
});

// Lo de arriba comprueba la REGLA; esto comprueba que siga enchufada.
// `asentar` y `agregarBloque` no se pueden ejecutar aqui —necesitan
// Firebase—, asi que se lee el codigo. Es poca cosa, pero es lo unico
// que impide que alguien reponga la puerta ciega sin enterarse de por
// que se quito. Es el mismo truco que usa la prueba de los gemelos.
describe("la puerta sigue donde la dejamos", () => {
  const servidor = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

  it("agregarBloque ya no pide editar a ciegas", () => {
    const fn = servidor.slice(servidor.indexOf("export const agregarBloque"));
    const cuerpo = fn.slice(0, fn.indexOf("export const guardarCampos"));
    expect(cuerpo).not.toMatch(/exigir\([^)]*"editar"\)/);
  });

  it("y asentar comprueba el permiso del evento y la guardia de campos", () => {
    const fn = servidor.slice(servidor.indexOf("async function asentar("));
    const cuerpo = fn.slice(0, fn.indexOf("\n}"));
    expect(cuerpo).toContain("permiso || permisoDeEvento(ev)");
    expect(cuerpo).toContain("PERMISOS_QUE_CAMBIAN.has(pide)");
    // los campos del servidor no pasan por la guardia: no vienen de fuera
    expect(cuerpo).toContain("delCliente");
  });
});

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

// ← NUEVO (18 oct): el campo del acuerdo es del servidor y de nadie mas.
//
// Si `acuerdo` estuviera entre los campos editables, cualquiera con
// acceso al documento podria escribirse una firma ajena por la via de
// guardar campos, sin pasar por el codigo de firma. Toda la doble
// firma se volveria decorativa, y nada fallaria a la vista.
describe("el acuerdo no se escribe guardando campos", () => {
  it("`acuerdo` no esta entre los campos editables", () => {
    expect(CAMPOS_EDITABLES.has("acuerdo")).toBe(false);
  });

  it("limpiarCambios lo tira en silencio", () => {
    const falso = { acuerdo: { firmas: [{ parte: "receptor" }] }, title: "Obra" };
    expect(limpiarCambios(falso)).toEqual({ title: "Obra" });
  });

  it("ni por un camino parecido", () => {
    for (const k of ["acuerdo", "firmas", "estado", "ownerUid", "roles", "sharedWith"]) {
      expect(CAMPOS_EDITABLES.has(k)).toBe(false);
    }
  });

  it("aceptar o rechazar es su propia accion, y pide aprobar", () => {
    expect(ACCIONES.has("ACUERDO")).toBe(true);
    expect(permisoDeEvento({ accion: "ACUERDO" })).toBe("aprobar");
  });
});
