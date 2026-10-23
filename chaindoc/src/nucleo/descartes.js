// ─────────────────────────────────────────────────────────────
// descartes.js — Las notificaciones que ya quitaste
//
// Casi todo en la campana se apaga solo: un aviso se da por leído
// cuando abres el documento, y eso ya está en la cadena. Pero hay un
// caso que no se puede deducir de ningún lado: «ya lo vi aquí mismo y
// no pienso abrirlo». Eso sólo lo sabe quien le dio a la X.
//
// Se guarda en el navegador, no en el servidor. Es lo mismo que se
// hace con las carpetas, y el motivo es que esto no es información
// del documento: no le importa a la otra parte, no tiene que quedar
// asentado, y si se perdiera no se pierde nada. Lo que sí trae es que
// es POR DISPOSITIVO: lo que quites en la computadora sigue estando
// en el teléfono hasta que lo quites ahí o abras el documento.
//
// NO SE GUARDA LA CLAVE A SECAS, SE GUARDA CON SU FECHA. Si sólo se
// guardara «ya quité comp:d1», el día que te vuelvan a compartir ese
// mismo documento la notificación nueva nacería descartada y no te
// enterarías nunca. Guardando la fecha, se descarta ese aviso y no el
// siguiente.
// ─────────────────────────────────────────────────────────────

/** Una caja por cuenta: dos personas en el mismo navegador no se mezclan. */
export const claveDescartes = (uid) => `cd_descartes:${uid || "sin-cuenta"}`;

/** Cuántos se guardan como mucho. Los más viejos se van cayendo. */
export const TOPE = 300;

export function leerDescartes(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(claveDescartes(uid)));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function guardar(uid, mapa) {
  try {
    localStorage.setItem(claveDescartes(uid), JSON.stringify(mapa));
  } catch {
    // Sin sitio o en modo privado. Se queda sin descartar y ya: esto
    // no puede romper la campana.
  }
  return mapa;
}

/**
 * Marca una notificación como quitada y devuelve el mapa nuevo.
 *
 * La fecha que se guarda es la del hecho que la originó. Si no trae
 * —hay avisos sin fecha—, se guarda la de ahora, que a efectos de
 * comparar hace el mismo papel.
 */
export function descartar(uid, noti) {
  if (!noti?.clave) return leerDescartes(uid);
  const mapa = { ...leerDescartes(uid), [noti.clave]: noti.fecha || new Date().toISOString() };
  return guardar(uid, podar(mapa));
}

/** Vuelve a enseñar una. Para deshacer sin tener que buscarla. */
export function recuperar(uid, clave) {
  const mapa = { ...leerDescartes(uid) };
  delete mapa[clave];
  return guardar(uid, mapa);
}

/** Si esta notificación ya se quitó. Una más nueva con la misma clave NO. */
export const estaDescartada = (descartes, noti) => {
  const cuando = descartes?.[noti?.clave];
  if (!cuando) return false;
  return !noti.fecha || String(noti.fecha) <= String(cuando);
};

/**
 * Deja el mapa en el tope, tirando lo más viejo.
 *
 * Hace falta porque nada lo limpia: un documento puede borrarse y su
 * descarte se quedaría ahí para siempre. Tirar por fecha es lo único
 * que se puede hacer sin saber qué documentos siguen existiendo.
 */
export function podar(mapa, tope = TOPE) {
  const filas = Object.entries(mapa || {});
  if (filas.length <= tope) return mapa || {};
  filas.sort((a, b) => String(b[1]).localeCompare(String(a[1])));
  return Object.fromEntries(filas.slice(0, tope));
}
