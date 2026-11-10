// El enlace de entrega: de ?entrega= a /e/
//
// Lo que esto protege no es el formato nuevo, es el VIEJO. Hay enlaces
// repartidos que viven en bandejas de entrada de gente que no tiene
// cuenta y a la que no se le puede volver a mandar nada. Si dejan de
// leerse, esa persona se queda sin poder entregar y nadie se entera.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  testigoDeUrl, enlaceDeEntrega, limpiarUrlDeEntrega,
} from "../src/nucleo/invitaciones.js";

const T = "a9f3K2mZq8Lp";
let reemplazos;

/** Un window de mentira, que en Node no hay. */
function enLa(href) {
  const u = new URL(href);
  globalThis.window = {
    location: { href, origin: u.origin, pathname: u.pathname, search: u.search },
    history: { replaceState: (_a, _b, url) => reemplazos.push(url) },
  };
}
beforeEach(() => { reemplazos = []; });
afterEach(() => { delete globalThis.window; });

describe("leer el testigo de la direccion", () => {
  it("del camino corto", () => {
    enLa(`https://octavin.mx/e/${T}`);
    expect(testigoDeUrl()).toBe(T);
  });

  it("y del viejo, que sigue vivo en bandejas de entrada", () => {
    enLa(`https://octavin.mx/?entrega=${T}`);
    expect(testigoDeUrl()).toBe(T);
  });

  it("aguanta la barra de mas que anade el navegador", () => {
    enLa(`https://octavin.mx/e/${T}/`);
    expect(testigoDeUrl()).toBe(T);
  });

  it("y los caracteres escapados", () => {
    enLa("https://octavin.mx/e/a%2Fb");
    expect(testigoDeUrl()).toBe("a/b");
  });

  it("sin testigo, nada", () => {
    enLa("https://octavin.mx/");
    expect(testigoDeUrl()).toBe(null);
    enLa("https://octavin.mx/e/");
    expect(testigoDeUrl()).toBe(null);
    enLa("https://octavin.mx/?entrega=");
    expect(testigoDeUrl()).toBe(null);
  });

  it("una ruta cualquiera no se confunde con una entrega", () => {
    enLa("https://octavin.mx/ejemplo");
    expect(testigoDeUrl()).toBe(null);
  });

  it("sin window no truena", () => {
    delete globalThis.window;
    expect(testigoDeUrl()).toBe(null);
  });
});

describe("armar el enlace", () => {
  it("sale el corto", () => {
    enLa("https://octavin.mx/");
    expect(enlaceDeEntrega(T)).toBe(`https://octavin.mx/e/${T}`);
  });

  it("sin el ? que parten WhatsApp y Outlook", () => {
    enLa("https://octavin.mx/");
    expect(enlaceDeEntrega(T)).not.toContain("?");
  });

  it("lo que arma se puede volver a leer", () => {
    // La unica prueba que importa de verdad de las dos juntas.
    enLa("https://octavin.mx/");
    const url = enlaceDeEntrega(T);
    enLa(url);
    expect(testigoDeUrl()).toBe(T);
  });

  it("y con un testigo raro tambien", () => {
    enLa("https://octavin.mx/");
    const raro = "a/b c+d";
    const url = enlaceDeEntrega(raro);
    enLa(url);
    expect(testigoDeUrl()).toBe(raro);
  });
});

describe("quitar el testigo de la barra de direcciones", () => {
  it("el corto se va a la raiz", () => {
    enLa(`https://octavin.mx/e/${T}`);
    limpiarUrlDeEntrega();
    expect(reemplazos).toEqual(["/"]);
  });

  it("el viejo pierde el parametro y conserva la ruta", () => {
    enLa(`https://octavin.mx/?entrega=${T}`);
    limpiarUrlDeEntrega();
    expect(reemplazos[0]).toBe("/");
  });

  it("no se lleva por delante otros parametros", () => {
    enLa(`https://octavin.mx/?entrega=${T}&otro=1`);
    limpiarUrlDeEntrega();
    expect(reemplazos[0]).toContain("otro=1");
    expect(reemplazos[0]).not.toContain("entrega");
  });

  it("si el navegador no deja, no truena", () => {
    enLa("https://octavin.mx/e/x");
    globalThis.window.history.replaceState = () => { throw new Error("no"); };
    expect(() => limpiarUrlDeEntrega()).not.toThrow();
  });
});
