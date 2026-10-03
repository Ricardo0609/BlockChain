// Identificadores y hash de propósito general.
// El formato de bloque y la verificación de la cadena viven en bloques.js.

export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
export const genNumId = () => String(Math.floor(Math.random() * 90000000000) + 10000000000);

export { sha256, verificarCadena as verifyChain } from "./bloques";
