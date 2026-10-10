// ─────────────────────────────────────────────────────────────
// index.js — Funciones de servidor de chaindoc
//
// Regla de oro: los bloques sólo se escriben aquí. El navegador pide
// que se asiente algo; el servidor decide si procede, pone la hora,
// calcula el hash y lo guarda. Las reglas de Firestore impiden que
// nadie más toque la subcolección `bloques`.
//
// Modelo:
//   operaciones/{id}                 ← el documento o expediente
//   operaciones/{id}/bloques/{n}     ← su historia, sólo se agrega
//   operaciones/{id}/validaciones/{} ← reservado (SAT, sellos de tiempo)
// ─────────────────────────────────────────────────────────────

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

import { armarBloqueV2, verificarCadena, sha256Bytes } from "./lib/bloques.js";
import {
  agregarArchivo, quitarArchivo, cerrarSolicitudes,
} from "./lib/expediente.js";
import { normalizarEnlace, nombreDeEnlace, textoFirmado } from "./lib/enlaces.js";
import {
  limpiarCambios, validarEvento, revisarCambioDeAcceso,
  rolDe, puede, permisoDeEvento, puedeSubirA,
  ROLES, ROL_TEXTO, esDueno, debeRegistrarConsulta, LIMITES,
} from "./lib/permisos.js";
import {
  sellarSecreto, comprobarSecreto, estadoIntentos, trasIntento,
  verificarAsercion, nuevoReto, retoValido,
} from "./lib/identidad.js";
import { analizar, EXPLICA } from "./lib/ia.js";

initializeApp();
const db = getFirestore();

// Tope de instancias: evita que un error en bucle dispare el costo.
setGlobalOptions({ region: "us-central1", maxInstances: 10, memory: "256MiB" });

const OPS = "operaciones";
const idBloque = (n) => String(n).padStart(6, "0");

// ── Folios (10 oct) ───────────────────────────────────────────
//
// El contador consecutivo de cada cuenta. Va en su propia colección y
// no en `users/{uid}`, que el navegador sí puede escribir: si el
// usuario pudiera fijar su propio contador, el folio dejaría de probar
// el orden en que se crearon los documentos.
const FOLIOS = "folios";
const folioTexto = (n) => String(Math.max(1, Math.trunc(Number(n) || 1))).padStart(2, "0");

// ── App Check (Etapa 3) ───────────────────────────────────────
// Comprueba que la llamada venga de nuestra aplicación y no de un
// script apuntando a las funciones. Se exige sólo cuando la variable
// EXIGIR_APPCHECK está en 1: así se puede desplegar primero, medir en
// la consola que todas las llamadas traen su distintivo, y recién
// entonces cerrar la puerta sin dejar fuera a nadie.
const APPCHECK = process.env.EXIGIR_APPCHECK === "1";
const OPCIONES = { enforceAppCheck: APPCHECK };

/** Datos de quien llama. Sin sesión, no se hace nada. */
function quien(req){
  const uid = req.auth?.uid;
  if(!uid) throw new HttpsError("unauthenticated", "Necesitas iniciar sesión.");
  return { uid, email: (req.auth.token.email || "").toLowerCase() };
}

/** Nombre para firmar los bloques: el del perfil, no el que mande el navegador. */
async function nombreDe(uid, email){
  const s = await db.doc(`users/${uid}`).get();
  return s.data()?.name || email || "Usuario";
}

/**
 * Exige un permiso y devuelve el rol de quien llama.
 *
 * Es el único sitio donde se decide «puedes o no puedes»: así ninguna
 * función se queda con la comprobación vieja de «tiene acceso», que
 * daba lo mismo al dueño que al que sólo venía a mirar.
 */
function exigir(op, uid, email, accion){
  const rol = rolDe(op, uid, email);
  if(!rol) throw new HttpsError("permission-denied", "No tienes acceso a esta operación.");
  if(!puede(rol, accion)){
    throw new HttpsError("permission-denied",
      `Tu rol en este documento (${ROL_TEXTO[rol] || rol}) no permite esta acción.`);
  }
  return rol;
}

/** Lee la operación con su cadena completa, para devolvérsela al navegador. */
async function leerOperacion(id){
  const [op, bl] = await Promise.all([
    db.doc(`${OPS}/${id}`).get(),
    db.collection(`${OPS}/${id}/bloques`).orderBy("index").get(),
  ]);
  if(!op.exists) return null;
  return { ...op.data(), chain: bl.docs.map((d) => d.data()) };
}

/**
 * Corazón del sistema: agrega un bloque y aplica los cambios de campos
 * en la misma transacción. O pasan las dos cosas, o ninguna.
 */
async function asentar({ opId, evento, cambios, uid, email, autor, tocarFecha = true, exigirAcceso = true, permiso }){
  const ev = validarEvento(evento);
  const campos = limpiarCambios(cambios);

  const refOp = db.doc(`${OPS}/${opId}`);

  const bloque = await db.runTransaction(async (t) => {
    const snap = await t.get(refOp);
    if(!snap.exists) throw new HttpsError("not-found", "La operación no existe.");
    const op = snap.data();

    // El permiso que exige el bloque sale del propio evento: una FIRMA
    // pide «firmar», una EVIDENCIA de baja pide «retirar», etc.
    if(exigirAcceso) exigir(op, uid, email, permiso || permisoDeEvento(ev));
    revisarCambioDeAcceso(op, campos);

    const n = op.bloques || 0;
    const b = await armarBloqueV2({
      previo: n ? { index: n - 1, hash: op.ultimoHash } : null,
      action: ev.accion, content: ev.contenido,
      author: autor, autorUid: uid, meta: ev.meta,
      timestamp: new Date().toISOString(),          // hora del servidor
    });

    const nuevo = { ...op, ...campos };
    if(JSON.stringify(nuevo).length > LIMITES.documento){
      throw new HttpsError("invalid-argument", "El documento es demasiado grande.");
    }

    t.set(db.doc(`${OPS}/${opId}/bloques/${idBloque(b.index)}`), b);
    encolarParaAnclar(t, opId, b);
    t.update(refOp, {
      ...campos,
      bloques: n + 1,
      ultimoHash: b.hash,
      actualizadoEn: FieldValue.serverTimestamp(),
      ...(tocarFecha ? { lastModified: b.timestamp } : {}),
    });
    return b;
  });

  return { doc: await leerOperacion(opId), bloque };
}

// ── Crear ─────────────────────────────────────────────────────
export const crearOperacion = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const autor = await nombreDe(uid, email);
  const campos = limpiarCambios(req.data?.datos || {});
  const ev = validarEvento(req.data?.evento);

  const ref = db.collection(OPS).doc();
  const refFolio = db.doc(`${FOLIOS}/${uid}`);

  const b = await armarBloqueV2({
    previo: null, action: ev.accion, content: ev.contenido,
    author: autor, autorUid: uid, meta: ev.meta,
    timestamp: new Date().toISOString(),
  });

  // ← ACTUALIZADO (10 oct): el folio consecutivo sustituye al número al
  // azar. Va en transacción y no en lote porque hay que LEER el contador
  // antes de subirlo: con un lote, dos documentos creados en el mismo
  // instante se quedarían con el mismo folio. La transacción reintenta
  // sola si alguien se le adelanta.
  const op = await db.runTransaction(async (t) => {
    const previo = await t.get(refFolio);
    const folio = Math.trunc(Number(previo.data()?.ultimo) || 0) + 1;

    const operacion = {
      ...campos,
      id: ref.id, folio, numId: folioTexto(folio), version: 2,
      owner: autor, ownerUid: uid, ownerEmail: email,
      sharedWith: [],
      roles: {},
      password: null,
      bloques: 1, ultimoHash: b.hash,
      creadoEn: new Date().toISOString(),
      lastModified: b.timestamp,
    };

    t.set(refFolio, { ultimo: folio, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    t.set(ref, operacion);
    t.set(db.doc(`${OPS}/${ref.id}/bloques/${idBloque(0)}`), b);
    encolarParaAnclar(t, ref.id, b);
    return operacion;
  });

  return { doc: { ...op, chain: [b] } };
});

// ── Agregar un bloque ─────────────────────────────────────────
//
// Quien no puede editar tampoco puede mandar cambios de campos por
// aquí. Sin esto, un aportador podría colar un cambio de título
// dentro del bloque con el que sube su factura.
export const agregarBloque = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, evento, cambios, tocarFecha } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const campos = limpiarCambios(cambios || {});
  if(Object.keys(campos).length){
    const op = (await db.doc(`${OPS}/${opId}`).get()).data();
    if(!op) throw new HttpsError("not-found", "La operación no existe.");
    exigir(op, uid, email, "editar");
  }

  const autor = await nombreDe(uid, email);
  const { doc } = await asentar({ opId, evento, cambios, uid, email, autor, tocarFecha });
  return { doc };
});

