// Los correos que manda Firebase, en espanol.
//
// Confirmar el correo, recuperar la contrasena y deshacer un cambio de
// correo los manda Firebase, no nosotros. Sin fijar el idioma salen en
// ingles: la segunda pantalla que ve alguien que acaba de registrarse
// en un producto en espanol seria un correo en ingles.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const fb = readFileSync(new URL("../src/firebase.js", import.meta.url), "utf8");

describe("el idioma de los correos", () => {
  it("se fija en espanol", () => {
    expect(fb).toMatch(/auth\.languageCode\s*=\s*"es"/);
  });

  it("y se fija DESPUES de crear el auth, que si no no se aplica", () => {
    expect(fb.indexOf("auth.languageCode")).toBeGreaterThan(fb.indexOf("export const auth = getAuth(app)"));
  });

  it("no se deja al idioma del navegador", () => {
    // El producto tiene una sola version, en espanol. Con el idioma
    // del navegador, alguien con el sistema en ingles recibiria el
    // correo en ingles y la aplicacion en espanol.
    // La llamada, no la palabra: el comentario de al lado la nombra
    // para explicar por que NO se usa.
    expect(fb).not.toMatch(/auth\.useDeviceLanguage\(/);
  });
});

describe("App Check esta escrito y solo le falta la llave", () => {
  it("el navegador lo enciende si hay llave, y sin ella no estorba", () => {
    expect(fb).toMatch(/APP_CHECK = Boolean\(ENV\.VITE_RECAPTCHA_KEY\)/);
  });

  it("usa el proveedor de Fraud Defense, no el Classic", () => {
    // Google dejo de permitir llaves Classic nuevas en 2024: el
    // proveedor viejo pide una llave que ya no se puede conseguir.
    expect(fb).toMatch(/ReCaptchaEnterpriseProvider\(ENV\.VITE_RECAPTCHA_KEY\)/);
    expect(fb).not.toMatch(/new ReCaptchaV3Provider\(/);
  });

  it("el servidor lo exige solo cuando se le dice", () => {
    // Asi se puede desplegar primero, mirar en la consola que todas
    // las llamadas traen su distintivo, y recien entonces cerrar.
    const srv = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
    expect(srv).toMatch(/process\.env\.EXIGIR_APPCHECK === "1"/);
    expect(srv).toMatch(/enforceAppCheck: APPCHECK/);
  });

  it("y las dos variables estan documentadas donde se buscan", () => {
    const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    expect(env).toMatch(/VITE_RECAPTCHA_KEY=/);
    expect(env).toMatch(/VITE_APPCHECK_DEBUG/);
    // Y dice que esta no es la Classic, que es el error que se puede
    // cometer: Google ya no permite llaves nuevas de esas.
    expect(env).toMatch(/Fraud Defense/);
    expect(env).toMatch(/NO sirve una llave de reCAPTCHA Classic/);
  });
});
