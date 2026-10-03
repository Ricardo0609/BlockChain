// ─────────────────────────────────────────────────────────────
// des.js — Triple DES en modo CBC, sólo descifrar
//
// POR QUÉ ESTÁ ESTO AQUÍ
//
// La llave privada de la e.firma (.key) viene cifrada con
// pbeWithSHA1And3-KeyTripleDES-CBC, que es lo que lleva usando el SAT
// desde hace años. Web Crypto, que es lo que trae el navegador, NO
// implementa 3DES: lo sacaron a propósito porque es viejo y lento.
//
// Así que para abrir la llave **dentro del navegador** —que es la
// condición innegociable, porque esa llave no puede subir a ningún
// servidor— hay que traer el algoritmo. Son unas doscientas líneas y
// están totalmente especificadas (FIPS 46-3); se comprueban contra los
// vectores oficiales y contra openssl.
//
// Sólo descifra. No cifra nada, porque no hay ningún caso en que
// tengamos que producir un .key. Menos superficie, menos que revisar.
//
// 3DES tiene sus años y ya no se usaría para algo nuevo. Aquí no se
// elige: es el formato en el que el SAT entrega la llave, y lo único
// que se hace con él es abrir un archivo que el usuario ya tiene en su
// disco, en su propia máquina.
// ─────────────────────────────────────────────────────────────

// ── Tablas de FIPS 46-3 ───────────────────────────────────────

const PC1 = [
  56,48,40,32,24,16,8, 0,57,49,41,33,25,17, 9,1,58,50,42,34,26,
  18,10,2,59,51,43,35, 62,54,46,38,30,22,14, 6,61,53,45,37,29,21,
  13,5,60,52,44,36,28, 20,12,4,27,19,11,3,
];

const PC2 = [
  13,16,10,23,0,4, 2,27,14,5,20,9, 22,18,11,3,25,7, 15,6,26,19,12,1,
  40,51,30,36,46,54, 29,39,50,44,32,47, 43,48,38,55,33,52, 45,41,49,35,28,31,
];

const CORRIMIENTOS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

const IP = [
  57,49,41,33,25,17,9,1, 59,51,43,35,27,19,11,3, 61,53,45,37,29,21,13,5,
  63,55,47,39,31,23,15,7, 56,48,40,32,24,16,8,0, 58,50,42,34,26,18,10,2,
  60,52,44,36,28,20,12,4, 62,54,46,38,30,22,14,6,
];

const IP_INV = [
  39,7,47,15,55,23,63,31, 38,6,46,14,54,22,62,30, 37,5,45,13,53,21,61,29,
  36,4,44,12,52,20,60,28, 35,3,43,11,51,19,59,27, 34,2,42,10,50,18,58,26,
  33,1,41,9,49,17,57,25, 32,0,40,8,48,16,56,24,
];

const E = [
  31,0,1,2,3,4, 3,4,5,6,7,8, 7,8,9,10,11,12, 11,12,13,14,15,16,
  15,16,17,18,19,20, 19,20,21,22,23,24, 23,24,25,26,27,28, 27,28,29,30,31,0,
];

const P = [
  15,6,19,20, 28,11,27,16, 0,14,22,25, 4,17,30,9,
  1,7,23,13, 31,26,2,8, 18,12,29,5, 21,10,3,24,
];

const S = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7, 0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,
   4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0, 15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10, 3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,
   0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15, 13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8, 13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,
   13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7, 1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15, 13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,
   10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4, 3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9, 14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,
   4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14, 11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11, 10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,
   9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6, 4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1, 13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,
   1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2, 6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7, 1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,
   7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8, 2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

// ── Utilidades de bits ────────────────────────────────────────

/** Bytes → array de bits (el 0 es el más significativo del primer byte). */
const aBits = (bytes) => {
  const b = new Uint8Array(bytes.length * 8);
  for(let i = 0; i < bytes.length; i++)
    for(let k = 0; k < 8; k++) b[i * 8 + k] = (bytes[i] >> (7 - k)) & 1;
  return b;
};

const aBytes = (bits) => {
  const b = new Uint8Array(bits.length / 8);
  for(let i = 0; i < b.length; i++){
    let v = 0;
    for(let k = 0; k < 8; k++) v = (v << 1) | bits[i * 8 + k];
    b[i] = v;
  }
  return b;
};

const permutar = (bits, tabla) => {
  const s = new Uint8Array(tabla.length);
  for(let i = 0; i < tabla.length; i++) s[i] = bits[tabla[i]];
  return s;
};

// ── DES ───────────────────────────────────────────────────────