// ── Guardar campos sin asentar nada ───────────────────────────
export const guardarCampos = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, cambios } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");
  const campos = limpiarCambios(cambios || {});

  const refOp = db.doc(`${OPS}/${opId}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(refOp);
    if(!snap.exists) throw new HttpsError("not-found", "La operación no existe.");
    const op = snap.data();
    exigir(op, uid, email, "editar");
    revisarCambioDeAcceso(op, campos);
    t.update(refOp, { ...campos, actualizadoEn: FieldValue.serverTimestamp() });
  });

  return { doc: await leerOperacion(opId) };
});

// ── Consulta: la decide el servidor, no el navegador ──────────
export const registrarConsulta = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  exigir(actual, uid, email, "ver");
  if(!debeRegistrarConsulta(actual, actual.chain, uid, email)) return { doc: actual };

  const autor = await nombreDe(uid, email);
  const { doc } = await asentar({
    opId, uid, email, autor, tocarFecha: false,
    evento: { accion: "CONSULTA", contenido: `${autor} consultó el documento`, meta: { uid, email: email || null } },
  });
  return { doc };
});

// ── Borrar ────────────────────────────────────────────────────
export const borrarOperacion = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  const { opId } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const ref = db.doc(`${OPS}/${opId}`);
  const snap = await ref.get();
  if(!snap.exists) return { borrado: true };
  if(!esDueno(snap.data(), uid)) throw new HttpsError("permission-denied", "Sólo el dueño puede eliminarlo.");

  await db.recursiveDelete(ref);
  return { borrado: true };
});

// ── Verificar la cadena en el servidor ────────────────────────
export const verificarOperacion = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId } = req.data || {};
  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  exigir(actual, uid, email, "ver");
  return await verificarCadena(actual.chain);
});

// ══════════════════════════════════════════════════════════════
// ACCESOS Y ROLES
//
// Compartir dejó de ser «todo o nada». El correo llega con un rol y
// ese rol decide lo que puede hacer. Los accesos se cambian sólo por
// estas funciones: ya no viajan entre los campos del documento, donde
// cualquiera con acceso podía sumarse gente.
// ══════════════════════════════════════════════════════════════

const ROLES_ASIGNABLES = ROLES.filter((r) => r !== "propietario");

/** Normaliza y revisa un correo que llega del navegador. */
function correoValido(valor){
  const correo = String(valor || "").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)){
    throw new HttpsError("invalid-argument", "Ese correo no parece válido.");
  }
  return correo;
}

/**
 * Para invitar gente hace falta tener el correo verificado. Si no,
 * cualquiera podría registrarse con una dirección que no es suya y
 * repartir accesos desde ahí.
 */
function exigirCorreoVerificado(req){
  if(req.auth?.token?.email_verified) return;
  throw new HttpsError("failed-precondition",
    "Confirma tu correo antes de invitar a alguien. Te enviamos un enlace al registrarte; puedes pedir otro desde tu perfil.");
}

/** Escribe el acceso y devuelve lo que había antes, para el bloque. */
async function ponerAcceso(opId, correo, rol){
  const refOp = db.doc(`${OPS}/${opId}`);
  return db.runTransaction(async (t) => {
    const snap = await t.get(refOp);
    if(!snap.exists) throw new HttpsError("not-found", "La operación no existe.");
    const op = snap.data();
    if(op.ownerUid && correo === (op.ownerEmail || "").toLowerCase()){
      throw new HttpsError("invalid-argument", "Esa persona ya es la dueña del documento.");
    }

    const antes = rolDe(op, null, correo);
    const compartido = new Set([...(op.sharedWith || []), correo]);
    if(compartido.size > LIMITES.correos){
      throw new HttpsError("invalid-argument", "Demasiadas personas con acceso.");
    }

    t.update(refOp, {
      sharedWith: [...compartido],
      [`roles.${correo}`]: rol,
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return { antes };
  });
}

/** Dar acceso a alguien con un rol, o cambiarle el que ya tenía. */
export const compartirOperacion = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  exigirCorreoVerificado(req);

  const { opId } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");
  const correo = correoValido(req.data?.correo);
  const rol = String(req.data?.rol || "lector");
  if(!ROLES_ASIGNABLES.includes(rol)) throw new HttpsError("invalid-argument", "Ese rol no existe.");

  const op = (await db.doc(`${OPS}/${opId}`).get()).data();
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "compartir");

  const { antes } = await ponerAcceso(opId, correo, rol);
  const autor = await nombreDe(uid, email);

  const { doc } = await asentar({
    opId, uid, email, autor, tocarFecha: false,
    evento: {
      accion: "COMPARTIDO",
      contenido: antes
        ? `${correo}: ${ROL_TEXTO[antes] || antes} → ${ROL_TEXTO[rol]}`
        : `Acceso para ${correo} como ${ROL_TEXTO[rol]}`,
      meta: { tipo: antes ? "cambio-rol" : "alta", correo, rol, rolAnterior: antes || null },
    },
  });

  return { doc, correo, rol };
});

/** Retirar el acceso de alguien. */
export const quitarAcceso = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");
  const correo = correoValido(req.data?.correo);

  const refOp = db.doc(`${OPS}/${opId}`);
  const op = (await refOp.get()).data();
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "compartir");

  const antes = rolDe(op, null, correo);
  if(!antes) return { doc: await leerOperacion(opId) };

  await refOp.update({
    sharedWith: (op.sharedWith || []).filter((c) => c !== correo),
    [`roles.${correo}`]: FieldValue.delete(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });

  const autor = await nombreDe(uid, email);
  const { doc } = await asentar({
    opId, uid, email, autor, tocarFecha: false,
    evento: {
      accion: "COMPARTIDO",
      contenido: `Acceso retirado a ${correo}`,
      meta: { tipo: "baja", correo, rolAnterior: antes },
    },
  });

  return { doc };
});

/**
 * Pedirle un comprobante a alguien. La solicitud es lo que le da
 * permiso de subir, y sólo a ese requisito: si no tenía acceso, entra
 * como aportador; si ya tenía uno mayor, se le respeta.
 */
export const pedirEvidencia = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  exigirCorreoVerificado(req);

  const { opId, reqId, mensaje, paraUid, paraNombre } = req.data || {};
  if(!opId || !reqId) throw new HttpsError("invalid-argument", "Faltan datos de la solicitud.");
  const correo = correoValido(req.data?.correo);

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  exigir(actual, uid, email, "pedir");

  const requisito = (actual.requisitos || []).find((r) => r.id === reqId);
  if(!requisito) throw new HttpsError("not-found", "Ese requisito no existe en el expediente.");

  const repetida = (actual.solicitudes || []).some(
    (s) => s.reqId === reqId && (s.paraEmail || "").toLowerCase() === correo && s.estado === "pendiente");
  if(repetida) throw new HttpsError("already-exists", "Ya le pediste este comprobante a esa persona.");

  // Pedir implica dar acceso, pero sólo el mínimo: si no tenía nada,
  // entra como aportador. Si ya tenía un rol mayor, no se le rebaja.
  const rolActual = rolDe(actual, null, correo);
  if(!rolActual) await ponerAcceso(opId, correo, "aportador");

  const autor = await nombreDe(uid, email);
  const solicitud = {
    sid: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    reqId, reqTitulo: requisito.titulo || reqId,
    paraUid: paraUid || null, paraEmail: correo, paraNombre: paraNombre || null,
    deUid: uid, deNombre: autor,
    mensaje: String(mensaje || "").trim().slice(0, 500) || null,
    estado: "pendiente",
    creadaEn: new Date().toISOString(), resueltaEn: null,
  };

  const { doc } = await asentar({
    opId, uid, email, autor, tocarFecha: false,
    evento: {
      accion: "SOLICITUD",
      contenido: `Se pidió «${solicitud.reqTitulo}» a ${paraNombre || correo}`,
      meta: { tipo: "alta", sid: solicitud.sid, requisito: reqId, correo },
    },
    cambios: { solicitudes: [...(actual.solicitudes || []), solicitud] },
  });

  return { doc, solicitud };
});

// ── Migración v1 → v2 ─────────────────────────────────────────
// Copia los documentos del usuario al modelo nuevo. Los bloques viejos
// se conservan tal cual (siguen verificando con su fórmula v1) y encima
// se asienta un bloque de MIGRACIÓN que los encadena al formato nuevo.
export const migrar = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const autor = await nombreDe(uid, email);

  const viejos = await db.collection("documents").where("ownerUid", "==", uid).limit(300).get();
  const resultado = { revisados: viejos.size, migrados: 0, omitidos: 0, errores: [] };

  for(const d of viejos.docs){
    const v1 = d.data();
    try{
      const ref = db.doc(`${OPS}/${d.id}`);
      if((await ref.get()).exists){ resultado.omitidos++; continue; }

      const cadena = Array.isArray(v1.chain) ? v1.chain : [];
      const revision = await verificarCadena(cadena);

      const lote = db.batch();
      const campos = { ...v1 };
      delete campos.chain;                 // la cadena se copia aparte, a la subcolección
      // Los bloques migrados también entran a la cola: son historia
      // real y merecen fecha comprobable como los nuevos.
      cadena.forEach((b) => {
        lote.set(db.doc(`${OPS}/${d.id}/bloques/${idBloque(b.index)}`), b);
        if(b.hash) encolarParaAnclar(lote, d.id, b);
      });

      const previo = cadena.length ? cadena[cadena.length - 1] : null;
      const sello = await armarBloqueV2({
        previo,
        action: "MIGRACIÓN",
        content: `Historia trasladada al formato nuevo (${cadena.length} bloques)`,
        author: autor, autorUid: uid,
        meta: { desde: "v1", bloques: cadena.length, cadenaValida: revision.valid,
                fallaEn: revision.valid ? null : revision.failedAt },
        timestamp: new Date().toISOString(),
      });
      lote.set(db.doc(`${OPS}/${d.id}/bloques/${idBloque(sello.index)}`), sello);
      encolarParaAnclar(lote, d.id, sello);

      lote.set(ref, {
        ...campos,
        id: d.id, version: 2,
        sharedWith: v1.sharedWith || [],
        bloques: cadena.length + 1,
        ultimoHash: sello.hash,
        migradoEn: new Date().toISOString(),
        creadoEn: cadena[0]?.timestamp || v1.lastModified || new Date().toISOString(),
        actualizadoEn: FieldValue.serverTimestamp(),
      });

      lote.update(d.ref, { migradoA: `${OPS}/${d.id}`, migradoEn: new Date().toISOString() });
      await lote.commit();
      resultado.migrados++;
    }catch(e){
      resultado.errores.push({ id: d.id, error: String(e?.message || e) });
    }
  }

  return resultado;
});

// ══════════════════════════════════════════════════════════════
// ARCHIVOS EN STORAGE
//
// El navegador sube el archivo a Storage y luego pide al servidor
// que lo registre. El servidor LO LEE y calcula su huella él mismo:
// nunca confía en el hash que mande el navegador, que era el hueco
// que quedaba en la evidencia.
// ══════════════════════════════════════════════════════════════

const bucket = () => getStorage().bucket();
const META = "evidencias";                 // registro de archivos (sin los bytes)
const LIMITE_ARCHIVO = 20 * 1024 * 1024;   // 20 MB

/** Lee un objeto de Storage y devuelve sus bytes y su huella. */
async function leerYHashear(ruta){
  const archivo = bucket().file(ruta);
  const [existe] = await archivo.exists();
  if(!existe) throw new HttpsError("not-found", "El archivo no llegó a Storage. Vuelve a subirlo.");

  const [meta] = await archivo.getMetadata();
  const tam = Number(meta.size || 0);
  if(tam > LIMITE_ARCHIVO){
    await archivo.delete().catch(() => {});
    throw new HttpsError("invalid-argument", "El archivo pesa más de 20 MB.");
  }

  const [bytes] = await archivo.download();
  const hash = await sha256Bytes(bytes);
  // ← Los bytes se devuelven para poder leer el XML de un CFDI sin
  //   volver a bajarlo. Quien no los necesite, que los ignore.
  return { hash, tam, tipo: meta.contentType || "application/octet-stream", bytes };
}

/** Comprueba que la ruta pertenezca a quien llama. */
function rutaValida(ruta, uid, opId){
  const esperado = `evidencias/${uid}/${opId}/`;
  if(typeof ruta !== "string" || !ruta.startsWith(esperado) || ruta.includes("..")){
    throw new HttpsError("permission-denied", "Ruta de archivo no válida.");
  }
}

// ── Adjuntar un comprobante a un requisito ────────────────────
export const registrarArchivo = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, reqId, ruta, nombre, thumb } = req.data || {};
  if(!opId || !reqId || !ruta) throw new HttpsError("invalid-argument", "Faltan datos del archivo.");
  rutaValida(ruta, uid, opId);

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  const rol = exigir(actual, uid, email, "subir");
  // El aportador sube sólo donde le pidieron algo; si no, no habría
  // diferencia entre invitarlo a entregar su factura y darle el expediente.
  if(!puedeSubirA(actual, rol, email, reqId)){
    throw new HttpsError("permission-denied", "No tienes una solicitud abierta para ese requisito.");
  }

  const { hash, tam, tipo, bytes } = await leerYHashear(ruta);
  const autor = await nombreDe(uid, email);
  const id = `${opId}-${reqId}-${Math.random().toString(36).slice(2, 10)}`;

  // ← NUEVO (Etapa 4): si es el XML de una factura, se lee, se le
  //   pregunta al SAT y se cruzan sus RFC contra la lista 69-B, en el
  //   mismo movimiento en que se registra. Nadie teclea el importe, así
  //   que nadie puede ajustarlo al capturarlo.
  let fiscal = null;
  if(pareceXML(tipo, nombre)){
    try{
      const texto = bytes.toString("utf8");
      const datos = esCFDI(texto) ? leerCFDI(texto) : null;
      if(datos){
        const requisito = (actual.requisitos || []).find((x) => x.id === reqId);
        const r = await validarCFDI(datos, { uid, opId, reqId, requisito });
        await asentarValidacion(opId, id, r);
        await apuntarFolio(uid, datos.uuid, {
          opId, reqId, aid: id, titulo: actual.title || null,
          total: datos.total ?? null, rfcEmisor: datos.rfcEmisor || null,
          creadoEn: new Date().toISOString(),
        });
        fiscal = resumenFiscal(r);
      }
    }catch(e){
      // Que falle la revisión no puede impedir guardar el comprobante:
      // el archivo y su huella son lo que no se puede perder.
      console.error("CFDI: no se pudo revisar", e);
    }
  }

  const nuevo = {
    aid: id, path: id, ruta, nombre: nombre || "archivo",
    tipo, tam, hash, subidoEn: new Date().toISOString(), subidoPor: autor,
    ...(fiscal ? { fiscal } : {}),
  };

  const { requisitos, encontrado } = agregarArchivo(actual.requisitos || [], reqId, nuevo);
  if(!encontrado) throw new HttpsError("not-found", "Ese requisito no existe en el expediente.");
  const { solicitudes, cerradas } = cerrarSolicitudes(actual, reqId, autor);
  const req0 = (actual.requisitos || []).find((r) => r.id === reqId);

  await db.doc(`${META}/${id}`).set({
    id, ownerUid: uid, docId: opId, reqId, ruta,
    nombre: nuevo.nombre, tipo, tam, hash,
    thumb: thumb || null, creadoEn: nuevo.subidoEn,
  });

  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: {
      accion: "EVIDENCIA",
      contenido: fiscal
        ? `${req0?.titulo || reqId}: «${nuevo.nombre}» · CFDI ${fiscal.uuid || "sin folio"} · ${fiscal.textoSAT}`
        : `${req0?.titulo || reqId}: «${nuevo.nombre}» (${hash.slice(0, 16)}…)`,
      meta: { tipo: "alta", requisito: reqId, archivo: nuevo.nombre, huella: hash, tam,
              ...(fiscal ? { fiscal } : {}) },
    },
    cambios: { requisitos, solicitudes },
  });

  return { doc, archivo: nuevo, cerradas, fiscal };
});

// ── Registrar un ENLACE como comprobante ──────────────────────
//
// Un entregable que vive en una dirección —un sitio publicado, un
// repositorio, un tablero— no se puede subir. Antes había que mandar
// una captura de pantalla, que prueba menos que la dirección misma.
//
// La huella se calcula sobre el TEXTO de la dirección, no sobre lo que
// haya en ella. Eso es a propósito y la interfaz lo dice: queda probado
// qué se entregó y cuándo, no que el contenido siga ahí mañana.
//
// La dirección se vuelve a revisar aquí aunque el navegador ya la haya
// revisado. Quien entrega puede no ser quien mira, y un «javascript:»
// guardado como comprobante sería una trampa para el dueño del
// expediente el día que le dé clic.
export const registrarEnlace = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, reqId, url, nombre } = req.data || {};
  if(!opId || !reqId) throw new HttpsError("invalid-argument", "Faltan datos del enlace.");

  const revisado = normalizarEnlace(url);
  if(!revisado.ok) throw new HttpsError("invalid-argument", revisado.error);

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  const rol = exigir(actual, uid, email, "subir");
  if(!puedeSubirA(actual, rol, email, reqId)){
    throw new HttpsError("permission-denied", "No tienes una solicitud abierta para ese requisito.");
  }

  const autor = await nombreDe(uid, email);
  const hash = await sha256Bytes(Buffer.from(textoFirmado(revisado.url), "utf8"));
  const id = `${opId}-${reqId}-${Math.random().toString(36).slice(2, 10)}`;

  const nuevo = {
    aid: id, origen: "enlace",
    url: revisado.url, host: revisado.host,
    nombre: nombreDeEnlace(nombre, revisado.host),
    hash, subidoEn: new Date().toISOString(), subidoPor: autor,
  };

  const { requisitos, encontrado } = agregarArchivo(actual.requisitos || [], reqId, nuevo);
  if(!encontrado) throw new HttpsError("not-found", "Ese requisito no existe en el expediente.");
  const { solicitudes, cerradas } = cerrarSolicitudes(actual, reqId, autor);
  const req0 = (actual.requisitos || []).find((r) => r.id === reqId);

  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: {
      accion: "EVIDENCIA",
      contenido: `${req0?.titulo || reqId}: enlace a ${revisado.host} («${nuevo.nombre}»)`,
      meta: { tipo: "alta", requisito: reqId, enlace: revisado.url,
              host: revisado.host, archivo: nuevo.nombre, huella: hash },
    },
    cambios: { requisitos, solicitudes },
  });

  return { doc, archivo: nuevo, cerradas };
});

// ── Entregar un enlace por invitación ─────────────────────────
//
// El gemelo de subirPorInvitacion para quien no tiene cuenta. Mismas
// comprobaciones del enlace de invitación, y además gasta una de las
// entregas que le quedan: si no, un enlace de invitación daría entregas
// ilimitadas con sólo pegar direcciones.
export const entregarEnlacePorInvitacion = onCall(OPCIONES, async (req) => {
  const anon = req.auth?.uid;
  if(!anon) throw new HttpsError("unauthenticated", "Vuelve a abrir el enlace e inténtalo de nuevo.");

  const { testigo, reqId, url, nombre } = req.data || {};
  const revisado = normalizarEnlace(url);
  if(!revisado.ok) throw new HttpsError("invalid-argument", revisado.error);

  const { huella, registro } = await abrirInvitacion(testigo);
  if(!cubre(registro, reqId)){
    throw new HttpsError("permission-denied", "Este enlace no sirve para ese comprobante.");
  }

  const op = await leerOperacion(registro.opId);
  if(!op) throw new HttpsError("not-found", "El documento ya no existe.");
  const requisito = (op.requisitos || []).find((r) => r.id === reqId);
  if(!requisito) throw new HttpsError("not-found", "Ese requisito ya no está en el documento.");

  const autor = autorDeInvitacion(registro);
  const hash = await sha256Bytes(Buffer.from(textoFirmado(revisado.url), "utf8"));
  const id = `${registro.opId}-${reqId}-${Math.random().toString(36).slice(2, 10)}`;

  const nuevo = {
    aid: id, origen: "enlace",
    url: revisado.url, host: revisado.host,
    nombre: nombreDeEnlace(nombre, revisado.host),
    hash, subidoEn: new Date().toISOString(), subidoPor: autor,
    porInvitacion: true, invitacionA: registro.correo || null,
  };

  const { requisitos, encontrado } = agregarArchivo(op.requisitos || [], reqId, nuevo);
  if(!encontrado) throw new HttpsError("not-found", "Ese requisito ya no está en el documento.");
  const { solicitudes } = cerrarSolicitudes(op, reqId, autor);

  await asentar({
    opId: registro.opId, uid: op.ownerUid, email: op.ownerEmail, autor,
    exigirAcceso: false,
    evento: {
      accion: "EVIDENCIA",
      contenido: `${requisito.titulo || reqId}: enlace a ${revisado.host} entregado por invitación`,
      meta: { tipo: "alta", requisito: reqId, enlace: revisado.url, host: revisado.host,
              archivo: nuevo.nombre, huella: hash,
              porInvitacion: true, correo: registro.correo || null },
    },
    cambios: { requisitos, solicitudes },
  });

  await refInv(huella).set({
    entregas: (registro.entregas || 0) + 1,
    ultimoUso: new Date().toISOString(),
  }, { merge: true });

  return { ok: true, nombre: nuevo.nombre, hash, url: revisado.url, host: revisado.host, reqId };
});

// ── Retirar un comprobante ────────────────────────────────────
export const quitarArchivoDeRequisito = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, reqId, aid } = req.data || {};
  if(!opId || !reqId || !aid) throw new HttpsError("invalid-argument", "Faltan datos.");

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  exigir(actual, uid, email, "retirar");

  const { requisitos, quitado } = quitarArchivo(actual.requisitos || [], reqId, aid);
  if(!quitado) throw new HttpsError("not-found", "Ese comprobante ya no está en el requisito.");

  // Un documento enlazado sólo se desvincula y un enlace externo nunca
  // tuvo archivo; en los dos casos no hay nada que borrar del almacén.
  if(quitado.origen !== "interno" && quitado.origen !== "enlace" && quitado.path){
    const meta = await db.doc(`${META}/${quitado.path}`).get();
    const ruta = meta.data()?.ruta;
    if(ruta) await bucket().file(ruta).delete().catch(() => {});
    await meta.ref.delete().catch(() => {});
  }

  // ← NUEVO (Etapa 4): al retirar una factura se libera su folio del
  //   registro. Si no, volver a subirla después —o corregir el
  //   requisito equivocado— la marcaría como repetida sin serlo.
  if(quitado.fiscal?.uuid){
    const ref = refFolio(uid, quitado.fiscal.uuid);
    const previo = (await ref.get()).data();
    if(previo && previo.aid === (quitado.aid || quitado.path)) await ref.delete().catch(() => {});
  }

  const autor = await nombreDe(uid, email);
  const req0 = (actual.requisitos || []).find((r) => r.id === reqId);
  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: {
      accion: "EVIDENCIA",
      contenido: `Retiro de «${quitado.nombre}» en «${req0?.titulo || reqId}»`,
      meta: { tipo: "baja", requisito: reqId, archivo: quitado.nombre || null },
    },
    cambios: { requisitos },
  });

  return { doc };
});

// ── Galería de imágenes del documento ─────────────────────────
export const registrarImagen = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, ruta, nombre, thumb } = req.data || {};
  if(!opId || !ruta) throw new HttpsError("invalid-argument", "Faltan datos del archivo.");
  rutaValida(ruta, uid, opId);

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  // La galería no nace de una solicitud, así que aquí el aportador no entra.
  exigir(actual, uid, email, "editar");
  if((actual.imagenes || []).length >= 12) throw new HttpsError("invalid-argument", "Máximo 12 imágenes por documento.");

  const { hash, tam, tipo } = await leerYHashear(ruta);
  if(!tipo.startsWith("image/")) throw new HttpsError("invalid-argument", "Sólo se admiten imágenes aquí.");

  const autor = await nombreDe(uid, email);
  const id = `${opId}-img-${Math.random().toString(36).slice(2, 10)}`;
  const imagen = {
    path: id, ruta, nombre: nombre || "imagen", tipo, tam, hash,
    thumb: thumb || null, subidoEn: new Date().toISOString(), subidoPor: autor,
  };

  await db.doc(`${META}/${id}`).set({
    id, ownerUid: uid, docId: opId, reqId: "img", ruta,
    nombre: imagen.nombre, tipo, tam, hash, thumb: thumb || null, creadoEn: imagen.subidoEn,
  });

  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: {
      accion: "EVIDENCIA",
      contenido: `Imagen adjunta «${imagen.nombre}» (${hash.slice(0, 16)}…)`,
      meta: { tipo: "imagen", archivo: imagen.nombre, huella: hash, tam },
    },
    cambios: { imagenes: [...(actual.imagenes || []), imagen] },
  });

  return { doc, imagen };
});

export const quitarImagen = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, path } = req.data || {};
  if(!opId || !path) throw new HttpsError("invalid-argument", "Faltan datos.");

  const actual = await leerOperacion(opId);
  if(!actual) throw new HttpsError("not-found", "La operación no existe.");
  exigir(actual, uid, email, "retirar");

  const img = (actual.imagenes || []).find((x) => x.path === path);
  if(!img) throw new HttpsError("not-found", "Esa imagen ya no está.");

  const meta = await db.doc(`${META}/${path}`).get();
  const ruta = meta.data()?.ruta || img.ruta;
  if(ruta) await bucket().file(ruta).delete().catch(() => {});
  await meta.ref.delete().catch(() => {});

  const autor = await nombreDe(uid, email);
  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: {
      accion: "EVIDENCIA",
      contenido: `Imagen retirada «${img.nombre || path}»`,
      meta: { tipo: "imagen-baja", archivo: img.nombre || null },
    },
    cambios: { imagenes: (actual.imagenes || []).filter((x) => x.path !== path) },
  });

  return { doc };
});

// ── Entrega del archivo ───────────────────────────────────────
// Se sirve desde aquí, no con un enlace público: así se comprueba
// que quien lo pide tenga acceso al expediente, cada vez.
export const archivo = onRequest({ cors: true, memory: "512MiB" }, async (req, res) => {
  try{
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if(!token) return res.status(401).send("Falta la sesión.");

    let sesion;
    try{ sesion = await getAuth().verifyIdToken(token); }
    catch{ return res.status(401).send("Sesión no válida."); }

    const id = String(req.query.id || "");
    if(!id) return res.status(400).send("Falta el identificador del archivo.");

    const snap = await db.doc(`${META}/${id}`).get();
    if(!snap.exists) return res.status(404).send("El archivo ya no está disponible.");
    const f = snap.data();

    const correo = (sesion.email || "").toLowerCase();
    if(f.ownerUid !== sesion.uid){
      const op = await leerOperacion(f.docId);
      const viejo = op ? null : (await db.doc(`documents/${f.docId}`).get()).data();
      const padre = op || viejo;
      const rol = padre ? rolDe(padre, sesion.uid, correo) : null;
      // El aportador ve lo que él entregó, no lo que entregaron los demás.
      if(!puede(rol, "ver") || rol === "aportador"){
        return res.status(403).send("No tienes acceso a este archivo.");
      }
    }

    // Formato viejo: los bytes seguían dentro de Firestore.
    if(!f.ruta && f.data){
      const bytes = Buffer.from(f.data, "base64");
      res.setHeader("Content-Type", f.tipo || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.nombre || id)}"`);
      return res.status(200).end(bytes);
    }

    const objeto = bucket().file(f.ruta);
    const [existe] = await objeto.exists();
    if(!existe) return res.status(404).send("El archivo ya no está en el almacén.");

    res.setHeader("Content-Type", f.tipo || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.nombre || id)}"`);
    res.setHeader("Cache-Control", "private, max-age=60");
    objeto.createReadStream().on("error", () => res.status(500).end()).pipe(res);
  }catch(e){
    console.error(e);
    res.status(500).send("No se pudo entregar el archivo.");
  }
});

