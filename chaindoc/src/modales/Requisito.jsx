// ─────────────────────────────────────────────────────────────
// Pedir un comprobante que no estaba en el contrato
//
// Lo pidió Ricardo así: «si al usuario se le olvidó o se le ocurrió
// poner algo que debía haber pedido, no tener que editar el contrato
// o hacer otro para que esté».
//
// Dos campos, y los dos son suyos: el título, obligatorio, y abajo
// uno más grande para explicarlo, opcional. No hay un tercero para
// elegir el tipo, ni la fase, ni si es obligatorio: la fase viene del
// botón que se pulsó —el que está debajo de esa fase— y lo demás
// tiene un valor razonable. Preguntar cuatro cosas para pedir una
// foto sería convertir un atajo en un formulario.
//
// LO QUE SÍ SE DICE, Y NO SE PODÍA CALLAR: si el contrato ya está
// firmado, esto cambia lo que se acordó, y a quien firmó le va a
// llegar un aviso. Sale antes de pulsar, no después, porque es
// justamente lo que puede hacer que alguien decida no pulsar.
// ─────────────────────────────────────────────────────────────

import { Icon } from "../ui/iconos";

export function modalRequisito(ctx){
  const { modal, setModal, d, reqTitulo, setReqTitulo, reqDesc, setReqDesc,
          reqBusy, reqErr, guardarRequisito, confirmarQuitarRequisito } = ctx;

  // ── QUITARLO: LA CONFIRMACION (17 nov) ─────────────────────
  //
  // Pregunta porque no se puede deshacer, y porque el boton que lleva
  // aqui vive en la misma fila que los de entregar: el dedo se
  // equivoca. Lo que se enseña es el TITULO de lo que se va a quitar,
  // no «¿seguro?»: leer el nombre es lo unico que distingue quitar el
  // que querias de quitar el de al lado.
  if(modal?.t === "quitar-requisito"){
    const r = (d?.requisitos || []).find(x => x.id === modal.reqId);
    const cerrar = ()=>{ if(!reqBusy) setModal(null); };
    return (
      <div className="ov" onClick={cerrar}>
        <div className="modal" onClick={e=>e.stopPropagation()} role="alertdialog">
          <h2>¿Quitar esta solicitud?</h2>
          <p className="sub">
            Se deja de pedir <b>{r?.titulo || "este comprobante"}</b>. Nadie tendrá que
            entregarlo, y no se puede deshacer: si lo quieres de vuelta hay que pedirlo
            otra vez.
          </p>
          {/* Lo que ya estaba entregado no se toca nunca: el servidor
              se niega a quitar uno con archivos. Esto no es un aviso
              de riesgo, es lo contrario -decir que no hay ninguno-. */}
          <p className="aviso-detalle">
            Lo que ya está entregado en el expediente no cambia, y lo que pasó aquí
            queda en el historial con la fecha.
          </p>
          {reqErr && <p className="entrega-aceptar-e">{reqErr}</p>}
          <div className="modal-row">
            <button className="btn btn-secondary" disabled={reqBusy} onClick={cerrar}>
              Cancelar
            </button>
            <button className={`btn btn-warning ${reqBusy?"esperando":""}`}
              disabled={reqBusy} onClick={confirmarQuitarRequisito}>
              {reqBusy ? "Quitando…" : "Quitar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if(modal?.t !== "requisito") return null;

  const faseId = modal.fase || null;
  const fase = (d?.fases || []).find(f => f.id === faseId) || null;
  // Quién va a recibir el aviso. Sale del acuerdo, que es donde están
  // las firmas, y se quitan las del propio dueño: a él no se le avisa
  // de lo que acaba de hacer.
  const firmantes = (d?.acuerdo?.firmas || [])
    .filter(f => f.uid !== d?.ownerUid)
    .map(f => f.nombre)
    .filter(Boolean);
  const nombres = [...new Set(firmantes)];
  const listo = reqTitulo.trim().length >= 3;

  const cerrar = ()=>{ if(!reqBusy) setModal(null); };

  return (
    <div className="ov" onClick={cerrar}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Pedir un comprobante más</h2>
        <p className="sub">
          {fase
            ? <>Se añade a la fase <b>{fase.nombre || fase.id}</b>, junto a lo que ya
               había que entregar ahí.</>
            : <>Se añade a la lista de lo que hay que entregar en este expediente.</>}
        </p>

        <label className="rec-lbl" htmlFor="req-t">¿Qué hay que entregar?</label>
        <input id="req-t" className="inp" value={reqTitulo} disabled={reqBusy}
          autoFocus maxLength={120} placeholder="Ej.: Fotos de la instalación terminada"
          onChange={e=>setReqTitulo(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter" && listo && !reqBusy) guardarRequisito(); }}/>

        <label className="rec-lbl" htmlFor="req-d">
          Detalles <span className="rec-opt">(opcional)</span>
        </label>
        <textarea id="req-d" className="inp req-area" value={reqDesc} disabled={reqBusy}
          maxLength={600} rows={4}
          placeholder="Explica qué tiene que verse, en qué formato, o por qué hace falta."
          onChange={e=>setReqDesc(e.target.value)}/>

        {/* El aviso, antes de pulsar. Sólo si hay a quién avisar: en un
            borrador que nadie ha firmado todavía esto no viene a
            cuento y sería ruido. */}
        {nombres.length > 0 && (
          <div className="req-aviso">
            <Icon n="notifications" size={17}/>
            <div>
              <strong>
                {nombres.length === 1
                  ? `${nombres[0]} va a recibir un aviso.`
                  : `${nombres.length} personas van a recibir un aviso.`}
              </strong>
              <p>
                Ya firmaron este contrato, así que esto les pide algo que no estaba en
                lo que aceptaron. Lo que firmaron no cambia: el requisito nuevo se añade
                aparte y queda marcado con su fecha.
              </p>
            </div>
          </div>
        )}

        {reqErr && <p className="entrega-aceptar-e">{reqErr}</p>}

        <div className="modal-row">
          <button className="btn btn-secondary" disabled={reqBusy} onClick={cerrar}>
            Cancelar
          </button>
          <button className={`btn btn-primary ${reqBusy?"esperando":""}`}
            disabled={!listo || reqBusy} onClick={guardarRequisito}>
            {reqBusy ? "Añadiendo…" : "Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}
