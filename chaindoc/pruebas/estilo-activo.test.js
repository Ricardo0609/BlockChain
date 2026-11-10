// Que la barra de estilos diga que hay puesto donde esta el cursor.
//
// Lo que se vigila aqui es que la barra no MIENTA: un boton iluminado
// que no corresponde con el texto es peor que ninguno iluminado,
// porque la gente deja de mirar el texto y se fia del boton.
import { describe, it, expect } from "vitest";
import {
  leerActivos, estaActivo, bloqueDe, INTERRUPTORES,
} from "../src/ui/estiloActivo";

/** Un documento de mentira que responde lo que le digamos. */
const doc = (estados = {}, bloque = "p", romper = false) => ({
  queryCommandState: (c) => { if (romper) throw new Error("no"); return Boolean(estados[c]); },
  queryCommandValue: () => { if (romper) throw new Error("no"); return bloque; },
});

describe("el nombre del bloque", () => {
  it("cada navegador lo dice distinto y todos valen", () => {
    for (const v of ["h2", "H2", "<h2>", " h2 "]) expect(bloqueDe(v)).toBe("h2");
  });

  it("lo que no es un titulo es texto normal", () => {
    for (const v of ["", "div", "p", "normal", "blockquote", null, undefined]) {
      expect(bloqueDe(v)).toBe("p");
    }
  });
});

describe("que esta activo", () => {
  it("lee los interruptores del navegador", () => {
    const a = leerActivos(doc({ bold: true, insertUnorderedList: true }));
    expect(a.bold).toBe(true);
    expect(a.italic).toBe(false);
    expect(a.insertUnorderedList).toBe(true);
  });

  it("y el bloque", () => {
    expect(leerActivos(doc({}, "h1")).bloque).toBe("h1");
    expect(leerActivos(doc({}, "div")).bloque).toBe("p");
  });

  it("sin alineacion declarada, es izquierda", () => {
    // El navegador no la declara porque es el valor por defecto, pero
    // el usuario SI la ve asi. La barra tiene que coincidir con lo que
    // hay en pantalla, no con lo que el navegador se digna a decir.
    expect(leerActivos(doc({})).justifyLeft).toBe(true);
  });

  it("pero no la inventa si ya hay otra", () => {
    const a = leerActivos(doc({ justifyCenter: true }));
    expect(a.justifyCenter).toBe(true);
    expect(a.justifyLeft).toBe(false);
  });

  it("devuelve todos los interruptores, no solo los encendidos", () => {
    const a = leerActivos(doc({}));
    for (const c of INTERRUPTORES) expect(typeof a[c]).toBe("boolean");
  });
});

describe("cuando el navegador no coopera", () => {
  it("sin documento, la barra se queda apagada y no revienta", () => {
    expect(leerActivos(null)).toEqual({ bloque: "p" });
    expect(leerActivos(undefined)).toEqual({ bloque: "p" });
    expect(leerActivos({})).toEqual({ bloque: "p" });
  });

  it("si lanza, tampoco revienta", () => {
    // Un fallo aqui no puede romper la edicion: es un adorno.
    const a = leerActivos(doc({}, "p", true));
    expect(a.bloque).toBe("p");
    expect(a.bold).toBe(false);
  });

  it("un documento a medias no se da por bueno", () => {
    expect(leerActivos({ queryCommandValue: () => "h1" })).toEqual({ bloque: "p" });
  });
});

describe("si este boton va iluminado", () => {
  const a = leerActivos(doc({ bold: true, justifyCenter: true }, "h2"));

  it("los normales, por su comando", () => {
    expect(estaActivo(a, "bold")).toBe(true);
    expect(estaActivo(a, "italic")).toBe(false);
    expect(estaActivo(a, "justifyCenter")).toBe(true);
  });

  it("los de titulo, por su valor", () => {
    expect(estaActivo(a, "formatBlock", "h2")).toBe(true);
    expect(estaActivo(a, "formatBlock", "h1")).toBe(false);
    expect(estaActivo(a, "formatBlock", "p")).toBe(false);
  });

  it("en texto normal se ilumina «Normal», no ninguno", () => {
    // Si no, parece que el texto no tiene formato asignado, cuando si
    // lo tiene: es parrafo.
    const n = leerActivos(doc({}, "div"));
    expect(estaActivo(n, "formatBlock", "p")).toBe(true);
  });

  it("sin nada leido, nada se ilumina", () => {
    expect(estaActivo(null, "bold")).toBe(false);
    expect(estaActivo({}, "bold")).toBe(false);
  });
});