// ── Migración de los archivos en base64 a Storage ─────────────
export const migrarArchivos = onCall({ ...OPCIONES, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const { uid } = quien(req);
  const pend = await db.collection(META).where("ownerUid", "==", uid).limit(300).get();
  const resultado = { revisados: pend.size, migrados: 0, omitidos: 0, errores: [] };

  for(const d of pend.docs){
    const f = d.data();
    try{
      if(f.ruta || !f.data){ resultado.omitidos++; continue; }

      const bytes = Buffer.from(f.data, "base64");
      const ruta = `evidencias/${uid}/${f.docId}/${d.id}`;
      await bucket().file(ruta).save(bytes, {
        contentType: f.tipo || "application/octet-stream",
        metadata: { cacheControl: "private, max-age=60" },
      });

      const hash = f.hash || await sha256Bytes(bytes);
      await d.ref.update({ ruta, hash, tam: bytes.length, data: FieldValue.delete(),
                           migradoEn: new Date().toISOString() });
      resultado.migrados++;
    }catch(e){
      resultado.errores.push({ id: d.id, error: String(e?.message || e) });
    }
  }

  return resultado;
});

// ══════════════════════════════════════════════════════════════
// IDENTIDAD: CÓDIGO DE FIRMA, CONTRASEÑAS Y BIOMETRÍA
//
// Nada de esto se comprueba ya en el navegador. Los secretos viven
// en colecciones que ninguna sesión puede leer (`secretos`,
// `protegidos`, `retos`); sólo estas funciones las tocan.
// ══════════════════════════════════════════════════════════════

