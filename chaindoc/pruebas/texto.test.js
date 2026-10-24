// El contenido con formato.
//
// `content` es lo que la cadena sella, asi que aqui se protegen tres
// cosas, y las tres importan mas que los botones de la barra:
//
//   1. NADA DE LO QUE NO ESTE EN EL MODELO SOBREVIVE. Lo guardado no
//      es lo que escribio el navegador, es lo que paso por parsear y
//      serializar. Un script no llega a guardarse.
//   2. EL SELLADO ES ESTABLE. El mismo documento tiene que dar el
//      mismo HTML siempre; si no, el mismo texto daria hashes
//      distintos segun el navegador y la verificacion seria ruido.
//   3. LOS DOCUMENTOS DE ANTES SIGUEN VALIENDO. Son texto plano, no
//      hay migracion, y tienen que leerse igual que siempre.
import { describe, it, expect } from "vitest";
import {
  ALINEACIONES, BLOQUES, aTextoPlano, estaVacio, normalizar, parsear,
  resumenDe, serializar, tieneFormato,
} from "../src/nucleo/texto.js";

describe("los documentos de antes, sin migrar nada", () => {
  it("un texto plano se lee como parrafos", () => {
    const b = parsear("Primera linea\nSegunda linea");
    expect(b.map((x) => x.tipo)).toEqual(["p", "p"]);
    expect(b[0].trozos[0].texto).toBe("Primera linea");
  });

  it("y se reconoce que no traia formato", () => {
    expect(tieneFormato("Hola")).toBe(false);
    expect(tieneFormato("")).toBe(false);
    expect(tieneFormato("2 < 3 y 4 > 1")).toBe(false);
    expect(tieneFormato("<p>Hola</p>")).toBe(true);
    expect(tieneFormato("<h2>Titulo</h2>")).toBe(true);
  });

  it("un renglon en blanco se conserva: alguien lo puso a proposito", () => {
    const b = parsear("Uno\n\nDos");
    expect(b).toHaveLength(3);
    expect(b[1].trozos).toEqual([]);
  });

  it("el texto plano sale igual que entro", () => {
    expect(aTextoPlano("Hola\nmundo")).toBe("Hola\nmundo");
  });

  it("ni vacio ni nulo truenan", () => {
    for (const v of ["", null, undefined]) {
      expect(() => parsear(v)).not.toThrow();
      expect(aTextoPlano(v)).toBe("");
      expect(estaVacio(v)).toBe(true);
    }
  });
});

