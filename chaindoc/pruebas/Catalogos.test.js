// Catálogo de creación.
//
// La primera pantalla del flujo de creación llegó a tener siete
// tarjetas, y después cuatro más una fila de pastillas para elegir la
// clase de contrato. Las dos formas hacían decidir de qué clase es el
// contrato antes de escribir una línea. Estas pruebas sujetan la
// decisión final: cuatro tarjetas, y nada más entre el tipo y el
// método. Si alguien vuelve a meter un paso intermedio, esto falla y
// obliga a decidirlo a propósito.

import { describe, expect, it } from "vitest";
import { aceptaEfirma, METHODS, TEMPLATES } from "../src/nucleo/catalogos.js";

describe("tipos de documento (paso 1)", () => {
  it("son exactamente cuatro", () => {
    expect(TEMPLATES).toHaveLength(4);
  });

  it("son contrato, factura, recibo y contrato inteligente", () => {
    expect(TEMPLATES.map((t) => t.id))
      .toEqual(["contrato", "factura", "recibo", "inteligente"]);
  });

  it("cada uno trae icono y nombre, que es lo que dibuja la tarjeta", () => {
    for(const t of TEMPLATES){
      expect(t.ico).toBeTruthy();
      expect(t.name).toBeTruthy();
    }
  });

  // El paso 1 elige el tipo y el paso 2 el método. No hay un paso 1.5.
  it("ninguno pide una decisión extra antes del método", () => {
    for(const t of TEMPLATES){
      expect(t.tipos).toBeUndefined();
      expect(t.variantes).toBeUndefined();
    }
  });

  it("factura y recibo son formularios, no texto libre", () => {
    expect(TEMPLATES.find((t) => t.id === "factura").form).toBe("factura");
    expect(TEMPLATES.find((t) => t.id === "recibo").form).toBe("recibo");
    // Y por eso su cuerpo va vacío: lo arma el formulario.
    expect(TEMPLATES.find((t) => t.id === "factura").body).toBe("");
    expect(TEMPLATES.find((t) => t.id === "recibo").body).toBe("");
  });

  it("el contrato inteligente sigue marcado como tal", () => {
    expect(TEMPLATES.find((t) => t.id === "inteligente").smart).toBe(true);
  });
});

describe("el tipo de texto libre", () => {
  const texto = TEMPLATES.find((t) => t.id === "contrato");

  // Antes traía un contrato completo de plantilla. Llenaba la hoja de
  // corchetes que había que borrar uno por uno, y suponía que lo que se
  // va a escribir es un contrato. Ahora la hoja empieza limpia y el
  // marcador de posición es el que invita a escribir.
  it("empieza en blanco, a proposito", () => {
    expect(texto.body).toBe("");
  });

  it("se llama por lo que es, no por un solo uso", () => {
    expect(texto.name).toBe("Documento de texto");
    expect(texto.name).not.toMatch(/contrato/i);
  });

  // El identificador no cambia aunque el nombre sí: cambiarlo dejaría
  // huérfano lo que ya está creado.
  it("conserva su identificador", () => {
    expect(texto.id).toBe("contrato");
  });
});


describe("métodos de creación (paso 2)", () => {
  it("siguen siendo los tres de siempre", () => {
    expect(METHODS.map((m) => m.id)).toEqual(["escanear", "subir", "cero"]);
  });

  it("cada uno explica qué hace, que es lo que se lee bajo la tarjeta", () => {
    for(const m of METHODS){
      expect(m.name).toBeTruthy();
      expect(m.desc).toBeTruthy();
      expect(m.ico).toBeTruthy();
    }
  });
});

// ── e.firma (Etapa 5) ─────────────────────────────────────────

describe("a quien se le ofrece la e.firma", () => {
  it("a un contrato si", () => {
    expect(aceptaEfirma({ tplId: "contrato" })).toBe(true);
    expect(aceptaEfirma({ tplId: "inteligente" })).toBe(true);
    expect(aceptaEfirma({ tplId: "recibo" })).toBe(true);
  });

  // Un CFDI ya viene sellado por quien lo emitio y timbrado por el SAT.
  it("a una factura no", () => {
    expect(aceptaEfirma({ tplId: "factura" })).toBe(false);
  });

  it("a un documento sin plantilla si, y a nada no", () => {
    expect(aceptaEfirma({ tplId: null })).toBe(true);
    expect(aceptaEfirma(null)).toBe(false);
  });
});

// ── La recomendación de cada tipo (14 oct) ────────────────────
//
// Cuatro tarjetas con un ícono y un nombre no dicen cuál conviene. El
// texto de cada una está detrás de una ⓘ, y estas pruebas existen para
// que el día que se agregue un quinto tipo no se quede sin él.
describe("la recomendación de cada tipo", () => {
  it("todos los tipos tienen una, y no es un relleno", () => {
    for(const t of TEMPLATES){
      expect(typeof t.info, `«${t.name}» sin texto`).toBe("string");
      expect(t.info.length, `«${t.name}» con texto demasiado corto`).toBeGreaterThan(120);
    }
  });

  it("ninguna nombra un sector: el producto no es sólo para constructoras", () => {
    // La regla del modelo de negocio: el nicho vive en el discurso y en
    // la página de entrada, nunca en las palabras de la pantalla.
    const prohibidas = ["constructora", "obra civil", "despacho contable", "albañilería"];
    for(const t of TEMPLATES){
      for(const mala of prohibidas){
        expect(t.info.toLowerCase(), `«${t.name}» menciona «${mala}»`).not.toContain(mala);
      }
    }
  });

  it("sólo el contrato inteligente va destacado", () => {
    const destacados = TEMPLATES.filter(t => t.destacado);
    expect(destacados).toHaveLength(1);
    expect(destacados[0].id).toBe("inteligente");
    expect(destacados[0].smart).toBe(true);
  });

  it("el texto del contrato inteligente cierra con la tesis", () => {
    const smart = TEMPLATES.find(t => t.id === "inteligente");
    expect(smart.info).toContain("prueba lo que se cumplió");
  });
});
