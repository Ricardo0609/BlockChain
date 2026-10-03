// Modales de carpetas: nueva, mover y eliminar documento.

export function modalCarpetas(ctx){
  const {
    delDoc, folders, mIn, mIn2, modal, moveTo, notify, setFolders, setMIn, setMIn2, setModal,
  } = ctx;
  if(modal.t==="newFolder") return (
    <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Nueva carpeta</h2>
      <p className="sub">Organiza tus documentos por categorías.</p>
      <input className="inp" placeholder="Nombre de la carpeta" value={mIn}
        onChange={e=>setMIn(e.target.value)} autoFocus
        onKeyDown={e=>{if(e.key==="Enter"&&mIn.trim()){setFolders([...folders,mIn.trim()]);setModal(null);notify("Carpeta creada ✓");}}} />
      <div className="modal-row">
        <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="btn btn-primary" onClick={()=>{if(mIn.trim()){setFolders([...folders,mIn.trim()]);setModal(null);notify("Carpeta creada ✓");}}}>Crear</button>
      </div>
    </div></div>
  );

  if(modal.t==="move") return (
    <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Mover a carpeta</h2>
      <p className="sub">Selecciona la carpeta destino.</p>
      <div className="pills">
        <button className={`pill ${mIn2===""?"sel":""}`} onClick={()=>setMIn2("")}>Sin carpeta</button>
        {folders.map(f=><button key={f} className={`pill ${mIn2===f?"sel":""}`} onClick={()=>setMIn2(f)}>{f}</button>)}
      </div>
      <div className="modal-row">
        <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="btn btn-primary" onClick={()=>moveTo(modal.id,mIn2||null)}>Mover</button>
      </div>
    </div></div>
  );

  if(modal.t==="del") return (
    <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Eliminar documento</h2>
      <p className="sub">¿Seguro que quieres eliminar <strong>«{modal.name}»</strong>? Esta acción no se puede deshacer.</p>
      <div className="modal-row">
        <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="btn btn-warning" onClick={()=>delDoc(modal.id)}>Eliminar</button>
      </div>
    </div></div>
  );

  return null;
}