// ── LO QUE DE VERDAD IMPORTA ─────────────────────────────────────
describe("solo sobrevive lo que cabe en el modelo", () => {
  const fuera = (sucio) => {
    const html = serializar(parsear(sucio));
    return html;
  };

  it("un script no llega a guardarse", () => {
    const html = fuera('<p>Hola<script>alert(1)</script></p>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
  });

  it("ni un manejador de eventos", () => {
    const html = fuera('<p onclick="robar()">Texto</p>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("robar");
    expect(html).toContain("Texto");
  });

  it("ni un iframe, ni una imagen, ni un enlace disfrazado", () => {
    for (const malo of [
      '<p><iframe src="http://x"></iframe>texto</p>',
      '<p><img src=x onerror="alert(1)">texto</p>',
      '<p><a href="javascript:alert(1)">texto</a></p>',
    ]) {
      const html = fuera(malo);
      expect(html).not.toMatch(/<(iframe|img|a)\b/i);
      expect(html).not.toContain("alert(1)");
    }
  });

  it("el texto de dentro se queda, escapado", () => {
    const html = fuera("<p>2 &lt; 3 &amp;&amp; 4 &gt; 1</p>");
    expect(html).not.toMatch(/<(?!\/?(p|h[1-3]|ul|ol|li|strong|em|br)\b)/);
    expect(aTextoPlano(html)).toContain("2 < 3 && 4 > 1");
  });

  it("pasarlo dos veces no cambia nada mas", () => {
    const una = normalizar('<h2>Titulo</h2><p>Hola <strong>mundo</strong></p>');
    expect(normalizar(una)).toBe(una);
  });

  it("un bloque inventado se vuelve parrafo, no desaparece el texto", () => {
    expect(serializar([{ tipo: "marquesina", alineacion: "izquierda", trozos: [{ texto: "x" }] }]))
      .toBe("<p>x</p>");
  });

  it("una alineacion inventada no escribe ninguna clase", () => {
    expect(serializar([{ tipo: "p", alineacion: "diagonal", trozos: [{ texto: "x" }] }]))
      .toBe("<p>x</p>");
  });
});

describe("el sellado es estable", () => {
  it("lo mismo da siempre lo mismo", () => {
    const a = normalizar("<h1>Contrato</h1><p>Primera clausula</p>");
    const b = normalizar("<h1>Contrato</h1><p>Primera clausula</p>");
    expect(a).toBe(b);
  });

  it("trozos seguidos que visten igual se funden en uno", () => {
    // Si no, el mismo texto daria HTML distinto segun como lo partiera
    // el navegador, y con el HTML cambiaria el hash.
    const html = serializar([{ tipo: "p", alineacion: "izquierda", trozos: [
      { texto: "Hola ", negrita: true }, { texto: "mundo", negrita: true },
    ] }]);
    expect(html).toBe("<p><strong>Hola mundo</strong></p>");
  });

  it("los trozos vacios no dejan etiquetas sueltas", () => {
    // Con estilos DISTINTOS a proposito: si vistieran igual se
    // fundirian solos y la prueba no probaria el filtrado.
    expect(serializar([{ tipo: "p", alineacion: "izquierda", trozos: [
      { texto: "", negrita: true }, { texto: "Hola" }, { texto: "", cursiva: true },
    ] }])).toBe("<p>Hola</p>");
  });

  it("las listas seguidas se juntan en una sola", () => {
    const html = serializar([
      { tipo: "li-vineta", alineacion: "izquierda", trozos: [{ texto: "uno" }] },
      { tipo: "li-vineta", alineacion: "izquierda", trozos: [{ texto: "dos" }] },
    ]);
    expect(html).toBe("<ul><li>uno</li><li>dos</li></ul>");
  });

  it("y una numerada despues de una de viñetas no se mezclan", () => {
    const html = serializar([
      { tipo: "li-vineta", alineacion: "izquierda", trozos: [{ texto: "uno" }] },
      { tipo: "li-numero", alineacion: "izquierda", trozos: [{ texto: "dos" }] },
    ]);
    expect(html).toBe("<ul><li>uno</li></ul><ol><li>dos</li></ol>");
  });

  it("la alineacion viaja como clase, no como estilo suelto", () => {
    const html = serializar([{ tipo: "p", alineacion: "centro", trozos: [{ texto: "x" }] }]);
    expect(html).toBe('<p class="al-centro">x</p>');
    expect(html).not.toContain("style");
  });

  it("la de por defecto no ensucia el HTML", () => {
    expect(ALINEACIONES.izquierda).toBe(null);
    expect(serializar([{ tipo: "p", alineacion: "izquierda", trozos: [{ texto: "x" }] }]))
      .toBe("<p>x</p>");
  });

  it("todos los bloques del catalogo se saben escribir", () => {
    for (const tipo of BLOQUES) {
      const html = serializar([{ tipo, alineacion: "izquierda", trozos: [{ texto: "x" }] }]);
      expect(html, tipo).toContain("x");
      expect(html, tipo).not.toContain("undefined");
    }
  });
});

describe("el texto sin etiquetas", () => {
  it("para la IA, la cadena y el paquete: prosa y nada mas", () => {
    const plano = aTextoPlano("<h1>Contrato</h1><p>Se pagan <strong>$5,000</strong> el dia 10.</p>");
    expect(plano).toBe("Contrato\nSe pagan $5,000 el dia 10.");
  });

  it("las listas se leen como listas", () => {
    expect(aTextoPlano("<ul><li>uno</li><li>dos</li></ul>")).toBe("• uno\n• dos");
  });

  it("los saltos de linea sobreviven", () => {
    expect(aTextoPlano("<p>uno<br>dos</p>")).toBe("uno\ndos");
  });

  it("no deja hueco de tres renglones donde habia uno", () => {
    expect(aTextoPlano("<p>uno</p><p></p><p></p><p>dos</p>")).toBe("uno\n\ndos");
  });

  it("el resumen de la tarjeta va de un tiron y recortado", () => {
    const r = resumenDe("<h1>Titulo</h1><p>" + "ab ".repeat(300) + "</p>", 40);
    expect(r).toHaveLength(40);
    expect(r.endsWith("…")).toBe(true);
    expect(r).not.toContain("\n");
  });

  it("un documento con etiquetas pero sin texto esta vacio", () => {
    expect(estaVacio("<p></p>")).toBe(true);
    expect(estaVacio("<p>  </p>")).toBe(true);
    expect(estaVacio("<p>x</p>")).toBe(false);
  });
});
