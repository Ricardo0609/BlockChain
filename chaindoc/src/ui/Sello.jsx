// El sello de firma, dibujado en el momento.
//
// Sustituye a las ocho imágenes LG1…LG8. Aquellas tenían dos problemas
// que no se arreglaban agregando archivos: con ocho opciones, a partir
// de cinco cuentas había un 79% de probabilidad de que dos personas
// compartieran sello, y a partir de ocho era seguro. Además LG8 estaba
// en la lista sin tener PNG, así que una de cada ocho cuentas firmaba
// y no le salía nada en absoluto.
//
// ── Todo lo que decide el dibujo viene del bloque ─────────────
//
// `clave` y `semilla` se estampan en el bloque de FIRMA en el momento
// de firmar, y de ahí salen para dibujar. NO se recalculan desde el
// nombre actual de la cuenta: si alguien se edita el nombre, su sello
// tiene que seguir siendo el mismo en las firmas que ya asentó. Un
// sello que cambia después de firmado es justo lo que este producto no
// se puede permitir.
//
// No usa hooks a propósito: el canvas se pinta en la referencia de
// callback, que corre al montarse el nodo. Como el dibujo depende sólo
// de lo que trae el bloque, quien lo usa le pone `key` y React lo
// vuelve a montar si cambia. Menos piezas que un useEffect y sin nada
// que limpiar.

import { pintarSello } from "./trazoSello";
import { semillaDeOrden } from "../nucleo/sello";

/**
 * @param clave    la clave congelada, p. ej. "feloma01"
 * @param semilla  el barajado congelado. Si falta —una firma de los
 *                 primeros días— se deriva de la clave: sale un sello
 *                 válido y estable, sólo sin la separación extra entre
 *                 dos personas que compartan abreviatura.
 * @param lado     píxeles del lienzo interno.
 *
 * Sobre el 512: el trazo lleva los grosores en píxeles fijos —8 a 13
 * de mancha, 30 a 85 de zarcillo— así que lo que decide si se ve un
 * anillo o un borrón es la proporción entre esos números y el radio.
 * El CSS enseña el sello a 88 px. Medido a ese tamaño final: con un
 * lienzo de 240 la tinta cubre el 13.8% y sale un manchón; con 800
 * baja al 2.4% y queda un aro desvaído. 512 da 4.3%, que es donde se
 * distinguen las manchas y sobreviven las salpicaduras. Es una sola
 * cifra: si lo quieres más cargado, bájala.
 */
export function Sello({ clave, semilla = null, lado = 896, className = "sello" }){
  const orden = Number.isFinite(semilla) ? semilla >>> 0 : semillaDeOrden(clave, 1);

  
  const pintar = (nodo) => {
    if(!nodo) return;
    const ctx = nodo.getContext("2d", { alpha: false });
    if(!ctx) return;                       // navegador sin canvas: queda el alt
    pintarSello(ctx, lado, clave, orden);
  };

  return (
    <canvas ref={pintar} width={lado} height={lado} className={className}
      role="img" aria-label={`Sello de firma ${clave}`}/>
  );
}
