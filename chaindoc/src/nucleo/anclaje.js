// ─────────────────────────────────────────────────────────────
// anclaje.js — El lado del navegador del sellado en Bitcoin
//
// Aquí no se calcula nada: el árbol, la prueba y la consulta a los
// calendarios viven en el servidor, por la misma razón que los
// bloques. Un anclaje calculado por el navegador no probaría nada,
// porque el navegador lo controla quien lo abre.
//
// Esto sólo pide el estado, lo traduce a palabras que alguien entienda
// sin saber qué es Bitcoin, y arma el enlace para ir a comprobarlo por
// fuera.
// ─────────────────────────────────────────────────────────────

import { llamar } from "./backend";

/** Estado de anclaje de toda la cadena de una operación. */
export const anclajesDe = (opId, conPrueba = true) =>
  llamar("anclajesDe", { opId, conPrueba });

/** Fuerza el anclaje y la confirmación, sin esperar al horario. */
export const anclarAhora = () => llamar("anclarAhora", {});

/**
 * Un explorador público donde cualquiera ve el bloque de Bitcoin.
 * Se usa uno conocido a propósito: el punto es que lo compruebe en un
 * sitio que no es nuestro.
 */
export const enlaceDeBloque = (altura) =>
  `https://mempool.space/block/${altura}`;

/**
 * Cómo se cuenta en pantalla. Son tres estados y ninguno es un error:
 * un bloque recién creado todavía no está anclado, y eso es normal.
 */
export function textoDeAnclaje(a){
  if(!a) return null;
  if(a.estado === "confirmado") return {
    tono: "ok",
    corto: `Anclado en Bitcoin · bloque ${a.altura}`,
    largo: "La fecha de este bloque está publicada en la cadena de Bitcoin. "
         + "Ya no depende de chaindoc: cualquiera puede comprobarla por su cuenta, "
         + "y nadie —nosotros incluidos— puede cambiarla.",
  };
  if(a.estado === "pendiente") return {
    tono: "espera",
    corto: "En camino a Bitcoin",
    largo: "Los calendarios de OpenTimestamps ya se comprometieron a incluirlo. "
         + "Entra a Bitcoin cuando se mine el siguiente bloque que lo contenga, "
         + "normalmente dentro de unas horas. La prueba ya existe; le falta la confirmación.",
  };
  return {
    tono: "espera",
    corto: "Todavía sin anclar",
    largo: "El anclaje corre una vez al día, de madrugada. Este bloque entra en el próximo.",
  };
}

/** Resumen de toda la cadena, para enseñarlo de un vistazo. */
export function resumenAnclaje(r){
  if(!r || !Array.isArray(r.bloques)) return null;
  const total = r.bloques.length;
  const confirmados = r.bloques.filter((b) => b.estado === "confirmado").length;
  const pendientes = r.bloques.filter((b) => b.estado === "pendiente").length;
  const sinAnclar = r.bloques.filter((b) => b.estado === "sin-anclar").length;
  const alturas = r.bloques.filter((b) => b.altura).map((b) => b.altura);

  return {
    total, confirmados, pendientes, sinAnclar,
    completo: total > 0 && confirmados === total,
    // El bloque de Bitcoin más antiguo es el que prueba la fecha más
    // temprana, así que es el que vale la pena enseñar.
    primeraAltura: alturas.length ? Math.min(...alturas) : null,
    proximoAnclaje: r.proximoAnclaje || null,
  };
}

/** Índice hash → anclaje, para pintarlo junto a cada bloque. */
export function porHash(r){
  const m = {};
  for(const b of (r?.bloques || [])) if(b.hash) m[b.hash] = b;
  return m;
}

/**
 * Lo que se mete al paquete de evidencia. Se queda con la prueba en
 * base64 porque es lo que un tercero necesita para verificar por su
 * cuenta, con las herramientas estándar y sin nosotros:
 *
 *     ots verify -d <hash del bloque> bloque.ots
 */
export function paraElPaquete(r){
  if(!r || !Array.isArray(r.bloques)) return null;
  const utiles = r.bloques.filter((b) => b.ots);
  if(!utiles.length) return null;
  return {
    formato: "opentimestamps",
    comprobarCon: "ots verify -d <hash> <archivo.ots>",
    instalarCon: "pip install opentimestamps-client",
    bloques: utiles.map((b) => ({
      index: b.index, hash: b.hash,
      estado: b.estado,
      alturaBitcoin: b.altura ?? null,
      ancladoEn: b.ancladoEn || null,
      raizDelDia: b.raiz || null,
      ots: b.ots,
    })),
  };
}