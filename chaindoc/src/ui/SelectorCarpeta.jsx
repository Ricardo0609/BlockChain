// Dónde se guarda este documento.
//
// Vive aparte porque lo usan tres sitios: crear un documento, crear un
// expediente y mover uno que ya existe. Eran tres copias de la misma
// fila de botones, y tres copias se separan a la primera corrección
// que se haga en una sola.
//
// Lo que trae de nuevo es la carpeta nueva EN SITIO. Antes, si el
// documento que ibas a crear no encajaba en ninguna de las que tenías,
// había que salirse, crear la carpeta y volver a empezar el documento
// desde el principio. Crear una carpeta no es un trámite aparte: es
// parte de decidir dónde va esto.

import { Icon } from "./iconos";
import { LARGO_CARPETA } from "../nucleo/carpetas";

export function renderSelectorCarpeta(ctx){
  const {
    folders, mIn2, setMIn2,
    carpNueva, setCarpNueva, carpErr, setCarpErr, crearCarpeta,
  } = ctx;

  const abierto = carpNueva !== null;

  const cerrar = ()=>{ setCarpNueva(null); setCarpErr(""); };
  const confirmar = ()=>{ crearCarpeta(carpNueva); };

  return (
    <div className="sel-carp">
      <div className="pills">
        <button className={`pill ${mIn2===""?"sel":""}`} onClick={()=>setMIn2("")}>Sin carpeta</button>
        {folders.map(f=>(
          <button key={f} className={`pill ${mIn2===f?"sel":""}`} onClick={()=>setMIn2(f)}>{f}</button>
        ))}
        {!abierto && (
          <button className="pill pill-nueva" onClick={()=>{ setCarpErr(""); setCarpNueva(""); }}>
            <Icon n="add" size={16}/> Nueva carpeta
          </button>
        )}
      </div>

      {abierto && (
        <div className="carp-nueva">
          <input className="inp" autoFocus maxLength={LARGO_CARPETA}
            placeholder="Nombre de la carpeta"
            value={carpNueva}
            onChange={e=>{ setCarpNueva(e.target.value); setCarpErr(""); }}
            onKeyDown={e=>{
              if(e.key==="Enter"){ e.preventDefault(); confirmar(); }
              if(e.key==="Escape"){ e.preventDefault(); cerrar(); }
            }} />
          <div className="carp-nueva-acts">
            <button className="btn btn-primary" onClick={confirmar}>Crear y usar</button>
            <button className="btn btn-tertiary" onClick={cerrar}>Cancelar</button>
          </div>
          {carpErr && <div className="share-err">{carpErr}</div>}
        </div>
      )}
    </div>
  );
}
