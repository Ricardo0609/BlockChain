// Crear dentro de una carpeta no vuelve a preguntar la carpeta.
//
// Entrar a una carpeta y pulsar crear ya dijo donde va el documento.
// Preguntarlo otra vez es hacer dos veces la misma eleccion.
//
// Pero el riesgo del atajo es el contrario: un documento que se guarda
// en un sitio SIN avisar es un documento que luego no aparece donde se
// busca, y eso se nota tarde. Por eso no es «no preguntar», es
// «responder antes de que pregunten», con su «Cambiar» al lado.
import { describe, it, expect } from "vitest";
import { destinoDicho } from "../src/ui/SelectorCarpeta";

describe("cuando el destino se da por hecho", () => {
  it("dentro de una carpeta, al abrir: no pregunta", () => {
    expect(destinoDicho({ filterF: "Obra", mIn2: "Obra", carpAbierta: false })).toBe(true);
  });

  it("fuera de toda carpeta: pregunta, como siempre", () => {
    expect(destinoDicho({ filterF: null, mIn2: "", carpAbierta: false })).toBe(false);
    expect(destinoDicho({ filterF: "", mIn2: "", carpAbierta: false })).toBe(false);
  });

  it("si pulsaste «Cambiar», la fila se queda abierta", () => {
    // Aunque la carpeta elegida vuelva a ser la de origen: cerrarsela
    // en las narices a quien acaba de abrirla seria peor que dejarla.
    expect(destinoDicho({ filterF: "Obra", mIn2: "Obra", carpAbierta: true })).toBe(false);
    expect(destinoDicho({ filterF: "Obra", mIn2: "Nomina", carpAbierta: true })).toBe(false);
  });

  it("si el destino ya no es la carpeta de origen, pregunta", () => {
    // Por si algo cambia mIn2 sin pasar por «Cambiar»: lo que manda es
    // lo que se va a guardar, no de donde se venia.
    expect(destinoDicho({ filterF: "Obra", mIn2: "Nomina", carpAbierta: false })).toBe(false);
    expect(destinoDicho({ filterF: "Obra", mIn2: "", carpAbierta: false })).toBe(false);
  });

  it("no confunde «ninguna carpeta» con «la carpeta de origen»", () => {
    // Los dos son cadenas vacias si no se tiene cuidado, y entonces
    // crear desde Inicio diria «se guardara en» y no diria donde.
    expect(destinoDicho({ filterF: "", mIn2: "", carpAbierta: false })).toBe(false);
    expect(destinoDicho({ filterF: undefined, mIn2: undefined, carpAbierta: false })).toBe(false);
  });
});
