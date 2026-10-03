// El dígito verificador del RFC.
//
// Un validador que rechace RFC buenos es peor que no tener validador,
// así que estas pruebas cuidan sobre todo los falsos positivos.
import { describe, it, expect } from "vitest";
import {
  revisarRFC, rfcValido, digitoVerificador, normalizarRFC, tipoDeRFC,
  errorDeRFC, GENERICOS,
} from "../functions/lib/rfc.js";

describe("dígito verificador", () => {
  it("calcula el de una persona física", () => {
    // El dígito se obtiene del resto del RFC: se le quita y se recalcula.
    expect(digitoVerificador("COSC8001137NA")).toBe("A");
  });

  it("la letra A aparece cuando la resta da diez", () => {
    expect(digitoVerificador("COSC8001137NA")).toBe("A");
  });

  it("acepta el ampersand y la eñe, que sí existen en los RFC", () => {
    expect(digitoVerificador("A&N010101AAA")).not.toBeNull();
    expect(digitoVerificador("ÑAA010101AAA")).not.toBeNull();
  });

  it("devuelve null ante caracteres que no están en la tabla", () => {
    expect(digitoVerificador("A#A010101AAA")).toBeNull();
  });
});

describe("revisión completa", () => {
  it("acepta un RFC correcto", () => {
    expect(revisarRFC("COSC8001137NA")).toEqual({ ok: true, tipo: "fisica" });
  });

  it("no le importan espacios, guiones ni minúsculas", () => {
    expect(rfcValido(" cosc800113-7na ")).toBe(true);
    expect(normalizarRFC(" cosc800113-7na ")).toBe("COSC8001137NA");
  });

  it("detecta un dedazo en el último carácter", () => {
    const r = revisarRFC("COSC8001137NB");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("digito");
    expect(r.esperado).toBe("A");
  });

  it("detecta un dedazo en medio, que cambia el dígito esperado", () => {
    expect(revisarRFC("COSC8001147NA").ok).toBe(false);
  });

  it("rechaza una fecha que no existe", () => {
    expect(revisarRFC("COSC8013137NA").motivo).toBe("fecha");   // mes 13
    expect(revisarRFC("COSC8002307NA").motivo).toBe("fecha");   // 30 de febrero
  });

  it("acepta el 29 de febrero de un año bisiesto", () => {
    // 2000 fue bisiesto; el RFC no dice el siglo, así que se prueban los dos.
    expect(revisarRFC("AAA000229AAA").motivo).not.toBe("fecha");
  });

  it("rechaza lo que ni siquiera tiene forma de RFC", () => {
    expect(revisarRFC("HOLA").motivo).toBe("forma");
    expect(revisarRFC("12345678901234").motivo).toBe("forma");
    expect(revisarRFC("").motivo).toBe("vacio");
    expect(revisarRFC(null).motivo).toBe("vacio");
  });
});

describe("los RFC genéricos, que son la excepción", () => {
  it("se aceptan aunque no cumplan el dígito verificador", () => {
    for (const g of GENERICOS) {
      expect(rfcValido(g)).toBe(true);
      expect(revisarRFC(g).generico).toBe(true);
    }
  });

  it("y de hecho NO lo cumplen: por eso hay que exceptuarlos a mano", () => {
    expect(digitoVerificador("XAXX010101000")).not.toBe("0");
  });
});

describe("persona o empresa", () => {
  it("trece caracteres es persona física; doce, empresa", () => {
    expect(tipoDeRFC("COSC8001137NA")).toBe("fisica");
    expect(tipoDeRFC("ABC010101AAA")).toBe("moral");
    expect(tipoDeRFC("CORTO")).toBeNull();
  });
});

describe("el mensaje para la persona", () => {
  it("explica qué revisar, no sólo que está mal", () => {
    expect(errorDeRFC("COSC8001137NB")).toMatch(/dedazo/i);
    expect(errorDeRFC("HOLA")).toMatch(/12 caracteres|13/);
    expect(errorDeRFC("COSC8001137NA")).toBe("");
  });
});

describe("las dos copias no se separan", () => {
  it("functions/lib/rfc.js es idéntico a src/nucleo/rfc.js", async () => {
    const { readFileSync } = await import("node:fs");
    const a = readFileSync(new URL("../src/nucleo/rfc.js", import.meta.url), "utf8");
    const b = readFileSync(new URL("../functions/lib/rfc.js", import.meta.url), "utf8");
    expect(a).toBe(b);
  });
});