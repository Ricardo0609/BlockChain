// ─────────────────────────────────────────────────────────────
// fases.js — El orden de las fases de un contrato
//
// Un contrato por fases casi siempre las tiene en orden: no se entrega
// el acabado antes que la obra negra, y un comprobante de la fase 3
// subido cuando la 1 sigue vacía no prueba un avance, prueba un
// desorden. Hasta hoy se podía subir a cualquiera.
//
// Pero NO todos los contratos son así. Hay contratos con entregas
// paralelas, donde las fases son compartimentos y da igual cuál se
// cierre primero. Por eso el orden no se da por supuesto: sale de lo
// que diga el contrato, y si la lectura se equivoca, el dueño lo
// corrige con un interruptor y queda asentado quién lo cambió.
//
// Esto es orden de trabajo, no permiso: vive en el navegador. Nadie se
// hace daño saltándoselo, y lo que se entregue antes de tiempo queda
// en la cadena igual que todo lo demás.
// ─────────────────────────────────────────────────────────────

/**
 * Si las fases de este contrato van en orden.
 *
 * Por defecto sí. Un contrato que no lo diga se trata como
 * secuencial, que es lo que es casi siempre; para que no lo sea hay
 * que decirlo, y así los contratos de antes de esta regla no cambian
 * de significado por un campo que no traían.
 */
export const vanEnOrden = (exp) => exp?.fasesEnOrden !== false;

/**
 * La fase que hay que cerrar antes de poder entregar en `faseId`.
 *
 * Devuelve la PRIMERA incompleta anterior, no la última: es la que
 * toca hacer ahora, y nombrar cualquier otra mandaría a la persona al
 * sitio equivocado. Null si no hay nada que la detenga.
 *
 * `fases` es lo que devuelve `estadoFases(exp)`, ya calculado: este
 * módulo no sabe de requisitos ni de archivos, sólo de orden.
 */
export function faseQueFalta(exp, fases, faseId) {
  if (!faseId || !vanEnOrden(exp)) return null;
  const i = (fases || []).findIndex((f) => f.id === faseId);
  if (i <= 0) return null;                       // la primera nunca espera
  // Una fase sin comprobantes asignados no puede completarse nunca, así
  // que no detiene a las de atrás: si no, el contrato entero se
  // atasca en una fase que nadie puede cerrar.
  return fases.slice(0, i).find((f) => !f.completa && !f.sinRequisitos) || null;
}

/** Si se puede entregar en esta fase ahora mismo. */
export const sePuedeEntregarEn = (exp, fases, faseId) =>
  faseQueFalta(exp, fases, faseId) === null;

/** Lo mismo, para un requisito. Uno sin fase no espera a nadie. */
export const sePuedeEntregarEnReq = (exp, fases, req) =>
  sePuedeEntregarEn(exp, fases, req?.fase || null);

/**
 * Una línea para el aviso de la pantalla.
 *
 * Corta a propósito: sale en CADA comprobante bloqueado, y repetir un
 * párrafo seis veces no informa, estorba. El porqué entero va en el
 * título del botón, para quien lo busque.
 */
export function porQueEsperar(exp, fases, faseId) {
  const falta = faseQueFalta(exp, fases, faseId);
  if (!falta) return null;
  const quedan = falta.total - falta.hechos;
  return `Espera a la fase ${falta.n} («${falta.titulo}»): le `
    + `${quedan === 1 ? "falta 1 comprobante" : `faltan ${quedan} de ${falta.total} comprobantes`}.`;
}

/** El porqué entero, para el título del botón apagado. */
export function porQueEsperarLargo(exp, fases, faseId) {
  const corto = porQueEsperar(exp, fases, faseId);
  return corto && `Este contrato entrega sus fases en orden, así que aquí `
    + `todavía no se puede adjuntar. ${corto}`;
}
