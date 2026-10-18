// Los modales de la doble firma: mandar a firmar, aceptar y no aceptar.
//
// La firma va al MANDAR, no al crear el expediente. Una firma sólo
// significa algo si lo que se firmó ya no puede cambiar, y al crear el
// contrato todavía se está armando: requisitos, montos y fechas se
// mueven en los primeros minutos. Firmar ahí sería firmar un
// documento que al rato es otro.

import { fmtMonto } from "../smartContract";

/** Los motivos de un rechazo. El último abre el campo libre. */
const MOTIVOS = [
  "El importe no es el que acordamos",
  "La fecha no me funciona",
  "Falta o sobra algo de lo acordado",
  "Otra cosa",
];

export function modalAcuerdo(ctx){
  const {
    acu, d, enFirmeConf, enFirmeCorreo, enFirmeErr, enFirmeNombre, firmaBusy,
    mandarAFirmar, aceptarElContrato, rechazarElContrato, modal, pass,
    rechDetalle, rechMotivo, setEnFirmeConf, setEnFirmeCorreo, setEnFirmeNombre,
    setModal, setPass, setRechDetalle, setRechMotivo, user,
  } = ctx;

  // ── Mandar a firmar ────────────────────────────────────────
  if(modal.t==="enFirme"){
    const reqs = d?.requisitos || [];
    return (
    <div className="ov" onClick={()=>{ if(!firmaBusy) setModal(null); }}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Poner en firme y enviar</h2>
        <p className="sub">
          Al firmar, el contrato queda fijo. Si después hay que cambiar algo,
          se hace una versión nueva y se vuelve a firmar.
        </p>

        <div className="acu-fijo">
          <div className="acu-fijo-t">Queda fijo</div>
          <div className="acu-fijo-l"><span>{reqs.length} punto{reqs.length===1?"":"s"}</span><span>y sus importes</span></div>
          {d?.montoTotal!=null && (
            <div className="acu-fijo-l"><span>{fmtMonto(d.montoTotal, d.moneda||"MXN")}</span><span>total del contrato</span></div>
          )}
          {d?.fechaLimite && (
            <div className="acu-fijo-l"><span>{d.fechaLimite}</span><span>fecha límite</span></div>
          )}
          <div className="acu-fijo-l"><span>El texto del contrato</span><span>como está ahora</span></div>
        </div>

        <label className="rec-lbl" htmlFor="acu-correo">Se lo mandas a</label>
        <input id="acu-correo" className="inp" type="email" placeholder="correo@ejemplo.com"
          value={enFirmeCorreo} onChange={e=>setEnFirmeCorreo(e.target.value)} />

        <label className="rec-lbl" htmlFor="acu-nombre">Su nombre (opcional)</label>
        <input id="acu-nombre" className="inp" type="text" placeholder="Ana Solís"
          value={enFirmeNombre} onChange={e=>setEnFirmeNombre(e.target.value)} />

        <label className="acu-check" htmlFor="acu-conf">
          <input id="acu-conf" type="checkbox" checked={enFirmeConf}
            onChange={e=>setEnFirmeConf(e.target.checked)} />
          <span>
            <strong>Pedir su conformidad al terminar</strong>
            <em>Al final, las dos partes firman que quedó entregado. Para un
            trabajo chico suele sobrar; para una obra, no.</em>
          </span>
        </label>

        <label className="rec-lbl" htmlFor="acu-codigo">Tu código de firma</label>
        <input id="acu-codigo" className="inp" type="password" placeholder="••••"
          value={pass} onChange={e=>setPass(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&mandarAFirmar()} />

        {enFirmeErr && <div className="share-err">{enFirmeErr}</div>}

        <div className="modal-row">
          <button className={`btn btn-primary ${firmaBusy?"esperando":""}`}
            disabled={firmaBusy} onClick={mandarAFirmar}>
            {firmaBusy ? "Mandando…" : "Firmar y enviar"}
          </button>
          <button className="btn btn-secondary" disabled={firmaBusy}
            onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </div>
    </div>);
  }

  // ── Aceptar ────────────────────────────────────────────────
  if(modal.t==="aceptar"){
    return (
    <div className="ov" onClick={()=>{ if(!firmaBusy) setModal(null); }}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Aceptar el contrato</h2>
        <p className="sub">
          {d?.title}
          {d?.montoTotal!=null && ` · ${fmtMonto(d.montoTotal, d.moneda||"MXN")}`}
        </p>

        <div className="acu-acepto">
          He leído el contrato completo y <strong>acepto sus términos</strong>:
          el alcance, el importe y la fecha límite.
        </div>

        <label className="rec-lbl" htmlFor="acu-cod2">Tu código de firma</label>
        <input id="acu-cod2" className="inp" type="password" placeholder="••••"
          value={pass} onChange={e=>setPass(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&aceptarElContrato()} />

        <p className="acu-nota">
          Queda registrada la fecha, tu nombre y tu cuenta. Firmas como <strong>{user}</strong>.
        </p>

        <div className="modal-row">
          <button className={`btn btn-primary ${firmaBusy?"esperando":""}`}
            disabled={firmaBusy} onClick={aceptarElContrato}>
            {firmaBusy ? "Firmando…" : "Firmar y aceptar"}
          </button>
          <button className="btn btn-secondary" disabled={firmaBusy}
            onClick={()=>setModal(null)}>Volver a leerlo</button>
        </div>
      </div>
    </div>);
  }

  // ── No acepto ──────────────────────────────────────────────
  if(modal.t==="rechazar"){
    return (
    <div className="ov" onClick={()=>{ if(!firmaBusy) setModal(null); }}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>¿Qué habría que cambiar?</h2>
        <p className="sub">
          No se rompe nada. {acu?.paraNombre ? "Quien te lo mandó" : "Quien te lo mandó"} recibe
          tu respuesta y puede mandarte una versión corregida.
        </p>

        <div className="acu-motivos">
          {MOTIVOS.map(m=>(
            <label key={m} className={`acu-motivo ${rechMotivo===m?"on":""}`}>
              <input type="radio" name="acu-motivo" checked={rechMotivo===m}
                onChange={()=>setRechMotivo(m)} />
              <span>{m}</span>
            </label>
          ))}
        </div>

        <label className="rec-lbl" htmlFor="acu-det">Cuéntale (opcional)</label>
        <textarea id="acu-det" className="inp" rows={3}
          placeholder="Habíamos quedado en otra cantidad."
          value={rechDetalle} onChange={e=>setRechDetalle(e.target.value)} />

        <p className="acu-nota">
          Queda asentado que lo revisaste y no lo aceptaste, con la fecha.
          Eso también es evidencia.
        </p>

        <div className="modal-row">
          <button className={`btn btn-primary ${firmaBusy?"esperando":""}`}
            disabled={firmaBusy || !rechMotivo} onClick={rechazarElContrato}>
            {firmaBusy ? "Mandando…" : "Mandar mi respuesta"}
          </button>
          <button className="btn btn-secondary" disabled={firmaBusy}
            onClick={()=>setModal(null)}>Volver</button>
        </div>
      </div>
    </div>);
  }

  return null;
}
