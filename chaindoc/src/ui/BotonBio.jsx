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
  // ← ACHICADO (26 nov). Lo pidió Ricardo viéndolo dentro de la
  // banda del expediente: «se ve muy grande lo de firmar con
  // biometría, está muy largo el botón; hazlo más pequeño aunque
  // también cambie en otros lados».
  //
  // Antes el botón se estiraba al 100% del sitio donde cayera. En un
  // modal estrecho eso se lee bien; en una banda ancha salía un
  // botón de pared a pared para una acción que no es la principal
  // —la principal es firmar, con huella o con código, y éstas son
  // dos formas de lo mismo—.
  //
  // Ahora tiene un ancho máximo y se centra: igual de cómodo de
  // pulsar en el móvil, y proporcionado en una pantalla ancha. El
  // círculo de la huella baja de 72 a 56.
  return (<>
    <button className="btn btn-primary bio-btn" type="button"
      disabled={ocupado} onClick={onBio}>
      {ocupado ? "Esperando verificación…" : `${verbo} con ${comoSeLlama()}`}
    </button>
    <div className="fingerprint" onClick={()=>{ if(!ocupado) onBio(); }}><IcoFinger/></div>
    <div className="sign-or"><span>o usa tu código</span></div>
  </>);
}
