// Comprobación de la e.firma en el servidor.
//
// Aquí se decide si una firma vale, así que lo que estas pruebas
// cuidan sobre todo es que **NO** dé por buena una que no lo es.
//
// El ataque que importa es el más fácil de todos: fabricarse un
// certificado autofirmado que diga el RFC de otro. Pasa todas las
// comprobaciones que se le hacen a un certificado contra sí mismo. Lo
// único que lo caza es la cadena hasta una raíz del SAT, y por eso hay
// varias pruebas dedicadas a que esa comprobación no se pueda saltar.
//
// ⚠️ Los certificados de pruebas/fixtures son SINTÉTICOS. La «A.C.
// falsa del SAT» es una autoridad de mentira generada aquí, para poder
// probar la lógica de la cadena sin depender de la red.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { X509Certificate, webcrypto } from "node:crypto";
import {
  comoCertificados, enPalabras, loQueSeFirma, nombreDe, raicesDesdeZip,
  revisarEfirma, rfcDe, verificarCadena, verificarFirma,
} from "../functions/lib/efirma.js";
import { leerZip, nombreSeguro } from "../functions/lib/zip.js";
import { abrirLlave, firmar } from "../src/nucleo/efirma.js";

if(!globalThis.crypto) globalThis.crypto = webcrypto;

const leer = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const b64  = (f) => leer(f).toString("base64");

const ZIP       = new Uint8Array(leer("raices-falsas.zip"));
const CON_CA    = b64("efirma-falsa-con-ca.cer");     // emitido por la A.C. falsa
const AUTOFIRMA = b64("efirma-falsa.cer");            // se firmó a sí mismo
const HASH      = "7c".repeat(32);
const CLAVE     = "12345678";

const raices = raicesDesdeZip(ZIP);

/** Firma de verdad, con la llave del certificado que se le pase. */
async function firmarCon(archivoKey, hash = HASH){
  const pkcs8 = await abrirLlave(new Uint8Array(leer(archivoKey)), CLAVE);
  return Buffer.from(await firmar(pkcs8, hash)).toString("base64");
}

// ── El zip del SAT ────────────────────────────────────────────

describe("leer el zip del SAT", () => {
  it("saca los certificados que trae dentro", () => {
    expect(raices.length).toBeGreaterThan(0);
    expect(raices[0].sujeto).toMatch(/A\.C\. FALSA DEL SAT/);
    expect(raices[0].archivo).toMatch(/\.cer$/i);
  });

  it("guarda lo necesario para volver a armarlos después", () => {
    const vueltos = comoCertificados(raices);
    expect(vueltos.length).toBe(raices.length);
    expect(vueltos[0].cert).toBeInstanceOf(X509Certificate);
  });

  it("un zip sin certificados se rechaza en vez de dar una lista vacía", () => {
    // Una lista vacía haría que todo se rechazara «por falta de raíces»,
    // que parece un problema de red y no lo es.
    const vacio = new Uint8Array([
      0x50,0x4b,0x05,0x06, 0,0,0,0, 0,0, 0,0, 0,0,0,0, 0,0,0,0, 0,0]);
    expect(() => raicesDesdeZip(vacio)).toThrow(/no-traia-certificados/);
  });

  it("rechaza nombres que intentan salirse de su carpeta", () => {
    expect(nombreSeguro("../fuera.cer")).toBe(false);
    expect(nombreSeguro("/etc/passwd")).toBe(false);
    expect(nombreSeguro("C:\\windows\\x")).toBe(false);
    expect(nombreSeguro("a/../../b.cer")).toBe(false);
    expect(nombreSeguro("normal.cer")).toBe(true);
  });

  it("un zip sin índice no se lee", () => {
    expect(() => leerZip(new Uint8Array(100))).toThrow(/zip-sin-indice/);
  });
});

// ── La cadena ─────────────────────────────────────────────────

