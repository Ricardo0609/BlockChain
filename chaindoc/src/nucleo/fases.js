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

// ── DÓNDE VA EL BOTÓN DE «PEDIR UNO MÁS» (17 nov) ─────────────
//
// Ricardo lo pidió así: «un botón abajo del último requisito de
// evidencia en cada fase, o si sólo es una pues sólo ahí».
//
// Suena trivial y no lo es, por cómo está hecha la pantalla: la lista
// de requisitos es PLANA y se filtra por fase, no se agrupa. Así que
// «el último de su fase» no es el último de la lista, ni los de una
// fase tienen por qué estar juntos: el contrato puede traerlos
// mezclados, y la IA que los extrae no promete ningún orden.
//
// Vive aquí y no dentro de la pantalla para poder probarlo. Metido en
// el JSX sólo se puede comprobar leyendo el código, y lo que puede
// fallar —que salga dos veces, en la fila equivocada, o en ninguna—
// no se ve leyendo: se ve contando.

/** La clave del grupo de los requisitos que no tienen fase. */
export const SIN_FASE = "\u0000sin-fase";

/**
 * El índice del último requisito VISIBLE de cada fase.
 *
 * Devuelve `{ [faseId]: índice }` con índices sobre la lista
 * completa, que es como los numera la pantalla. `faseSel` es la fase
 * que está filtrando, o null si se ven todas.
 *
 * Un expediente sin fases cae entero en SIN_FASE, así que sale una
 * sola entrada y el botón aparece una vez, al final. Es el «si sólo
 * es una» de Ricardo, y sale solo: no hace falta un caso aparte.
 */
export function ultimosDeCadaFase(requisitos, faseSel = null) {
  const fuera = {};
  (requisitos || []).forEach((r, i) => {
    if (faseSel && r.fase !== faseSel) return;
    fuera[grupoDe(r)] = i;
  });
  return fuera;
}

/**
 * En qué grupo cae un requisito.
 *
 * `r.fase ?? SIN_FASE` no bastaba: `??` deja pasar la cadena VACÍA,
 * así que un requisito con `fase: ""` formaba un grupo suyo y se
 * llevaba su propio botón. El resto del código ya trata esa cadena
 * como «sin fase» —la pantalla manda `r.fase||null`—, y dos sitios
 * que opinan distinto sobre lo mismo acaban siempre mal.
 */
const grupoDe = (r) => r?.fase || SIN_FASE;

/** Si la fila `i` es la última de su fase, y por tanto lleva el botón. */
export const cierraLaFase = (ultimos, r, i) => ultimos[grupoDe(r)] === i;

/**
 * Qué número lleva cada requisito en pantalla.
 *
 * ← NUEVO (17 nov). Devuelve `{ [reqId]: n }` empezando en 1 y sin
 * huecos, contando sólo los que se ven.
 *
 * Antes el número era el ÍNDICE en la lista completa, `i+1`, y eso
 * daba dos resultados raros que pidió arreglar Ricardo: «si el de
 * arriba es la evidencia número 2 este nuevo será el 3», «al igual si
 * se quita una evidencia, cambiar los números para que coincidan».
 *
 *   · Filtrando por una fase salían los números de la lista entera:
 *     la segunda fase empezaba en 4, o en 7, según cuántos hubiera
 *     antes. En pantalla se leía «4, 5» sin ningún 1, 2, 3 a la
 *     vista.
 *   · Y al quitar uno de en medio, los de abajo no se movían hasta
 *     recargar, porque el índice es del array y el array se queda
 *     como estaba en memoria.
 *
 * Contar lo que se VE arregla los dos a la vez, y el segundo sin
 * hacer nada: quitar un elemento del array cambia las posiciones de
 * los de abajo, así que la numeración se corrige sola.
 *
 * Un requisito ya cumplido enseña una palomita en vez de su número,
 * pero SIGUE CONTANDO: si no, la lista pasaría de «✓» a «1» al
 * cumplirse el primero y los números bailarían cada vez que alguien
 * entrega algo.
 */
export function numeroDeCada(requisitos, faseSel = null) {
  const fuera = {};
  let n = 0;
  (requisitos || []).forEach((r) => {
    if (faseSel && r.fase !== faseSel) return;
    if (!r?.id) return;
    fuera[r.id] = ++n;
  });
  return fuera;
}