const SECRETOS = "secretos";     // por usuario: código de firma y credenciales
const PROTEGIDOS = "protegidos"; // por operación: contraseña del documento
const RETOS = "retos";           // por usuario: reto biométrico en curso

/** Dominios desde los que aceptamos una firma biométrica. */
const HOSTS = (process.env.HOSTS_PERMITIDOS || "localhost")
  .split(",").map((h) => h.trim()).filter(Boolean);

const refSecretos = (uid) => db.doc(`${SECRETOS}/${uid}`);

/**
 * Trae los secretos del usuario y, la primera vez, se lleva lo que
 * estaba en el perfil (donde el propio navegador podía escribirlo).
 */
async function secretosDe(uid){
  const [sec, perfil] = await Promise.all([
    refSecretos(uid).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const datos = sec.exists ? sec.data() : {};
  const p = perfil.data() || {};

  const pendiente = {};
  if(!datos.codigo && p.signCodeHash) pendiente.codigo = { algoritmo: "sha256-viejo", legacySha256: p.signCodeHash };
  if(!datos.bioCreds && Array.isArray(p.bioCreds) && p.bioCreds.length) pendiente.bioCreds = p.bioCreds;

  if(Object.keys(pendiente).length){
    await refSecretos(uid).set({ ...datos, ...pendiente, migradoEn: new Date().toISOString() }, { merge: true });
    await db.doc(`users/${uid}`).set(
      { signCodeHash: FieldValue.delete(), bioCreds: FieldValue.delete() }, { merge: true });
    return { ...datos, ...pendiente };
  }
  return datos;
}

/** Corta el intento si la cuenta está en espera por fallos repetidos. */
function exigirIntentosLibres(registro, clave){
  const estado = estadoIntentos(registro?.[clave] || {});
  if(estado.bloqueado){
    throw new HttpsError("resource-exhausted",
      `Demasiados intentos fallidos. Espera ${Math.ceil(estado.segundos / 60)} minuto(s).`);
  }
}

// ── Estado de la cuenta (sin exponer nada secreto) ────────────
export const estadoCuenta = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  const s = await secretosDe(uid);
  return {
    tieneCodigo: Boolean(s.codigo),
    biometria: (s.bioCreds || []).map((c) => ({ credId: c.credId, device: c.device || null })),
  };
});

// ── Código de firma ───────────────────────────────────────────
export const guardarCodigoFirma = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  const codigo = String(req.data?.codigo || "");
  if(codigo.trim().length < 4) throw new HttpsError("invalid-argument", "El código necesita al menos 4 caracteres.");

  await secretosDe(uid);   // arrastra lo viejo antes de sobrescribir
  await refSecretos(uid).set({
    codigo: await sellarSecreto(codigo.trim()),
    intentosCodigo: { intentos: 0, bloqueadoHasta: null },
  }, { merge: true });

  return { ok: true };
});

/** Comprueba el código y devuelve el resultado; también re-sella el formato viejo. */
async function revisarCodigo(uid, codigo){
  const s = await secretosDe(uid);
  if(!s.codigo) throw new HttpsError("failed-precondition", "No tienes código de firma configurado.");
  exigirIntentosLibres(s, "intentosCodigo");

  const { ok, viejo } = await comprobarSecreto(String(codigo || "").trim(), s.codigo);

  const cambios = { intentosCodigo: trasIntento(s.intentosCodigo, ok) };
  if(ok && viejo) cambios.codigo = await sellarSecreto(String(codigo).trim());  // migración silenciosa
  await refSecretos(uid).set(cambios, { merge: true });

  if(!ok) throw new HttpsError("permission-denied", "Código incorrecto.");
  return true;
}

/** Sirve para abrir los adjuntos protegidos, sin firmar nada. */
export const verificarCodigoFirma = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  await revisarCodigo(uid, req.data?.codigo);
  return { ok: true };
});

/** Firmar con código: el servidor comprueba y sella el bloque. */
export const firmarDocumento = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, codigo } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  await revisarCodigo(uid, codigo);

  const autor = await nombreDe(uid, email);
  const perfil = (await db.doc(`users/${uid}`).get()).data() || {};
  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: { accion: "FIRMA", contenido: "Firma", meta: { sello: perfil.selloId || null, metodo: "codigo" } },
  });
  return { doc };
});

// ── Biometría ─────────────────────────────────────────────────
export const registrarBiometria = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  const c = req.data?.credencial || {};
  if(!c.credId || !c.publicKey){
    throw new HttpsError("invalid-argument", "Este navegador no entregó la llave pública; no se puede registrar.");
  }

  const s = await secretosDe(uid);
  const otras = (s.bioCreds || []).filter((x) => x.credId !== c.credId);
  const credencial = {
    credId: String(c.credId), publicKey: String(c.publicKey),
    alg: Number(c.alg ?? -7), device: c.device || null,
    contador: 0, creadoEn: new Date().toISOString(),
  };

  await refSecretos(uid).set({ bioCreds: [...otras, credencial] }, { merge: true });
  return { ok: true, device: credencial.device };
});

/** El reto lo emite el servidor: así una firma no se puede preparar por fuera. */
export const retoBiometrico = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  const motivo = String(req.data?.motivo || "");
  const opId = req.data?.opId || null;
  if(!["firma", "desbloqueo"].includes(motivo)) throw new HttpsError("invalid-argument", "Motivo no válido.");

  const s = await secretosDe(uid);
  const credenciales = s.bioCreds || [];
  if(!credenciales.length) throw new HttpsError("failed-precondition", "No tienes biometría activada.");
  exigirIntentosLibres(s, "intentosBio");

  const reto = nuevoReto(motivo, opId);
  await db.doc(`${RETOS}/${uid}`).set(reto);

  return { reto: reto.reto, credenciales: credenciales.map((c) => c.credId) };
});

/** Comprueba la aserción contra el reto emitido y la llave registrada. */
async function revisarBiometria(uid, { asercion, motivo, opId }){
  const s = await secretosDe(uid);
  exigirIntentosLibres(s, "intentosBio");

  const snapReto = await db.doc(`${RETOS}/${uid}`).get();
  const guardado = snapReto.data();
  if(!retoValido(guardado, { motivo, opId })){
    throw new HttpsError("failed-precondition", "El reto expiró. Inténtalo de nuevo.");
  }

  const credencial = (s.bioCreds || []).find((c) => c.credId === asercion?.credId);
  if(!credencial) throw new HttpsError("permission-denied", "Credencial desconocida.");

  const r = verificarAsercion({ credencial, asercion, reto: guardado.reto, hosts: HOSTS });

  await db.doc(`${RETOS}/${uid}`).delete().catch(() => {});   // un reto sirve una sola vez

  const restantes = (s.bioCreds || []).filter((c) => c.credId !== credencial.credId);
  await refSecretos(uid).set({
    intentosBio: trasIntento(s.intentosBio, r.ok),
    ...(r.ok ? { bioCreds: [...restantes, { ...credencial, contador: r.contador, usadoEn: new Date().toISOString() }] } : {}),
  }, { merge: true });

  if(!r.ok){
    const explica = {
      "reto": "La verificación no corresponde con lo que pidió el servidor.",
      "origen": "La verificación viene de otro sitio.",
      "dominio": "La credencial pertenece a otro dominio.",
      "sin-biometria": "El dispositivo no verificó tu identidad.",
      "repetida": "Esa verificación ya se había usado.",
      "firma": "La firma no corresponde con la credencial registrada.",
    };
    throw new HttpsError("permission-denied", explica[r.motivo] || "No se pudo verificar la biometría.");
  }
  return credencial;
}

export const firmarConBiometria = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, asercion } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const credencial = await revisarBiometria(uid, { asercion, motivo: "firma", opId });

  const autor = await nombreDe(uid, email);
  const perfil = (await db.doc(`users/${uid}`).get()).data() || {};
  const { doc } = await asentar({
    opId, uid, email, autor,
    evento: {
      accion: "FIRMA",
      contenido: `Firma biométrica desde ${credencial.device || "dispositivo"}`,
      meta: {
        sello: perfil.selloId || null,
        signature: {
          method: "webauthn", credId: credencial.credId,
          device: credencial.device || null, alg: credencial.alg ?? null,
          verified: true, verificadaEn: "servidor",
        },
      },
    },
  });
  return { doc };
});

/** Biometría para abrir adjuntos o documentos protegidos, sin firmar. */
export const desbloquearBiometrico = onCall(OPCIONES, async (req) => {
  const { uid } = quien(req);
  const { asercion, opId } = req.data || {};
  await revisarBiometria(uid, { asercion, motivo: "desbloqueo", opId: opId || null });
  return { ok: true };
});

// ── Contraseña del documento ──────────────────────────────────
export const protegerDocumento = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, password } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const op = (await db.doc(`${OPS}/${opId}`).get()).data();
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "proteger");

  const texto = String(password || "");
  if(texto){
    await db.doc(`${PROTEGIDOS}/${opId}`).set({
      clave: await sellarSecreto(texto),
      intentos: { intentos: 0, bloqueadoHasta: null },
      puestaPor: uid, actualizadoEn: new Date().toISOString(),
    });
  }else{
    await db.doc(`${PROTEGIDOS}/${opId}`).delete().catch(() => {});
  }

  // En el documento sólo queda la marca; la contraseña ya no vive ahí.
  await db.doc(`${OPS}/${opId}`).set(
    { protegido: Boolean(texto), password: FieldValue.delete() }, { merge: true });

  return { doc: await leerOperacion(opId) };
});

