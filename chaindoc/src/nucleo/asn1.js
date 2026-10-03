// ─────────────────────────────────────────────────────────────
// asn1.js — Lector mínimo de DER
//
// Hace falta para la e.firma: el certificado (.cer) y la llave (.key)
// del SAT son DER, y hay que abrirlos en el navegador para poder
// firmar sin que la llave salga del dispositivo.
//
// Es un lector, no una librería: sólo entiende lo que estos dos
// archivos usan. Preferible a traerse una dependencia de criptografía
// entera para leer cuatro estructuras, y además así se puede razonar
// sobre lo que hace — que en el archivo que toca la llave privada de
// alguien no es un lujo.
//
// Sólo LEE. No construye DER, no firma, no cifra.
// ─────────────────────────────────────────────────────────────

/** Etiquetas que aparecen en un certificado o en un PKCS#8. */
export const TIPO = {
  BOOLEANO:    0x01,
  ENTERO:      0x02,
  BITS:        0x03,
  OCTETOS:     0x04,
  NULO:        0x05,
  OID:         0x06,
  UTF8:        0x0c,
  SECUENCIA:   0x30,
  CONJUNTO:    0x31,
  IMPRIMIBLE:  0x13,
  T61:         0x14,
  IA5:         0x16,
  UTC:         0x17,
  GENERALIZED: 0x18,
};

/**
 * Parte los bytes en un árbol.
 *
 * Cada nodo trae dónde empieza y dónde acaba dentro del original,
 * porque para verificar una firma hace falta volver a serializar
 * exactamente los mismos bytes que se firmaron, no una reconstrucción
 * que "significa lo mismo".
 */
export function leer(bytes, desde = 0, hasta = bytes.length){
  const salida = [];
  let i = desde;

  while(i < hasta){
    const inicio = i;
    const etiqueta = bytes[i++];
    if(i > hasta) throw new Error("der-truncado");

    let largo = bytes[i++];
    if(largo & 0x80){
      const n = largo & 0x7f;
      if(n === 0) throw new Error("der-largo-indefinido");
      if(n > 4) throw new Error("der-largo-enorme");
      largo = 0;
      for(let k = 0; k < n; k++) largo = largo * 256 + bytes[i++];
    }
    const cuerpo = i;
    const fin = cuerpo + largo;
    if(fin > hasta) throw new Error("der-truncado");

    const compuesto = (etiqueta & 0x20) !== 0;
    salida.push({
      etiqueta, inicio, cuerpo, fin,
      bytes: bytes.subarray(cuerpo, fin),
      crudo: bytes.subarray(inicio, fin),
      hijos: compuesto ? leer(bytes, cuerpo, fin) : null,
    });
    i = fin;
  }
  return salida;
}

/** El primer (y normalmente único) nodo de más arriba. */
export const raiz = (bytes) => {
  const n = leer(bytes);
  if(!n.length) throw new Error("der-vacio");
  return n[0];
};

/** Baja por el árbol: ruta(nodo, 0, 2, 1) = hijo 0 → hijo 2 → hijo 1. */
export function ruta(nodo, ...indices){
  let n = nodo;
  for(const i of indices){
    if(!n?.hijos || !n.hijos[i]) return null;
    n = n.hijos[i];
  }
  return n;
}

/** Un OID en su forma de siempre: 1.2.840.113549.1.1.11 */
export function oid(nodo){
  if(!nodo || nodo.etiqueta !== TIPO.OID) return null;
  const b = nodo.bytes;
  if(!b.length) return null;
  const partes = [Math.floor(b[0] / 40), b[0] % 40];
  let valor = 0;
  for(let i = 1; i < b.length; i++){
    valor = valor * 128 + (b[i] & 0x7f);
    if(!(b[i] & 0x80)){ partes.push(valor); valor = 0; }
  }
  return partes.join(".");
}

/** Un entero, como número. Sólo para los chicos (iteraciones, versión). */
export function entero(nodo){
  if(!nodo) return null;
  let v = 0;
  for(const b of nodo.bytes){
    v = v * 256 + b;
    if(v > Number.MAX_SAFE_INTEGER) throw new Error("entero-enorme");
  }
  return v;
}

/** Un entero grande (el número de serie), en hexadecimal. */
export const enteroHex = (nodo) =>
  nodo ? [...nodo.bytes].map((b) => b.toString(16).padStart(2, "0")).join("") : null;

/** Una cadena, sea cual sea su tipo. */
export function texto(nodo){
  if(!nodo) return null;
  try{ return new TextDecoder("utf-8").decode(nodo.bytes); }
  catch{ return null; }
}

/**
 * Una fecha. DER las escribe de dos formas: UTCTime (dos dígitos de
 * año, con la regla de que 50+ es 19xx) y GeneralizedTime (cuatro).
 */
export function fecha(nodo){
  const s = texto(nodo);
  if(!s) return null;
  const m = nodo.etiqueta === TIPO.UTC
    ? s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/)
    : s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
  if(!m) return null;
  let año = Number(m[1]);
  if(nodo.etiqueta === TIPO.UTC) año += año >= 50 ? 1900 : 2000;
  return new Date(Date.UTC(año, Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0)));
}

/** Busca el primer nodo que cumpla algo, a cualquier profundidad. */
export function buscar(nodo, cumple){
  if(cumple(nodo)) return nodo;
  for(const h of nodo.hijos || []){
    const r = buscar(h, cumple);
    if(r) return r;
  }
  return null;
}

/** Todos los que cumplan, en el orden en que aparecen. */
export function buscarTodos(nodo, cumple, salida = []){
  if(cumple(nodo)) salida.push(nodo);
  for(const h of nodo.hijos || []) buscarTodos(h, cumple, salida);
  return salida;
}