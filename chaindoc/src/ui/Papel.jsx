import { normalizar, ID_PAPEL } from "../nucleo/texto";

/**
 * El papel donde se escribe.
 *
 * Vivía dentro de `Documento.jsx`. Se sacó aquí el 26 de noviembre,
 * cuando el contrato de un expediente rechazado pasó a poder
 * corregirse: ese texto se edita desde OTRA pantalla —la pestaña
 * «Contrato» del expediente— y dos editores escritos por separado se
 * desvían en cuanto alguien toca uno. Siendo el mismo, no pueden.
 *
 * Tres cosas de aquí dentro que parecen detalles y no lo son:
 *
 *  · `dangerouslySetInnerHTML` NO pinta lo que mandó nadie: pinta el
 *    HTML canónico que sale de `normalizar`, que sólo deja pasar
 *    p/h1-h3/ul/ol/li/strong/em.
 *  · Se pone UNA SOLA VEZ, del texto guardado y no del estado. Si
 *    React lo repintara en cada tecla, el cursor saltaría al
 *    principio en cada letra.
 *  · El identificador es fijo y único: es por donde `cuerpoDelEditor`
 *    lee lo escrito al guardar. Mientras editas manda el DOM.
 *
 * Eso último trae una regla que hay que respetar donde se use: si
 * este papel no está montado, guardar lee el texto de antes. Quien lo
 * ponga detrás de una pestaña tiene que asegurarse de que esa pestaña
 * sea la que está abierta mientras se edita.
 */
export const PapelEditable = ({ html, onInput }) => (
  <div className="paper-ta" contentEditable suppressContentEditableWarning
    id={ID_PAPEL}
    data-vacio="Comienza a escribir…"
    onInput={onInput}
    dangerouslySetInnerHTML={{ __html: normalizar(html || "") }} />
);