export const abrirDocumento = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, password } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const refOp = db.doc(`${OPS}/${opId}`);
  const op = (await refOp.get()).data();
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "ver");

  const texto = String(password || "");
  const refP = db.doc(`${PROTEGIDOS}/${opId}`);
  const guardado = (await refP.get()).data();

  // Documentos de antes: la contraseña estaba en texto plano dentro del
  // propio documento. Se acepta una vez y se convierte al formato nuevo.
  if(!guardado){
    if(op.password && texto === op.password){
      await refP.set({ clave: await sellarSecreto(texto), intentos: { intentos: 0, bloqueadoHasta: null },
                       puestaPor: op.ownerUid || uid, migradoEn: new Date().toISOString() });
      await refOp.set({ protegido: true, password: FieldValue.delete() }, { merge: true });
      return { ok: true };
    }
    if(op.password) throw new HttpsError("permission-denied", "Contraseña incorrecta.");
    return { ok: true };   // ya no está protegido
  }

  const estado = estadoIntentos(guardado.intentos || {});
  if(estado.bloqueado){
    throw new HttpsError("resource-exhausted",
      `Demasiados intentos. Espera ${Math.ceil(estado.segundos / 60)} minuto(s).`);
  }

  const { ok } = await comprobarSecreto(texto, guardado.clave);
  await refP.set({ intentos: trasIntento(guardado.intentos, ok) }, { merge: true });
  if(!ok) throw new HttpsError("permission-denied", "Contraseña incorrecta.");

  return { ok: true };
});

// ══════════════════════════════════════════════════════════════
// ANÁLISIS DE CONTRATOS CON IA
//
// Antes esto corría en el navegador y la llave de Gemini viajaba con
// él: cualquiera podía abrir las herramientas de desarrollo, copiarla
// y gastarla a nombre nuestro. Ahora la llave vive sólo aquí.
// ══════════════════════════════════════════════════════════════

export const analizarContrato = onCall(
  { ...OPCIONES, timeoutSeconds: 120, memory: "512MiB", secrets: ["GEMINI_API_KEY"] },
  async (req) => {
    quien(req);   // hace falta sesión: el análisis cuesta dinero

    const texto = String(req.data?.texto || "");
    if(texto.trim().length < 80){
      throw new HttpsError("invalid-argument",
        "El contrato es demasiado corto para analizarse. Escribe al menos un párrafo con las obligaciones.");
    }
    if(texto.length > 120000){
      throw new HttpsError("invalid-argument", "El contrato es demasiado largo. Divídelo en partes.");
    }
    if(!process.env.GEMINI_API_KEY){
      throw new HttpsError("failed-precondition", "El análisis con IA no está configurado en el servidor.");
    }

    try{
      return await analizar(texto);
    }catch(e){
      const motivo = String(e?.message || "");
      console.error("analizarContrato:", motivo);
      const mensaje = EXPLICA[motivo] || "No se pudo analizar el contrato. Inténtalo de nuevo.";
      const codigo = ["cuota", "saturado", "conexion"].includes(motivo) ? "unavailable" : "internal";
      throw new HttpsError(codigo, mensaje);
    }
  });

// ══════════════════════════════════════════════════════════════
// VERIFICACIÓN FISCAL (Etapa 4)
//
// Hasta aquí el sistema sabía que le subiste un archivo: quién, cuándo
// y con qué huella. Lo que no sabía es si ese archivo vale algo. Se
// puede subir una factura cancelada, una de un facturero fichado por
// el SAT, o una que nunca existió, y el expediente se vería igual de
// verde.
//
// Esto lo cierra. Y corre en el servidor por la misma razón que los
// bloques: una respuesta del SAT registrada por el navegador se
// falsifica en diez segundos con las herramientas de desarrollo.
// ══════════════════════════════════════════════════════════════

import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  leerCFDI, esCFDI, expresionImpresa, revisarCFDI, cotejarConRequisito,
} from "./lib/cfdi.js";
import { consultarEstatus } from "./lib/sat.js";
import { parsear69B, indexar, revisarRFCs } from "./lib/lista69b.js";
import { vencimientosDe, tocaRevisar, TOPE_SAT } from "./lib/revision.js";

const RUTA_69B = "catalogos/69b.json";
const URL_69B = process.env.URL_69B
  || "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv";

/** Caché en memoria de la instancia: la lista cambia una vez al día. */
let cache69B = { indice: null, cargadoEn: 0 };
const VIGENCIA_CACHE = 60 * 60 * 1000;   // una hora

async function indice69B(){
  if(cache69B.indice && Date.now() - cache69B.cargadoEn < VIGENCIA_CACHE){
    return cache69B.indice;
  }
  try{
    const f = bucket().file(RUTA_69B);
    const [existe] = await f.exists();
    if(!existe) return null;                        // todavía no se ha descargado
    const [bytes] = await f.download();
    cache69B = { indice: JSON.parse(bytes.toString("utf8")), cargadoEn: Date.now() };
    return cache69B.indice;
  }catch(e){
    console.error("69-B: no se pudo leer el índice", e);
    return null;
  }
}

/** Descarga la lista del SAT y la deja lista para consultar. */
async function bajar69B(){
  const res = await fetch(URL_69B, { redirect: "follow" });
  if(!res.ok) throw new Error(`El SAT respondió ${res.status} al pedir la lista 69-B.`);

  // El archivo viene en latin1, no en UTF-8: leerlo mal parte los nombres
  // con acento y, peor, puede partir una celda.
  const crudo = Buffer.from(await res.arrayBuffer());
  let texto = crudo.toString("utf8");
  if(texto.includes("�")) texto = crudo.toString("latin1");

  const lista = parsear69B(texto);
  if(lista.length < 100){
    throw new Error(`La lista 69-B llegó con sólo ${lista.length} registros: parece incompleta, no se reemplaza la anterior.`);
  }

  const indice = indexar(lista);
  await bucket().file(RUTA_69B).save(JSON.stringify(indice), {
    contentType: "application/json", resumable: false,
  });

  const conteo = lista.reduce((c, e) => ({ ...c, [e.situacion]: (c[e.situacion] || 0) + 1 }), {});
  const resumen = { total: lista.length, ...conteo, actualizadoEn: new Date().toISOString() };
  await db.doc("catalogos/69b").set(resumen);

  cache69B = { indice, cargadoEn: Date.now() };
  return resumen;
}

/** Todos los días a las 6 de la mañana, hora de la Ciudad de México. */
export const actualizar69B = onSchedule(
  { schedule: "0 6 * * *", timeZone: "America/Mexico_City", timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const r = await bajar69B();
    console.log("69-B actualizada:", r);
  });

/** La misma descarga, a mano, para no esperar al día siguiente. */
export const refrescar69B = onCall(
  { ...OPCIONES, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    quien(req);
    return await bajar69B();
  });

/** Los RFC que aparecen en un expediente, vengan de donde vengan. */
function rfcsDe(op){
  const out = [];
  const campos = op?.fields || {};
  out.push(campos.rfcEmisor, campos.rfcReceptor);
  for(const p of op?.partes || []) out.push(p.rfc);
  for(const r of op?.requisitos || []){
    for(const a of (Array.isArray(r.archivos) ? r.archivos : [])){
      out.push(a.fiscal?.rfcEmisor, a.fiscal?.rfcReceptor);
    }
  }
  return out.filter(Boolean);
}

/**
 * Registro de folios fiscales ya usados, por persona.
 *
 * Deducir dos veces la misma factura es de los errores que más caro
 * salen en una auditoría, y en un expediente grande no se ve a simple
 * vista. Un documento por folio, sin índices ni consultas: se pregunta
 * por su nombre y ya.
 */
const refFolio = (uid, uuid) => db.doc(`cfdis/${uid}_${String(uuid).toUpperCase()}`);

async function revisarRepetido(uid, uuid, { opId, reqId }){
  if(!uuid) return null;
  const snap = await refFolio(uid, uuid).get();
  const previo = snap.data();
  if(previo && (previo.opId !== opId || previo.reqId !== reqId)) return previo;
  return null;
}

async function apuntarFolio(uid, uuid, datos){
  if(!uuid) return;
  await refFolio(uid, uuid).set({ uuid: String(uuid).toUpperCase(), ...datos }, { merge: true });
}

/**
 * Todo lo que se puede averiguar de un CFDI, en un solo paso: que el
 * XML sea coherente, qué dice el SAT, si alguno de sus RFC está en la
 * lista negra, si es la factura que el requisito esperaba, y si ya se
 * había usado antes.
 */
async function validarCFDI(datos, contexto = {}){
  const problemas = revisarCFDI(datos);
  const [sat, indice] = await Promise.all([
    consultarEstatus(expresionImpresa(datos)),
    indice69B(),
  ]);
  const listaNegra = revisarRFCs(indice, [datos.rfcEmisor, datos.rfcReceptor]);
  const cotejo = cotejarConRequisito(datos, contexto.requisito);

  let repetido = null;
  if(contexto.uid){
    try{
      repetido = await revisarRepetido(contexto.uid, datos.uuid, contexto);
    }catch(e){ console.error("folios: no se pudo revisar el repetido", e); }
  }

  // El semáforo. Rojo es «no lo deduzcas»: el SAT lo niega, el emisor
  // está fichado en definitivo, o la factura ya se usó en otro lado.
  // Ámbar es «revísalo». Verde sólo cuando todo cuadra.
  let semaforo = "verde";
  if(sat.estado === "cancelado" || sat.estado === "no-encontrado") semaforo = "rojo";
  else if(listaNegra.some((x) => x.riesgo === "alto")) semaforo = "rojo";
  else if(repetido) semaforo = "rojo";
  else if(sat.estado === "desconocido" || listaNegra.length || problemas.length || cotejo.length) semaforo = "ambar";

  return { datos, problemas, sat, listaNegra, cotejo, repetido, semaforo,
           revisadoEn: new Date().toISOString() };
}

/** Guarda la revisión como validación de la operación. Sólo se agregan. */
async function asentarValidacion(opId, aid, r){
  const vid = `${aid}-${Date.now().toString(36)}`;
  await db.doc(`${OPS}/${opId}/validaciones/${vid}`).set({
    id: vid, aid, tipo: "cfdi",
    uuid: r.datos.uuid || null,
    rfcEmisor: r.datos.rfcEmisor || null,
    rfcReceptor: r.datos.rfcReceptor || null,
    total: r.datos.total ?? null,
    semaforo: r.semaforo,
    sat: r.sat,
    listaNegra: r.listaNegra,
    problemas: r.problemas,
    cotejo: r.cotejo || [],
    repetido: r.repetido || null,
    creadoEn: r.revisadoEn,
  });
  return vid;
}

/** El resumen que viaja en el bloque y en la ficha del archivo. */
const resumenFiscal = (r) => ({
  uuid: r.datos.uuid || null,
  version: r.datos.version || null,
  rfcEmisor: r.datos.rfcEmisor || null,
  rfcReceptor: r.datos.rfcReceptor || null,
  total: r.datos.total ?? null,
  moneda: r.datos.moneda || null,
  fecha: r.datos.fechaCorta || null,
  emisor: r.datos.nombreEmisor || null,
  semaforo: r.semaforo,
  estadoSAT: r.sat.estado,
  textoSAT: r.sat.texto,
  listaNegra: r.listaNegra.map((x) => ({ rfc: x.rfc, situacion: x.situacion, riesgo: x.riesgo })),
  problemas: r.problemas.map((p) => p.clave),
  cotejo: (r.cotejo || []).map((c) => ({ clave: c.clave, texto: c.texto })),
  repetido: r.repetido
    ? { opId: r.repetido.opId, reqId: r.repetido.reqId, titulo: r.repetido.titulo || null,
        usadaEn: r.repetido.creadoEn || null }
    : null,
  revisadoEn: r.revisadoEn,
});

