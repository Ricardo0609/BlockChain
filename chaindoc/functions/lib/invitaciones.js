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
//
// ── TRES PROPÓSITOS, NO UNO (15 nov) ─────────────────────────
//
// Esto nació para una sola cosa: que un proveedor suba una factura.
// Ahora sirve para tres, y conviene nombrarlas, porque la pieza que
// reparte acceso sin sesión es el último sitio donde se debe adivinar
// qué puede hacer quien entra.
//
//   · «entrega» — lo de siempre. Un expediente con requisitos.
//     Sube archivos y nada más.
//   · «lectura» — un documento de texto sin sección de firmas. Lo
//     lee y ya. No escribe nada, ni en el documento ni en la cadena.
//   · «firma»   — un documento de texto con sección de firmas. Lo
//     lee, y lo firma con su nombre o dice que no.
//
// Lo pidió Ricardo pensando en un freelance: «se usa el documento de
// texto para solo hacer el acuerdo y firmarlo». Las dos partes
// cumplen algo —uno da el servicio, el otro paga— y para eso no hace
// falta un expediente entero con requisitos y comprobantes: hace
// falta un texto y dos firmas.
//
// EL PROPÓSITO NO LO MANDA EL CLIENTE. Lo calcula el servidor con
// `propositoDe`, leyendo el documento. Si viajara en la petición,
// cualquiera podría pedir un enlace de «firma» para un expediente, o
// de «lectura» para algo que no debe leer.
// ─────────────────────────────────────────────────────────────

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DIAS_POR_OMISION = 7;
export const MAX_ARCHIVOS = 20;
export const LIMITE_DIAS = 60;

/** Para qué sirve un enlace. Ver la cabecera. */
export const PROPOSITOS = ["entrega", "lectura", "firma"];

/** Si sólo deja leer y responder, sin subir nada. */
export const esDeTexto = (p) => p === "lectura" || p === "firma";

/**
 * Si la sección de firmas se ve en este documento.
 *
 * Mismo criterio que `src/nucleo/secciones.js`: se guarda sólo lo que
 * se APAGÓ, así que ausente quiere decir encendida. Va escrito aquí
 * en vez de importado porque el servidor no puede importar de `src`,
 * y es una línea: duplicarla cuesta menos que un módulo gemelo más.
 */
export const conFirmas = (op) => op?.secciones?.firmas !== false;

/** Las firmas que ya tiene un documento. */
export const firmasDe = (op) =>
  (op?.chain || []).filter((b) => b?.action === "FIRMA");

/**
 * Si el dueño ya firmó.
 *
 * Los bloques nuevos llevan el uid en la marca; los de antes no, y de
 * ésos sólo queda el nombre del autor, que es lo que se compara.
 * Ninguna de las dos vías acepta una firma hecha DESDE un enlace:
 * ésas llevan `fuerza: "enlace"` y no son del dueño por definición.
 */
export function firmoElDueno(op, nombreDelDueno){
  return firmasDe(op).some((b) => {
    if(b?.meta?.fuerza === "enlace") return false;
    if(b?.meta?.uid) return b.meta.uid === op?.ownerUid;
    return Boolean(nombreDelDueno) && b?.author === nombreDelDueno;
  });
}

/**
 * Un recibo o una factura. Se reconocen por su plantilla.
 *
 * ← NUEVO (16 nov). Escrito aquí y no importado de `src/nucleo` por
 * lo de siempre: el servidor no puede importar del cliente. Es una
 * comparación, y duplicarla cuesta menos que un módulo gemelo más.
 */
export const esComprobante = (op) =>
  op?.tplId === "recibo" || op?.tplId === "factura";

/**
 * Para qué sirve el enlace de ESTE documento, o null si no lleva.
 *
 * Un expediente siempre es «entrega»: tiene requisitos y su acuerdo
 * se acepta, no se firma con el nombre escrito. Un documento de
 * texto depende de si tiene sección de firmas.
 *
 * ── Y UN COMPROBANTE NO LLEVA ENLACE (16 nov) ────────────────
 *
 * Devuelve null, y `crearInvitacion` se niega. El motivo es de
 * Ricardo: «no tiene sentido compartírselo a alguien que no tiene
 * cuenta porque no estás emitiendo una factura o recibo que quieras
 * mandar, solamente estás respaldando la información».
 *
 * Esto hace falta HOY, no algún día: desde el 15 de noviembre un
 * documento que no es expediente recibe enlace de lectura o de
 * firma, y una factura no es un expediente. Sin esta línea, el
 * trabajo de ayer le habría abierto a los comprobantes justo la
 * puerta que él quiere cerrada.
 */
