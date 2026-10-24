// ─────────────────────────────────────────────────────────────
// accesos.js — Quién entra a un documento y con qué rol
//
// Compartir dejó de ser «todo o nada». Al electricista que sube su
// factura no tiene por qué verle los pagos al plomero, ni tocar las
// fases del contrato.
//
// Esta es la mitad del navegador: pinta la interfaz y llama al
// servidor. La decisión real la toma `functions/lib/permisos.js`,
// que es idéntico a esto en su tabla de permisos; aquí sólo se usa
// para no enseñar botones que después van a fallar.
// ─────────────────────────────────────────────────────────────

import { llamar } from "./backend";
import { enServidor } from "./datos";

export const ROLES = [
  "propietario", "involucrado", "lector", "auditor",
  // ← Siguen valiendo, ya no se ofrecen. Ver ROLES_OFRECIDOS.
  "editor", "aportador", "aprobador",
];

/** Los que el servidor acepta al compartir (dueño sólo hay uno). */
export const ROLES_ASIGNABLES = ROLES.filter((r) => r !== "propietario");

/**
 * Los que se le OFRECEN a quien comparte. Son tres a propósito.
 *
 * ← NUEVO (20 oct). Había seis roles, y tres existían por cómo está
 * hecho esto por dentro, no porque alguien los pidiera. Quien
 * comparte un contrato no se pregunta «¿editor o aportador?»: se
 * pregunta quién es esta persona respecto al trato. Son tres
 * respuestas:
 *
 *   - **Involucrado** — la otra parte. Firma el contrato y sube lo
 *     que le toca. No lo puede editar, y una vez aceptado no lo
 *     puede editar nadie.
 *   - **Lector** — lo ve y ya. El socio al que le enseñas en qué va.
 *   - **Auditor** — entra al expediente completo y firma como
 *     testigo, pero no tiene que aprobar el contrato antes. Es el
 *     extra para quien quiera un tercero mirando.
 *
 * Los otros tres no se borran: hay documentos que ya los usan y
 * quitarlos dejaría a esa gente sin permisos de un día para otro.
 * Simplemente dejan de ofrecerse.
 */
export const ROLES_OFRECIDOS = ["involucrado", "lector", "auditor"];

export const ROL_TEXTO = {
  propietario: "Propietario",
  involucrado: "Involucrado",
  lector:      "Lector",
  auditor:     "Auditor",
  editor:      "Editor",
  aportador:   "Aportador",
  aprobador:   "Aprobador",
};

/** Lo que se le explica a quien comparte, en una línea. */
export const ROL_AYUDA = {
  propietario: "Control total, incluido eliminar el documento.",
  involucrado: "La otra parte del trato. Lee el contrato y lo acepta o lo rechaza; después sube lo que le toque entregar. No puede cambiar el contrato.",
  lector:      "Ve el expediente y cómo va, sin tocar nada ni firmar.",
  auditor:     "Ve el expediente completo y firma como testigo, pero no tiene que aprobar el contrato.",
  editor:      "Edita, firma, sube y pide comprobantes. Todo menos repartir accesos.",
  aportador:   "Sólo entrega los comprobantes que le pidas. No ve el resto del expediente.",
  aprobador:   "Revisa y firma; no puede editar el contenido.",
};

export const PERMISOS = {
  propietario: ["ver", "editar", "subir", "retirar", "firmar", "compartir", "pedir", "aprobar", "exportar", "proteger", "vincular", "borrar"],
  // ← NUEVO (20 oct). Lleva «retirar» porque es quien sube: si se
  // equivoca de archivo tiene que poder quitarlo él, sin pedirle
  // permiso a nadie. No lleva «editar»: el contrato que aceptó no lo
  // puede cambiar, y ésa es justo la garantía que firma.
  // ← ARREGLADO (23 oct): le faltaba «vincular», y sin eso la otra
  // parte podía subir un archivo suelto pero NO adjuntar uno de sus
  // propios documentos de chaindoc. Es la misma entrega con el mejor
  // artefacto de los dos: el documento vinculado trae su propia
  // cadena, su historial y sus firmas. Dejar pasar el PDF suelto y
  // bloquear el documento era premiar la versión con menos pruebas.
  involucrado: ["ver", "subir", "retirar", "firmar", "aprobar", "vincular", "exportar"],
  editor:      ["ver", "editar", "subir", "retirar", "firmar", "pedir", "exportar", "proteger", "vincular"],
  aportador:   ["ver", "subir"],
  aprobador:   ["ver", "aprobar", "firmar", "exportar"],
  auditor:     ["ver", "exportar"],
  lector:      ["ver"],
};