/** ¿Vale la pena intentar leerlo como CFDI? */
const pareceXML = (tipo, nombre) =>
  /xml/i.test(tipo || "") || /\.xml$/i.test(nombre || "");

/**
 * Revisa de nuevo un comprobante ya adjunto. Una factura vigente hoy
 * puede estar cancelada mañana, y quien firma un expediente necesita
 * poder preguntarlo otra vez sin volver a subir nada.
 */
export const verificarCFDI = onCall(
  { ...OPCIONES, timeoutSeconds: 120 },
  async (req) => {
    const { uid, email } = quien(req);
    const { opId, aid } = req.data || {};
    if(!opId || !aid) throw new HttpsError("invalid-argument", "Faltan datos del comprobante.");

    const op = await leerOperacion(opId);
    if(!op) throw new HttpsError("not-found", "La operación no existe.");
    exigir(op, uid, email, "ver");

    const requisito = (op.requisitos || [])
      .find((r) => (Array.isArray(r.archivos) ? r.archivos : []).some((a) => (a.aid || a.path) === aid));
    const archivo = (requisito?.archivos || []).find((a) => (a.aid || a.path) === aid);
    if(!archivo?.ruta) throw new HttpsError("not-found", "Ese comprobante ya no está.");

    const [bytes] = await bucket().file(archivo.ruta).download();
    const datos = leerCFDI(bytes.toString("utf8"));
    if(!datos) throw new HttpsError("failed-precondition", "Ese archivo no es un CFDI.");

    const r = await validarCFDI(datos, { uid, opId, reqId: requisito?.id, requisito });
    await asentarValidacion(opId, aid, r);

    const autor = await nombreDe(uid, email);
    const { doc } = await asentar({
      opId, uid, email, autor, tocarFecha: false, permiso: "ver",
      evento: {
        accion: "VALIDACIÓN",
        contenido: `Revisión del SAT: ${r.sat.texto}`,
        meta: { tipo: "cfdi", aid, ...resumenFiscal(r) },
      },
    });

    return { doc, fiscal: resumenFiscal(r) };
  });

/** Cruza todos los RFC del expediente contra la lista negra, a petición. */
export const revisar69B = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId } = req.data || {};
  const op = await leerOperacion(opId);
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "ver");

  const indice = await indice69B();
  if(!indice) return { listo: false, hallazgos: [], texto: "La lista del SAT aún no se ha descargado." };

  const hallazgos = revisarRFCs(indice, rfcsDe(op));
  const catalogo = (await db.doc("catalogos/69b").get()).data() || {};
  return { listo: true, hallazgos, actualizadoEn: catalogo.actualizadoEn || null };
});

// ══════════════════════════════════════════════════════════════
// INVITACIONES POR ENLACE (Etapa 4 · Bloque B)
//
// Un enlace que abre UN requisito y nada más, para que quien te debe
// una factura no tenga que abrirse una cuenta para dártela.
//
// Estas funciones son las únicas del sistema que atienden a alguien
// sin sesión propia, así que cada una vuelve a comprobar el enlace
// desde cero: no se confía en nada que venga del navegador salvo el
// testigo, y del testigo sólo se confía después de compararlo contra
// su huella guardada.
// ══════════════════════════════════════════════════════════════

import {
  armarInvitacion, huellaDe, revisarInvitacion, MOTIVOS as MOTIVOS_INV,
  vistaPublica, autorDeInvitacion, rutaValidaDeInvitacion, cubre,
} from "./lib/invitaciones.js";

const INV = "invitaciones";
const refInv = (huella) => db.doc(`${INV}/${huella}`);

/** Busca el enlace y comprueba que se pueda usar. Devuelve el registro o falla. */
async function abrirInvitacion(testigo){
  const t = String(testigo || "");
  if(t.length < 20) throw new HttpsError("not-found", MOTIVOS_INV["no-existe"]);

  const huella = huellaDe(t);
  const snap = await refInv(huella).get();
  const registro = snap.exists ? snap.data() : null;

  const r = revisarInvitacion(registro);
  if(!r.ok) throw new HttpsError(r.motivo === "no-existe" ? "not-found" : "failed-precondition",
                                 MOTIVOS_INV[r.motivo]);
  return { huella, registro };
}

/** Crear el enlace. El testigo se devuelve UNA vez: después ya no se puede recuperar. */
export const crearInvitacion = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, reqIds, correo, dias, maxArchivos, todoLoQueFalta } = req.data || {};
  if(!opId) throw new HttpsError("invalid-argument", "Faltan datos de la invitación.");

  const op = await leerOperacion(opId);
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "pedir");

  // «Todo lo que falta» es el caso normal: un proveedor que te debe
  // varias facturas. Mandarle un enlace por cada una sería obligarlo a
  // hacer nuestro trabajo de organización.
  const pedidos = todoLoQueFalta
    ? (op.requisitos || []).filter((r) => r.estado !== "cumplido").map((r) => r.id)
    : (Array.isArray(reqIds) ? reqIds : [reqIds]).filter(Boolean);

  const existentes = new Set((op.requisitos || []).map((r) => r.id));
  const lista = [...new Set(pedidos)].filter((x) => existentes.has(x));
  if(!lista.length){
    throw new HttpsError("invalid-argument", todoLoQueFalta
      ? "No queda ningún requisito pendiente en este expediente."
      : "Elige al menos un requisito que exista en el expediente.");
  }

  const autor = await nombreDe(uid, email);
  const { testigo, registro } = armarInvitacion({
    opId, reqIds: lista, correo,
    creadaPor: autor, creadaPorUid: uid, dias, maxArchivos,
  });

  await refInv(registro.huella).set(registro);

  const titulos = lista
    .map((id) => (op.requisitos || []).find((r) => r.id === id)?.titulo || id);

  const { doc } = await asentar({
    opId, uid, email, autor, tocarFecha: false, permiso: "pedir",
    evento: {
      accion: "SOLICITUD",
      contenido: lista.length === 1
        ? `Enlace de entrega para «${titulos[0]}»`
          + (registro.correo ? ` (${registro.correo})` : "")
        : `Enlace de entrega para ${lista.length} comprobantes`
          + (registro.correo ? ` (${registro.correo})` : ""),
      meta: { tipo: "invitacion", requisitos: lista, correo: registro.correo,
              expiraEn: registro.expiraEn, huella: registro.huella },
    },
  });

  return { doc, testigo, expiraEn: registro.expiraEn, huella: registro.huella,
           requisitos: titulos };
});

/** Retirar un enlace antes de que venza. */
export const revocarInvitacion = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId, huella } = req.data || {};
  if(!opId || !huella) throw new HttpsError("invalid-argument", "Faltan datos.");

  const op = await leerOperacion(opId);
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "pedir");

  const snap = await refInv(huella).get();
  if(!snap.exists || snap.data().opId !== opId){
    throw new HttpsError("not-found", "Ese enlace no pertenece a este documento.");
  }
  await refInv(huella).set({ revocada: true, revocadaEn: new Date().toISOString() }, { merge: true });

  const autor = await nombreDe(uid, email);
  const { doc } = await asentar({
    opId, uid, email, autor, tocarFecha: false, permiso: "pedir",
    evento: { accion: "SOLICITUD", contenido: `Enlace de entrega retirado`,
              meta: { tipo: "invitacion-baja", huella } },
  });
  return { doc };
});

/** Los enlaces vivos de una operación, para la pantalla de quien los creó. */
export const invitacionesDe = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const { opId } = req.data || {};
  const op = await leerOperacion(opId);
  if(!op) throw new HttpsError("not-found", "La operación no existe.");
  exigir(op, uid, email, "ver");

  const snap = await db.collection(INV).where("opId", "==", opId).limit(100).get();
  const ahora = Date.now();
  return {
    enlaces: snap.docs.map((d) => d.data())
      .map((x) => ({
        huella: x.huella, reqIds: x.reqIds || [], correo: x.correo,
        creadaEn: x.creadaEn, expiraEn: x.expiraEn,
        entregas: x.entregas || 0, maxArchivos: x.maxArchivos || 20,
        estado: revisarInvitacion(x, ahora).ok ? "vigente" : revisarInvitacion(x, ahora).motivo,
      }))
      .sort((a, b) => String(b.creadaEn).localeCompare(String(a.creadaEn))),
  };
});

// ── Lo que ve y hace el invitado, sin cuenta ──────────────────
//
// Estas dos no exigen sesión propia de chaindoc. Sí exigen una sesión
// anónima de Firebase, que es lo que permite subir el archivo a un
// rincón aislado del almacén; esa sesión no da acceso a nada más.

export const verInvitacion = onCall(OPCIONES, async (req) => {
  const { registro } = await abrirInvitacion(req.data?.testigo);
  const op = await leerOperacion(registro.opId);
  if(!op) throw new HttpsError("not-found", "El documento ya no existe.");
  return vistaPublica(registro, op);
});

/**
 * El invitado ya dejó su archivo en la carpeta temporal; aquí se
 * registra. El servidor lo lee, calcula su huella, lo mueve al lugar
 * definitivo, lo revisa como a cualquier otro comprobante y lo asienta
 * en la cadena. El invitado nunca escribe en la operación.
 */
export const subirPorInvitacion = onCall(
  { ...OPCIONES, timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
    const anon = req.auth?.uid;
    if(!anon) throw new HttpsError("unauthenticated", "Vuelve a abrir el enlace e inténtalo de nuevo.");

    const { testigo, ruta, nombre, reqId } = req.data || {};
    const { huella, registro } = await abrirInvitacion(testigo);

    if(!rutaValidaDeInvitacion(ruta, anon, huella)){
      throw new HttpsError("permission-denied", "El archivo no llegó por donde debía.");
    }

    // El enlace cubre una lista de requisitos; el invitado dice a cuál
    // sube. Que lo diga él no lo hace válido: se comprueba aquí.
    if(!cubre(registro, reqId)){
      throw new HttpsError("permission-denied", "Este enlace no sirve para ese comprobante.");
    }

    const op = await leerOperacion(registro.opId);
    if(!op) throw new HttpsError("not-found", "El documento ya no existe.");
    const requisito = (op.requisitos || []).find((r) => r.id === reqId);
    if(!requisito) throw new HttpsError("not-found", "Ese requisito ya no está en el documento.");

    const { hash, tam, tipo, bytes } = await leerYHashear(ruta);

    // Del rincón temporal al lugar donde viven las evidencias, bajo el
    // dueño del expediente: el invitado no deja nada a su nombre.
    const id = `${registro.opId}-${reqId}-${Math.random().toString(36).slice(2, 10)}`;
    const destino = `evidencias/${op.ownerUid}/${registro.opId}/${id}`;
    await bucket().file(ruta).move(destino);

    const autor = autorDeInvitacion(registro);

    let fiscal = null;
    if(pareceXML(tipo, nombre)){
      try{
        const texto = bytes.toString("utf8");
        const datos = esCFDI(texto) ? leerCFDI(texto) : null;
        if(datos){
          const r = await validarCFDI(datos, {
            uid: op.ownerUid, opId: registro.opId, reqId, requisito });
          await asentarValidacion(registro.opId, id, r);
          await apuntarFolio(op.ownerUid, datos.uuid, {
            opId: registro.opId, reqId, aid: id, titulo: op.title || null,
            total: datos.total ?? null, rfcEmisor: datos.rfcEmisor || null,
            creadoEn: new Date().toISOString(),
          });
          fiscal = resumenFiscal(r);
        }
      }catch(e){ console.error("CFDI por invitación: no se pudo revisar", e); }
    }

    const nuevo = {
      aid: id, path: id, ruta: destino, nombre: nombre || "archivo",
      tipo, tam, hash, subidoEn: new Date().toISOString(), subidoPor: autor,
      porInvitacion: true, invitacionA: registro.correo || null,
      ...(fiscal ? { fiscal } : {}),
    };

    const { requisitos, encontrado } = agregarArchivo(op.requisitos || [], reqId, nuevo);
    if(!encontrado) throw new HttpsError("not-found", "Ese requisito ya no está en el documento.");
    const { solicitudes } = cerrarSolicitudes(op, reqId, autor);

    await db.doc(`${META}/${id}`).set({
      id, ownerUid: op.ownerUid, docId: registro.opId, reqId, ruta: destino,
      nombre: nuevo.nombre, tipo, tam, hash, thumb: null, creadoEn: nuevo.subidoEn,
      porInvitacion: true,
    });

    // El bloque lo asienta el servidor a nombre de la invitación, sin
    // pedirle permisos a nadie: el enlace ES el permiso, y ya se
    // comprobó arriba.
    await asentar({
      opId: registro.opId, uid: op.ownerUid, email: op.ownerEmail, autor,
      exigirAcceso: false,
      evento: {
        accion: "EVIDENCIA",
        contenido: fiscal
          ? `${requisito.titulo || reqId}: «${nuevo.nombre}» por invitación · ${fiscal.textoSAT}`
          : `${requisito.titulo || reqId}: «${nuevo.nombre}» entregado por invitación (${hash.slice(0, 16)}…)`,
        meta: { tipo: "alta", requisito: reqId, archivo: nuevo.nombre, huella: hash, tam,
                porInvitacion: true, correo: registro.correo || null, ...(fiscal ? { fiscal } : {}) },
      },
      cambios: { requisitos, solicitudes },
    });

    await refInv(huella).set({
      entregas: (registro.entregas || 0) + 1,
      ultimoUso: new Date().toISOString(),
    }, { merge: true });

    return { ok: true, nombre: nuevo.nombre, hash, fiscal, reqId };
  });

