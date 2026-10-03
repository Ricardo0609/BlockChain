// ─────────────────────────────────────────────────────────────
// efirma.js — Firmar con la e.firma del SAT, en el navegador
//
// LA REGLA QUE MANDA SOBRE TODO LO DEMÁS
//
// La llave privada (.key) NO SALE DEL DISPOSITIVO. Nunca se sube, ni
// a nuestro servidor ni a ninguno. Se abre aquí, se usa para firmar
// aquí, y se descarta al terminar.
//
// Pedirle a alguien que suba su e.firma es pedirle la llave con la que
// presenta declaraciones. Nadie sensato lo hace, y si lo hiciera,
// nosotros acabaríamos guardando algo que no queremos guardar ni un
// segundo. Técnicamente se puede firmar en el navegador, así que no
// hay excusa para hacerlo de otra forma.
//
// Lo único que viaja al servidor es lo que un tercero necesita para
// comprobar la firma: el certificado —que es público— y la firma.
//
// QUÉ SE FIRMA
//
// El hash del bloque, no el documento. Es lo mismo que ya firma el
// código de firma: así la e.firma se engancha en el mismo sitio de la
// cadena y no hay dos formas distintas de encadenar.
//
// PARA QUÉ SIRVE, Y PARA QUÉ NO
//
// Una firma con e.firma es firma electrónica avanzada: acredita quién
// firmó, no sólo quién tenía acceso a la cuenta. Eso es lo que la
// distingue del código de firma. No la sustituye: el código sigue
// siendo el camino de todos los días, y la e.firma se ofrece donde
// vale la pena, que es al cerrar un contrato.
// ─────────────────────────────────────────────────────────────

import { buscar, entero, enteroHex, fecha, oid, raiz, ruta, texto, TIPO } from "./asn1";
import { descifrar3DES } from "./des";

// ── Identificadores que aparecen en estos archivos ────────────

export const OID = {
  // Cifrado de la llave
  PBE_SHA1_3DES: "1.2.840.113549.1.12.1.3",
  PBES2:         "1.2.840.113549.1.5.13",
  PBKDF2:        "1.2.840.113549.1.5.12",
  AES128_CBC:    "2.16.840.1.101.3.4.1.2",
  AES192_CBC:    "2.16.840.1.101.3.4.1.22",
  AES256_CBC:    "2.16.840.1.101.3.4.1.42",
  HMAC_SHA1:     "1.2.840.113549.2.7",
  HMAC_SHA256:   "1.2.840.113549.2.9",
  // Campos del sujeto del certificado
  NOMBRE_COMUN:  "2.5.4.3",
  ORGANIZACION:  "2.5.4.10",
  UNIDAD:        "2.5.4.11",
  CORREO:        "1.2.840.113549.1.9.1",
  // El SAT mete «RFC / CURP» aquí
  IDENTIFICADOR: "2.5.4.45",
  NUM_SERIE:     "2.5.4.5",
};

/** Tamaño de llave de cada cifrador, en bytes. */
const LARGO_AES = {
  [OID.AES128_CBC]: 16,
  [OID.AES192_CBC]: 24,
  [OID.AES256_CBC]: 32,
};

// ── Utilidades ────────────────────────────────────────────────

const unir = (...t) => {
  const s = new Uint8Array(t.reduce((n, x) => n + x.length, 0));
  let i = 0; for(const x of t){ s.set(x, i); i += x.length; }
  return s;
};

