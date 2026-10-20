// Revisar un contrato antes de entrar al expediente.
//
// Mientras el contrato espera tu firma, abrirlo te trae aquí y no al
// expediente. La razón es que ahí dentro la decisión quedaba enterrada
// entre la barra de avance y la lista de requisitos, y lo primero que
// uno ve debería ser lo que tiene que decidir.
//
// Es una PANTALLA y no un modal, por tres motivos:
//
//   - un contrato se lee, y leer dentro de una caja con la página
//     asomando por detrás es incómodo, en un teléfono más;
//   - un modal se puede cerrar, y entonces acabas en el expediente sin
//     haber decidido, que es justo lo que esto viene a evitar; y si no
//     se puede cerrar, es una trampa sin salida;
//   - la reacción normal ante un contrato es «déjame consultarlo», así
//     que tiene que haber una puerta para irse y volver.
//
// Lo que manda es el ESTADO, no un «ya lo vio» guardado: mientras el
// contrato espere tu firma, esta pantalla aparece, da igual el
// dispositivo o si borraste los datos del navegador.

import { IcoBack, Icon } from "../ui/iconos";
import { renderModales } from "../modales";
import { archivosDe, fmtMonto } from "../smartContract";
import { fmtFull } from "../nucleo/formato";

export function renderRevision(ctx){
  const {
    acu, d, decision, goHome, modal, notif, setModal, setPass, user,
  } = ctx;

  const reqs = d.requisitos || [];
  const rechazado = decision === "rechazado";

  return (<>
    <nav className="nav">
      <div className="nav-id">
        <button className="icon-btn" onClick={goHome} title="Decidir luego">
          <IcoBack/>
        </button>
        ID:<span className="num">{d.numId||d.id}</span>
        <span className="rol-tag">{rechazado ? "No aceptado" : "Para firmar"}</span>
      </div>
      <div className="nav-actions">
        <button className="btn btn-tertiary" onClick={goHome}>Decidir luego</button>
      </div>
    </nav>

    <div className="rev">

      {rechazado ? (
        <div className="rev-aviso mal">
          <Icon n="block" size={20}/>
          <div>
            <strong>No aceptaste este contrato</strong>
            <div className="rev-aviso-d">
              Dijiste que no el {fmtFull(acu.rechazo?.fecha)}
              {acu.rechazo?.motivo && <>, por esto: <em>«{acu.rechazo.motivo}»</em></>}.
              {acu.rechazo?.detalle && <><br/>Y añadiste: <em>«{acu.rechazo.detalle}»</em></>}
              <br/>
              Quien te lo mandó ya lo sabe. Si lo corrige, te llegará una
              versión nueva y podrás decidir otra vez sobre ella.
            </div>
          </div>
        </div>
      ) : (
        <div className="rev-aviso">
          <Icon n="lock" size={20}/>
          <div>
            <strong>Este contrato está fijo</strong>
            <div className="rev-aviso-d">
              No puede cambiar mientras lo lees. Si quien te lo mandó necesita
              cambiar algo, te llegará uno nuevo y este quedará sin efecto.
            </div>
          </div>
        </div>
      )}

      {/* Ya decidió: no tiene sentido volver a pedírselo. */}
      <div className="rev-de">
        {rechazado
          ? `Esto es lo que te mandó ${d.owner || "la otra parte"}`
          : `${acu.paraNombre ? `Hola ${acu.paraNombre}. ` : ""}${d.owner || "Quien te lo mandó"} te pide que aceptes este contrato`}
      </div>
      <h1 className="rev-t">{d.title}</h1>

      <div className="rev-datos">
        {d.montoTotal!=null && (
          <div className="rev-dato">
            <div className="rev-dato-l">Importe</div>
            <div className="rev-dato-v">{fmtMonto(d.montoTotal, d.moneda||"MXN")}</div>
          </div>
        )}
        {d.fechaLimite && (
          <div className="rev-dato">
            <div className="rev-dato-l">Fecha límite</div>
            <div className="rev-dato-v">{d.fechaLimite}</div>
          </div>
        )}
        {(d.partes||[]).length>0 && (
          <div className="rev-dato">
            <div className="rev-dato-l">Partes</div>
            <div className="rev-dato-v chico">
              {d.partes.map((p,i)=>(
                <div key={i}>{p.nombre} <span className="rev-rol">· {p.rol}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* El texto completo, no un resumen: si sólo ve los montos, lo
          primero que va a querer es leer la letra, y si no se la damos
          aquí se va a buscarla y se pierde la decisión. */}
      <div className="rev-sec">
        <div className="rev-sec-t">El contrato</div>
        <div className="paper-ro rev-texto">
          {d.content || "Este contrato no tiene texto escrito."}
        </div>
      </div>

      {reqs.length>0 && (
        <div className="rev-sec">
          <div className="rev-sec-t">Qué se va a comprobar</div>
          <div className="rev-reqs">
            {reqs.map((r,i)=>(
              <div key={r.id} className="rev-req">
                <span className="rev-req-n">{i+1}</span>
                <div className="rev-req-b">
                  <div className="rev-req-t">{r.titulo}</div>
                  {r.descripcion && <div className="rev-req-d">{r.descripcion}</div>}
                </div>
                <span className="rev-req-m">
                  {r.monto!=null ? fmtMonto(r.monto, d.moneda||"MXN")
                   : (r.tipo||"comprobante")==="entregable" ? "entregable" : "comprobante"}
                  {archivosDe(r).length>0 && ` · ${archivosDe(r).length} ya adjunto${archivosDe(r).length===1?"":"s"}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!rechazado && (
        <div className="rev-acts">
          <button className="btn btn-primary"
            onClick={()=>{ setPass(""); setModal({t:"aceptar"}); }}>
            Aceptar y firmar
          </button>
          <button className="btn btn-secondary" onClick={()=>setModal({t:"rechazar"})}>
            No acepto
          </button>
          <span className="rev-acts-n">
            Firmas como <strong>{user}</strong>. Queda registrada la fecha.
          </span>
        </div>
      )}

    </div>

    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
    {modal && renderModales(ctx)}
  </>);
}
