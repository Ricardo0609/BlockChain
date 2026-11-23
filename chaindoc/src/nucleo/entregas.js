// ─────────────────────────────────────────────────────────────
// entregas.js — Qué pasa cuando alguien sube algo, y quién lo acepta
//
// GEMELO de `functions/lib/entregas.js`. Los dos archivos son
// idénticos a partir del marcador de abajo, y hay una prueba que lo
// comprueba. La razón es la de siempre en este proyecto: el navegador
// pinta el estado y el servidor lo escribe, y si cada uno tuviera su
// propia copia de la regla, el día que discrepen gana el servidor y
// la pantalla lleva un rato mintiendo.
//
// ── POR QUÉ EXISTE ESTO (23 nov) ─────────────────────────────
//
// Hasta hoy, subir un archivo a un requisito lo daba por CUMPLIDO en
// el acto. Nadie miraba nada. Lo pidió Ricardo:
//
//   «Que se aprueben las cosas importantes o decisivas para cada
//    fase, si es por fases.»
//
// Y al preguntarle quién decide cuáles son importantes, eligió que
// lo marque él al pedirlas: un interruptor en cada requisito. Lo que
// no se marque sigue como hasta hoy.
//
// Se descartaron las otras dos opciones, y conviene dejar escrito
// por qué: que fuera siempre el último requisito de cada fase ADIVINA
// cuál importa, y que fuera todo convierte al dueño en cuello de
// botella de cada factura.
//
// ── Y POR QUÉ UN ESTADO NUEVO Y NO UNA MARCA ─────────────────
//
// La tentación era dejar `cumplido` y colgarle un `aprobado: false`.
// Está mal: media aplicación pregunta `estado !== "cumplido"` para
// saber qué falta, y con esa marca un requisito entregado-y-sin-
// revisar contaría como terminado en todas esas cuentas. El estado
// es lo que todo el mundo ya mira, así que la verdad tiene que
// estar ahí.
// ─────────────────────────────────────────────────────────────

/** Los tres estados por los que pasa un requisito de evidencia.
 *
 * `por-revisar` es el nuevo, y sólo existe para los requisitos que su
 * dueño marcó. Un requisito normal salta de `pendiente` a `cumplido`
 * en cuanto llega el archivo, como siempre.
 */
export const ESTADOS_REQ = ["pendiente", "por-revisar", "cumplido"];

/** ¿Este requisito espera el visto bueno de su dueño? */
export const pideVisto = (r) => r?.requiereVisto === true;

/** ¿Está esperando a que alguien lo mire? */
export const esperaVisto = (r) => r?.estado === "por-revisar";

/** ¿Terminado del todo? Entregado Y, si hacía falta, aprobado. */
export const estaCumplido = (r) => r?.estado === "cumplido";

/**
 * ¿Le falta a la otra parte entregar algo aquí?
 *
 * Es distinto de «no está cumplido», y la diferencia importa: un
 * requisito entregado y esperando visto bueno NO está cumplido, pero
 * tampoco le falta nada a quien lo subió. Pedírselo otra vez sería
 * pedirle algo que ya hizo.
 */
export const faltaEntregar = (r) => !estaCumplido(r) && !esperaVisto(r);

/** Lo que el dueño tiene encima de la mesa ahora mismo. */
export const porRevisar = (requisitos = []) => requisitos.filter(esperaVisto);

/** Los archivos vivos: los que no han sido rechazados. */
export const vivos = (archivos = []) => archivos.filter((a) => !a?.rechazo);

/**
 * El estado que le toca a un requisito, mirando lo que tiene dentro.
 *
 * Una sola función para los tres momentos —llega un archivo, se
 * aprueba, se rechaza— porque son el mismo cálculo y separarlos es
 * como acaban discrepando.
 */
export function estadoDe(requisito, archivos) {
  const lista = vivos(archivos ?? requisito?.archivos ?? []);
  if (!lista.length) return "pendiente";
  if (!pideVisto(requisito)) return "cumplido";
  // Con visto bueno pedido: basta con que UNO esté aprobado. Quien
  // sube dos versiones de la misma factura no tiene que conseguir que
  // le aprueben las dos.
  return lista.some((a) => a?.visto) ? "cumplido" : "por-revisar";
}

/**
 * Marca un archivo como aprobado o rechazado y recalcula el estado.
 *
 * Devuelve `null` si no encuentra el archivo, para que quien llame
 * pueda decirlo en vez de guardar un cambio que no cambió nada.
 *
 * El `archivo` que devuelve es el de ANTES de revisarlo: sirve para
 * el nombre y para saber a quién avisar, que es lo que hace falta
 * fuera. El ya revisado está en `requisito.archivos`.
 */
export function revisarArchivo(requisitos = [], reqId, aid, veredicto) {
  const { ok, motivo = null, por = null, porUid = null, fecha } = veredicto || {};
  let archivo = null;
  let requisito = null;

  const out = requisitos.map((r) => {
    if (r.id !== reqId) return r;
    const lista = r.archivos || [];
    if (!lista.some((a) => (a?.aid || a?.path) === aid)) return r;

    const nuevos = lista.map((a) => {
      if ((a?.aid || a?.path) !== aid) return a;
      archivo = a;
      // Aprobar BORRA el rechazo anterior y rechazar borra el visto:
      // un archivo no puede estar aprobado y rechazado a la vez, y
      // dejar el campo viejo ahí es cómo se llega a esa foto.
      const limpio = { ...a };
      delete limpio.visto;
      delete limpio.rechazo;
      return ok
        ? { ...limpio, visto: { fecha, por, porUid } }
        : { ...limpio, rechazo: { fecha, por, porUid, motivo: motivo || null } };
    });

    requisito = { ...r, archivos: nuevos, estado: estadoDe(r, nuevos) };
    return requisito;
  });

  return archivo ? { requisitos: out, archivo, requisito } : null;
}
