// ─────────────────────────────────────────────────────────────
// descartes.js — Las notificaciones que ya quitaste
//
// Casi todo en la campana se apaga solo: un aviso se da por leído
// cuando abres el documento, y eso ya está en la cadena. Pero hay un
// caso que no se puede deducir de ningún lado: «ya lo vi aquí mismo y
// no pienso abrirlo». Eso sólo lo sabe quien le dio a la X.
//
// ← CAMBIADO (6 nov): AHORA VA EN LA CUENTA, NO EN EL NAVEGADOR.
//
// Vivía en `localStorage`, con el argumento de que no es información
// del documento y de que si se perdiera no se pierde nada. Lo segundo
// es verdad; lo primero no era el problema. El problema es que era
// POR DISPOSITIVO: quitabas un aviso en la computadora y seguía ahí
// en el teléfono, así que la campana te perseguía con lo mismo hasta
// que lo quitabas en cada sitio. Y la campana es justo lo que no
// puede mentir sobre si ya te enteraste de algo.
//
// Ahora se guarda en `users/{uid}`, que es de la cuenta y lo escribe
// el propio navegador —no hace falta servidor nuevo ni cambiar las
// reglas—. Sigue sin ser información del documento: la otra parte no
// lo ve y no queda asentado en ninguna cadena.
//
// El navegador sigue usándose como respaldo para no perder lo que ya
// había, y para que quitar un aviso se vea al instante sin esperar a
// que la red conteste.
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

/** Lo que hay en este navegador. Respaldo, ya no la verdad. */
export function leerLocales(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(claveDescartes(uid)));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function guardarLocales(uid, mapa) {
  try {
    localStorage.setItem(claveDescartes(uid), JSON.stringify(mapa));
  } catch {
    // Sin sitio o en modo privado. No pasa nada: el bueno es el de la
    // cuenta, esto sólo evita el parpadeo mientras llega.
  }
  return mapa;
}

/**
 * Lo quitado en el navegador y lo quitado en la cuenta, juntos.
 *
 * Gana la fecha MÁS NUEVA de cada clave, no el perfil ni el navegador:
 * si te lo volvieron a compartir y lo quitaste en el teléfono, esa es
 * la respuesta más reciente y es la que vale. Esto es también lo que
 * sube lo que ya tenías guardado aquí la primera vez que entras: no
 * hay un paso de migración, se funden y ya.
 */
export function fundir(local, remoto) {
  const salida = { ...(remoto || {}) };
  for (const [k, v] of Object.entries(local || {})) {
    if (!salida[k] || String(v) > String(salida[k])) salida[k] = v;
  }
  return podar(salida);
}

/**
 * Marca una notificación como quitada y devuelve el mapa nuevo.
 *
 * La fecha que se guarda es la del hecho que la originó. Si no trae
 * —hay avisos sin fecha—, se guarda la de ahora, que a efectos de
 * comparar hace el mismo papel.
 *
 * Sólo calcula: no escribe en ningún sitio. Quien llama decide qué
 * hacer con el resultado, que es lo que permite guardarlo en dos
 * sitios a la vez sin que este módulo sepa de redes.
 */
export function descartar(mapa, noti) {
  if (!noti?.clave) return { ...(mapa || {}) };
  return podar({ ...(mapa || {}), [noti.clave]: noti.fecha || new Date().toISOString() });
}

/** Vuelve a enseñar una. Para deshacer sin tener que buscarla. */
export function recuperar(mapa, clave) {
  const salida = { ...(mapa || {}) };
  delete salida[clave];
  return salida;
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
