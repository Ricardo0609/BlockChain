// ─────────────────────────────────────────────────────────────
// efirma.js — Comprobar una firma hecha con la e.firma del SAT
//
// POR QUÉ ESTO NO PUEDE FALTAR
//
// El navegador firma, pero el navegador lo controla quien lo abre. Un
// certificado que diga cualquier RFC se fabrica en treinta segundos:
//
//     openssl req -x509 -newkey rsa:2048 -subj "/CN=QUIEN YO QUIERA"
//
// Ese certificado pasa todas las comprobaciones que se le pueden hacer
// a un certificado contra sí mismo: la firma cuadra, el par coincide,
// las fechas son válidas. Lo único que distingue una e.firma de
// verdad es **que la emitió el SAT**, y eso sólo se sabe comprobando
// la cadena contra los certificados raíz del SAT.
//
// Sin esa comprobación, poner «Firmado con e.firma» sería mentir, y
// peor que no tenerlo: le daría a alguien una confianza que no
// corresponde. Así que aquí la cadena no es opcional. Si no se puede
// comprobar, la firma se rechaza; no se guarda como «e.firma sin
// verificar», porque eso acabaría enseñándose como si valiera.
//
// Los certificados raíz los publica el SAT y los baja el servidor
// solo, igual que la lista 69-B.
// ─────────────────────────────────────────────────────────────

import { X509Certificate, constants, createHash, verify as verificarRSA } from "node:crypto";
import { leerZip } from "./zip.js";

/** De dónde los publica el SAT. */
export const URL_RAICES = process.env.URL_RAICES_SAT
  || "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Cert_Prod.zip";

/** Hasta dónde se sube buscando una raíz. Con 4 sobra: el SAT usa dos niveles. */
const PROFUNDIDAD = 4;

// ── Los certificados del SAT ──────────────────────────────────

/**
 * Saca los certificados del zip que publica el SAT. Dentro vienen las
 * raíces y las autoridades intermedias, mezcladas y sin un orden
 * particular, así que se toman todos y ya se verá cuál encaja con cuál.
 */
export function raicesDesdeZip(bytes){
  const salida = [];
  for(const e of leerZip(bytes, { soloQueTermineEn: ".cer" })){
    try{
      const c = new X509Certificate(Buffer.from(e.datos));
      salida.push({
        archivo: e.nombre,
        sujeto: c.subject,
        serie: c.serialNumber,
        desde: c.validFrom,
        hasta: c.validTo,
        der: Buffer.from(e.datos).toString("base64"),
      });
    }catch{
      // Un archivo que no es un certificado no invalida el resto.
    }
  }
  if(!salida.length) throw new Error("el-zip-del-sat-no-traia-certificados");
  return salida;
}

/** Vuelve a armar los objetos a partir de lo guardado. */
export const comoCertificados = (guardadas) =>
  (guardadas || []).map((r) => {
    try{ return { info: r, cert: new X509Certificate(Buffer.from(r.der, "base64")) }; }
    catch{ return null; }
  }).filter(Boolean);

// ── La cadena ─────────────────────────────────────────────────

/**
 * ¿Sube este certificado hasta una raíz del SAT?
 *
 * Se comprueban DOS cosas en cada escalón, y hacen falta las dos:
 *  · `checkIssued` — que los nombres y los identificadores encajen.
 *    Eso solo no prueba nada: los nombres se copian.
 *  · `verify` — que la firma del certificado la haya hecho de verdad
 *    la llave del de arriba. Eso es lo que no se puede falsificar.
 */
export function verificarCadena(cert, raices){
  const recorrido = [];
  let actual = cert;

  for(let nivel = 0; nivel < PROFUNDIDAD; nivel++){
    const padre = raices.find((r) => {
      try{ return actual.checkIssued(r.cert) && actual.verify(r.cert.publicKey); }
      catch{ return false; }
    });
    if(!padre) return { ok: false, motivo: "no-llega-a-una-raiz-del-sat", recorrido };

    recorrido.push({ sujeto: padre.cert.subject, archivo: padre.info.archivo });

    // Una raíz se firma a sí misma: si llegamos ahí, la cadena cierra.
    const esRaiz = padre.cert.subject === padre.cert.issuer;
    if(esRaiz) return { ok: true, recorrido, raiz: padre.cert.subject };

    actual = padre.cert;
  }
  return { ok: false, motivo: "cadena-demasiado-larga", recorrido };
}

// ── La firma ──────────────────────────────────────────────────