/** Las 16 subllaves de 48 bits que salen de una llave de 8 bytes. */
function subllaves(llave8){
  const k = permutar(aBits(llave8), PC1);
  let c = k.slice(0, 28), d = k.slice(28, 56);
  const salida = [];
  for(let ronda = 0; ronda < 16; ronda++){
    const n = CORRIMIENTOS[ronda];
    c = Uint8Array.from([...c.slice(n), ...c.slice(0, n)]);
    d = Uint8Array.from([...d.slice(n), ...d.slice(0, n)]);
    salida.push(permutar(Uint8Array.from([...c, ...d]), PC2));
  }
  return salida;
}

/** La función f de Feistel: expandir, mezclar con la subllave, cajas S, permutar. */
function feistel(derecha, subllave){
  const e = permutar(derecha, E);
  for(let i = 0; i < 48; i++) e[i] ^= subllave[i];

  const salida = new Uint8Array(32);
  for(let caja = 0; caja < 8; caja++){
    const o = caja * 6;
    const fila = (e[o] << 1) | e[o + 5];
    const col = (e[o+1] << 3) | (e[o+2] << 2) | (e[o+3] << 1) | e[o+4];
    const v = S[caja][fila * 16 + col];
    for(let k = 0; k < 4; k++) salida[caja * 4 + k] = (v >> (3 - k)) & 1;
  }
  return permutar(salida, P);
}

/** Un bloque de 8 bytes. `alReves` invierte el orden de las rondas: eso es descifrar. */
function bloqueDES(bloque8, llaves, alReves){
  const b = permutar(aBits(bloque8), IP);
  let izq = b.slice(0, 32), der = b.slice(32, 64);

  for(let ronda = 0; ronda < 16; ronda++){
    const k = llaves[alReves ? 15 - ronda : ronda];
    const f = feistel(der, k);
    const nueva = new Uint8Array(32);
    for(let i = 0; i < 32; i++) nueva[i] = izq[i] ^ f[i];
    izq = der; der = nueva;
  }
  // Al final se cruzan: el orden es derecha-izquierda, no al revés.
  return aBytes(permutar(Uint8Array.from([...der, ...izq]), IP_INV));
}

// ── Triple DES en CBC ─────────────────────────────────────────

/**
 * Descifra con 3DES-CBC. La llave son 24 bytes (tres de 8), y el
 * esquema es descifrar-cifrar-descifrar con la tercera, la segunda y
 * la primera.
 *
 * @param {Uint8Array} cifrado  múltiplo de 8 bytes
 * @param {Uint8Array} llave24
 * @param {Uint8Array} iv8
 * @param {boolean} quitarRelleno  quita el relleno PKCS#7 del final
 */
export function descifrar3DES(cifrado, llave24, iv8, quitarRelleno = true){
  if(llave24.length !== 24) throw new Error("llave-3des-debe-ser-24-bytes");
  if(iv8.length !== 8) throw new Error("iv-debe-ser-8-bytes");
  if(cifrado.length === 0 || cifrado.length % 8) throw new Error("cifrado-no-multiplo-de-8");

  const k1 = subllaves(llave24.subarray(0, 8));
  const k2 = subllaves(llave24.subarray(8, 16));
  const k3 = subllaves(llave24.subarray(16, 24));

  const salida = new Uint8Array(cifrado.length);
  let anterior = iv8;

  for(let i = 0; i < cifrado.length; i += 8){
    const bloque = cifrado.subarray(i, i + 8);
    // Descifrar con k3, cifrar con k2, descifrar con k1.
    const claro = bloqueDES(bloqueDES(bloqueDES(bloque, k3, true), k2, false), k1, true);
    for(let k = 0; k < 8; k++) salida[i + k] = claro[k] ^ anterior[k];
    anterior = bloque;
  }

  if(!quitarRelleno) return salida;
  return sinRelleno(salida);
}

/**
 * Quita el relleno PKCS#7.
 *
 * Aquí un relleno mal formado casi siempre significa «la contraseña
 * estaba mal», porque descifrar con la llave equivocada produce ruido.
 * Se distingue con un mensaje propio para poder decírselo a la persona
 * en vez de soltarle un error de criptografía.
 */
export function sinRelleno(datos){
  if(!datos.length) throw new Error("vacio");
  const n = datos[datos.length - 1];
  if(n < 1 || n > 8 || n > datos.length) throw new Error("relleno-invalido");
  for(let i = datos.length - n; i < datos.length; i++){
    if(datos[i] !== n) throw new Error("relleno-invalido");
  }
  return datos.subarray(0, datos.length - n);
}

/** Un solo bloque DES, expuesto para poder probar contra los vectores oficiales. */
export const unBloque = (bloque8, llave8, alReves = false) =>
  bloqueDES(bloque8, subllaves(llave8), alReves);