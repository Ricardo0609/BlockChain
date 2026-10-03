// ─────────────────────────────────────────────────────────────
// identidad.js — Códigos de firma, contraseñas y biometría
//
// Todo lo que prueba "quién eres" se comprueba aquí, en el servidor.
// Antes se comparaba en el navegador, así que bastaba con cambiar lo
// que esa comparación devolvía.
//
// Tres piezas:
//  · Códigos y contraseñas: se guardan con scrypt y sal. Scrypt es
//    lento a propósito: hace inviable probar millones de códigos.
//  · Límite de intentos: tras varios fallos, la cuenta espera.
//  · Biometría: se verifica la firma del enclave contra la llave
//    pública registrada, y se revisa el contador para que una firma
//    vieja no se pueda reusar.
// ─────────────────────────────────────────────────────────────

import { createHash, createPublicKey, randomBytes, scrypt, timingSafeEqual, verify } from "node:crypto";

// ── base64url ─────────────────────────────────────────────────
export const b64uABytes = (s) =>
  Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

export const bytesAB64u = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sha256 = (b) => createHash("sha256").update(b).digest();

// ── Códigos y contraseñas ─────────────────────────────────────

const PARAMS = { N: 16384, r: 8, p: 1, largo: 32 };

const derivar = (secreto, sal) =>
  new Promise((res, rej) => {
    scrypt(String(secreto), sal, PARAMS.largo, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p },
      (err, dk) => (err ? rej(err) : res(dk)));
  });

/** Crea el registro que se guarda: nunca el secreto, sólo su huella lenta. */
export async function sellarSecreto(secreto){
  const sal = randomBytes(16);
  const dk = await derivar(secreto, sal);
  return { algoritmo: "scrypt", sal: sal.toString("base64"), hash: dk.toString("base64"), creadoEn: new Date().toISOString() };
}

/**
 * Compara sin filtrar información por el tiempo de respuesta.
 * Acepta el formato viejo (SHA-256 sin sal, que se comparaba en el
 * navegador) para poder migrarlo en el primer uso correcto.
 */
export async function comprobarSecreto(secreto, registro){
  if(!registro) return { ok: false, viejo: false };

  if(registro.algoritmo === "scrypt"){
    const dk = await derivar(secreto, Buffer.from(registro.sal, "base64"));
    const guardado = Buffer.from(registro.hash, "base64");
    const ok = dk.length === guardado.length && timingSafeEqual(dk, guardado);
    return { ok, viejo: false };
  }

  // Formato viejo: SHA-256 del texto, en hexadecimal.
  if(typeof registro.legacySha256 === "string"){
    const h = createHash("sha256").update(String(secreto)).digest("hex");
    const a = Buffer.from(h), b = Buffer.from(registro.legacySha256);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    return { ok, viejo: ok };      // si acierta, hay que re-sellarlo con scrypt
  }

  return { ok: false, viejo: false };
}

// ── Límite de intentos ────────────────────────────────────────

export const INTENTOS = { maximo: 5, esperaMin: 15 };

/** ¿Puede intentar ahora? Devuelve cuánto falta si está bloqueado. */
export function estadoIntentos(registro = {}, ahora = Date.now()){
  const hasta = registro.bloqueadoHasta ? Date.parse(registro.bloqueadoHasta) : 0;
  if(hasta > ahora){
    return { bloqueado: true, segundos: Math.ceil((hasta - ahora) / 1000) };
  }
  return { bloqueado: false, segundos: 0 };
}

/** Estado de los intentos después de este intento. */
export function trasIntento(registro = {}, exito, ahora = Date.now()){
  if(exito) return { intentos: 0, bloqueadoHasta: null, ultimoIntento: new Date(ahora).toISOString() };

  const previos = (registro.bloqueadoHasta && Date.parse(registro.bloqueadoHasta) <= ahora)
    ? 0                                   // el bloqueo anterior ya venció: se empieza de nuevo
    : (registro.intentos || 0);
  const intentos = previos + 1;

  return {
    intentos,
    bloqueadoHasta: intentos >= INTENTOS.maximo
      ? new Date(ahora + INTENTOS.esperaMin * 60000).toISOString()
      : null,
    ultimoIntento: new Date(ahora).toISOString(),
  };
}

