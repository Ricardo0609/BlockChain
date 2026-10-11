// Un aviso que hay que leer y cerrar.
//
// Para cuando una acción no se pudo hacer y la razón importa. El aviso
// flotante de abajo (`notify`) sirve para confirmar que algo salió
// bien: aparece, se va solo, y si estabas mirando otra parte de la
// pantalla te lo perdiste. Eso está bien para un «Documento
// eliminado» y está mal para un «no se pudo, y esta es la razón»: el
// usuario se queda sin saber por qué su documento sigue ahí.
//
// Este se queda hasta que lo cierras.

export function modalAviso(ctx){
  const { modal, setModal } = ctx;
  if(modal.t !== "aviso") return null;

  return (
    <div className="ov" onClick={()=>setModal(null)}>
      <div className="modal" onClick={e=>e.stopPropagation()} role="alertdialog"
        aria-labelledby="aviso-t">
        <h2 id="aviso-t">{modal.titulo || "No se pudo completar"}</h2>
        <p className="sub">{modal.texto}</p>
        {/* La segunda línea es para explicar qué SÍ se puede hacer. Un
            aviso que sólo dice que no se pudo deja al usuario en el
            mismo lugar donde estaba. */}
        {modal.detalle && <p className="aviso-detalle">{modal.detalle}</p>}
        <div className="modal-row">
          <button className="btn btn-primary" autoFocus
            onClick={()=>setModal(null)}>Entendido</button>
        </div>
      </div>
    </div>
  );
}