export function propositoDe(op){
  if(esComprobante(op)) return null;
  if(op?.kind === "expediente") return "entrega";
  return conFirmas(op) ? "firma" : "lectura";
}

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
 *
 * ← CAMBIADO (15 nov): un enlace de «lectura» o de «firma» va SIN
 * requisitos, porque un documento de texto no los tiene. La lista
 * vacía sigue siendo un error para «entrega»: un enlace de entrega
 * que no pide nada no es un enlace, es un agujero.
 */
export function armarInvitacion({ opId, reqIds, correo, creadaPor, creadaPorUid,
                                  proposito = "entrega", paraElContrato = false,
                                  dias = DIAS_POR_OMISION, maxArchivos = MAX_ARCHIVOS,
                                  ahora = Date.now() }){
  if(!PROPOSITOS.includes(proposito)) throw new Error("proposito-raro");
  const lista = [...new Set((Array.isArray(reqIds) ? reqIds : [reqIds]).filter(Boolean))];
  if(!lista.length && proposito === "entrega") throw new Error("sin-requisitos");

  const d = Math.min(Math.max(Number(dias) || DIAS_POR_OMISION, 1), LIMITE_DIAS);
  const tope = Math.min(Math.max(Number(maxArchivos) || MAX_ARCHIVOS, 1), MAX_ARCHIVOS);
  const testigo = nuevoTestigo();

  return {
    testigo,
    registro: {
      huella: huellaDe(testigo),
      proposito,
      // ── QUÉ ENLACE ES ÉSTE (17 nov) ──────────────────────────
      //
      // Hasta hoy se deducía del correo: si el correo del enlace era
      // el mismo que el destinatario del contrato, era el enlace del
      // contrato; si no, era el de pedirle un comprobante a alguien.
      // Deducirlo funcionaba mientras TODO enlace llevara correo.
      //
      // Ricardo pidió que el enlace de la otra parte NO vaya atado a
      // ningún correo —«para que se lo puedas compartir por el medio
      // que el usuario quiera»— y con eso la deducción se queda sin
      // nada que comparar: dos correos vacíos no son el mismo correo.
      //
      // Así que ahora se dice en vez de deducirse. LO ESCRIBE SÓLO
      // `ponerEnFirme`, que es el acto de mandar el contrato a
      // firmar; `crearInvitacion` no lo pasa nunca y no sale de
      // ninguna petición del navegador. La garantía que protegía la
      // comparación de correos sigue entera: a quien se le pide un
      // comprobante no puede poner el contrato en vigor.
      paraElContrato: paraElContrato === true,
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
  // El tope cuenta archivos, y un enlace de texto no sube ninguno. Sin
  // esta salida, un enlace de lectura con `maxArchivos: 0` heredado de
  // algún sitio se daría por agotado sin haberse usado nunca.
  if(esDeTexto(registro.proposito)) return { ok: true };
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
 * Lo que ve quien abre el enlace.
 *
 * ← CAMBIADO (12 nov): AHORA SALE TAMBIÉN EL CONTRATO.
 *
 * Hasta hoy esto era deliberadamente mínimo: título, lo que te piden,
 * y nada más. El texto del contrato, los montos y las partes se
 * quedaban fuera a propósito.
 *
 * Era un error, y lo encontró Ricardo probando: a alguien se le pedía
 * «la factura del material» sin dejarle ver el contrato que dice qué
 * material, por cuánto y para cuándo. Se le pedía cumplir algo que no
 * podía leer. Quien invita decidió meter a esa persona en el acuerdo;
 * esconderle los términos no protege a nadie, sólo la deja a ciegas.
 *
 * LO QUE SIGUE SIN SALIR, y esto no cambia: la cadena, los archivos
 * que subieron otros, y los requisitos que no le tocan. Puede leer el
 * acuerdo del que forma parte, no asomarse al trabajo de los demás.
 */
export function vistaPublica(registro, operacion, { abierto = true } = {}){
  const requisitos = (operacion?.requisitos || [])
    .filter((r) => cubre(registro, r.id))
    .map((r) => ({
      id: r.id,
      titulo: r.titulo || "Comprobante",
      descripcion: r.descripcion || null,
      tipo: r.tipo || null,
      entregado: (Array.isArray(r.archivos) ? r.archivos.length : 0) > 0,
    }));

  const proposito = registro.proposito || "entrega";
  // ← NUEVO (15 nov): EL CANDADO TAMBIÉN APRIETA AQUÍ.
  //
  // Lo pidió Ricardo: «si llega a tener candado de seguridad igual
  // pide la clave que el usuario le proporcionará». Un documento
  // protegido que se abriera entero por tener el enlace volvería el
  // candado en decoración, y el enlace se reenvía.
  //
  // `bloqueado` no es una bandera para que la pantalla esconda el
  // texto: cuando está puesta, el texto NO VIENE. Esconder en el
  // navegador algo que ya viajó no esconde nada.
  const bloqueado = Boolean(operacion?.protegido || operacion?.password) && !abierto;

  return {
    documento: operacion?.title || "Documento",
    pedidoPor: registro.creadaPor || null,
    correo: registro.correo || null,
    expiraEn: registro.expiraEn,
    proposito,
    bloqueado,
    requisitos: bloqueado ? [] : requisitos,
    archivosRestantes: Math.max(0, (registro.maxArchivos || MAX_ARCHIVOS) - (registro.entregas || 0)),
    // El contrato, para poder leer a qué se está uno obligando. Ya
    // viene limpio de cuando se guardó: es el mismo `content` que la
    // cadena sella, no una copia aparte que pudiera diferir.
    contrato: bloqueado ? null : (operacion?.content || null),
    // Las firmas que ya tiene, para un documento de texto que se
    // firma. Sólo el nombre y la fecha: quién firmó es parte de lo
    // que se está leyendo, y a cuántas firmas le faltan no se le
    // puede contestar sin enseñarlas.
    firmas: (proposito === "firma" && !bloqueado)
      ? firmasDe(operacion).map((b) => ({
          autor: b.author || null, fecha: b.timestamp || null,
          fuerza: b?.meta?.fuerza || "cuenta",
        }))
      : [],
    // Si ESTE enlace ya contestó. Un enlace de firma se gasta al
    // usarse: dos firmas con dos nombres distintos desde el mismo
    // enlace no serían dos partes, serían una persona probando.
    respuesta: registro.respuesta || null,
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
 * Cómo se nombra a quien firma, acepta o rechaza desde un enlace.
 *
 * ← NUEVO (15 nov): estaba escrito dos veces dentro de
 * `functions/index.js`, y ahora harían falta cuatro. La frase es la
 * prueba: tiene que decir lo mismo en los cuatro sitios o la cadena
 * contaría la misma cosa de maneras distintas.
 *
 * Teclear un nombre no comprueba una identidad: quien tenga el enlace
 * puede escribir cualquiera. Así que se escribe la verdad entera, que
 * además es la útil el día que haya una discusión. Cada pieza es
 * comprobable —hubo una invitación a ese correo, alguien con ese
 * enlace respondió, y dio ese nombre—; lo que NO se afirma es que sea
 * él. Y lo que de verdad pesa es el correo, no el nombre: por eso van
 * juntos y nunca el nombre solo.
 */
export function autorDeclarado(nombre, correo){
  return correo
    ? `${nombre} (declarado, desde el enlace enviado a ${correo})`
    : `${nombre} (declarado, desde un enlace de invitación)`;
}

/**
 * El nombre que escribió, limpio, o el motivo por el que no sirve.
 * Devuelve { ok:true, nombre } o { ok:false, error }.
 *
 * Dos palabras, no una. No comprueba nada —nada puede—, pero corta el
 * «x» y el «ok» escritos sin leer, que es lo único que un campo de
 * texto puede hacer por la seriedad del acto.
 */
export function revisarNombre(crudo){
  const nombre = String(crudo || "").trim().replace(/\s+/g, " ");
  if(nombre.length < 5 || !nombre.includes(" ")){
    return { ok: false, error: "Escribe tu nombre completo, como aparece en tu identificación." };
  }
  if(nombre.length > 120) return { ok: false, error: "Ese nombre es demasiado largo." };
  return { ok: true, nombre };
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