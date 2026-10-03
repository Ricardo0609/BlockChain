// Aviso de privacidad y términos de uso.
//
// Estas pruebas no comprueban que el texto sea bueno —eso lo dirá un
// abogado— sino que la mecánica alrededor no se rompa sin que nadie se
// entere, que es lo que convierte un consentimiento en papel mojado:
//
//  · que la versión aceptada se compare bien, para que un cambio de
//    fondo obligue a volver a aceptar;
//  · que no queden huecos de los que la ley pide llenar;
//  · que los marcadores que faltan por decidir sigan siendo visibles,
//    y no se publiquen sin darse cuenta.

import { describe, expect, it } from "vitest";
import {
  AVISO, DOCUMENTOS, FECHA, RESPONSABLE, TERMINOS, VERSION,
  aceptoVigente, comoTexto, selloDeAceptacion, sinMarcas, trozos,
} from "../src/nucleo/legal.js";

describe("la versión", () => {
  it("es un entero positivo", () => {
    expect(Number.isInteger(VERSION)).toBe(true);
    expect(VERSION).toBeGreaterThan(0);
  });

  it("los dos documentos van con la misma versión y fecha", () => {
    for(const doc of [AVISO, TERMINOS]){
      expect(doc.version).toBe(VERSION);
      expect(doc.fecha).toBe(FECHA);
    }
  });
});

describe("quién ya aceptó", () => {
  it("quien nunca aceptó, no", () => {
    expect(aceptoVigente(null)).toBe(false);
    expect(aceptoVigente({})).toBe(false);
    expect(aceptoVigente({ legal: {} })).toBe(false);
  });

  it("quien aceptó la versión vigente, sí", () => {
    expect(aceptoVigente({ legal: selloDeAceptacion() })).toBe(true);
  });

  // Esta es la que importa: si se cambia el aviso y esto no detecta la
  // diferencia, la gente sigue con un consentimiento que ya no
  // corresponde a lo que dice el texto.
  it("quien aceptó una versión anterior, NO", () => {
    expect(aceptoVigente({ legal: { version: VERSION - 1 } })).toBe(false);
  });

  it("una versión posterior también vale (no se degrada al desplegar)", () => {
    expect(aceptoVigente({ legal: { version: VERSION + 1 } })).toBe(true);
  });

  it("el sello lleva versión, fecha del texto y momento de aceptación", () => {
    const s = selloDeAceptacion();
    expect(s.version).toBe(VERSION);
    expect(s.fecha).toBe(FECHA);
    expect(() => new Date(s.aceptadoEn).toISOString()).not.toThrow();
  });
});

describe("el aviso de privacidad", () => {
  const titulos = AVISO.secciones.map((s) => s.t.toLowerCase());
  const todo = comoTexto(AVISO).toLowerCase();

  // Lo que la LFPDPPP pide que un aviso diga. Si alguien borra una
  // sección al reescribir el texto, esto lo caza.
  it.each([
    ["qué datos se recaban", "qué datos recabamos"],
    ["para qué se usan", "para qué los usamos"],
    ["con quién se comparten", "con quién se comparten"],
    ["cuánto se conservan", "cuánto tiempo los conservamos"],
    ["los derechos ARCO", "tus derechos arco"],
    ["cómo revocar el consentimiento", "revocar tu consentimiento"],
    ["cómo se avisan los cambios", "cambios a este aviso"],
  ])("tiene la sección de %s", (_, titulo) => {
    expect(titulos).toContain(titulo);
  });

  it("nombra a los cuatro terceros con los que se comparten datos", () => {
    for(const quien of ["firebase", "gemini", "sat", "opentimestamps"]){
      expect(todo).toContain(quien);
    }
  });

  it("dice a dónde escribir para ejercer los derechos", () => {
    expect(todo).toContain(RESPONSABLE.correo.toLowerCase());
  });

  // Es la duda razonable de cualquiera que oiga «se publica en
  // Bitcoin»: el aviso tiene que decir que NO viajan sus datos ahí.
  it("aclara que al anclar no se publica nada identificable", () => {
    const s = AVISO.secciones.find((x) => x.t === "Para qué los usamos");
    const linea = s.lista.find((l) => l.includes("Bitcoin"));
    expect(linea).toMatch(/no viaja ahí tu nombre/);
    expect(linea).toMatch(/ni nada que permita identificarte/);
  });

  it("no promete que no se recaban datos sensibles sin explicar la excepción", () => {
    expect(todo).toContain("si tú los incluyes dentro de un documento");
  });
});

