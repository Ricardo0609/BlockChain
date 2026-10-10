// La clave del sello de firma: nombre abreviado + número de usuario.
//
//   Fernando Lopez Martinez, usuario 1  →  "feloma01"
//
// Esto NO dibuja nada: sólo arma el texto del que sale el dibujo. El
// trazo vive en ui/trazoSello.js y no depende de este archivo.
//
// ── Por qué la clave se CONGELA ───────────────────────────────
//
// Se calcula una vez, al crear la cuenta, y se guarda. Nunca se vuelve
// a calcular desde el nombre actual. Si alguien se cambia de «Ricardo
// Cabrera» a «Ricardo Cabrera Soto», su clave pasaría de "rica02" a
// "ricaso02" y le cambiaría el sello — incluido el de las firmas que
// ya están asentadas en la cadena. Quien comparara un PDF viejo con la
// app vería otra marca en la misma firma, que es justo la impresión
// que este producto no se puede permitir.
//
// ── Y por qué el número lo pone el servidor ───────────────────
//
// `users/{uid}` lo puede escribir el propio navegador. Si el número
// saliera de ahí, cualquiera podría ponerse el de otro y estampar un
// sello ajeno. Por eso vive en `sellos/{uid}`, que es sólo del
// servidor, igual que el folio de los documentos.
//
// Este archivo tiene un gemelo en functions/lib/sello.js, porque las
// Cloud Functions no pueden importar de src. pruebas/sello.test.js
// compara las dos copias.

/** La versión del formato. Si algún día cambia la regla, sube esto y
 *  deja la 1 intacta: las claves viejas tienen que seguir dando el
 *  mismo dibujo para siempre. */
export const VERSION_SELLO = 1;

// Partículas que no identifican a nadie. Si «Juan de la Cruz Perez»
// entrara completo saldría "judelacrpe": cuatro letras de ruido en un
// dibujo donde cada letra es un arco del círculo.
export const PARTICULAS = new Set([
  "DE", "DEL", "LA", "LAS", "LO", "LOS", "Y", "DA", "DI",
  "VAN", "VON", "MC", "MAC", "SAN", "SANTA",
]);

/** Tope de partes del nombre. Sin él, un nombre largo llena el círculo
 *  de arcos minúsculos y todos los sellos largos se parecen. */
export const MAX_PARTES = 4;

/** Quita acentos y deja sólo A-Z. La ñ se vuelve N; no desaparece. */
export function soloLetras(txt){
  return String(txt ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z]/g, "");
}

/** Las dos primeras letras de cada parte del nombre. */
export function abreviar(nombre){
  const partes = String(nombre ?? "")
    .split(/\s+/)
    .map(soloLetras)
    .filter((p) => p.length > 0 && !PARTICULAS.has(p));
  return partes.slice(0, MAX_PARTES).map((p) => p.slice(0, 2)).join("");
}

/** El número de usuario, con dos cifras como mínimo: 1 → "01". */
export const numeroTexto = (n) =>
  String(Math.max(1, Math.trunc(Number(n) || 1))).padStart(2, "0");

/**
 * La clave completa.
 *
 * El número es lo que garantiza que no se repita: dos «Fernando Lopez
 * Martinez» dan los dos "feloma", pero nunca el mismo número.
 *
 * El respaldo "xx" es para los nombres sin ninguna letra latina (un
 * nombre en otro alfabeto, o un campo vacío). Sale un sello válido y
 * distinto, porque el número sigue cambiando.
 */
export function claveDeSello(nombre, numero){
  return (abreviar(nombre) || "xx").toLowerCase() + numeroTexto(numero);
}

/**
 * La semilla con la que se baraja el orden de las letras alrededor del
 * círculo.
 *
 * Sin esto, dos personas que comparten abreviatura —y comparten más de
 * lo que parece: con 500 cuentas son un 4.5%, con 2000 un 15%— sólo se
 * diferenciarían en una cifra. Medido sobre el dibujo real, eso las
 * deja a 0.005 de distancia cuando dos desconocidos están a 0.040: el
 * mismo sello, a ojo. Barajando las posiciones suben a 0.036-0.045.
 *
 * Sale del nombre COMPLETO, no de la abreviatura: es lo que hace que
 * «Fernando Lopez Martinez» y «Felipe Lopez Mares» repartan sus letras
 * de otra forma.
 */
export function semillaDeOrden(nombre, numero){
  const base = `${soloLetras(nombre)}#${numeroTexto(numero)}`;
  let h = 0x811c9dc5;
  for(let i = 0; i < base.length; i++){
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Los sellos del sistema viejo eran ocho imágenes: LG1 … LG8. */
export const esSelloViejo = (s) => /^LG\d+$/.test(String(s ?? ""));
