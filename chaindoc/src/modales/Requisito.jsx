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
          reqVisto, setReqVisto,
          revisando, confirmarRechazo, rechMotivoAdj, setRechMotivoAdj,
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

  // ── RECHAZAR UN ADJUNTO: EL MOTIVO (23 nov) ────────────────
  //
  // Lo pidió Ricardo: «si el dueño rechaza algo, le aparece una
  // notificación a quien lo adjuntó de que su archivo adjunto fue
  // rechazado y los motivos, si el dueño puso un motivo».
  //
  // El motivo es OPCIONAL -eso del «si»- y aun así se pregunta. No
  // es lo mismo: un no sin explicación obliga a la otra persona a
  // adivinar qué estaba mal, y lo más probable es que vuelva a subir
  // lo mismo. Preguntarlo sin exigirlo es lo que hace que casi
  // siempre lo escriban.
  //
  // Y se dice lo que NO pasa: el archivo no se borra. Es lo que
  // despeja el miedo a pulsar y lo que hace que quien lo subió pueda
  // ver qué le rechazaron.
  if(modal?.t === "rechazar-adjunto"){
    const cerrar = ()=>{ if(!revisando) setModal(null); };
    return (
      <div className="ov" onClick={cerrar}>
        <div className="modal" onClick={e=>e.stopPropagation()} role="alertdialog">
          <h2>¿Rechazar este comprobante?</h2>
          <p className="sub">
            No se acepta <b>{modal.nombre || "este archivo"}</b>. A quien lo subió le
            llega un aviso y el requisito vuelve a quedar pendiente.
          </p>

          <label className="rec-lbl" htmlFor="rech-m">
            ¿Por qué? <span className="rec-opt">(opcional, pero ayuda)</span>
          </label>
          <textarea id="rech-m" className="inp req-area" value={rechMotivoAdj || ""}
            disabled={Boolean(revisando)} maxLength={400} rows={3} autoFocus
            placeholder="Ej.: La factura es de otro mes, o la foto no deja ver el folio."
            onChange={e=>setRechMotivoAdj(e.target.value)}/>
          <p className="aviso-detalle">
            Lo que escribas aquí se lo mandamos tal cual. Si lo dejas en blanco sólo
            verá que no lo aceptaste, y tendrá que adivinar qué cambiar.
          </p>
          <p className="aviso-detalle">
            El archivo <b>no se borra</b>: se queda marcado para que vea qué rechazaste.
          </p>

          <div className="modal-row">
            <button className="btn btn-secondary" disabled={Boolean(revisando)} onClick={cerrar}>
              Cancelar
            </button>
            <button className={`btn btn-warning ${revisando?"esperando":""}`}
              disabled={Boolean(revisando)} onClick={confirmarRechazo}>
              {revisando ? "Rechazando…" : "Rechazar"}
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

        {/* ── EL VISTO BUENO (23 nov) ──────────────────────────
            Lo pidió Ricardo —«que se aprueben las cosas importantes o
            decisivas para cada fase»— y al preguntarle quién decide
            cuáles son importantes eligió esto: que lo marque él al
            pedirlas.

            Apagado por omisión, y es deliberado. Encendido por
            omisión convertiría al dueño en cuello de botella de cada
            factura, que es justo la opción que descartó. */}
        <label className={`req-visto ${reqVisto?"on":""}`}>
          <input type="checkbox" checked={Boolean(reqVisto)} disabled={reqBusy}
            onChange={e=>setReqVisto(e.target.checked)} />
          <span className="req-visto-t">Necesita mi visto bueno</span>
          <span className="req-visto-d">
            {reqVisto
              ? "No contará como entregado hasta que lo mires y lo apruebes. A quien lo suba le avisaremos si lo rechazas."
              : "Si lo marcas, no contará como entregado hasta que lo apruebes tú."}
          </span>
        </label>

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
