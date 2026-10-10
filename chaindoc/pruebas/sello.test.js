// El sello de firma: la clave, el congelado y el trazo.
//
// Lo que esta prueba cuida, en orden de importancia:
//
//  1. Que la clave de una cuenta NO dependa del nombre actual. Si
//     alguien se edita el nombre y su sello cambia, cambian también
//     las firmas que ya están asentadas en la cadena — y eso rompe la
//     promesa entera del producto.
//  2. Que dos personas no acaben con el mismo dibujo.
//  3. Que el trazo sea reproducible: la misma clave, el mismo dibujo,
//     hoy y en dos años.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  abreviar, claveDeSello, numeroTexto, semillaDeOrden, soloLetras,
  esSelloViejo, VERSION_SELLO,
} from "../src/nucleo/sello";
import { letrasDe, getLetterDNA } from "../src/ui/trazoSello";
import * as servidor from "../functions/lib/sello.js";

describe("abreviar un nombre", () => {
  it("toma las dos primeras letras de cada parte", () => {
    expect(abreviar("Fernando Lopez Martinez")).toBe("FELOMA");
    expect(abreviar("Ricardo Cabrera")).toBe("RICA");
  });

  it("se salta las partículas, que no identifican a nadie", () => {
    // Sin esto saldría "JUDELACRPE": cuatro letras de ruido en un
    // dibujo donde cada letra ocupa un arco del círculo.
    expect(abreviar("Juan de la Cruz Perez")).toBe("JUCRPE");
    expect(abreviar("Maria del Carmen Santa Cruz")).toBe("MACACR");
  });

  it("dobla acentos y conserva la ñ como N", () => {
    // El trazo borra todo lo que no sea A-Z, así que una ñ sin doblar
    // desaparecería del sello.
    expect(abreviar("Ñuño Peña Ibáñez")).toBe("NUPEIB");
    expect(soloLetras("José Ángel")).toBe("JOSEANGEL");
  });

  it("corta a cuatro partes", () => {
    // Sin tope, un nombre largo llena el círculo de arcos minúsculos.
    expect(abreviar("Jose Maria Fernandez del Valle Santamaria")).toBe("JOMAFEVA");
  });

  it("aguanta lo vacío y lo que no trae letras latinas", () => {
    expect(abreviar("")).toBe("");
    expect(abreviar("   ")).toBe("");
    expect(abreviar("李小龙")).toBe("");
    expect(abreviar(null)).toBe("");
  });
});

describe("la clave completa", () => {
  it("da el formato acordado", () => {
    expect(claveDeSello("Fernando Lopez Martinez", 1)).toBe("feloma01");
    expect(claveDeSello("Ricardo Cabrera", 2)).toBe("rica02");
  });

  it("rellena el número a dos cifras y crece solo", () => {
    expect(numeroTexto(1)).toBe("01");
    expect(numeroTexto(9)).toBe("09");
    expect(numeroTexto(10)).toBe("10");
    expect(numeroTexto(137)).toBe("137");
  });

  it("nunca sale vacía, aunque el nombre no sirva", () => {
    expect(claveDeSello("李小龙", 11)).toBe("xx11");
    expect(claveDeSello("", 3)).toBe("xx03");
  });

  it("dos personas con la misma abreviatura no comparten clave", () => {
    // Es el número quien garantiza que no se repita, no el nombre.
    expect(claveDeSello("Fernando Lopez Martinez", 42))
      .not.toBe(claveDeSello("Felipe Lopez Mares", 43));
  });

  it("reconoce los sellos del sistema viejo", () => {
    expect(esSelloViejo("LG3")).toBe(true);
    expect(esSelloViejo("LG8")).toBe(true);
    expect(esSelloViejo("feloma01")).toBe(false);
    expect(esSelloViejo(null)).toBe(false);
  });
});

describe("el barajado del orden", () => {
  it("separa a dos personas que comparten abreviatura", () => {
    // Las dos claves se diferencian en una sola cifra, y en este trazo
    // una cifra casi no mueve el dibujo. La semilla sale del nombre
    // COMPLETO, así que sí cambia.
    const a = semillaDeOrden("Fernando Lopez Martinez", 42);
    const b = semillaDeOrden("Felipe Lopez Mares", 43);
    expect(a).not.toBe(b);
    expect(letrasDe("feloma42", a).join("")).not.toBe(letrasDe("feloma43", b).join(""));
  });

  it("es el mismo siempre para los mismos datos", () => {
    expect(semillaDeOrden("Ana Ruiz", 4)).toBe(semillaDeOrden("Ana Ruiz", 4));
    const s = semillaDeOrden("Ana Ruiz", 4);
    expect(letrasDe("anru04", s)).toEqual(letrasDe("anru04", s));
  });

  it("baraja sin perder ni inventar letras", () => {
    const antes = [..."FELOMA01"].sort().join("");
    const despues = letrasDe("feloma01", 987654).sort().join("");
    expect(despues).toBe(antes);
  });

  it("no se cae con claves de una letra o vacías", () => {
    expect(letrasDe("a", 1)).toEqual(["A"]);
    expect(letrasDe("", 1)).toEqual([]);
    expect(letrasDe(null, 1)).toEqual([]);
  });
});

describe("el trazo no cambia", () => {
  // Si esto se pone en rojo es que alguien tocó el motor del dibujo, y
  // eso redibuja TODOS los sellos ya estampados. No se arregla
  // actualizando el número: se crea una versión nueva y se deja la 1
  // como está.
  it("el ADN de una letra es siempre el mismo", () => {
    const a = getLetterDNA("A");
    expect(a.clusters).toHaveLength(1);
    expect(a.tendrils).toHaveLength(3);
    expect(a.splatters).toHaveLength(7);
    expect(a.baseThickness).toBeCloseTo(getLetterDNA("A").baseThickness, 12);
  });

  it("letras distintas dan ADN distinto", () => {
    expect(getLetterDNA("A").tendrils[0].length)
      .not.toBeCloseTo(getLetterDNA("B").tendrils[0].length, 6);
  });

  it("la versión del formato es la 1", () => {
    expect(VERSION_SELLO).toBe(1);
  });
});

describe("las dos copias de la regla", () => {
  it("el cliente y el servidor tienen el mismo cuerpo", () => {
    const corte = (ruta, marca) => {
      const t = readFileSync(new URL(ruta, import.meta.url), "utf8");
      return t.slice(t.indexOf(marca));
    };
    const marca = "/** La versión del formato.";
    expect(corte("../functions/lib/sello.js", marca))
      .toBe(corte("../src/nucleo/sello.js", marca));
  });

  it("y deciden igual sobre los mismos nombres", () => {
    const casos = [
      ["Fernando Lopez Martinez", 1], ["Juan de la Cruz Perez", 5],
      ["Ñuño Peña Ibáñez", 7], ["", 3], ["李小龙", 11],
    ];
    for(const [n, i] of casos){
      expect(servidor.claveDeSello(n, i)).toBe(claveDeSello(n, i));
      expect(servidor.semillaDeOrden(n, i)).toBe(semillaDeOrden(n, i));
    }
  });
});
