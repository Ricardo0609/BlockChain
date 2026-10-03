// ─────────────────────────────────────────────────────────────
// invitaciones.js — Entregar sin tener cuenta
//
// Hoy, para que el electricista suba su factura, tiene que
// registrarse: crear cuenta, confirmar correo, inventar un código de
// firma. La mitad de la gente abandona ahí, y con razón: no quiere una
// cuenta, quiere mandarte un archivo.
//
// La idea central: «tener acceso al expediente» NO tiene que
// significar «ver el expediente». Un enlace puede cubrir todos los
// requisitos —para que un proveedor suba las tres facturas que te debe
// desde la misma página— y aun así no dejarlo ver el contrato, los
// montos pactados, las otras partes ni los archivos de los demás.
//
// Es la pieza con más superficie de riesgo del proyecto, porque
// reparte acceso sin sesión, así que las reglas son estrechas a
// propósito:
//
//   · Cubre los requisitos que se le nombraron, de una sola operación.
//   · Sólo deja SUBIR. Nunca leer el documento ni lo que subió otro.
//   · Caduca. Por omisión, a los siete días.
//   · Se puede revocar en cualquier momento.
//   · Tiene un tope de archivos, para que filtrarse no salga gratis.
//   · El testigo NO se guarda: se guarda su huella. Si alguien se
//     llevara la base de datos completa, no podría usar ningún enlace,
//     igual que pasa con las contraseñas.
//   · Lo que se sube queda en la cadena con una identidad honesta:
//     «entregado por invitación enviada a tal correo», nunca «firmado
//     por Fulano», porque nadie verificó quién estaba del otro lado.
// ─────────────────────────────────────────────────────────────

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DIAS_POR_OMISION = 7;
export const MAX_ARCHIVOS = 20;
export const LIMITE_DIAS = 60;

const b64u = (b) => Buffer.from(b).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Testigo nuevo. 32 bytes de azar: adivinarlo no es una opción realista. */
export const nuevoTestigo = () => b64u(randomBytes(32));

/** La huella con la que se guarda. El testigo en claro no toca la base. */
export const huellaDe = (testigo) =>
  createHash("sha256").update(String(testigo || ""), "utf8").digest("hex");

/**
 * Comparación en tiempo constante. Con huellas hexadecimales del mismo
 * largo esto es casi ceremonial, pero es la clase de detalle que uno
 * agradece no haber omitido.
 */
