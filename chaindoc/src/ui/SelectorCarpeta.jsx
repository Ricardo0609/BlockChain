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

/**
 * El campo «dónde se guarda», al crear.
 *
 * ← NUEVO (4 nov): si estás DENTRO de una carpeta, no pregunta. Entrar
 * a una carpeta y crear ahí ya dice dónde quieres que vaya; volver a
 * preguntarlo es hacer dos veces la misma elección.
 *
 * Pero lo dice. Un documento que se guarda en un sitio sin avisar es
 * un documento que luego no aparece donde se busca, y eso se nota
 * tarde. Así que en vez de la fila de carpetas sale una línea con el
 * destino y un «Cambiar» al lado, para quien esta vez quería otra
 * cosa. No es preguntar: es responder antes de que pregunten.
 *
 * Mover un documento que ya existe no pasa por aquí: ahí la pregunta
 * ES la tarea, y la fila de carpetas sale siempre.
 */
/**
 * Si el destino se da por hecho y no hay nada que preguntar.
 *
 * Fuera del JSX para poder probarla: son tres condiciones y las tres
 * tienen que darse. `mIn2 === filterF` no sobra —parece que sí, porque
 * al abrir se ponen iguales—: si alguien elige otra carpeta y luego
 * vuelve a la de origen, la fila ya está abierta y cerrarla en sus
 * narices sería peor que dejarla.
 */
export const destinoDicho = ({ filterF, mIn2, carpAbierta }) =>
  Boolean(filterF) && !carpAbierta && mIn2 === filterF;

export function renderCampoCarpeta(ctx){
  const { filterF, setCarpAbierta } = ctx;
  const dentro = destinoDicho(ctx);

  if(dentro){
    return (
      <div className="carp-dicha">
        <Icon n="folder" size={17}/>
        <span>Se guardará en <strong>{filterF}</strong></span>
        <button className="btn btn-tertiary" onClick={()=>setCarpAbierta(true)}>Cambiar</button>
      </div>
    );
  }
  return (<>
    <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Guardar en carpeta (opcional):</p>
    {renderSelectorCarpeta(ctx)}
  </>);
}

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
