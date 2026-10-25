// Modales de carpetas: nueva, mover y eliminar documento.

import { renderSelectorCarpeta } from "../ui/SelectorCarpeta";
import { revisarCarpeta, conCarpeta, LARGO_CARPETA } from "../nucleo/carpetas";
import { decidirBorrado } from "../nucleo/borrado";

export function modalCarpetas(ctx){
  const {
    delDoc, docs, folders, mIn, mIn2, modal, moveTo, notify, ocupado,
    setFolders, setMIn, setMIn2, setModal,
  } = ctx;
  // ← ACTUALIZADO (25 oct): usa la misma regla que el selector de
  // dentro del formulario. Antes era `mIn.trim()` y ya: sin tope de
  // largo, sin mirar si ya existía y dejando llamarla «Sin carpeta»,
  // que es la etiqueta del botón de no-carpeta. Dos sitios donde se
  // crean carpetas tienen que crearlas igual.
  if(modal.t==="newFolder"){
    const crear = ()=>{
      const r = revisarCarpeta(mIn, folders);
      if(!r.ok){ notify(r.error, "err"); return; }
      if(!r.yaEsta) setFolders(conCarpeta(folders, r.nombre));
      setMIn2(r.nombre); setModal(null);
      notify(r.yaEsta ? `Ya tenías «${r.nombre}».` : `Carpeta «${r.nombre}» creada ✓`);
    };
    return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Nueva carpeta</h2>
        <p className="sub">Organiza tus documentos por categorías.</p>
        <input className="inp" placeholder="Nombre de la carpeta" value={mIn} autoFocus
          maxLength={LARGO_CARPETA}
          onChange={e=>setMIn(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); crear(); } }} />
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={crear}>Crear</button>
        </div>
      </div></div>
    );
  }

  if(modal.t==="move") return (
    <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Mover a carpeta</h2>
      <p className="sub">Selecciona la carpeta destino.</p>
      {renderSelectorCarpeta(ctx)}
      <div className="modal-row">
        <button className="btn btn-secondary" disabled={!!ocupado} onClick={()=>setModal(null)}>Cancelar</button>
        <button className={`btn btn-primary ${ocupado==="moviendo"?"esperando":""}`}
          disabled={ocupado==="moviendo"} onClick={()=>moveTo(modal.id,mIn2||null)}>
          {ocupado==="moviendo" ? "Moviendo…" : "Mover"}
        </button>
      </div>
    </div></div>
  );

  // ← ACTUALIZADO (25 oct): el mismo boton hace dos cosas distintas
  // segun el documento, asi que tiene que decir cual antes de pulsarlo.
  // Un documento que no desaparece del todo despues de darle a
  // «Eliminar» es un boton roto si nadie aviso.
  if(modal.t==="del"){
    const doc = (docs||[]).find(x=>x.id===modal.id);
    const { modo, motivos } = decidirBorrado(doc);
    const esconde = modo==="ocultar";
    return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>{esconde ? "Quitar de tu lista" : "Eliminar documento"}</h2>
        {esconde ? (<>
          <p className="sub">
            <strong>«{modal.name}»</strong> ya no es sólo tuyo, así que no se borra:
            se quita de tu lista y sigue existiendo.
          </p>
          <ul className="del-motivos">
            {motivos.map((m,i)=><li key={i}>{m}</li>)}
          </ul>
          <div className="enl-nota">
            Lo seguirás pudiendo abrir por su enlace, y sigue contando como
            evidencia donde esté. Para los demás no cambia nada.
          </div>
        </>) : (
          <p className="sub">
            ¿Seguro que quieres eliminar <strong>«{modal.name}»</strong>? Nadie más
            lo ha firmado ni lo tiene como evidencia, así que se borra entero,
            con su historial. Esto no se puede deshacer.
          </p>
        )}
        <div className="modal-row">
          <button className="btn btn-secondary" disabled={!!ocupado} onClick={()=>setModal(null)}>Cancelar</button>
          <button className={`btn ${esconde?"btn-primary":"btn-warning"} ${ocupado==="eliminando"?"esperando":""}`}
            disabled={ocupado==="eliminando"} onClick={()=>delDoc(modal.id)}>
            {ocupado==="eliminando" ? (esconde?"Quitando…":"Eliminando…")
                                    : (esconde?"Quitar de mi lista":"Eliminar")}
          </button>
        </div>
      </div></div>
    );
  }

  return null;
}