describe("la cadena hasta el SAT", () => {
  const lista = comoCertificados(raices);

  it("un certificado emitido por la autoridad, sube hasta ella", () => {
    const r = verificarCadena(new X509Certificate(Buffer.from(CON_CA, "base64")), lista);
    expect(r.ok).toBe(true);
    expect(r.raiz).toMatch(/A\.C\. FALSA DEL SAT/);
  });

  // ESTA es la prueba que justifica todo el módulo.
  it("un AUTOFIRMADO no sube a ninguna raíz", () => {
    const r = verificarCadena(new X509Certificate(Buffer.from(AUTOFIRMA, "base64")), lista);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("no-llega-a-una-raiz-del-sat");
  });

  it("sin raíces, nada sube", () => {
    const r = verificarCadena(new X509Certificate(Buffer.from(CON_CA, "base64")), []);
    expect(r.ok).toBe(false);
  });
});

// ── La firma ──────────────────────────────────────────────────

describe("la firma sobre el hash", () => {
  it("una firma de verdad verifica", async () => {
    const cert = new X509Certificate(Buffer.from(CON_CA, "base64"));
    expect(verificarFirma(cert, await firmarCon("efirma-falsa-con-ca.key"), HASH)).toBe(true);
  });

  it("no verifica contra otro hash", async () => {
    const cert = new X509Certificate(Buffer.from(CON_CA, "base64"));
    const firma = await firmarCon("efirma-falsa-con-ca.key");
    expect(verificarFirma(cert, firma, "00".repeat(32))).toBe(false);
  });

  it("no verifica con el certificado de otro", async () => {
    const otro = new X509Certificate(Buffer.from(AUTOFIRMA, "base64"));
    expect(verificarFirma(otro, await firmarCon("efirma-falsa-con-ca.key"), HASH)).toBe(false);
  });

  it("una firma inventada no verifica", () => {
    const cert = new X509Certificate(Buffer.from(CON_CA, "base64"));
    expect(verificarFirma(cert, Buffer.alloc(256).toString("base64"), HASH)).toBe(false);
    expect(verificarFirma(cert, "no-es-base64-valido!!", HASH)).toBe(false);
  });
});

// ── Datos del firmante ────────────────────────────────────────

describe("quién firmó", () => {
  const cert = new X509Certificate(Buffer.from(CON_CA, "base64"));

  it("saca el RFC de donde el SAT lo mete", () => {
    expect(rfcDe(cert)).toMatch(/^GARR060821AB1/);
  });

  it("saca el nombre", () => {
    expect(nombreDe(cert)).toBe("RICARDO GARCIA");
  });
});

// ── El veredicto ──────────────────────────────────────────────

describe("el veredicto completo", () => {
  it("una firma buena, con certificado del SAT, es válida", async () => {
    const r = revisarEfirma({
      certificadoB64: CON_CA, firmaB64: await firmarCon("efirma-falsa-con-ca.key"),
      hashHex: HASH, raices });

    expect(r.valida).toBe(true);
    expect(r.rfc).toMatch(/^GARR060821AB1/);
    expect(r.nombre).toBe("RICARDO GARCIA");
    expect(r.raiz).toMatch(/FALSA DEL SAT/);
    expect(r.vigenteHasta).toMatch(/^\d{4}-/);
  });

  // El caso que hay que impedir: firma impecable, certificado
  // impecable, RFC de quien sea. Todo cuadra menos quién lo emitió.
  it("RECHAZA una firma perfecta con certificado autofirmado", async () => {
    const r = revisarEfirma({
      certificadoB64: AUTOFIRMA, firmaB64: await firmarCon("efirma-falsa-3des.key"),
      hashHex: HASH, raices });

    expect(r.valida).toBe(false);
    expect(r.motivo).toBe("no-llega-a-una-raiz-del-sat");
    // Y no devuelve el RFC: si lo devolviera, alguien acabaría
    // enseñándolo aunque la firma no valga.
    expect(r.rfc).toBeUndefined();
    expect(r.nombre).toBeUndefined();
  });

  it("rechaza si la firma es de otro documento", async () => {
    const r = revisarEfirma({
      certificadoB64: CON_CA, firmaB64: await firmarCon("efirma-falsa-con-ca.key", "11".repeat(32)),
      hashHex: HASH, raices });
    expect(r.valida).toBe(false);
    expect(r.motivo).toBe("la-firma-no-corresponde");
  });

  it("rechaza un certificado vencido, aunque la firma esté bien", async () => {
    const cert = new X509Certificate(Buffer.from(CON_CA, "base64"));
    const despues = new Date(new Date(cert.validTo).getTime() + 86400000);
    const r = revisarEfirma({
      certificadoB64: CON_CA, firmaB64: await firmarCon("efirma-falsa-con-ca.key"),
      hashHex: HASH, raices, ahora: despues });
    expect(r.valida).toBe(false);
    expect(r.motivo).toBe("certificado-vencido");
  });

  // Sin raíces se rechaza, NO se da por buena «mientras tanto».
  it("sin los certificados del SAT, rechaza", async () => {
    const r = revisarEfirma({
      certificadoB64: CON_CA, firmaB64: await firmarCon("efirma-falsa-con-ca.key"),
      hashHex: HASH, raices: [] });
    expect(r.valida).toBe(false);
    expect(r.motivo).toBe("sin-raices-del-sat");
  });

  it("rechaza lo que le falta", () => {
    expect(revisarEfirma({ raices }).motivo).toBe("faltan-datos");
    expect(revisarEfirma({ certificadoB64: "no-es-un-cert", firmaB64: "x", hashHex: HASH, raices }).motivo)
      .toBe("certificado-ilegible");
  });
});

