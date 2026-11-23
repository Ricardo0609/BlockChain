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

    // ── TE PIDIERON ALGO QUE NO ESTABA EN LO QUE FIRMASTE ──────
    //
    // ← NUEVO (17 nov). Pedido por Ricardo: «si el contrato ya se
    // compartió y se firmó, le va a llegar una notificación a la otra
    // u otras personas que ya firmaron de que tal persona añadió un
    // campo extra para evidencia en tal fase».
    //
    // ES LA MITAD QUE HACE ACEPTABLE LA OTRA. Añadir un requisito a un
    // contrato firmado es lo único que cambia lo acordado después de
    // acordarlo; si además pasara en silencio, el que firmó podría
    // quedar incumpliendo algo que nunca supo que se le pedía. El
    // aviso no es cortesía: es lo que convierte un cambio unilateral
    // en una petición.
    //
    // Se deriva del bloque, como todo lo demás aquí, así que no hay
    // nada que guardar ni que limpiar. Y se apaga al abrir el
    // documento —es un AVISO, no un PENDIENTE—: entrar y ver el
    // requisito nuevo es exactamente lo que se pedía que hiciera.
    const firmantes = d.acuerdo?.firmas || [];
    const yoFirme = firmantes.some(
      (f) => (f.uid && f.uid === uid) || String(f.email || "").toLowerCase() === mio);
    if (!soyDueno && yoFirme) {
      for (const b of d.chain || []) {
        if (b.action !== "SOLICITUD") continue;
        const quita = b.meta?.tipo === "requisito-quitado";
        if (b.meta?.tipo !== "requisito-extra" && !quita) continue;
        if (!sinVer(d, uid, b.timestamp)) continue;
        const donde = b.meta.faseNombre ? ` en la fase «${corto(b.meta.faseNombre, 28)}»` : "";
        const quien = b.author || d.owner || "Alguien";
        const cual = `«${corto(b.meta.titulo || "sin título", 34)}»`;
        mete({
          // La clave lleva el tipo: si no, quitar un requisito que se
          // habia añadido antes reusaria la clave del aviso de
          // haberlo añadido, y descartar uno apagaria el otro.
          clave: `${quita ? "reqm" : "reqx"}:${d.id}:${b.meta.reqId}`,
          tipo: quita ? "requisito-quitado" : "requisito-extra",
          fecha: b.timestamp || null,
          texto: quita
            // ← NUEVO (17 nov). Se avisa también al quitar, y no por
            // simetría: quien firmó pudo estar preparando justo eso, o
            // tenerlo a medias. Enterarse al ir a subirlo y no
            // encontrar dónde es peor que un aviso de más.
            ? `${quien} ya no pide ${cual}${donde} de «${titulo}».`
            : `${quien} añadió un comprobante${donde} de «${titulo}»: ${cual}.`,
        });
      }
    }

    // ── TE RECHAZARON LO QUE SUBISTE ──────────────────────────
    //
    // ← NUEVO (23 nov). Pedido por Ricardo: «si el dueño rechaza
    // algo, le aparece una notificación a quien lo adjuntó de que su
    // archivo adjunto fue rechazado y los motivos, si el dueño puso
    // un motivo».
    //
    // ES UN PENDIENTE, NO UN AVISO, y la diferencia es la regla de
    // arriba de este archivo: un aviso se apaga al abrir el
    // documento, y abrir el documento no arregla que te hayan
    // rechazado una factura. Lo que lo arregla es volver a subir
    // algo, y eso es justo lo que lo apaga: en cuanto el requisito
    // deja de estar «pendiente», esto desaparece solo.
    //
    // Y el motivo va DENTRO del texto. Un «te rechazaron algo» que
    // obliga a entrar a buscar por qué es media notificación.
    for (const b of d.chain || []) {
      if (b.action !== "EVIDENCIA" || b.meta?.tipo !== "rechazo") continue;
      if (!b.meta.subidoPorUid || b.meta.subidoPorUid !== uid) continue;
      const r = (d.requisitos || []).find((x) => x.id === b.meta.requisito);
      // Ya entregó otra cosa: el problema está resuelto y recordarlo
      // sería hacerle perder el tiempo a quien ya lo arregló.
      if (r && r.estado !== "pendiente") continue;
      mete({
        clave: `rechazo:${d.id}:${b.meta.aid}`, tipo: "entrega-rechazada",
        pendiente: true, grave: true, fecha: b.timestamp || null,
        texto: `${b.author || d.owner || "El dueño"} no aceptó «${corto(b.meta.archivo || "lo que subiste", 30)}»`
          + ` en «${corto(b.meta.reqTitulo || "un comprobante", 26)}» de «${titulo}»`
          + `${b.meta.motivo ? `: ${b.meta.motivo}` : "."}`,
      });
    }

    // ── ALGUIEN ADJUNTÓ ALGO A LO TUYO ────────────────────────
    //
    // ← NUEVO (23 nov). Pedido por Ricardo: «cada vez que adjunten
    // algo, al dueño le aparece una notificación de que se adjuntó
    // algo de tal persona, porque es importante que quede el
    // registro de cuándo alguien adjuntó algo».
    //
    // El registro ya existía —el bloque está en la cadena desde
    // siempre—; lo que faltaba era que se enterara sin ir a mirar.
    //
    // ES UN AVISO: se apaga al abrir el documento, porque entrar y
    // ver lo que subieron es exactamente lo que se pedía que
    // hiciera. Salvo que espere su visto bueno, y entonces lo dice:
    // ahí sí hay algo que hacer, y quien lo hace es él.
    if (soyDueno) {
      for (const b of d.chain || []) {
        if (b.action !== "EVIDENCIA" || b.meta?.tipo !== "alta") continue;
        // Lo que subió él mismo no es noticia para él.
        if (b.meta?.uid === uid) continue;
        if (!sinVer(d, uid, b.timestamp)) continue;
        const r = (d.requisitos || []).find((x) => x.id === b.meta.requisito);
        const espera = r?.estado === "por-revisar";
        mete({
          clave: `adj:${d.id}:${b.meta.requisito}:${b.timestamp}`,
          tipo: espera ? "por-revisar" : "entrega-nueva",
          // Si espera su visto bueno hay algo que hacer, así que no
          // se apaga por mirarlo: se apaga al revisarlo.
          pendiente: espera, fecha: b.timestamp || null,
          texto: `${b.author || "Alguien"} adjuntó «${corto(b.meta.archivo || "un archivo", 30)}»`
            + ` en «${corto(r?.titulo || b.meta.requisito, 26)}» de «${titulo}»`
            + `${espera ? ". Espera tu visto bueno." : "."}`,
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
  // `add_circle` y no `playlist_add`: el segundo diría mejor lo que
  // pasó, pero no está en el subconjunto del index.html y un icono
  // que falta no se dibuja, se escribe su nombre en crudo. Ver
  // `pruebas/iconos.test.js`, que ya cazó eso tres veces.
  "requisito-extra": "add_circle",
  // `remove`/`do_not_disturb_on` dirian mejor «ya no se pide», pero no
  // estan en el subconjunto del index.html. `close` si, y en una lista
  // de avisos al lado de un texto que empieza por «ya no pide» se
  // entiende. Ver `pruebas/iconos.test.js`.
  "requisito-quitado": "close",
  // ← NUEVOS (23 nov). `attach_file` y `rule` están los dos en el
  // subconjunto del index.html; lo comprobé antes de escribirlos,
  // porque un icono que falta no se dibuja: se escribe su nombre en
  // crudo en medio de la lista. Ver `pruebas/iconos.test.js`.
  "entrega-nueva": "attach_file",
  "por-revisar": "rule",
  // El mismo que el contrato rechazado, y a propósito: para quien lo
  // recibe es la misma noticia —dijeron que no a algo tuyo— y dos
  // iconos distintos para eso serían dos cosas que aprender.
  "entrega-rechazada": "block",
};
