// Pruebas de utilidades: lectura de facturas, sellos y limpieza de llaves.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFactura } from "../src/nucleo/extraccion";
import { limpiar, limpiarProfundo, filtrarRastro } from "../src/monitoreo";

describe("lectura de facturas (OCR)", () => {
  const texto = `FACTURA
Folio: A-123
Fecha: 2026-09-21
Emisor:
Materiales del Norte SA de CV
RFC MNO010101AB1  RFC CLT990101XY2
Concepto: Cubierta de cuarzo 4.5 m
Subtotal $ 18,965.52
IVA (16%) $ 3,034.48
Total $ 22,000.00
UUID 6F9619FF-8B86-D011-B42D-00C04FC964FF`;

  it("extrae los campos principales", () => {
    const f = parseFactura(texto);
    expect(f).toMatchObject({
      folio: "A-123", fecha: "2026-09-21",
      rfcEmisor: "MNO010101AB1", rfcReceptor: "CLT990101XY2",
      subtotal: "18965.52", iva: "3034.48", total: "22000.00",
      uuid: "6F9619FF-8B86-D011-B42D-00C04FC964FF",
      emisor: "Materiales del Norte SA de CV",
    });
  });

  it("convierte fechas dd/mm/aaaa", () => {
    expect(parseFactura("Fecha 5/9/2026").fecha).toBe("2026-09-05");
  });
});

describe("monitoreo: nunca envía llaves", () => {
  it("oculta ?key= en URLs", () => {
    expect(limpiar("https://x.googleapis.com/v1/models?key=AIzaSECRETO&alt=json"))
      .toBe("https://x.googleapis.com/v1/models?key=[oculta]&alt=json");
  });

  it("limpia objetos anidados", () => {
    const e = limpiarProfundo({ request: { url: "https://a.com/?token=abc" }, extra: ["&apiKey=zzz"] });
    expect(JSON.stringify(e)).not.toMatch(/abc|zzz/);
  });

  it("descarta los console.log (pueden llevar texto de contratos)", () => {
    expect(filtrarRastro({ category: "console", level: "log", message: "contrato..." })).toBeNull();
    expect(filtrarRastro({ category: "fetch", data: { url: "/x?key=S" } }).data.url).toBe("/x?key=[oculta]");
  });
});

// ── El mensaje de error que ve el usuario (11 oct) ────────────
//
// Al intentar borrar un documento compartido, el servidor contesta
// «Sólo el dueño puede eliminarlo» — y la interfaz lo cambiaba por un
// «No tienes permiso para hacer esto en este documento» que no dice
// nada, o peor, por un «Error» a secas. El motivo tiene que llegar
// entero: es lo único que le dice al usuario qué hacer después.
import { errorBackend } from "../src/nucleo/backend";

describe("errorBackend", () => {
  it("respeta el mensaje que escribió el servidor", () => {
    expect(errorBackend({ code: "functions/permission-denied",
                          message: "Sólo el dueño puede eliminarlo." }))
      .toBe("Sólo el dueño puede eliminarlo.");
    expect(errorBackend({ code: "functions/permission-denied",
                          message: "No tienes una solicitud abierta para ese requisito." }))
      .toBe("No tienes una solicitud abierta para ese requisito.");
  });

  it("un mensaje NUESTRO gana al generico, aunque el codigo sea del transporte", () => {
    // ← NUEVO (17 nov). El fallo que vio Ricardo: analizar un contrato
    // con la cuota de Gemini agotada devuelve `unavailable` -que es un
    // 503 en el navegador- con el texto «Se agoto la cuota de
    // analisis por ahora, espera un minuto». En pantalla salia «No se
    // pudo contactar al servidor. Revisa tu conexion». Su conexion
    // estaba perfecta: le mandamos a revisar lo que no estaba roto y
    // escondimos lo unico que decia que hacer.
    //
    // La marca `deOctavin` la pone la funcion al lanzar el error. Se
    // sabe, no se adivina: mi primer intento miraba el texto para
    // decidir si «parecia» nuestro, y «fetch failed» -que es del SDK-
    // tambien lo parecia.
    expect(errorBackend({
      code: "functions/unavailable",
      message: "Se agotó la cuota de análisis por ahora. Espera un minuto e inténtalo de nuevo.",
      details: { deOctavin: true, motivo: "cuota" },
    })).toMatch(/cuota de análisis/);

    expect(errorBackend({
      code: "functions/unavailable",
      message: "El servicio de IA está saturado en este momento. Espera un par de minutos.",
      details: { deOctavin: true, motivo: "saturado" },
    })).toMatch(/saturado/);

    // Sin la marca, manda el generico: es un fallo del transporte.
    expect(errorBackend({ code: "functions/unavailable", message: "fetch failed" }))
      .toBe("No se pudo contactar al servidor. Revisa tu conexión.");
  });

  it("y el servidor marca los suyos donde se perdian", () => {
    // Si la funcion dejara de marcarlos, el mensaje volveria a
    // cambiarse por «revisa tu conexion» sin que nadie se entere.
    const srv = readFileSync(
      new URL("../functions/index.js", import.meta.url), "utf8");
    const marcas = [...srv.matchAll(/deOctavin: true, motivo/g)];
    expect(marcas.length, "analizarContrato y redactarBorrador").toBe(2);
  });

  it("traduce los errores del transporte, que vienen en jerga", () => {
    // Estos no los escribimos nosotros: los pone el SDK, en inglés.
    expect(errorBackend({ code: "functions/unavailable", message: "fetch failed" }))
      .toBe("No se pudo contactar al servidor. Revisa tu conexión.");
    expect(errorBackend({ code: "functions/unauthenticated", message: "UNAUTHENTICATED" }))
      .toBe("Tu sesión expiró. Vuelve a iniciar sesión.");
    expect(errorBackend({ code: "functions/internal", message: "INTERNAL" }))
      .toBe("El servidor no pudo completar la operación.");
  });

  it("tiene respaldo cuando no viene mensaje", () => {
    expect(errorBackend({ code: "functions/permission-denied" }))
      .toBe("No tienes permiso para hacer esto en este documento.");
    expect(errorBackend({ code: "functions/not-found", message: "  " }))
      .toBe("El documento ya no existe.");
  });

  it("no se cae con cualquier cosa", () => {
    expect(errorBackend(null)).toBe("No se pudo completar la operación.");
    expect(errorBackend({})).toBe("No se pudo completar la operación.");
    expect(typeof errorBackend(new Error("algo"))).toBe("string");
  });
});