/** ¿Firmó esa llave ese hash? */
export function verificarFirma(cert, firmaB64, hashHex){
  try{
    // `cert.publicKey` YA es una llave pública. Envolverla otra vez en
    // createPublicKey() lanza, y como esto atrapa los errores para
    // devolver false, el fallo se disfrazaba de «firma inválida»: lo
    // peor posible, porque parece que el código funciona y rechaza
    // todo. Lo cazó la prueba de que una firma buena debe verificar.
    return verificarRSA(
      "sha256",
      Buffer.from(String(hashHex), "utf8"),
      { key: cert.publicKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(firmaB64, "base64"));
  }catch{
    return false;
  }
}

/** El RFC que el SAT mete en el sujeto, junto con la CURP. */
export function rfcDe(cert){
  const m = String(cert.subject || "").match(/x500UniqueIdentifier=([^\n/]+)/i)
    || String(cert.subject || "").match(/2\.5\.4\.45=([^\n/]+)/);
  return m ? m[1].trim().toUpperCase() : null;
}

/** El nombre de quien firmó. */
export function nombreDe(cert){
  const m = String(cert.subject || "").match(/CN=([^\n]+)/);
  return m ? m[1].trim() : null;
}

// ── Todo junto ────────────────────────────────────────────────

/**
 * El veredicto completo. Devuelve lo que se va a asentar en la cadena
 * y a enseñar en pantalla.
 *
 * Cualquier fallo devuelve `valida: false` con su motivo. No hay
 * estados intermedios del tipo «válida pero sin comprobar la cadena»:
 * eso acabaría enseñándose como válida.
 */
export function revisarEfirma({ certificadoB64, firmaB64, hashHex, raices, ahora = new Date() }){
  if(!certificadoB64 || !firmaB64 || !hashHex){
    return { valida: false, motivo: "faltan-datos" };
  }

  let cert;
  try{ cert = new X509Certificate(Buffer.from(certificadoB64, "base64")); }
  catch{ return { valida: false, motivo: "certificado-ilegible" }; }

  const desde = new Date(cert.validFrom);
  const hasta = new Date(cert.validTo);
  if(ahora < desde) return { valida: false, motivo: "certificado-aun-no-valido" };
  if(ahora > hasta) return { valida: false, motivo: "certificado-vencido" };

  if(!verificarFirma(cert, firmaB64, hashHex)){
    return { valida: false, motivo: "la-firma-no-corresponde" };
  }

  const lista = comoCertificados(raices);
  if(!lista.length) return { valida: false, motivo: "sin-raices-del-sat" };

  const cadena = verificarCadena(cert, lista);
  if(!cadena.ok) return { valida: false, motivo: cadena.motivo, recorrido: cadena.recorrido };

  return {
    valida: true,
    rfc: rfcDe(cert),
    nombre: nombreDe(cert),
    numeroDeSerie: cert.serialNumber,
    emisor: cert.issuer.replace(/\n/g, " · "),
    vigenteDesde: desde.toISOString(),
    vigenteHasta: hasta.toISOString(),
    raiz: cadena.raiz,
    // Por si en el futuro hay que rastrear con qué juego de raíces se
    // dio por buena: las autoridades del SAT cambian cada tantos años.
    cadena: cadena.recorrido.map((x) => x.sujeto),
  };
}

// ── Qué se firma ──────────────────────────────────────────────

/**
 * El texto exacto que la llave privada va a firmar.
 *
 * Lo arma el servidor y se lo manda al navegador ya hecho. Así no hay
 * dos versiones de esta receta que puedan separarse con el tiempo: el
 * navegador firma lo que recibió y el servidor comprueba contra lo que
 * él mismo guardó.
 *
 * Lleva tres cosas y cada una está por algo:
 *  · el expediente — para que la firma no valga en otro;
 *  · la huella del último bloque — para que ampare ESTA versión del
 *    documento y no una posterior que nadie le enseñó a quien firmó;
 *  · un reto de un solo uso — para que una firma capturada no se pueda
 *    volver a presentar mañana.
 */
export function loQueSeFirma({ opId, sobreHash, reto }){
  const texto = [
    "chaindoc-efirma/1",
    `expediente:${opId || ""}`,
    `huella:${sobreHash || ""}`,
    `reto:${reto || ""}`,
  ].join("\n");
  return { texto, hashHex: createHash("sha256").update(texto, "utf8").digest("hex") };
}

/** Los motivos, en palabras que se le puedan decir a alguien. */
export const EXPLICA = {
  "faltan-datos": "Faltan datos de la firma.",
  "certificado-ilegible": "El certificado no se pudo leer.",
  "certificado-vencido": "Ese certificado está vencido. Renueva tu e.firma ante el SAT.",
  "certificado-aun-no-valido": "Ese certificado todavía no es válido.",
  "la-firma-no-corresponde": "La firma no corresponde a este documento.",
  "sin-raices-del-sat":
    "Todavía no tenemos los certificados del SAT para comprobarlo. Inténtalo en unos minutos.",
  "no-llega-a-una-raiz-del-sat":
    "Ese certificado no lo emitió el SAT. Sólo se acepta la e.firma.",
  "cadena-demasiado-larga": "Ese certificado no lo emitió el SAT.",
};

export const enPalabras = (motivo) =>
  EXPLICA[motivo] || "No se pudo comprobar la firma.";
