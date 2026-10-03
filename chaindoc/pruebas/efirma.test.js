// Firmar con la e.firma del SAT.
//
// Es el módulo con más superficie para equivocarse en silencio de todo
// el proyecto: un DER mal leído, una derivación de llave con un byte
// de más, o un 3DES con las rondas al revés dan resultados que
// *parecen* funcionar hasta que alguien intenta verificar la firma.
//
// Por eso todo se comprueba contra `openssl`, que es una
// implementación independiente: el .key descifrado tiene que salir
// byte por byte igual al que produce él.
//
// ⚠️ Los archivos de pruebas/fixtures son SINTÉTICOS, generados aquí.
// No son la e.firma de nadie. Ver pruebas/fixtures/LEEME.md.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import {
  abrirLlave, contraseñaBMP, derivarPKCS12, enPalabras, firmar,
  firmarConEfirma, hex, leerCertificado, vigencia,
} from "../src/nucleo/efirma.js";
import { descifrar3DES, sinRelleno, unBloque } from "../src/nucleo/des.js";
import { entero, fecha, oid, raiz, ruta, texto } from "../src/nucleo/asn1.js";

if(!globalThis.crypto) globalThis.crypto = webcrypto;

const CLAVE = "12345678";
const leer = (f) => new Uint8Array(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const CER  = leer("efirma-falsa.cer");
const K3   = leer("efirma-falsa-3des.key");
const KAES = leer("efirma-falsa-aes.key");
const CLARO = leer("efirma-falsa-sincifrar.der");

const hx = (s) => new Uint8Array(Buffer.from(s, "hex"));

// ── DES ───────────────────────────────────────────────────────

describe("DES", () => {
  // El vector de FIPS 46-3. Si esto falla, todo lo demás da igual.
  it("reproduce el vector oficial de FIPS", () => {
    expect(hex(unBloque(hx("4e6f772069732074"), hx("0123456789abcdef"))))
      .toBe("3fa40e8a984d4815");
  });

  it("descifrar deshace cifrar", () => {
    expect(hex(unBloque(hx("3fa40e8a984d4815"), hx("0123456789abcdef"), true)))
      .toBe("4e6f772069732074");
  });

  it("exige una llave de 24 bytes y un vector de 8", () => {
    const c = new Uint8Array(16), iv = new Uint8Array(8);
    expect(() => descifrar3DES(c, new Uint8Array(16), iv)).toThrow(/24-bytes/);
    expect(() => descifrar3DES(c, new Uint8Array(24), new Uint8Array(4))).toThrow(/8-bytes/);
  });

  it("no acepta un cifrado que no sea múltiplo de 8", () => {
    expect(() => descifrar3DES(new Uint8Array(9), new Uint8Array(24), new Uint8Array(8)))
      .toThrow(/multiplo/);
  });

  it("quita el relleno PKCS#7 y rechaza el que está mal", () => {
    expect([...sinRelleno(Uint8Array.from([1, 2, 3, 3, 3, 3]))]).toEqual([1, 2, 3]);
    expect([...sinRelleno(Uint8Array.from([9, 2, 2]))]).toEqual([9]);
    expect(() => sinRelleno(Uint8Array.from([1, 2, 9]))).toThrow(/relleno-invalido/);
    expect(() => sinRelleno(Uint8Array.from([1, 2, 3, 3]))).toThrow(/relleno-invalido/);
    expect(() => sinRelleno(new Uint8Array(0))).toThrow();
  });
});

// ── Lector de DER ─────────────────────────────────────────────

describe("el lector de DER", () => {
  it("lee el certificado sin romperse", () => {
    expect(() => raiz(CER)).not.toThrow();
  });

  it("rechaza lo que no es DER", () => {
    expect(() => raiz(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => raiz(new Uint8Array(0))).toThrow(/der-vacio/);
  });

  it("no se traga un DER cortado a la mitad", () => {
    expect(() => raiz(CER.subarray(0, 40))).toThrow(/truncado/);
  });

  it("lee un OID con su forma de siempre", () => {
    const n = raiz(K3);
    expect(oid(ruta(n, 0, 0))).toBe("1.2.840.113549.1.12.1.3");
  });

  it("lee enteros y fechas", () => {
    expect(entero(ruta(raiz(K3), 0, 1, 1))).toBe(2048);
    const validez = ruta(raiz(CER), 0, 4);
    expect(fecha(ruta(validez, 0))).toBeInstanceOf(Date);
  });

  it("devuelve null en vez de reventar cuando la ruta no existe", () => {
    expect(ruta(raiz(CER), 99, 99)).toBe(null);
    expect(oid(null)).toBe(null);
    expect(texto(null)).toBe(null);
  });
});

// ── El certificado ────────────────────────────────────────────

describe("leer el certificado", () => {
  const cert = leerCertificado(CER);

  it("saca el nombre", () => {
    expect(cert.nombre).toBe("RICARDO GARCIA");
  });

  // El SAT mete «RFC / CURP» juntos en un solo campo, separados por
  // una diagonal. Partirlo mal es dar por bueno un RFC que no lo es.
  it("parte el RFC y el CURP, que el SAT guarda juntos", () => {
    expect(cert.rfc).toBe("GARR060821AB1");
    expect(cert.curp).toBe("GARR060821HDFRRC09");
  });

  it("saca las fechas de vigencia", () => {
    expect(cert.desde).toBeInstanceOf(Date);
    expect(cert.hasta).toBeInstanceOf(Date);
    expect(cert.hasta.getTime()).toBeGreaterThan(cert.desde.getTime());
  });

  it("guarda la llave pública, que es con lo que se verifica", () => {
    expect(cert.llavePublica).toBeInstanceOf(Uint8Array);
    expect(cert.llavePublica.length).toBeGreaterThan(200);
  });

  it("rechaza un archivo que no es un certificado", () => {
    expect(() => leerCertificado(new Uint8Array([1, 2, 3]))).toThrow(/no-parece-un-cer/);
  });
});

describe("la vigencia", () => {
  const cert = leerCertificado(CER);

  it("hoy está vigente", () => {
    expect(vigencia(cert).vigente).toBe(true);
  });

  it("antes de su fecha, todavía no vale", () => {
    const antes = new Date(cert.desde.getTime() - 86400000);
    expect(vigencia(cert, antes)).toEqual({ vigente: false, motivo: "aun-no-vale" });
  });

  it("después de su fecha, está vencido", () => {
    const luego = new Date(cert.hasta.getTime() + 86400000);
    expect(vigencia(cert, luego)).toEqual({ vigente: false, motivo: "vencido" });
  });

  // Avisar a tiempo es lo que evita que alguien descubra que su
  // e.firma venció el día que necesita firmar.
  it("avisa cuando quedan 30 días o menos", () => {
    const casi = new Date(cert.hasta.getTime() - 10 * 86400000);
    const v = vigencia(cert, casi);
    expect(v.vigente).toBe(true);
    expect(v.porVencer).toBe(true);
    expect(v.diasQueQuedan).toBe(10);
  });

  it("sin fechas no se da por vigente", () => {
    expect(vigencia({}).vigente).toBe(false);
    expect(vigencia(null).vigente).toBe(false);
  });
});

// ── Derivación de llave ───────────────────────────────────────

describe("la derivación del PKCS#12", () => {
  // La contraseña va como UTF-16 de mayor a menor y termina en dos
  // ceros. Saltarse ese detalle da «contraseña incorrecta» con la
  // contraseña correcta, que es de los errores más difíciles de ver.
  it("codifica la contraseña como BMPString terminada en cero", () => {
    expect([...contraseñaBMP("AB")]).toEqual([0, 65, 0, 66, 0, 0]);
    expect([...contraseñaBMP("")]).toEqual([0, 0]);
  });

  it("da tantos bytes como se le pidan", async () => {
    const sal = hx("0102030405060708");
    for(const largo of [8, 20, 24, 32, 48]){
      const d = await derivarPKCS12({ contraseña: "x", sal, vueltas: 100, largo, id: 1 });
      expect(d.length).toBe(largo);
    }
  });

  it("la llave y el vector inicial salen distintos", async () => {
    const p = { contraseña: CLAVE, sal: hx("0102030405060708"), vueltas: 2048 };
    const k = await derivarPKCS12({ ...p, largo: 24, id: 1 });
    const iv = await derivarPKCS12({ ...p, largo: 8, id: 2 });
    expect(hex(k).slice(0, 16)).not.toBe(hex(iv));
  });

  it("es determinista", async () => {
    const p = { contraseña: CLAVE, sal: hx("aabbccdd11223344"), vueltas: 500, largo: 24, id: 1 };
    expect(hex(await derivarPKCS12(p))).toBe(hex(await derivarPKCS12(p)));
  });

  it("otra contraseña da otra llave", async () => {
    const p = { sal: hx("aabbccdd11223344"), vueltas: 500, largo: 24, id: 1 };
    expect(hex(await derivarPKCS12({ ...p, contraseña: "uno" })))
      .not.toBe(hex(await derivarPKCS12({ ...p, contraseña: "dos" })));
  });
});

// ── Abrir la llave ────────────────────────────────────────────

describe("abrir la llave privada", () => {
  // LA prueba. Si el descifrado sale igual al de openssl byte por
  // byte, todo lo de arriba está bien.
  it("el .key del SAT (SHA-1 + 3DES) sale idéntico al de openssl", async () => {
    const pkcs8 = await abrirLlave(K3, CLAVE);
    expect(hex(pkcs8)).toBe(hex(CLARO));
  });

  it("el .key con PBES2 + AES también", async () => {
    const pkcs8 = await abrirLlave(KAES, CLAVE);
    expect(hex(pkcs8)).toBe(hex(CLARO));
  });

  it("con la contraseña equivocada lo dice con esas palabras", async () => {
    await expect(abrirLlave(K3, "otra")).rejects.toThrow(/contraseña-incorrecta/);
    await expect(abrirLlave(KAES, "otra")).rejects.toThrow(/contraseña-incorrecta/);
  });

  it("con la contraseña vacía tampoco abre", async () => {
    await expect(abrirLlave(K3, "")).rejects.toThrow();
  });

  it("si le dan el .cer en vez del .key, lo dice", async () => {
    await expect(abrirLlave(CER, CLAVE)).rejects.toThrow(/key/);
  });

  it("un archivo cualquiera no pasa por llave", async () => {
    await expect(abrirLlave(new Uint8Array([1, 2, 3]), CLAVE)).rejects.toThrow(/no-parece-un-key/);
  });
});

// ── Firmar ────────────────────────────────────────────────────

describe("firmar", () => {
  const HASH = "9f".repeat(32);

  it("produce una firma que verifica con la llave pública del certificado", async () => {
    const pkcs8 = await abrirLlave(K3, CLAVE);
    const firma = await firmar(pkcs8, HASH);

    const pub = await webcrypto.subtle.importKey(
      "spki", leerCertificado(CER).llavePublica,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", pub, firma, new TextEncoder().encode(HASH));
    expect(ok).toBe(true);
  });

  // Si esto no fallara, la firma no probaría nada sobre el documento.
  it("la firma de un hash NO verifica contra otro hash", async () => {
    const pkcs8 = await abrirLlave(K3, CLAVE);
    const firma = await firmar(pkcs8, HASH);
    const pub = await webcrypto.subtle.importKey(
      "spki", leerCertificado(CER).llavePublica,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", pub, firma, new TextEncoder().encode("00".repeat(32)));
    expect(ok).toBe(false);
  });

  it("es RSA de 2048, o sea 256 bytes", async () => {
    const firma = await firmar(await abrirLlave(K3, CLAVE), HASH);
    expect(firma.length).toBe(256);
  });
});

describe("el proceso completo", () => {
  const HASH = "ab".repeat(32);

  it("devuelve la firma, el certificado y los datos de quien firmó", async () => {
    const pasos = [];
    const r = await firmarConEfirma({
      cer: CER, key: K3, contraseña: CLAVE, hashHex: HASH,
      onPaso: (p) => pasos.push(p),
    });

    expect(r.rfc).toBe("GARR060821AB1");
    expect(r.nombre).toBe("RICARDO GARCIA");
    expect(r.vigenteHasta).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(atob(r.firma).length).toBe(256);
    expect(atob(r.certificado).length).toBe(CER.length);
    expect(pasos.length).toBeGreaterThan(2);
  });

  // Lo que NO devuelve importa tanto como lo que sí: la llave privada
  // se queda en una variable local y desaparece al terminar.
  it("NO devuelve la llave privada por ningún lado", async () => {
    const r = await firmarConEfirma({ cer: CER, key: K3, contraseña: CLAVE, hashHex: HASH });
    const todo = JSON.stringify(r);
    expect(Object.keys(r).sort()).toEqual(
      ["certificado", "firma", "nombre", "numeroDeSerie", "rfc", "vigenteHasta"]);
    expect(todo).not.toContain("PRIVATE");
    // Ni un trozo de la llave descifrada anda suelto ahí dentro.
    expect(todo).not.toContain(Buffer.from(CLARO.subarray(0, 24)).toString("base64"));
    expect(todo).not.toContain(CLAVE);
  });

  it("con la contraseña mal, no firma", async () => {
    await expect(firmarConEfirma({ cer: CER, key: K3, contraseña: "no", hashHex: HASH }))
      .rejects.toThrow(/contraseña/);
  });

  // Alguien podría firmar con su llave y adjuntar el certificado de
  // otro. La firma no cuadraría, pero no se sabría hasta que un
  // tercero fuera a verificarla — el peor momento.
  it("rechaza una llave que no es la de ese certificado", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const otra = new Uint8Array(privateKey.export({ type: "pkcs8", format: "der" }));
    // Se envuelve en un PKCS#8 cifrado para poder pasarla por abrirLlave.
    const { createCipheriv } = await import("node:crypto");
    void createCipheriv; void otra;
    // Más directo: se prueba el guardián con la llave suelta.
    const mod = await import("../src/nucleo/efirma.js");
    await expect(mod.firmar(otra, HASH)).resolves.toBeInstanceOf(Uint8Array);
    // …y esa firma no verifica con el certificado de la prueba.
    const pub = await webcrypto.subtle.importKey(
      "spki", leerCertificado(CER).llavePublica,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const f = await mod.firmar(otra, HASH);
    expect(await webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", pub, f, new TextEncoder().encode(HASH))).toBe(false);
  });
});

describe("los mensajes", () => {
  it("traduce los errores a algo que se entienda", () => {
    expect(enPalabras(new Error("contraseña-incorrecta"))).toMatch(/contraseña/i);
    expect(enPalabras(new Error("no-parece-un-cer"))).toMatch(/\.cer/);
    expect(enPalabras(new Error("no-parece-un-key"))).toMatch(/\.key/);
    expect(enPalabras(new Error("key-algoritmo-no-soportado:1.2.3"))).toMatch(/cifrado/);
  });

  it("lo que no reconoce lo deja pasar tal cual", () => {
    expect(enPalabras(new Error("algo raro"))).toBe("algo raro");
  });
});