/**
 * Endereza el mapa de roles.
 *
 * ← NUEVO (20 oct): los roles se guardaron mal. Se escribían con
 * `{ ["roles." + correo]: rol }`, y para Firestore un punto en el
 * nombre de un campo no es un punto: es «entra un nivel». Así que el
 * rol de `betolira@gmail.com` acababa guardado como
 * `roles: { "betolira@gmail": { com: "aprobador" } }`.
 *
 * De ahí salían el correo partido en la lista de accesos y, lo peor,
 * que al buscar el rol del correo entero no hubiera nada y se cayera
 * al apaño que trata a cualquiera de `sharedWith` como EDITOR.
 *
 * Esto junta los trozos con el punto que los separó y tira lo que
 * quedó vacío al borrar un acceso. Al leer y al escribir, así que lo
 * que ya está mal se arregla solo. Es el mismo criterio que
 * `functions/lib/permisos.js`; aquí manda el servidor, esto es para
 * que la pantalla no enseñe otra cosa.
 */
export function sanearRoles(roles){
  const salida = {};
  const bajar = (nodo, clave) => {
    if(typeof nodo === "string"){
      if(ROLES.includes(nodo)) salida[clave] = nodo;
      return;
    }
    if(!nodo || typeof nodo !== "object") return;
    for(const [trozo, dentro] of Object.entries(nodo)){
      bajar(dentro, clave ? `${clave}.${trozo}` : trozo);
    }
  };
  bajar(roles && typeof roles === "object" ? roles : {}, "");
  return salida;
}

/**
 * Rol de una persona en un documento.
 *
 * Compatibilidad: lo compartido antes de los roles no tiene mapa
 * `roles`; a quien estaba en `sharedWith` se le trata como editor,
 * que es lo que de hecho podía hacer.
 */
export function rolDe(d, uid, email){
  if(!d) return null;
  if(d.ownerUid === uid) return "propietario";
  const correo = (email || "").toLowerCase();
  if(!correo) return null;
  const rol = sanearRoles(d.roles)[correo];
  if(rol && ROLES.includes(rol)) return rol;
  return (d.sharedWith || []).includes(correo) ? "editor" : null;
}

export const puede = (rol, accion) => Boolean(rol && PERMISOS[rol]?.includes(accion));

/** Atajo para la interfaz: `puedo(d, ctx, "editar")`. */
export const puedo = (d, uid, email, accion) => puede(rolDe(d, uid, email), accion);

/** Un aportador sube sólo a los requisitos que le pidieron. */
export function puedeSubirA(d, rol, email, reqId){
  if(!puede(rol, "subir")) return false;
  if(rol !== "aportador") return true;
  const correo = (email || "").toLowerCase();
  return (d?.solicitudes || []).some(
    (s) => s.reqId === reqId && (s.paraEmail || "").toLowerCase() === correo && s.estado === "pendiente");
}

/** Lista para la pantalla de accesos: el dueño primero. */
export function listaDeAccesos(d){
  if(!d) return [];
  const dueno = { correo: (d.ownerEmail || "").toLowerCase(), rol: "propietario", nombre: d.owner || null };
  const otros = [...new Set([
    // ← ACTUALIZADO (20 oct): saneado, o los correos partidos salían
    // como personas de más. Es de donde venía la fila repetida.
    ...Object.keys(sanearRoles(d.roles)),
    ...(d.sharedWith || []),
  ])]
    .filter((c) => c && c !== dueno.correo)
    .map((correo) => ({ correo, rol: rolDe(d, null, correo) || "lector", nombre: null }))
    .sort((a, b) => a.correo.localeCompare(b.correo));
  return dueno.correo ? [dueno, ...otros] : otros;
}

// ── Llamadas al servidor ──────────────────────────────────────
// En modo local no hay servidor que decida, así que estas funciones
// avisan y quien llama se queda con el camino de siempre.

export const hayServidor = () => enServidor();

/** Dar acceso, o cambiarle el rol a quien ya lo tiene. */
export const compartir = (opId, correo, rol) =>
  llamar("compartirOperacion", { opId, correo: String(correo).toLowerCase().trim(), rol });

export const quitarAcceso = (opId, correo) =>
  llamar("quitarAcceso", { opId, correo: String(correo).toLowerCase().trim() });

export const pedirComprobante = (opId, reqId, correo, mensaje, cuenta = {}) =>
  llamar("pedirEvidencia", {
    opId, reqId, mensaje,
    correo: String(correo).toLowerCase().trim(),
    paraUid: cuenta.uid || null, paraNombre: cuenta.nombre || null,
  });