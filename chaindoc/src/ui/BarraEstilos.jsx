// La barra de estilos del documento: títulos, negrita, listas y
// alineación.
//
// Va debajo de las pestañas y sólo existe mientras editas. Fuera de
// edición no hay nada que aplicar, y una barra de botones apagados es
// ruido encima del documento.
//
// Sobre los títulos: son Normal, H1, H2 y H3, y no hay tamaños en
// puntos. Es a propósito. Un número no dice nada sobre la estructura
// del documento —«18 px» no es un título, sólo es grande—, y lo que
// hace falta para leer un contrato es saber qué es título y qué es
// texto. Además, el día que esto se exporte a PDF o se lea desde otro
// lado, un H2 se traduce y un «18 px» no.
//
// Por dentro usa `execCommand`. Está marcado como obsoleto y no tiene
// un sustituto real todavía; lo que lo hace seguro aquí es que da
// igual el HTML que produzca: al guardar, todo pasa por
// `normalizar()`, que sólo deja lo que cabe en el modelo. El navegador
// puede escribir lo que quiera, que no se guarda.

import { Icon } from "./iconos";
import { estaActivo } from "./estiloActivo";

const TITULOS = [
  { id: "p",  txt: "Normal", ayuda: "Texto normal" },
  { id: "h1", txt: "H1",     ayuda: "Título principal" },
  { id: "h2", txt: "H2",     ayuda: "Subtítulo" },
  { id: "h3", txt: "H3",     ayuda: "Apartado" },
];

const ALINEAR = [
  { cmd: "justifyLeft",    ico: "format_align_left",    ayuda: "Alinear a la izquierda" },
  { cmd: "justifyCenter",  ico: "format_align_center",  ayuda: "Centrar" },
  { cmd: "justifyRight",   ico: "format_align_right",   ayuda: "Alinear a la derecha" },
  { cmd: "justifyFull",    ico: "format_align_justify", ayuda: "Justificar" },
];

export function renderBarraEstilos(ctx){
  const { aplicarEstilo, estiloAct, pedirRedaccion, redBusy } = ctx;

  // `onMouseDown` con preventDefault y no `onClick`: al pulsar un
  // botón el navegador quita el cursor del texto, y execCommand sin
  // selección no hace nada. Evitando que el botón tome el foco, la
  // selección sigue donde estaba.
  // ← NUEVO (6 nov): el botón dice si eso YA está puesto donde tienes
  // el cursor. `aria-pressed` además de la clase: para quien navega
  // con lector de pantalla, el color no existe.
  const boton = (props, dentro)=>{
    const on = estaActivo(estiloAct, props.cmd, props.valor);
    return (
      <button type="button" key={props.k} aria-pressed={on}
        className={`${props.clase||"be-btn"}${on?" on":""}`}
        title={props.ayuda} aria-label={props.ayuda}
        onMouseDown={e=>{ e.preventDefault(); aplicarEstilo(props.cmd, props.valor); }}>
        {dentro}
      </button>
    );
  };

  return (
    <div className="be" role="toolbar" aria-label="Estilos del texto">
      <div className="be-grupo">
        {TITULOS.map(t=>boton(
          { k:t.id, cmd:"formatBlock", valor:t.id, ayuda:t.ayuda, clase:`be-btn be-txt${t.id==="p"?"":" be-h"}` },
          t.txt))}
      </div>

      <span className="be-sep"/>

      <div className="be-grupo">
        {boton({ k:"b", cmd:"bold", ayuda:"Negrita" }, <b>B</b>)}
        {boton({ k:"i", cmd:"italic", ayuda:"Cursiva" }, <i>I</i>)}
      </div>

      <span className="be-sep"/>

      <div className="be-grupo">
        {boton({ k:"ul", cmd:"insertUnorderedList", ayuda:"Lista con viñetas" },
          <Icon n="format_list_bulleted" size={19}/>)}
        {boton({ k:"ol", cmd:"insertOrderedList", ayuda:"Lista numerada" },
          <Icon n="format_list_numbered" size={19}/>)}
      </div>

      <span className="be-sep"/>

      <div className="be-grupo">
        {ALINEAR.map(a=>boton({ k:a.cmd, cmd:a.cmd, ayuda:a.ayuda },
          <Icon n={a.ico} size={19}/>))}
      </div>

      {/* ← NUEVO (11 nov): «Ayúdame a redactar».
          El objetivo de todo esto, dicho por Ricardo: «que se pueda
          usar incluso si no eres abogado o no sabes cómo redactarlo
          correctamente».

          Va al final, separado y con su nombre escrito. Los de la
          izquierda cambian cómo SE VE lo que escribiste y se deshacen
          con Ctrl+Z; éste reescribe lo que DICE, y eso no se pone
          detrás de un icono que haya que adivinar. Por la misma razón
          no aplica nada solo: enseña el borrador y tú decides.

          `onMouseDown` como los demás, para que no se pierda el
          cursor, y así el texto que se manda sigue siendo el de este
          documento. */}
      <span className="be-sep"/>

      <button type="button" className={`be-btn be-txt be-redactar${redBusy?" esperando":""}`}
        disabled={redBusy}
        title="Reescribe lo que llevas en forma de contrato"
        aria-label="Ayúdame a redactar"
        onMouseDown={e=>{ e.preventDefault(); if(!redBusy) pedirRedaccion(); }}>
        <Icon n="edit" size={18}/>
        <span>{redBusy ? "Redactando…" : "Ayúdame a redactar"}</span>
      </button>
    </div>
  );
}
