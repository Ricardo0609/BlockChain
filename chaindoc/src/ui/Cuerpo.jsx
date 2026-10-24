// El cuerpo de un documento, pintado.
//
// Esto NO pinta HTML. Pinta el modelo que sale de `nucleo/texto.js`,
// con elementos de React, y React escapa el texto por su cuenta. La
// diferencia importa más aquí que en casi cualquier otra app: el
// contenido de un documento compartido lo escribe la otra parte, y si
// se pintara su HTML tal cual, cualquiera podría meter un script en el
// documento de otro. Como lo único que se pinta son `p`, `h1..h3`,
// `li`, `strong` y `em`, no hay nada que inyectar.
//
// Lo usan las tres pantallas que enseñan contenido: el documento, el
// contrato dentro del expediente y la pantalla de revisión. Una sola
// copia para que las tres se vean igual.

import { ALINEACIONES, parsear } from "../nucleo/texto";

const ETIQUETA = { p: "p", h1: "h1", h2: "h2", h3: "h3" };

/** Los trozos de un bloque, con su negrita y su cursiva. */
function trozos(lista) {
  return lista.map((t, i) => {
    // Un salto dentro del mismo párrafo: se escribió con Shift+Enter.
    const partes = t.texto.split("\n");
    let dentro = partes.flatMap((p, j) => (j === 0 ? [p] : [<br key={`b${j}`}/>, p]));
    if (t.cursiva) dentro = <em>{dentro}</em>;
    if (t.negrita) dentro = <strong>{dentro}</strong>;
    return <span key={i}>{dentro}</span>;
  });
}

export function renderCuerpo(contenido){
  const bloques = parsear(contenido);
  const fuera = [];
  let lista = null;        // "ul" | "ol" mientras se acumulan <li>
  let acumulados = [];

  const cerrarLista = ()=>{
    if(!lista) return;
    const Etiqueta = lista;
    fuera.push(<Etiqueta key={`l${fuera.length}`}>{acumulados}</Etiqueta>);
    lista = null; acumulados = [];
  };

  bloques.forEach((b, i)=>{
    const clase = ALINEACIONES[b.alineacion] || undefined;

    if(b.tipo==="li-vineta" || b.tipo==="li-numero"){
      const quiero = b.tipo==="li-vineta" ? "ul" : "ol";
      if(lista !== quiero) cerrarLista();
      lista = quiero;
      acumulados.push(<li key={i} className={clase}>{trozos(b.trozos)}</li>);
      return;
    }

    cerrarLista();
    const Etiqueta = ETIQUETA[b.tipo] || "p";
    // Un párrafo vacío es un renglón en blanco que alguien puso a
    // propósito. Sin el espacio duro, el navegador lo aplasta a cero y
    // el documento se ve distinto de como se escribió.
    fuera.push(
      <Etiqueta key={i} className={clase}>
        {b.trozos.length ? trozos(b.trozos) : " "}
      </Etiqueta>
    );
  });

  cerrarLista();
  return fuera;
}