// ══════════════════════════════════════════════════════════════
// REVISIÓN DIARIA (Etapa 4 · Bloque B)
//
// Dos cosas que nadie va a hacer a mano:
//
//  1. Volver a preguntarle al SAT por las facturas ya comprobadas. Una
//     factura vigente en septiembre puede estar cancelada en octubre,
//     y el expediente se vuelve falso en silencio. Es el punto 26 del
//     plan: aquí sale casi gratis, porque la tarea ya corre.
//  2. Mirar qué fases y requisitos están por vencer.
//
// El resultado NO se manda por correo todavía —eso necesita el dominio
// propio— sino que se deja en `avisos/{uid}`, que la app enseña al
// entrar. Cuando haya dominio, lo único que se agrega es el envío: lo
// que decide qué avisar ya está aquí.
// ══════════════════════════════════════════════════════════════

const AVISOS = "avisos";

async function revisarOperacion(op){
  const avisos = vencimientosDe(op);
  let consultas = 0;
  let cambiados = 0;

  for(const { req, archivo } of tocaRevisar(op)){
    if(consultas >= TOPE_SAT) break;
    consultas++;
    try{
      const [bytes] = await bucket().file(archivo.ruta).download();
      const datos = leerCFDI(bytes.toString("utf8"));
      if(!datos) continue;

      const r = await validarCFDI(datos, {
        uid: op.ownerUid, opId: op.id, reqId: req.id, requisito: req });
      await asentarValidacion(op.id, archivo.aid || archivo.path, r);

      const antes = archivo.fiscal.estadoSAT;
      if(r.sat.estado !== antes && r.sat.estado !== "desconocido"){
        cambiados++;
        avisos.push({
          tipo: r.sat.estado === "cancelado" ? "factura-cancelada" : "factura-cambio",
          opId: op.id, titulo: op.title || "Documento",
          requisito: req.titulo, archivo: archivo.nombre,
          uuid: datos.uuid, antes, ahora: r.sat.estado, texto: r.sat.texto,
        });

        // Queda asentado en la cadena: el expediente tiene que reflejar
        // que algo cambió, no sólo la pantalla.
        await asentar({
          opId: op.id, uid: op.ownerUid, email: op.ownerEmail,
          autor: "Revisión automática", exigirAcceso: false, tocarFecha: false,
          evento: {
            accion: "VALIDACIÓN",
            contenido: `Revisión diaria: «${archivo.nombre}» pasó de ${antes} a ${r.sat.estado}`,
            meta: { tipo: "cfdi-revision", aid: archivo.aid || archivo.path, antes, ...resumenFiscal(r) },
          },
        });
      }
    }catch(e){ console.error("revisión diaria:", op.id, e?.message || e); }
  }

  return { avisos, consultas, cambiados };
}

/** Guarda los avisos de una persona, reemplazando los del día anterior. */
async function guardarAvisos(uid, avisos){
  await db.doc(`${AVISOS}/${uid}`).set({
    uid, generadoEn: new Date().toISOString(),
    total: avisos.length,
    avisos: avisos.slice(0, 50),
  });
}

/** Todos los días a las 7 de la mañana, hora de la Ciudad de México. */
export const revisionDiaria = onSchedule(
  { schedule: "0 7 * * *", timeZone: "America/Mexico_City",
    timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const snap = await db.collection(OPS).limit(500).get();
    const porDueno = new Map();

    for(const d of snap.docs){
      const op = { ...d.data(), id: d.id };
      if(!op.ownerUid) continue;
      const r = await revisarOperacion(op);
      if(!r.avisos.length) continue;
      porDueno.set(op.ownerUid, [...(porDueno.get(op.ownerUid) || []), ...r.avisos]);
    }

    for(const [uid, avisos] of porDueno) await guardarAvisos(uid, avisos);

    console.log("Revisión diaria:", {
      operaciones: snap.size, personasConAvisos: porDueno.size,
      avisos: [...porDueno.values()].reduce((n, a) => n + a.length, 0),
    });
  });

/** La misma revisión, a mano y sólo para lo tuyo. */
export const revisarAhora = onCall(
  { ...OPCIONES, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    const { uid } = quien(req);
    const snap = await db.collection(OPS).where("ownerUid", "==", uid).limit(100).get();

    let avisos = [];
    let consultas = 0;
    for(const d of snap.docs){
      const r = await revisarOperacion({ ...d.data(), id: d.id });
      avisos = [...avisos, ...r.avisos];
      consultas += r.consultas;
    }
    await guardarAvisos(uid, avisos);
    return { avisos: avisos.slice(0, 50), total: avisos.length, consultas };
  });

// ══════════════════════════════════════════════════════════════
// ANCLAJE EN BITCOIN (Etapa 5 · Bloque A)
//
// Hasta aquí la fecha de cada bloque la ponía nuestro servidor, y eso
// alcanza para organizarse pero no para discutir: si alguien pregunta
// «¿quién dice que eso fue el 17 de septiembre?», la respuesta era «lo
// dice mi servidor», y el servidor lo controlamos nosotros.
//
// Una vez al día se toma un solo hash que resume todos los bloques
// nuevos y se publica en la cadena de Bitcoin, gratis, vía
// OpenTimestamps. A partir de ahí la fecha la sostiene una red que
// nadie controla. Ni nosotros.
//
// El invitado no ve nada de esto y no tiene que hacer nada: es el
// único punto de la Etapa 5 con cero fricción.
// ══════════════════════════════════════════════════════════════

import {
  arbolMerkle, armarRegistro, actualizarOts, deHex, estadoDe, hex,
  otsDeHoja, sellarRaiz,
} from "./lib/anclaje.js";

const ANCLAJES = "anclajes";
const POR_ANCLAR = "porAnclar";

/** Tope de hojas por anclaje: un documento de Firestore aguanta 1 MiB. */
const MAX_HOJAS = 4000;

/** Tiempo mínimo antes de preguntarle al calendario si ya entró. */
const ESPERA_CONFIRMACION = 60 * 60 * 1000;   // una hora

/**
 * Apunta un bloque en la cola de lo que falta anclar.
 *
 * Es una cola y no una consulta por fecha a propósito: así ningún
 * bloque se pierde si un día el calendario no responde —la cola
 * simplemente crece y al día siguiente se pone al corriente— y no hace
 * falta un índice de grupo de colecciones sobre `bloques`.
 */
function encolarParaAnclar(t, opId, bloque){
  t.set(db.doc(`${POR_ANCLAR}/${bloque.hash}`), {
    hash: bloque.hash, opId, index: bloque.index,
    creadoEn: bloque.timestamp || new Date().toISOString(),
  });
}

/** Junta lo que falta por anclar, lo sella y lo guarda. */
async function anclarPendientes({ ahora = new Date(), fetchImpl } = {}){
  const cola = await db.collection(POR_ANCLAR)
    .orderBy("creadoEn").limit(MAX_HOJAS).get();
  if(cola.empty) return { anclados: 0, motivo: "nada-pendiente" };

  const filas = cola.docs.map((d) => d.data());
  const hojas = filas.map((f) => deHex(f.hash));
  const { raiz } = arbolMerkle(hojas);

  // Si el sellado falla, no se borra nada de la cola: el próximo
  // intento vuelve a incluirlos.
  const { prueba, respondieron, fallos } = await sellarRaiz(raiz, { fetchImpl });

  const registro = armarRegistro({ hojas, raiz, prueba, ahora, fallos });
  const id = await idLibre(registro.id);
  await db.doc(`${ANCLAJES}/${id}`).set({ ...registro, id });

  // Recién ahora se vacía la cola.
  const lote = db.batch();
  for(const d of cola.docs) lote.delete(d.ref);
  await lote.commit();

  return { anclados: hojas.length, id, raiz: hex(raiz), calendarios: respondieron, fallos };
}

