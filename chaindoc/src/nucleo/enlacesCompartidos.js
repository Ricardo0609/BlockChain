// ─────────────────────────────────────────────────────────────
// enlacesCompartidos.js — Los enlaces de entrega, leídos de la cadena
//
// Un enlace de entrega reparte acceso a alguien que NO tiene cuenta:
// el proveedor al que se le piden sus facturas. Hasta ahora eso no
// salía en la pestaña de «Con acceso», que es justo donde alguien va a
// mirar quién puede entrar aquí. Un enlace vivo es acceso concedido,
// aunque del otro lado no haya una cuenta.
//
// Se saca de la CADENA y no del servidor a propósito. Son dos razones:
//
//   1. Crear un enlace ya asienta un bloque, y retirarlo también. La
//      cadena es el registro que no se puede reescribir — es
//      exactamente donde debe vivir la trazabilidad de quién repartió
//      acceso y cuándo.
//   2. Se lee sin pedirle nada a nadie: funciona con el documento que
//      ya está en pantalla.
//
// Lo que NO se puede saber desde aquí es cuántas entregas lleva el
// enlace, porque eso vive en el registro del servidor. Para eso está
// la lista de dentro del modal de compartir.
// ─────────────────────────────────────────────────────────────

/** Un bloque de los que hablan de enlaces de entrega. */
const esDeEnlace = (b) => b?.action === "SOLICITUD";

/**
 * Los enlaces de entrega de este documento, del más nuevo al más viejo.
 *
 * `estado` es «vigente», «vencido» o «retirado». Los tres se enseñan:
 * un enlace que ya no sirve sigue siendo parte de la historia de quién
 * repartió acceso, y esconderlo sería perder justo lo que se quería
 * registrar. Quien mira la lista necesita distinguirlos, no ignorarlos.
 */
export function enlacesCompartidos(chain, { hoy = new Date() } = {}) {
  const porClave = new Map();
  const retirados = new Set();

  for (const b of chain || []) {
    if (!esDeEnlace(b)) continue;
    const t = b.meta?.tipo;

    if (t === "invitacion-baja") {
      if (b.meta?.huella) retirados.add(b.meta.huella);
      continue;
    }
    if (t !== "invitacion") continue;

    // Los bloques viejos pueden no traer huella. Se les da una clave
    // propia para que no se pisen entre ellos; a cambio, una baja no
    // puede emparejarse con ellos y se quedan como estaban.
    const clave = b.meta?.huella || `bloque:${b.index}`;
    porClave.set(clave, {
      clave,
      huella: b.meta?.huella || null,
      creadoPor: b.author || null,
      creadoPorUid: b.autorUid || null,
      creadoEn: b.timestamp || null,
      correo: b.meta?.correo || null,
      expiraEn: b.meta?.expiraEn || null,
      requisitos: Array.isArray(b.meta?.requisitos) ? b.meta.requisitos.length : null,
    });
  }

  const ahora = hoy instanceof Date ? hoy.getTime() : new Date(hoy).getTime();

  return [...porClave.values()]
    .map((x) => {
      const vence = x.expiraEn ? Date.parse(x.expiraEn) : NaN;
      const vencido = Number.isFinite(vence) && vence < ahora;
      return {
        ...x,
        estado: (x.huella && retirados.has(x.huella)) ? "retirado"
              : vencido ? "vencido" : "vigente",
      };
    })
    .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));
}

/** Los que ahora mismo dan acceso. Es lo que cuenta la pestaña. */
export const enlacesVivos = (chain, opts) =>
  enlacesCompartidos(chain, opts).filter((x) => x.estado === "vigente");

/** Cómo se lee cada estado en pantalla. */
export const ESTADO_ENLACE = {
  vigente: "Compartió un enlace",
  vencido: "Compartió un enlace · vencido",
  retirado: "Compartió un enlace · retirado",
};
