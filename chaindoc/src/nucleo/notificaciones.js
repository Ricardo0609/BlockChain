// ─────────────────────────────────────────────────────────────
// notificaciones.js — Lo que OTRA GENTE hizo contigo
//
// La campana y la barra de «Requiere atención» no son lo mismo, y es
// la línea que decide qué va en cada una:
//
//   - La BARRA mira tu propio trabajo: qué se está venciendo, qué
//     lleva días quieto, qué factura canceló el SAT. Es un atajo a lo
//     importante, y por eso vive en la página, a la vista.
//   - La CAMPANA mira lo que hizo alguien más: te compartieron algo,
//     te mandaron un contrato a firmar, te pidieron un comprobante,
//     aceptaron o rechazaron lo tuyo. Son cosas que pasaron mientras
//     no mirabas, y por eso están guardadas detrás de un icono.
//
// NO SE GUARDA NADA. Las notificaciones se derivan de los documentos
// que ya están cargados, igual que el estado de un acuerdo. Una tabla
// de «leídos» habría que escribirla, limpiarla, y se desincroniza
// entre el teléfono y la computadora; esto no, porque no existe.
//
// Lo «leído» sale de dos sitios distintos según el tipo:
//
//   - un AVISO se da por leído cuando abriste el documento, y eso ya
//     está escrito en la cadena: cada vez que entras a un documento
//     compartido queda un bloque CONSULTA con tu uid;
//   - un PENDIENTE no se apaga por mirarlo, sino por hacerlo. Abrir
//     el contrato y salir sin decidir no es haberlo firmado, y la
//     notificación tiene que seguir ahí.
// ─────────────────────────────────────────────────────────────

import { decideAhora, esDestinatario, estadoAcuerdo, firmaDe } from "./acuerdo";
import { rolDe } from "./accesos";
import { estaDescartada } from "./descartes";

/**
 * Cuándo fue la última vez que esta persona abrió este documento.
 *
 * Sale de la cadena, no de un campo aparte: el bloque CONSULTA ya se
 * escribe desde que existen los documentos compartidos, y dice quién
 * entró y cuándo. `null` si nunca entró.
 */
export function ultimaConsulta(d, uid) {
  let ultima = null;
  for (const b of d?.chain || []) {
    if (b.action !== "CONSULTA" || b.meta?.uid !== uid) continue;
    if (!ultima || String(b.timestamp) > ultima) ultima = String(b.timestamp);
  }
  return ultima;
}

/** Si algo que pasó en `fecha` es posterior a la última vez que miraste. */
const sinVer = (d, uid, fecha) => {
  const vista = ultimaConsulta(d, uid);
  return !vista || (fecha ? String(fecha) > vista : true);
};

/** El bloque que te dio acceso a ti, para saber quién y cuándo. */
function quienTeCompartio(d, email) {
  const mio = String(email || "").toLowerCase();
  let encontrado = null;
  for (const b of d?.chain || []) {
    if (b.action !== "COMPARTIDO") continue;
    if (String(b.meta?.correo || "").toLowerCase() !== mio) continue;
    // Las bajas se saltan, no borran lo encontrado. Quien decide si
    // tienes acceso es `rolDe`, no esto; esto sólo busca QUIÉN te lo
    // dio y CUÁNDO, y una baja no contesta ninguna de las dos. Si la
    // última fuera una baja y se dejara como respuesta, la
    // notificación se quedaría sin fecha y no se apagaría nunca.
    if (b.meta?.tipo === "baja" || b.meta?.tipo === "revocado") continue;
    encontrado = b;
  }
  return encontrado;
}

const corto = (t, n = 48) =>
  String(t || "Sin título").length > n ? String(t).slice(0, n - 1) + "…" : String(t || "Sin título");

/**
 * Las notificaciones de una persona, derivadas de sus documentos.
 *
 * Devuelve lo más reciente primero. Cada una trae `docId` porque la
 * campana no es un museo: se entra desde ahí.
 */
