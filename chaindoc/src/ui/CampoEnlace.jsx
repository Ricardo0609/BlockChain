// El campo para entregar un enlace como comprobante.
//
// Vive aparte porque lo usan dos pantallas muy distintas: el expediente
// —donde entra el dueño o un colaborador con cuenta— y la página de
// entrega por invitación, donde entra alguien que no tiene cuenta y a
// quien no se le puede pedir que entienda nada. Las dos tienen que
// comportarse igual, así que es el mismo componente.

import { Icon } from "./iconos";

export function CampoEnlace({
  url, nombre, error, ocupado,
  onUrl, onNombre, onGuardar, onCancelar,
  textoGuardar = "Agregar enlace",
}){
  // Enter guarda, Escape cancela: es un formulario de dos campos y
  // obligar al ratón para algo así sobra.
  const teclas = (e)=>{
    if(e.key === "Enter"){ e.preventDefault(); if(!ocupado) onGuardar(); }
    if(e.key === "Escape"){ e.preventDefault(); if(!ocupado) onCancelar(); }
  };

  return (
    <div className="enl-form">
      <input
        className={`inp enl-url ${error?"malo":""}`}
        type="url" inputMode="url" autoFocus disabled={ocupado}
        placeholder="midominio.com/mi-pagina"
        value={url} onChange={e=>onUrl(e.target.value)} onKeyDown={teclas} />
      <input
        className="inp enl-nom" disabled={ocupado}
        placeholder="Cómo se llama (opcional)"
        value={nombre} onChange={e=>onNombre(e.target.value)} onKeyDown={teclas} />

      {error && <div className="enl-err"><Icon n="warning" size={15}/> {error}</div>}

      {/* Decirlo aquí y no en la letra chica: quien entrega tiene que
          saber qué está probando antes de darle a guardar, no después. */}
      <div className="enl-nota">
        <Icon n="info" size={15}/>
        <span>
          Queda registrada <b>la dirección y la fecha</b> en que se entregó. Lo que haya
          en esa dirección puede cambiar después: eso no lo guarda chaindoc.
        </span>
      </div>

      <div className="enl-acts">
        <button className="btn btn-secondary rojo" disabled={ocupado}
          onClick={onCancelar}>Cancelar</button>
        <button className={`btn btn-primary ${ocupado?"esperando":""}`}
          disabled={ocupado || !url.trim()} onClick={onGuardar}>
          {ocupado ? "Guardando…" : textoGuardar}
        </button>
      </div>
    </div>
  );
}