export function mismaHuella(a, b){
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if(x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Arma el registro que se guarda. El testigo se devuelve aparte, una
 * sola vez: después ya no se puede recuperar de ningún lado.
 *
 * `reqIds` es una lista porque el caso normal es un proveedor que te
 * debe varias facturas. Mandarle un enlace por cada una sería obligarlo
 * a hacer nuestro trabajo de organización.
 */
export function armarInvitacion({ opId, reqIds, correo, creadaPor, creadaPorUid,
                                  dias = DIAS_POR_OMISION, maxArchivos = MAX_ARCHIVOS,
                                  ahora = Date.now() }){
  const lista = [...new Set((Array.isArray(reqIds) ? reqIds : [reqIds]).filter(Boolean))];
  if(!lista.length) throw new Error("sin-requisitos");

  const d = Math.min(Math.max(Number(dias) || DIAS_POR_OMISION, 1), LIMITE_DIAS);
  const tope = Math.min(Math.max(Number(maxArchivos) || MAX_ARCHIVOS, 1), MAX_ARCHIVOS);
  const testigo = nuevoTestigo();

  return {
    testigo,
    registro: {
      huella: huellaDe(testigo),
      opId, reqIds: lista,
      correo: String(correo || "").toLowerCase().trim() || null,
      creadaPor: creadaPor || null, creadaPorUid: creadaPorUid || null,
      creadaEn: new Date(ahora).toISOString(),
      expiraEn: new Date(ahora + d * 86400000).toISOString(),
      maxArchivos: tope, entregas: 0, revocada: false,
      ultimoUso: null,
    },
  };
}

/**
 * ¿Se puede usar? Devuelve el motivo exacto, porque a quien recibe el
 * enlace hay que decirle qué pasó: si le digo «no válido» a secas va a
 * pensar que el sistema está roto y te va a llamar por teléfono.
 *
 * motivo: "no-existe" · "revocada" · "vencida" · "agotada"
 */
export function revisarInvitacion(registro, ahora = Date.now()){
  if(!registro) return { ok: false, motivo: "no-existe" };
  if(registro.revocada) return { ok: false, motivo: "revocada" };
  if(registro.expiraEn && Date.parse(registro.expiraEn) < ahora) return { ok: false, motivo: "vencida" };
  if((registro.entregas || 0) >= (registro.maxArchivos || MAX_ARCHIVOS)) {
    return { ok: false, motivo: "agotada" };
  }
  return { ok: true };
}

export const MOTIVOS = {
  "no-existe": "Este enlace no existe. Revisa que lo hayas copiado completo.",
  "revocada":  "Quien te lo envió retiró este enlace.",
  "vencida":   "Este enlace ya venció. Pídele uno nuevo a quien te lo mandó.",
  "agotada":   "Este enlace llegó a su tope de archivos. Pídele uno nuevo a quien te lo mandó.",
};

/** ¿Este requisito está entre los que cubre el enlace? */
export const cubre = (registro, reqId) =>
  Boolean(reqId) && (registro?.reqIds || []).includes(reqId);

/**
 * Lo que ve quien abre el enlace: la lista de lo que le toca entregar,
 * y nada más.
 *
 * Fíjate en lo que NO sale de aquí: el texto del contrato, los montos
 * pactados, las partes, las fases, la cadena, ni los archivos que
 * subieron otros. De cada requisito sale su título, su descripción y
 * si ya está entregado — lo mínimo para poder hacer el trabajo.
 */
export function vistaPublica(registro, operacion){
  const requisitos = (operacion?.requisitos || [])
    .filter((r) => cubre(registro, r.id))
    .map((r) => ({
      id: r.id,
      titulo: r.titulo || "Comprobante",
      descripcion: r.descripcion || null,
      tipo: r.tipo || null,
      entregado: (Array.isArray(r.archivos) ? r.archivos.length : 0) > 0,
    }));

  return {
    documento: operacion?.title || "Documento",
    pedidoPor: registro.creadaPor || null,
    correo: registro.correo || null,
    expiraEn: registro.expiraEn,
    requisitos,
    archivosRestantes: Math.max(0, (registro.maxArchivos || MAX_ARCHIVOS) - (registro.entregas || 0)),
  };
}

/**
 * Cómo se firma en la cadena lo que llega por un enlace.
 *
 * Deliberadamente no dice un nombre propio: nadie comprobó la
 * identidad de quien subió el archivo, sólo que tenía el enlace. Decir
 * «Firmado por Juan Pérez» sería mentir en el único lugar donde este
 * producto no se puede permitir mentir.
 */
export function autorDeInvitacion(registro){
  return registro?.correo
    ? `Entrega por invitación (${registro.correo})`
    : "Entrega por invitación";
}

/**
 * Ruta temporal donde el invitado deja el archivo antes de registrarse.
 *
 * Los puntos seguidos se colapsan además de las barras: dejar un `..`
 * dentro del nombre no permitiría salirse de la carpeta, pero luego lo
 * rechazaría nuestra propia comprobación de rutas, y el invitado se
 * quedaría sin entender por qué su archivo «no es válido».
 */
export const rutaTemporal = (uid, huella, nombre) => {
  const limpio = String(nombre || "archivo")
    .replace(/[^\w.-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .slice(0, 80) || "archivo";
  return `invitaciones/${uid}/${huella}/${limpio}`;
};

/** Comprueba que la ruta sea la que le corresponde a esta invitación. */
export function rutaValidaDeInvitacion(ruta, uid, huella){
  const prefijo = `invitaciones/${uid}/${huella}/`;
  return typeof ruta === "string" && ruta.startsWith(prefijo) && !ruta.includes("..");
}