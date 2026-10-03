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

export const ROLES = ["propietario", "editor", "aportador", "aprobador", "lector", "auditor"];

/** Los que se pueden asignar al compartir (dueño sólo hay uno). */
export const ROLES_ASIGNABLES = ROLES.filter((r) => r !== "propietario");

export const ROL_TEXTO = {
  propietario: "Propietario",
  editor:      "Editor",
  aportador:   "Aportador",
  aprobador:   "Aprobador",
  lector:      "Lector",
  auditor:     "Auditor",
};

/** Lo que se le explica a quien comparte, en una línea. */
export const ROL_AYUDA = {
  propietario: "Control total, incluido eliminar el documento.",
  editor:      "Edita, firma, sube y pide comprobantes. Todo menos repartir accesos.",
  aportador:   "Sólo entrega los comprobantes que le pidas. No ve el resto del expediente.",
  aprobador:   "Revisa y firma; no puede editar el contenido.",
  lector:      "Sólo lee.",
  auditor:     "Lee y exporta el paquete de evidencia para revisarlo por fuera.",
};

export const PERMISOS = {
  propietario: ["ver", "editar", "subir", "retirar", "firmar", "compartir", "pedir", "aprobar", "exportar", "proteger", "vincular", "borrar"],
  editor:      ["ver", "editar", "subir", "retirar", "firmar", "pedir", "exportar", "proteger", "vincular"],
  aportador:   ["ver", "subir"],
  aprobador:   ["ver", "aprobar", "firmar", "exportar"],
  auditor:     ["ver", "exportar"],
  lector:      ["ver"],
};

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
  const rol = d.roles?.[correo];
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
    ...Object.keys(d.roles || {}),
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