// ── Qué se firma ──────────────────────────────────────────────
//
// Estas tres pruebas son las que impiden que una firma buena sirva
// donde no debe: en otro expediente, sobre otra versión del mismo, o
// una segunda vez.

describe("lo que se firma", () => {
  const base = { opId: "abc123", sobreHash: "ff".repeat(32), reto: "R-1" };

  it("el mismo expediente y el mismo reto dan siempre lo mismo", () => {
    expect(loQueSeFirma(base).hashHex).toBe(loQueSeFirma({ ...base }).hashHex);
    expect(loQueSeFirma(base).hashHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia si cambia el expediente", () => {
    expect(loQueSeFirma({ ...base, opId: "otro" }).hashHex).not.toBe(loQueSeFirma(base).hashHex);
  });

  it("cambia si el documento cambió", () => {
    expect(loQueSeFirma({ ...base, sobreHash: "ab".repeat(32) }).hashHex)
      .not.toBe(loQueSeFirma(base).hashHex);
  });

  it("cambia con cada reto, para que una firma no se pueda reusar", () => {
    expect(loQueSeFirma({ ...base, reto: "R-2" }).hashHex).not.toBe(loQueSeFirma(base).hashHex);
  });

  it("el texto dice en claro qué se está firmando", () => {
    const { texto } = loQueSeFirma(base);
    expect(texto).toContain("chaindoc-efirma/1");
    expect(texto).toContain("expediente:abc123");
    expect(texto).toContain(base.sobreHash);
  });

  it("una firma sobre un reto no vale para otro", async () => {
    const cert = new X509Certificate(Buffer.from(CON_CA, "base64"));
    const uno = loQueSeFirma(base).hashHex;
    const dos = loQueSeFirma({ ...base, reto: "R-2" }).hashHex;
    const firma = await firmarCon("efirma-falsa-con-ca.key", uno);

    expect(verificarFirma(cert, firma, uno)).toBe(true);
    expect(verificarFirma(cert, firma, dos)).toBe(false);
  });
});

describe("los mensajes", () => {
  it("cada motivo tiene su explicación", () => {
    for(const m of ["faltan-datos","certificado-ilegible","certificado-vencido",
                    "la-firma-no-corresponde","sin-raices-del-sat","no-llega-a-una-raiz-del-sat"]){
      expect(enPalabras(m).length).toBeGreaterThan(15);
    }
  });

  it("el de «no lo emitió el SAT» lo dice con claridad", () => {
    expect(enPalabras("no-llega-a-una-raiz-del-sat")).toMatch(/no lo emitió el SAT/i);
  });

  it("un motivo desconocido no deja el mensaje vacío", () => {
    expect(enPalabras("cualquier-cosa")).toMatch(/no se pudo comprobar/i);
  });
});