/** Si ya hubo un anclaje hoy, el siguiente lleva sufijo. */
async function idLibre(base){
  for(let i = 0; i < 50; i++){
    const id = i === 0 ? base : `${base}-${i + 1}`;
    if(!(await db.doc(`${ANCLAJES}/${id}`).get()).exists) return id;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Convierte en confirmadas las pruebas que los calendarios ya metieron
 * a Bitcoin. Tardan entre unas horas y un día; eso no es un fallo, es
 * cómo funciona: hay que esperar a que se mine un bloque y a que el
 * calendario agregue lo suyo.
 */
async function confirmarPendientes({ ahora = new Date(), fetchImpl } = {}){
  const corte = new Date(ahora.getTime() - ESPERA_CONFIRMACION).toISOString();
  // Sólo un filtro de igualdad, a propósito: combinarlo con un rango
  // sobre otro campo obligaría a crear un índice compuesto, que es una
  // cosa más que desplegar y una cosa más que puede faltar el día del
  // estreno. Como hay un anclaje por día y se confirma dentro del
  // mismo día, los pendientes se cuentan con los dedos de una mano; la
  // edad se filtra aquí.
  const snap = await db.collection(ANCLAJES)
    .where("estado", "==", "pendiente")
    .limit(50).get();

  let confirmados = 0;
  let esperando = 0;
  for(const d of snap.docs){
    const reg = d.data();
    if(reg.creadoEn && reg.creadoEn > corte){ esperando++; continue; }   // demasiado reciente
    try{
      const actual = new Uint8Array(Buffer.from(reg.ots, "base64"));
      const nueva = await actualizarOts(actual, { fetchImpl });
      if(!nueva) continue;
      const { altura } = estadoDe(nueva);
      await d.ref.update({
        ots: Buffer.from(nueva).toString("base64"),
        estado: "confirmado",
        altura,
        confirmadoEn: ahora.toISOString(),
      });
      confirmados++;
    }catch(e){
      console.error("anclaje: no se pudo confirmar", d.id, e?.message || e);
    }
  }
  return { revisados: snap.size, confirmados, aunMuyRecientes: esperando };
}

/** Todos los días de madrugada, cuando no hay nadie usando la app. */
export const anclajeDiario = onSchedule(
  { schedule: "17 3 * * *", timeZone: "America/Mexico_City",
    timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const r = await anclarPendientes();
    console.log("anclaje diario:", JSON.stringify(r));
  });

/** Cada seis horas, a ver si los calendarios ya lo metieron a Bitcoin. */
export const confirmarAnclajes = onSchedule(
  { schedule: "23 */6 * * *", timeZone: "America/Mexico_City",
    timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const r = await confirmarPendientes();
    console.log("confirmación de anclajes:", JSON.stringify(r));
  });

/** Las dos cosas a mano, para no esperar al horario. */
export const anclarAhora = onCall(
  { ...OPCIONES, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    quien(req);
    const sellado = await anclarPendientes();
    const confirmado = await confirmarPendientes();
    return { sellado, confirmado };
  });

/** Busca en qué anclaje quedó un hash. */
async function anclajeDe(hash){
  const snap = await db.collection(ANCLAJES)
    .where("hojas", "array-contains", String(hash).toLowerCase())
    .limit(1).get();
  return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id };
}

/**
 * El estado de anclaje de toda la cadena de una operación, más la
 * prueba .ots de cada bloque que ya lo tenga.
 *
 * Va en una sola llamada porque es lo que necesitan las dos pantallas
 * que lo usan —la línea de tiempo y el paquete de evidencia— y así el
 * navegador no lee `anclajes` directamente.
 */
export const anclajesDe = onCall(
  { ...OPCIONES, timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
    const { uid, email } = quien(req);
    const opId = String(req.data?.opId || "");
    if(!opId) throw new HttpsError("invalid-argument", "Falta el documento.");

    const op = await leerOperacion(opId);
    if(!op) throw new HttpsError("not-found", "La operación no existe.");
    exigir(op, uid, email, "ver");

    const conPrueba = req.data?.conPrueba !== false;
    const cache = new Map();
    const bloques = [];
    let pendientes = 0;

    for(const b of op.chain || []){
      if(!b?.hash){ bloques.push({ index: b?.index ?? null, estado: "sin-hash" }); continue; }
      let reg = cache.get(b.hash);
      if(reg === undefined){
        reg = await anclajeDe(b.hash);
        cache.set(b.hash, reg);
        // Un anclaje cubre muchos bloques de la misma cadena: se
        // aprovecha para los demás sin volver a consultar.
        if(reg) for(const h of reg.hojas) if(!cache.has(h)) cache.set(h, reg);
      }
      if(!reg){
        pendientes++;
        bloques.push({ index: b.index, hash: b.hash, estado: "sin-anclar" });
        continue;
      }
      let ots = null;
      if(conPrueba){
        try{ const o = otsDeHoja(reg, b.hash); ots = o ? Buffer.from(o).toString("base64") : null; }
        catch(e){ console.error("anclaje: no se pudo armar la prueba", b.hash, e?.message); }
      }
      bloques.push({
        index: b.index, hash: b.hash,
        estado: reg.estado,               // pendiente | confirmado
        anclaje: reg.id,
        ancladoEn: reg.creadoEn,
        confirmadoEn: reg.confirmadoEn || null,
        altura: reg.altura ?? null,
        raiz: reg.raiz,
        ots,
      });
    }

    return {
      bloques,
      pendientes,
      confirmados: bloques.filter((b) => b.estado === "confirmado").length,
      // Cuándo correrá el próximo, para poder decirlo en pantalla en
      // vez de dejar al usuario preguntándose si se atoró.
      proximoAnclaje: proximaMadrugada().toISOString(),
    };
  });

/** La próxima vez que corre el anclaje diario (3:17 hora de México). */
function proximaMadrugada(desde = new Date()){
  const d = new Date(desde);
  // El servidor corre en UTC; México es UTC-6, así que 3:17 local
  // son las 9:17 UTC.
  d.setUTCHours(9, 17, 0, 0);
  if(d <= desde) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// ══════════════════════════════════════════════════════════════
// ETAPA 5 — FIRMAR CON LA e.firma DEL SAT
//
// La firma se hace en el navegador: el archivo .key no sale del
// equipo de quien firma, ni pasa por aquí, ni se guarda en ningún
// lado. Lo que llega es el certificado público y la firma.
//
// Y precisamente por eso el servidor no puede creerle al navegador.
// Un certificado que diga cualquier RFC se fabrica en un minuto, así
// que aquí se comprueban tres cosas y hacen falta las tres:
//
//   1. Que la firma corresponda a lo que el servidor pidió firmar
//      (el reto, atado a este expediente y a su último bloque).
//   2. Que la firma la haya hecho la llave de ese certificado.
//   3. Que ese certificado suba hasta una raíz del SAT.
//
// Si falla cualquiera, no se asienta nada. No existe el estado
// «e.firma sin verificar»: eso acabaría enseñándose como si valiera.
// ══════════════════════════════════════════════════════════════

import {
  loQueSeFirma, raicesDesdeZip, revisarEfirma, URL_RAICES,
  enPalabras as motivoEfirma,
} from "./lib/efirma.js";

/** Los certificados del SAT viven en Storage, igual que la lista 69-B. */
const RUTA_RAICES = "catalogos/raices-sat.json";
let cacheRaices = { lista: null, cargadoEn: 0 };
const VIGENCIA_RAICES = 6 * 60 * 60 * 1000;   // seis horas

/** Baja el zip del SAT y deja los certificados listos para comprobar. */
async function bajarRaicesSAT(){
  const res = await fetch(URL_RAICES, { redirect: "follow" });
  if(!res.ok) throw new Error(`El SAT respondió ${res.status} al pedir sus certificados.`);

  const lista = raicesDesdeZip(new Uint8Array(await res.arrayBuffer()));

  // Si llegara casi vacío, mejor quedarse con los de ayer: una lista
  // corta no rechaza firmas falsas, rechaza las buenas.
  if(lista.length < 2){
    throw new Error(`El paquete del SAT llegó con sólo ${lista.length} certificado(s): parece incompleto, no se reemplaza el anterior.`);
  }

  await bucket().file(RUTA_RAICES).save(JSON.stringify(lista), {
    contentType: "application/json", resumable: false,
  });

  const resumen = {
    total: lista.length,
    actualizadoEn: new Date().toISOString(),
    certificados: lista.map((r) => ({ archivo: r.archivo, sujeto: r.sujeto, hasta: r.hasta })),
  };
  await db.doc("catalogos/raicesSAT").set(resumen);

  cacheRaices = { lista, cargadoEn: Date.now() };
  return resumen;
}

/** Los certificados guardados. Si nunca se han bajado, los baja ahora. */
async function raicesSAT(){
  if(cacheRaices.lista && Date.now() - cacheRaices.cargadoEn < VIGENCIA_RAICES){
    return cacheRaices.lista;
  }
  try{
    const f = bucket().file(RUTA_RAICES);
    const [existe] = await f.exists();
    if(existe){
      const [bytes] = await f.download();
      cacheRaices = { lista: JSON.parse(bytes.toString("utf8")), cargadoEn: Date.now() };
      return cacheRaices.lista;
    }
  }catch(e){
    console.error("raíces del SAT: no se pudieron leer", e);
  }
  // Primera vez (o se borró el archivo): se bajan al vuelo para no
  // dejar a nadie sin poder firmar hasta la madrugada siguiente.
  try{
    await bajarRaicesSAT();
    return cacheRaices.lista;
  }catch(e){
    console.error("raíces del SAT: no se pudieron bajar", e);
    return [];
  }
}

/** Los lunes de madrugada. Las autoridades del SAT cambian cada años, no cada día. */
export const actualizarRaicesSAT = onSchedule(
  { schedule: "41 4 * * 1", timeZone: "America/Mexico_City", timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const r = await bajarRaicesSAT();
    console.log("Raíces del SAT actualizadas:", r.total);
  });

/** La misma descarga, a mano. */
export const refrescarRaicesSAT = onCall(
  { ...OPCIONES, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    quien(req);
    return await bajarRaicesSAT();
  });

/**
 * Paso 1 — el servidor dice qué hay que firmar.
 *
 * Devuelve el hash y, en palabras, sobre qué documento es, para que la
 * pantalla pueda enseñarlo antes de pedir la contraseña de la llave.
 */
export const retoEfirma = onCall(OPCIONES, async (req) => {
  const { uid, email } = quien(req);
  const opId = String(req.data?.opId || "");
  if(!opId) throw new HttpsError("invalid-argument", "Falta el identificador de la operación.");

  const snap = await db.doc(`${OPS}/${opId}`).get();
  if(!snap.exists) throw new HttpsError("not-found", "La operación no existe.");
  const op = snap.data();
  exigir(op, uid, email, "firmar");

  // Diez minutos: abrir el explorador de archivos y escribir la
  // contraseña de la llave lleva más que una huella.
  const reto = nuevoReto("efirma", opId, 10);
  const sobreHash = op.ultimoHash || "";
  const { texto, hashHex } = loQueSeFirma({ opId, sobreHash, reto: reto.reto });

  await db.doc(`${RETOS}/${uid}`).set({ ...reto, sobreHash, hashHex });

  return {
    hashHex, texto,
    resumen: {
      numId: op.numId || opId,
      titulo: op.title || "Documento",
      bloques: op.bloques || 0,
      sobreHash,
    },
  };
});

/** Paso 2 — llega la firma y se comprueba entera antes de asentar nada. */
export const firmarConEfirma = onCall(
  { ...OPCIONES, timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
    const { uid, email } = quien(req);
    const { opId, certificado, firma } = req.data || {};
    if(!opId || !certificado || !firma){
      throw new HttpsError("invalid-argument", "Faltan datos de la firma.");
    }

    const snapReto = await db.doc(`${RETOS}/${uid}`).get();
    const guardado = snapReto.data();
    if(!retoValido(guardado, { motivo: "efirma", opId })){
      throw new HttpsError("failed-precondition", "La firma tardó demasiado. Vuelve a intentarlo.");
    }
    // Un reto sirve una sola vez, valga o no la firma.
    await db.doc(`${RETOS}/${uid}`).delete().catch(() => {});

    const snap = await db.doc(`${OPS}/${opId}`).get();
    if(!snap.exists) throw new HttpsError("not-found", "La operación no existe.");
    if((snap.data().ultimoHash || "") !== guardado.sobreHash){
      // Alguien escribió un bloque mientras se firmaba. La firma ampara
      // la versión anterior, así que no se asienta sobre la nueva: eso
      // haría parecer que firmó algo que no vio.
      throw new HttpsError("failed-precondition",
        "El expediente cambió mientras firmabas. Vuelve a firmar para que la firma ampare la versión nueva.");
    }

    const raices = await raicesSAT();
    const r = revisarEfirma({
      certificadoB64: String(certificado),
      firmaB64: String(firma),
      hashHex: guardado.hashHex,
      raices,
    });
    if(!r.valida) throw new HttpsError("permission-denied", motivoEfirma(r.motivo));

    const autor = await nombreDe(uid, email);
    const perfil = (await db.doc(`users/${uid}`).get()).data() || {};
    const { doc } = await asentar({
      opId, uid, email, autor,
      evento: {
        accion: "FIRMA",
        contenido: `Firma con e.firma del SAT · ${r.rfc}`,
        meta: {
          sello: perfil.selloId || null,
          signature: {
            method: "efirma", verified: true, verificadaEn: "servidor",
            rfc: r.rfc, nombre: r.nombre,
            numeroDeSerie: r.numeroDeSerie, emisor: r.emisor,
            vigenteHasta: r.vigenteHasta, raiz: r.raiz,
            // Sobre qué versión del expediente se firmó, para poder
            // demostrarlo después sin depender de este servidor.
            sobreHash: guardado.sobreHash,
            hashFirmado: guardado.hashHex,
          },
        },
      },
    });

    return { doc, firmante: { rfc: r.rfc, nombre: r.nombre, numeroDeSerie: r.numeroDeSerie } };
  });