export const hex = (b) =>
  [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

const cripto = () => {
  const c = globalThis.crypto;
  if(!c?.subtle) throw new Error("sin-webcrypto");
  return c;
};

const digerir = (alg, datos) => cripto().subtle.digest(alg, datos);

// ── Derivación de llave del PKCS#12 (RFC 7292, apéndice B.2) ──

/**
 * La contraseña, como la espera el PKCS#12: UTF-16 de mayor a menor,
 * y terminada en dos ceros.
 *
 * Es un detalle fácil de pasar por alto y hace que la llave derivada
 * salga distinta, lo que se ve como «contraseña incorrecta» con la
 * contraseña correcta.
 */
export function contraseñaBMP(texto){
  const s = String(texto ?? "");
  const b = new Uint8Array(s.length * 2 + 2);
  for(let i = 0; i < s.length; i++){
    const c = s.charCodeAt(i);
    b[i * 2] = c >> 8;
    b[i * 2 + 1] = c & 0xff;
  }
  return b;   // los dos últimos quedan en cero
}

/** Repite `origen` hasta llenar un múltiplo de `bloque`. */
function estirar(origen, bloque){
  if(!origen.length) return new Uint8Array(0);
  const largo = Math.ceil(origen.length / bloque) * bloque;
  const s = new Uint8Array(largo);
  for(let i = 0; i < largo; i++) s[i] = origen[i % origen.length];
  return s;
}

/**
 * Deriva bytes a partir de la contraseña, la sal y un identificador:
 * 1 para la llave, 2 para el vector inicial.
 *
 * Es la parte del formato que más se equivoca al implementarla, así
 * que se comprueba contra openssl con archivos de verdad.
 */
export async function derivarPKCS12({ contraseña, sal, vueltas, largo, id, hash = "SHA-1" }){
  const u = hash === "SHA-1" ? 20 : 32;   // bytes que devuelve el hash
  const v = 64;                            // bloque del hash

  const D = new Uint8Array(v).fill(id);
  const S = estirar(sal, v);
  const P = estirar(contraseñaBMP(contraseña), v);
  let I = unir(S, P);

  const salida = new Uint8Array(largo);
  let puesto = 0;

  while(puesto < largo){
    // A = hash aplicado `vueltas` veces sobre D||I
    let A = new Uint8Array(await digerir(hash, unir(D, I)));
    for(let i = 1; i < vueltas; i++) A = new Uint8Array(await digerir(hash, A));

    const cuanto = Math.min(u, largo - puesto);
    salida.set(A.subarray(0, cuanto), puesto);
    puesto += cuanto;
    if(puesto >= largo) break;

    // B es A repetida hasta v bytes; después se le suma a cada trozo
    // de I, como enteros grandes, más uno.
    const B = estirar(A, v).subarray(0, v);
    for(let inicio = 0; inicio < I.length; inicio += v){
      let acarreo = 1;
      for(let k = v - 1; k >= 0; k--){
        const suma = I[inicio + k] + B[k] + acarreo;
        I[inicio + k] = suma & 0xff;
        acarreo = suma >> 8;
      }
    }
  }
  return salida;
}

// ── Abrir la llave privada ────────────────────────────────────

/**
 * Descifra un .key y devuelve el PKCS#8 en claro, listo para que Web
 * Crypto lo importe.
 *
 * Entiende los dos formatos con los que se topa uno: el clásico del
 * SAT (SHA-1 + 3DES) y PBES2 con AES, que es lo que producen las
 * herramientas modernas.
 */
export async function abrirLlave(bytes, contraseña){
  let nodo;
  try{ nodo = raiz(bytes); }
  catch{ throw new Error("no-parece-un-key"); }

  const algoritmo = oid(ruta(nodo, 0, 0));
  const cifrado = ruta(nodo, 1)?.bytes;
  if(!algoritmo || !cifrado) throw new Error("no-parece-un-key");

  if(algoritmo === OID.PBE_SHA1_3DES){
    const sal = ruta(nodo, 0, 1, 0)?.bytes;
    const vueltas = entero(ruta(nodo, 0, 1, 1));
    if(!sal || !vueltas) throw new Error("key-sin-parametros");

    const llave = await derivarPKCS12({ contraseña, sal, vueltas, largo: 24, id: 1 });
    const iv    = await derivarPKCS12({ contraseña, sal, vueltas, largo: 8,  id: 2 });
    try{
      return descifrar3DES(cifrado, llave, iv);
    }catch(e){
      // Con la contraseña equivocada sale ruido, y el ruido casi nunca
      // tiene un relleno válido. Es la forma de distinguir «te
      // equivocaste de contraseña» de «este archivo está roto».
      if(String(e.message).includes("relleno")){
        throw new Error("contraseña-incorrecta", { cause: e });
      }
      throw e;
    }
  }

  if(algoritmo === OID.PBES2){
    return await abrirPBES2(nodo, cifrado, contraseña);
  }

  throw new Error(`key-algoritmo-no-soportado:${algoritmo}`);
}

/** PBES2: PBKDF2 para derivar, AES-CBC para descifrar. Los dos los trae el navegador. */
async function abrirPBES2(nodo, cifrado, contraseña){
  const kdf = ruta(nodo, 0, 1, 0);
  const cif = ruta(nodo, 0, 1, 1);
  if(oid(ruta(kdf, 0)) !== OID.PBKDF2) throw new Error("key-kdf-no-soportado");

  const sal = ruta(kdf, 1, 0)?.bytes;
  const vueltas = entero(ruta(kdf, 1, 1));
  const algCifra = oid(ruta(cif, 0));
  const iv = ruta(cif, 1)?.bytes;
  const largo = LARGO_AES[algCifra];
  if(!sal || !vueltas || !iv || !largo) throw new Error("key-sin-parametros");

  // El hash del PBKDF2 va en un campo opcional; sin él es SHA-1.
  const prf = buscar(kdf, (n) =>
    n.etiqueta === TIPO.OID && [OID.HMAC_SHA1, OID.HMAC_SHA256].includes(oid(n)));
  const hash = oid(prf) === OID.HMAC_SHA256 ? "SHA-256" : "SHA-1";

  const base = await cripto().subtle.importKey(
    "raw", new TextEncoder().encode(String(contraseña ?? "")),
    "PBKDF2", false, ["deriveBits"]);
  const bits = await cripto().subtle.deriveBits(
    { name: "PBKDF2", salt: sal, iterations: vueltas, hash }, base, largo * 8);

  const llave = await cripto().subtle.importKey(
    "raw", bits, { name: "AES-CBC" }, false, ["decrypt"]);
  try{
    const claro = await cripto().subtle.decrypt({ name: "AES-CBC", iv }, llave, cifrado);
    return new Uint8Array(claro);
  }catch(e){
    // Con la contraseña equivocada, AES-CBC falla al comprobar el
    // relleno. Es la misma señal que en 3DES, con otro nombre.
    throw new Error("contraseña-incorrecta", { cause: e });
  }
}

// ── Leer el certificado ───────────────────────────────────────

/**
 * Saca del .cer lo que hay que enseñar y lo que hay que comprobar.
 *
 * El RFC vive en un campo que el SAT usa a su manera: mete «RFC / CURP»
 * junto, separados por una diagonal.
 */
export function leerCertificado(bytes){
  let nodo;
  try{ nodo = raiz(bytes); }
  catch{ throw new Error("no-parece-un-cer"); }

  const tbs = ruta(nodo, 0);
  if(!tbs) throw new Error("no-parece-un-cer");

  // Con versión explícita (v3) el número de serie es el hijo 1; sin
  // ella sería el 0. Los del SAT son v3, pero más vale mirarlo.
  const tieneVersion = tbs.hijos?.[0]?.etiqueta === 0xa0;
  const iSerie = tieneVersion ? 1 : 0;

  const serie = enteroHex(ruta(tbs, iSerie));
  const validez = ruta(tbs, iSerie + 3);
  const sujeto = ruta(tbs, iSerie + 4);
  const emisor = ruta(tbs, iSerie + 2);

  const campos = {};
  for(const conj of sujeto?.hijos || []){
    const par = conj.hijos?.[0];
    const clave = oid(ruta(par, 0));
    const valor = texto(ruta(par, 1));
    if(clave && valor != null) campos[clave] = valor;
  }

  const identificador = campos[OID.IDENTIFICADOR] || "";
  const [rfcCrudo, curpCrudo] = identificador.split("/").map((x) => (x || "").trim());

  return {
    serie,
    // El SAT numera sus certificados en decimal de 20 dígitos, que es
    // como se ve el número en los CFDI.
    numeroDeSerie: serieLegible(ruta(tbs, iSerie)?.bytes),
    nombre: campos[OID.NOMBRE_COMUN] || null,
    organizacion: campos[OID.ORGANIZACION] || null,
    correo: campos[OID.CORREO] || null,
    rfc: (rfcCrudo || "").toUpperCase() || null,
    curp: (curpCrudo || "").toUpperCase() || null,
    desde: fecha(ruta(validez, 0)),
    hasta: fecha(ruta(validez, 1)),
    emisor: nombreDe(emisor),
    // La llave pública, tal cual viene: es lo que el servidor usa para
    // comprobar la firma.
    llavePublica: ruta(tbs, iSerie + 5)?.crudo || null,
  };
}

/** El nombre común del emisor, para poder enseñar quién lo expidió. */
function nombreDe(nodo){
  for(const conj of nodo?.hijos || []){
    const par = conj.hijos?.[0];
    if(oid(ruta(par, 0)) === OID.NOMBRE_COMUN) return texto(ruta(par, 1));
  }
  return null;
}

/**
 * El SAT imprime el número de serie como los dígitos ASCII que hay
 * dentro del entero, no como su valor. Es raro, pero es lo que sale en
 * los comprobantes y lo que la gente reconoce.
 */
function serieLegible(bytes){
  if(!bytes) return null;
  const s = [...bytes].filter((b) => b >= 0x30 && b <= 0x39)
    .map((b) => String.fromCharCode(b)).join("");
  return s.length >= 16 ? s : null;
}

/** ¿Está vigente hoy? */
export function vigencia(cert, ahora = new Date()){
  if(!cert?.desde || !cert?.hasta) return { vigente: false, motivo: "sin-fechas" };
  if(ahora < cert.desde) return { vigente: false, motivo: "aun-no-vale" };
  if(ahora > cert.hasta) return { vigente: false, motivo: "vencido" };
  const diasQueQuedan = Math.floor((cert.hasta - ahora) / 86400000);
  return { vigente: true, diasQueQuedan, porVencer: diasQueQuedan <= 30 };
}

// ── Firmar ────────────────────────────────────────────────────

/**
 * Firma un hash con la llave privada. RSA con relleno PKCS#1 v1.5 y
 * SHA-256, que es lo que espera cualquiera que verifique una firma
 * del SAT.
 *
 * @param {Uint8Array} pkcs8  la llave ya descifrada
 * @param {string} hashHex    el hash del bloque, en hexadecimal
 */
export async function firmar(pkcs8, hashHex){
  const llave = await cripto().subtle.importKey(
    "pkcs8", pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,                      // no exportable: no puede volver a salir
    ["sign"]);

  const firma = await cripto().subtle.sign(
    "RSASSA-PKCS1-v1_5", llave, new TextEncoder().encode(hashHex));
  return new Uint8Array(firma);
}

/**
 * Todo el proceso, de los dos archivos a lo que se manda al servidor.
 *
 * Devuelve SÓLO lo público. La llave descifrada vive en una variable
 * local de esta función y desaparece al terminar; no se guarda, no se
 * devuelve, y no se mete en ningún estado de la aplicación.
 */
export async function firmarConEfirma({ cer, key, contraseña, hashHex, onPaso }){
  onPaso?.("Leyendo el certificado…");
  const cert = leerCertificado(cer);

  const v = vigencia(cert);
  if(!v.vigente){
    throw new Error(v.motivo === "vencido"
      ? "El certificado está vencido. Renueva tu e.firma ante el SAT."
      : "El certificado todavía no es válido. Revisa la fecha de tu equipo.");
  }

  onPaso?.("Abriendo la llave…");
  const pkcs8 = await abrirLlave(key, contraseña);

  onPaso?.("Comprobando que los dos archivos sean del mismo par…");
  await mismoPar(pkcs8, cert);

  onPaso?.("Firmando…");
  const firma = await firmar(pkcs8, hashHex);

  return {
    firma: btoa(String.fromCharCode(...firma)),
    certificado: btoa(String.fromCharCode(...cer)),
    rfc: cert.rfc,
    nombre: cert.nombre,
    numeroDeSerie: cert.numeroDeSerie,
    vigenteHasta: cert.hasta?.toISOString() || null,
  };
}

/**
 * Comprueba que el .key sea el de ese .cer, firmando algo y
 * verificándolo con la llave pública del certificado.
 *
 * Sin esto, alguien podría firmar con una llave suya y adjuntar el
 * certificado de otra persona: la firma no cuadraría, pero el usuario
 * no se enteraría hasta que un tercero fuera a verificarla, que es el
 * peor momento posible.
 */
async function mismoPar(pkcs8, cert){
  if(!cert.llavePublica) throw new Error("certificado-sin-llave-publica");
  const reto = new TextEncoder().encode("chaindoc/par");

  const priv = await cripto().subtle.importKey(
    "pkcs8", pkcs8, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const pub = await cripto().subtle.importKey(
    "spki", cert.llavePublica, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);

  const f = await cripto().subtle.sign("RSASSA-PKCS1-v1_5", priv, reto);
  const ok = await cripto().subtle.verify("RSASSA-PKCS1-v1_5", pub, f, reto);
  if(!ok) throw new Error("La llave y el certificado no son del mismo par.");
}

/** Mensajes en palabras, para no soltarle un error de criptografía a nadie. */
export const EXPLICA = {
  "no-parece-un-cer": "Ese archivo no parece un certificado. Busca el que termina en .cer",
  "no-parece-un-key": "Ese archivo no parece una llave. Busca el que termina en .key",
  "contraseña-incorrecta": "La contraseña de la llave privada no es correcta.",
  "key-sin-parametros": "La llave está incompleta o dañada.",
  "sin-webcrypto": "Tu navegador no permite firmar. Prueba con Chrome, Edge o Firefox actualizados.",
  "certificado-sin-llave-publica": "El certificado está incompleto.",
};

export const enPalabras = (e) => {
  const m = String(e?.message || e);
  if(EXPLICA[m]) return EXPLICA[m];
  if(m.startsWith("key-algoritmo-no-soportado"))
    return "Esa llave usa un cifrado que no reconocemos. Escríbenos y lo revisamos.";
  return m;
};