export function notificacionesDe(docs, { uid, email, descartes } = {}) {
  const mio = String(email || "").toLowerCase();
  if (!uid && !mio) return [];
  const fuera = [];

  for (const d of docs || []) {
    if (!d?.id) continue;
    const soyDueno = d.ownerUid === uid;
    const titulo = corto(d.title);
    const mete = (n) => fuera.push({ ...n, docId: d.id, titulo });

    // ── PENDIENTES: no se apagan por mirarlos ──────────────────
    //
    // Abrir el contrato y salir sin decidir no es haberlo firmado.

    if (decideAhora(d, mio) === "pendiente") {
      mete({
        clave: `firmar:${d.id}`, tipo: "para-firmar", pendiente: true, grave: true,
        fecha: d.acuerdo?.pedidoEn || null,
        texto: `${d.owner || "Alguien"} te mandó «${titulo}» para que lo aceptes o lo rechaces.`,
      });
    }

    for (const s of d.solicitudes || []) {
      if (s.estado !== "pendiente") continue;
      if (String(s.paraEmail || "").toLowerCase() !== mio) continue;
      const req = (d.requisitos || []).find((r) => r.id === s.reqId);
      mete({
        clave: `pide:${d.id}:${s.sid || s.reqId}`, tipo: "comprobante", pendiente: true,
        fecha: s.pedidaEn || s.creadaEn || null,
        texto: `Te pidieron «${corto(req?.titulo || "un comprobante", 36)}» en «${titulo}».`,
      });
    }

    // ── AVISOS: se apagan cuando abriste el documento ──────────

    if (!soyDueno && rolDe(d, uid, mio) && !esDestinatario(d, mio)) {
      const b = quienTeCompartio(d, mio);
      if (sinVer(d, uid, b?.timestamp)) {
        mete({
          clave: `comp:${d.id}`, tipo: "compartido", fecha: b?.timestamp || null,
          texto: `${b?.author || d.owner || "Alguien"} te compartió «${titulo}».`,
        });
      }
    }

    // Lo que le pasó a TU contrato. Sólo al dueño: al que lo rechazó
    // no hay que recordarle que lo rechazó.
    if (soyDueno && d.acuerdo?.pedidoEn) {
      const { estado } = estadoAcuerdo(d);

      if (estado === "rechazado" && sinVer(d, uid, d.acuerdo.rechazo?.fecha)) {
        const r = d.acuerdo.rechazo || {};
        mete({
          clave: `rech:${d.id}`, tipo: "rechazado", grave: true, fecha: r.fecha || null,
          texto: `${r.porNombre || "La otra parte"} no aceptó «${titulo}»${r.motivo ? `: ${r.motivo}.` : "."}`,
        });
      }

      const acepto = firmaDe(d, "receptor", "aceptacion");
      if (acepto && estado !== "rechazado" && sinVer(d, uid, acepto.fecha)) {
        mete({
          clave: `acep:${d.id}`, tipo: "aceptado", fecha: acepto.fecha || null,
          texto: `${acepto.nombre || "La otra parte"} aceptó «${titulo}».`,
        });
      }
    }
  }

  // Lo más reciente arriba; lo que no trae fecha, al final.
  return fuera
    // ← NUEVO (23 oct): lo que quitaste con la X. Se filtra al final y
    // no antes para que el filtro no tenga que repetirse en cada
    // rama. Ver `nucleo/descartes.js`: compara por fecha, así que un
    // hecho NUEVO con la misma clave vuelve a aparecer.
    .filter((n) => !estaDescartada(descartes, n))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
}

/** Cuántas hay. Es el número del globito. */
export const cuantas = (lista) => (lista || []).length;

/** Cuántas piden algo de ti. Son las que pintan el globito de rojo. */
export const cuantasPendientes = (lista) => (lista || []).filter((n) => n.pendiente).length;

/** El icono de cada tipo. Todos están en el subconjunto del index.html. */
export const ICONO = {
  "para-firmar": "draw",
  comprobante: "upload_file",
  compartido: "group_add",
  rechazado: "block",
  aceptado: "task_alt",
};
