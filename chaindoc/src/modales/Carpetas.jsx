// Modales de carpetas: nueva, mover y eliminar documento.

import { renderSelectorCarpeta } from "../ui/SelectorCarpeta";
import { revisarCarpeta, conCarpeta, LARGO_CARPETA } from "../nucleo/carpetas";
import { decidirBorrado } from "../nucleo/borrado";
import { Icon } from "../ui/iconos";

export function modalCarpetas(ctx){
  const {
    dejarDeVerDoc, delDoc, docs, folders, mIn, mIn2, modal, moveTo, notify, ocupado,
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
    const { modo, motivos, adjuntoEn } = decidirBorrado(doc);
    // ← NUEVO (6 nov): los nombres de los contratos, no «un contrato».
    // Saber que algo es evidencia «en algún sitio» no sirve para
    // decidir: hay que poder ir a mirarlo. Los títulos salen de la
    // lista que ya está en pantalla; si uno no está ahí es que no
    // alcanzas a verlo, y entonces se dice eso en vez de inventarlo.
    const nombresExp = (adjuntoEn || []).map(id =>
      (docs || []).find(x => x.id === id)?.title || null);
    const visibles = nombresExp.filter(Boolean);
    const ocultosN = nombresExp.length - visibles.length;
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
          {Boolean(adjuntoEn?.length) && (
            <ul className="del-exps">
              {visibles.map((t,i)=>(
                <li key={i}><Icon n="link" size={15}/><span>{t}</span></li>
              ))}
              {ocultosN>0 && (
                <li className="del-exp-otro">
                  <Icon n="link" size={15}/>
                  <span>{ocultosN===1
                    ? "Y un contrato más, al que no tienes acceso."
                    : `Y ${ocultosN} contratos más, a los que no tienes acceso.`}</span>
                </li>
              )}
            </ul>
          )}
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

  // ← NUEVO (6 nov): salirse de algo que te compartieron.
  //
  // Lleva confirmación aunque se pueda deshacer, porque deshacerlo NO
  // está en tu mano: hay que pedírselo otra vez a quien te lo
  // compartió. Eso se dice aquí y no después.
  if(modal.t==="salir"){
    return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Dejar de ver este documento</h2>
        <p className="sub">
          <strong>«{modal.name}»</strong> desaparecerá de tu lista y perderás el
          acceso. No se borra: sigue siendo de quien te lo compartió, y lo que
          hayas firmado o entregado ahí sigue contando.
        </p>
        <div className="enl-nota">
          Para volver a verlo tendrás que pedírselo otra vez. Quedará asentado
          que saliste, para que la otra parte no se quede esperando algo tuyo.
        </div>
        <div className="modal-row">
          <button className="btn btn-secondary" disabled={!!ocupado} onClick={()=>setModal(null)}>Cancelar</button>
          <button className={`btn btn-warning ${ocupado==="saliendo"?"esperando":""}`}
            disabled={ocupado==="saliendo"} onClick={()=>dejarDeVerDoc(modal.id)}>
            {ocupado==="saliendo" ? "Saliendo…" : "Dejar de ver"}
          </button>
        </div>
      </div></div>
    );
  }

  return null;
}
