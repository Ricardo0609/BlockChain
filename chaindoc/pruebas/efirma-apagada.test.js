// La e.firma, apagada para el primer MVP.
//
// Decision de Ricardo el 11 de noviembre: «lo de poder firmar con la
// e.firma por ahora hay que apagarlo, o sea no quitarlo por completo,
// que siga ahi en los archivos pero apagado [...] solo prender la
// opcion».
//
// El motivo no es tecnico. Funciona, y esta probada de punta a punta
// contra certificados sinteticos. Es de confianza: a quien ve el
// producto por primera vez, que le pidan su e.firma le suena a tramite
// del SAT y a entregar su llave privada. Nada de eso pasa -el `.key`
// nunca sale de su computadora- pero hay que explicarlo, y un MVP no
// se puede permitir una pantalla que necesite explicacion antes de que
// nadie haya entendido el producto.
//
// Este archivo vigila tres cosas, y la segunda es la que de verdad
// importa:
//
//   1. Que estando apagada, no se ofrezca.
//   2. Que no se pueda encender A MEDIAS. Son dos interruptores, uno
//      en el navegador y otro en el servidor, y si se cambia uno solo
//      el resultado es una opcion en pantalla que el servidor rechaza
//      -o peor, una opcion escondida que el servidor sigue aceptando-.
//   3. Que no se haya borrado nada. Ricardo dijo «que siga ahi en los
//      archivos», y la unica forma de que eso no se pierda en seis
//      meses es que algo falle si se pierde.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { aceptaEfirma, leTocaEfirma, EFIRMA_ENCENDIDA } from "../src/nucleo/catalogos";

const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), "utf8");

describe("apagada, no se ofrece", () => {
  it("a ningun documento, de ningun tipo", () => {
    for(const tplId of ["contrato", "inteligente", "recibo", "factura", null]){
      expect(aceptaEfirma({ tplId }), `tplId ${tplId}`).toBe(false);
    }
    expect(aceptaEfirma(null)).toBe(false);
  });

  it("y la pantalla de firmar lo pregunta antes de pintar la opcion", () => {
    // Si el panel se pintara sin preguntar, apagar la bandera no
    // serviria de nada: la opcion seguiria ahi.
    const firma = leer("src/modales/Firma.jsx");
    expect(firma).toMatch(/aceptaEfirma\(d\)\s*&&/);
  });
});

// ── LA REGLA SOBREVIVE AL INTERRUPTOR ───────────────────────────
//
// `leTocaEfirma` es a QUIEN le toca; `aceptaEfirma` es si ademas esta
// encendida. Separadas a proposito: el dia que se encienda, la regla
// de abajo tiene que seguir probada, y si estuvieran en una sola
// funcion estas comprobaciones habrian desaparecido al apagarla.
describe("a quien le tocaria, cuando se encienda", () => {
  it("a un contrato si", () => {
    expect(leTocaEfirma({ tplId: "contrato" })).toBe(true);
    expect(leTocaEfirma({ tplId: "inteligente" })).toBe(true);
    expect(leTocaEfirma({ tplId: "recibo" })).toBe(true);
  });

  it("a una factura no", () => {
    // Un CFDI ya viene sellado por quien lo emitio y timbrado por el
    // SAT. Volver a firmarlo no agrega nada.
    expect(leTocaEfirma({ tplId: "factura" })).toBe(false);
  });

  it("a un documento sin plantilla si, y a nada no", () => {
    expect(leTocaEfirma({ tplId: null })).toBe(true);
    expect(leTocaEfirma(null)).toBe(false);
  });
});

// ── LA QUE IMPORTA ──────────────────────────────────────────────
describe("los dos interruptores van juntos", () => {
  const delServidor = () => {
    const s = leer("functions/index.js");
    const m = s.match(/^const EFIRMA_ENCENDIDA = (true|false);$/m);
    expect(m, "no encontre EFIRMA_ENCENDIDA en functions/index.js").not.toBe(null);
    return m[1] === "true";
  };

  it("el del navegador y el del servidor dicen lo mismo", () => {
    // Encender solo el del navegador deja una opcion que falla al
    // pulsarla. Encender solo el del servidor deja abierta una puerta
    // que nadie vigila en pantalla. Las dos mitades, o ninguna.
    expect(delServidor()).toBe(EFIRMA_ENCENDIDA);
  });

  it("el servidor rechaza las dos funciones mientras este apagada", () => {
    // Esta es la mitad que cierra de verdad: esconder un boton no
    // impide llamar a la funcion.
    const s = leer("functions/index.js");
    for(const fn of ["retoEfirma", "firmarConEfirma"]){
      const i = s.indexOf(`export const ${fn} = onCall`);
      expect(i, fn).toBeGreaterThan(-1);
      const cabeza = s.slice(i, i + 700);
      expect(cabeza, `${fn} no llama a efirmaEncendida()`).toMatch(/efirmaEncendida\(\)/);
    }
    expect(s).toMatch(/function efirmaEncendida\(\)/);
  });

  it("y la landing no promete lo que no esta", () => {
    // Prometer la e.firma en la pagina que vende el producto y no
    // tenerla dentro es la peor combinacion de las posibles.
    const landing = leer("public/landing.html");
    if(!EFIRMA_ENCENDIDA) expect(landing).not.toMatch(/e\.firma/);
  });
});

// ── Y QUE NO SE HAYA BORRADO NADA ───────────────────────────────
describe("el codigo sigue donde estaba", () => {
  it("los modulos que hacen el trabajo", () => {
    // «Que siga ahi en los archivos». Dentro de unos meses nadie se va
    // a acordar de que esto estaba apagado y no muerto; una limpieza
    // bienintencionada se lo llevaria por delante.
    expect(leer("src/nucleo/efirma.js")).toMatch(/export/);
    expect(leer("src/nucleo/asn1.js")).toMatch(/export/);
    expect(leer("src/nucleo/des.js")).toMatch(/export/);
    expect(leer("src/ui/EfirmaPanel.jsx")).toMatch(/export/);
    expect(leer("functions/lib/efirma.js")).toMatch(/export/);
  });

  it("y el cuerpo de las dos funciones del servidor, entero", () => {
    const s = leer("functions/index.js");
    // Las piezas de la comprobacion de verdad: el reto de un solo uso,
    // la cadena de confianza del SAT y el asiento de la firma.
    expect(s).toMatch(/nuevoReto\("efirma"/);
    expect(s).toMatch(/retoValido\(guardado, \{ motivo: "efirma"/);
    expect(s).toMatch(/fuerza: "efirma"/);
  });

  it("el aviso legal sigue diciendo la verdad sobre la firma", () => {
    // Este texto no cambia al apagar la e.firma: dice que la firma con
    // codigo o huella NO es avanzada y que para eso hace falta la
    // e.firma. Con la e.firma apagada eso es mas cierto, no menos.
    const legal = leer("src/nucleo/legal.js");
    expect(legal).toMatch(/No es una firma electrónica avanzada/);
    expect(legal).toMatch(/e\.firma del SAT o un certificado equivalente/);
  });
});
