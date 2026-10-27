// El botón de firmar con Face ID / huella, para los sitios donde
// también se puede usar el código.
//
// ← NUEVO (27 oct): existía sólo dentro del modal de firmar el
// documento. Al añadirlo también a aceptar el contrato y a mandarlo a
// firmar iban a ser tres copias del mismo bloque, y tres sitios donde
// arreglar la misma cosa.

import { IcoFinger } from "./iconos";
import { deviceLabel } from "../biometric";

/** «Face ID» en iPhone y iPad; en lo demás, su nombre genérico. */
export const comoSeLlama = () => {
  const d = deviceLabel();
  return d === "iPhone" || d === "iPad" ? "Face ID" : "tu biometría";
};

/**
 * Devuelve null si esta persona no puede usarla —el dispositivo no la
 * tiene, o no registró ninguna credencial—, y entonces el código es
 * la única vía, exactamente como antes.
 */
export function renderBotonBio({ bioOk, bioCreds, ocupado, onBio, verbo = "Firmar" }){
  if(!bioOk || !(bioCreds || []).length) return null;
  return (<>
    <button className="btn btn-primary" style={{width:"100%"}} type="button"
      disabled={ocupado} onClick={onBio}>
      {ocupado ? "Esperando verificación…" : `${verbo} con ${comoSeLlama()}`}
    </button>
    <div className="fingerprint" onClick={()=>{ if(!ocupado) onBio(); }}><IcoFinger/></div>
    <div className="sign-or"><span>o usa tu código</span></div>
  </>);
}
