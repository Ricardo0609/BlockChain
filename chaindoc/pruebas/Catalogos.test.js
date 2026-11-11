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
import { aceptaEfirma, METHODS, TEMPLATES, TIPOS_DOC } from "../src/nucleo/catalogos.js";

describe("tipos de documento (paso 1)", () => {
  it("son exactamente cuatro", () => {
    expect(TEMPLATES).toHaveLength(4);
  });

  it("son contrato, factura, recibo y expediente", () => {
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

  it("el expediente sigue marcado como tal", () => {
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
// ── EL NOMBRE Y EL «CUAL ELIJO» (11 nov) ───────────────────────
//
// Dos decisiones de Ricardo del 11 de noviembre.
//
// EL NOMBRE. «Contrato inteligente» se confundia con los smart
// contracts de blockchain, que son otra cosa y de otro mundo. Por
// dentro el codigo ya lo llamaba `expediente` en todas partes
// -`kind:"expediente"`, `estadoFases(exp)`, `expedienteStatus`-, asi
// que el nombre nuevo no es un invento: es el que ya tenia, puesto
// tambien donde se lee.
//
// EL «CUAL ELIJO». La pantalla de crear ofrece cuatro tarjetas, y la
// que mas se va a elegir mal es entre un documento de texto y un
// expediente: los dos sirven para un contrato. La diferencia es si hay
// evidencia que reunir despues de firmarlo. Si la ⓘ no lo dice, la
// eleccion se hace a ciegas y se descubre tarde.
describe("como se llama y cuando se elige", () => {
  const texto = () => TEMPLATES.find((t) => t.id === "contrato");
  const exped = () => TEMPLATES.find((t) => t.id === "inteligente");

  it("ya no se llama «contrato inteligente» en ningun sitio visible", () => {
    // La confusion que se queria quitar. Si vuelve a aparecer en una
    // etiqueta o en un texto de ayuda, esto lo caza.
    expect(exped().name).toBe("Expediente");
    expect(TIPOS_DOC.smart.nombre).toBe("Expediente");
    for (const t of TEMPLATES) {
      expect(t.name.toLowerCase(), `nombre de «${t.id}»`).not.toContain("inteligente");
      expect(t.info.toLowerCase(), `texto de «${t.id}»`).not.toContain("inteligente");
    }
  });

  it("el documento de texto dice que sirve para un contrato que solo se firma", () => {
    // El caso del arrendamiento: dos firmas, una fecha, y nada que
    // adjuntar. Hoy alguien elegiria el expediente por el nombre y se
    // encontraria pidiendo comprobantes que nadie va a subir.
    expect(texto().info).toMatch(/arrendamiento/i);
    expect(texto().info).toMatch(/firmarse|firma/i);
  });

  it("y el expediente dice que es para cuando hay evidencia que reunir", () => {
    expect(exped().info).toMatch(/evidencia que reunir/i);
    // Y manda al otro cuando no la hay, que es la mitad util del aviso:
    // decir para que sirve sin decir cuando NO usarlo no desempata nada.
    expect(exped().info).toMatch(/Documento de texto/);
  });

  it("los dos se mandan el uno al otro, no solo uno", () => {
    // Quien entra por la tarjeta equivocada tiene que encontrar la
    // salida este donde este.
    expect(texto().info).toMatch(/expediente/i);
    expect(exped().info).toMatch(/Documento de texto/);
  });

  it("sin nombrar un sector, como el resto", () => {
    // La misma regla de arriba, dicha otra vez para los textos nuevos:
    // el nicho vive en el discurso, no en la pantalla.
    for (const t of [texto(), exped()]) {
      expect(t.info.toLowerCase()).not.toContain("constructora");
      expect(t.info.toLowerCase()).not.toContain("obra civil");
    }
  });
});

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

  it("sólo el expediente va destacado", () => {
    const destacados = TEMPLATES.filter(t => t.destacado);
    expect(destacados).toHaveLength(1);
    expect(destacados[0].id).toBe("inteligente");
    expect(destacados[0].smart).toBe(true);
  });

  it("el texto del expediente cierra con la tesis", () => {
    const smart = TEMPLATES.find(t => t.id === "inteligente");
    expect(smart.info).toContain("prueba lo que se cumplió");
  });
});
