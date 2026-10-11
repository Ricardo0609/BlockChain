// Pruebas de utilidades: lectura de facturas, sellos y limpieza de llaves.
import { describe, it, expect } from "vitest";
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