// ── Biometría (WebAuthn) ──────────────────────────────────────

/** Lee la cabecera de authenticatorData: quién, cómo y cuántas veces. */
export function leerAuthData(bytes){
  if(bytes.length < 37) throw new Error("authenticatorData demasiado corto");
  return {
    rpIdHash: bytes.subarray(0, 32),
    flags: bytes[32],
    presente: Boolean(bytes[32] & 0x01),     // UP: hubo interacción
    verificado: Boolean(bytes[32] & 0x04),   // UV: hubo biometría o PIN
    contador: bytes.readUInt32BE(33),
  };
}

/**
 * Verifica una aserción biométrica completa.
 *
 * Comprueba, en este orden: que el reto sea el que emitió el servidor,
 * que el origen sea nuestro sitio, que el autenticador haya verificado
 * a la persona, y que la firma corresponda a la llave registrada.
 *
 * `credencial` = { publicKey (SPKI en base64url), alg, contador }
 */
export function verificarAsercion({ credencial, asercion, reto, hosts }){
  const fallo = (motivo) => ({ ok: false, motivo });

  if(!credencial?.publicKey) return fallo("sin-llave");

  let clientData;
  try{
    clientData = JSON.parse(b64uABytes(asercion.clientDataJSON).toString("utf8"));
  }catch{ return fallo("clientData-ilegible"); }

  if(clientData.type !== "webauthn.get") return fallo("tipo");
  if(clientData.challenge !== reto) return fallo("reto");

  let host;
  try{ host = new URL(clientData.origin).hostname; }
  catch{ return fallo("origen-ilegible"); }
  if(!hosts.includes(host)) return fallo("origen");

  const authData = b64uABytes(asercion.authenticatorData);
  let cabecera;
  try{ cabecera = leerAuthData(authData); }
  catch{ return fallo("authData"); }

  if(!cabecera.verificado) return fallo("sin-biometria");
  if(!sha256(Buffer.from(host, "utf8")).equals(cabecera.rpIdHash)) return fallo("dominio");

  // Una firma sólo sirve una vez: el contador del autenticador siempre sube.
  // (Algunos autenticadores, como los de Apple, siempre reportan 0.)
  const previo = credencial.contador || 0;
  if(cabecera.contador !== 0 && cabecera.contador <= previo) return fallo("repetida");

  const firmado = Buffer.concat([authData, sha256(b64uABytes(asercion.clientDataJSON))]);
  const firma = b64uABytes(asercion.signature);

  let llave;
  try{
    llave = createPublicKey({ key: b64uABytes(credencial.publicKey), format: "der", type: "spki" });
  }catch{ return fallo("llave-ilegible"); }

  const esRSA = credencial.alg === -257;
  const ok = verify("sha256", firmado,
    esRSA ? llave : { key: llave, dsaEncoding: "der" }, firma);

  if(!ok) return fallo("firma");
  return { ok: true, contador: cabecera.contador };
}

/** Reto nuevo para firmar. Vive pocos minutos y sólo sirve una vez. */
export function nuevoReto(motivo, opId = null, minutos = 3){
  return {
    reto: bytesAB64u(randomBytes(32)),
    motivo, opId,
    creadoEn: new Date().toISOString(),
    expiraEn: new Date(Date.now() + minutos * 60000).toISOString(),
  };
}

/** ¿El reto guardado sirve para lo que se está pidiendo? */
export function retoValido(guardado, { motivo, opId }, ahora = Date.now()){
  if(!guardado?.reto) return false;
  if(Date.parse(guardado.expiraEn) < ahora) return false;
  if(guardado.motivo !== motivo) return false;
  if((guardado.opId || null) !== (opId || null)) return false;
  return true;
}