describe("los términos de uso", () => {
  const todo = comoTexto(TERMINOS).toLowerCase();

  // Las cuatro cosas que el producto NO es. Prometer de más aquí es lo
  // que mete en problemas, no prometer de menos.
  it.each([
    ["no somos notario", "no somos notario ni fedatario"],
    ["no damos asesoría legal", "no damos asesoría legal"],
    ["no validamos la veracidad", "no validamos la veracidad"],
    ["el SAT es la fuente", "la fuente oficial es el sat"],
  ])("deja claro que %s", (_, frase) => {
    expect(todo).toContain(frase);
  });

  // Mientras la firma sea con código o biometría, decir o dejar
  // entender que es avanzada sería falso.
  it("dice que la firma NO es avanzada", () => {
    expect(todo).toContain("firma electrónica simple");
    expect(todo).toContain("no es una firma electrónica avanzada");
  });

  it("advierte que el anclaje tarda en confirmarse", () => {
    expect(todo).toMatch(/tarda entre unas horas y un día/);
  });

  it("se rige por ley mexicana", () => {
    expect(todo).toContain("estados unidos mexicanos");
  });

  it("dice que durante el piloto es gratis", () => {
    expect(todo).toContain("el servicio es gratuito");
  });
});

describe("lo que falta por decidir", () => {
  // Estos marcadores tienen que seguir viéndose hasta que exista la
  // empresa y el dominio. Publicar un aviso que diga «[Domicilio en
  // México]» es feo; publicarlo sin darse cuenta es peor.
  it("los datos del responsable siguen marcados como pendientes", () => {
    for(const v of Object.values(RESPONSABLE)){
      if(v === RESPONSABLE.producto) continue;
      expect(v).toMatch(/^\[.*\]$/);
    }
  });

  it("los dos textos avisan que es una versión piloto", () => {
    expect(comoTexto(AVISO)).toMatch(/versión piloto/i);
    expect(comoTexto(TERMINOS)).toMatch(/versión piloto/i);
  });
});

describe("pintar el texto", () => {
  it("parte el resaltado en trozos", () => {
    expect(trozos("hola **mundo** adiós")).toEqual([
      { fuerte: false, texto: "hola " },
      { fuerte: true, texto: "mundo" },
      { fuerte: false, texto: " adiós" },
    ]);
  });

  it("un texto sin resaltado es un solo trozo", () => {
    expect(trozos("nada que resaltar")).toEqual([
      { fuerte: false, texto: "nada que resaltar" },
    ]);
  });

  it("la versión en texto plano no deja asteriscos sueltos", () => {
    for(const doc of Object.values(DOCUMENTOS)){
      expect(comoTexto(doc)).not.toContain("**");
    }
  });

  it("sinMarcas quita el resaltado", () => {
    expect(sinMarcas("**Google** aloja los datos")).toBe("Google aloja los datos");
  });

  it("el texto plano trae título, versión y todas las secciones", () => {
    const t = comoTexto(AVISO);
    expect(t).toContain(AVISO.titulo.toUpperCase());
    expect(t).toContain(`Versión ${VERSION}`);
    for(const s of AVISO.secciones) expect(t).toContain(s.t.toUpperCase());
  });
});

describe("forma de los documentos", () => {
  it("cada sección tiene título y algo que decir", () => {
    for(const doc of Object.values(DOCUMENTOS)){
      for(const s of doc.secciones){
        expect(s.t.length).toBeGreaterThan(3);
        const tiene = (s.p?.length || 0) + (s.lista?.length || 0);
        expect(tiene).toBeGreaterThan(0);
      }
    }
  });

  it("ninguna sección se quedó a medias", () => {
    for(const doc of Object.values(DOCUMENTOS)){
      for(const s of doc.secciones){
        for(const texto of [...(s.p || []), ...(s.lista || [])]){
          expect(texto.trim().length).toBeGreaterThan(20);
        }
      }
    }
  });
});