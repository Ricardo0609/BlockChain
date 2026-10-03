// Modales del expediente: convertir y adjuntar a.
//
// ← ACTUALIZADO (rediseño): «Pedir un comprobante» vivía aquí como
// modal aparte. Se fue a Compartir, que ahora es el único lugar donde
// se decide quién entra y a qué.

import { Icon } from "../ui/iconos";
import {
  archivosDe,
  comprobadoDe,
  dondeEstaAdjunto,
  expedienteStatus,
} from "../smartContract";
import { fmtFecha } from "../nucleo/formato";

export function modalExpediente(ctx){
  const {
    confirmarConversion, d, docs, dropFase, dropReq, exps, iniciarConversion, linkBusy,
    linkErr, linkExp, linkSitios, linkToExpediente, modal, openDoc,
    saving, setLinkErr, setLinkExp, setModal, setSmartErr, setSmartRes,
    smartBusy, smartErr, smartMsg, smartRes, title, uid,
  } = ctx;
  // ← NUEVO: revisar lo que propone la IA antes de convertir el documento
  if(modal.t==="convertir") return (
    <div className="ov" onClick={()=>{if(!smartBusy&&!saving)setModal(null);}}><div className="modal wide" onClick={e=>e.stopPropagation()}>
      <h2>Convertir a contrato inteligente</h2>
      <p className="sub">
        La IA lee <strong>{title||d.title}</strong> y propone los comprobantes que habrá que
        reunir. Revísalos antes de confirmar: estos requisitos regirán el expediente.
      </p>

      {smartBusy && (<>
        <div className="imp-msg"><span className="mini-spin"/>{smartMsg || "Leyendo el contrato…"}</div>
        <div className="imp-bar" style={{marginTop:12}}><div className="imp-fill indet"/></div>
      </>)}

      {smartErr && !smartBusy && (
        <div className="imp-error">
          {smartErr}
          <div style={{marginTop:10}}>
            <button className="btn btn-secondary" style={{padding:"8px 16px",fontSize:14}}
              onClick={iniciarConversion}>Reintentar</button>
          </div>
        </div>
      )}

      {smartRes && !smartBusy && (
        <div className="smart-res">
          <div className="smart-res-h">
            <div>
              <div className="smart-res-t">{smartRes.titulo}</div>
              <div className="smart-res-s">{smartRes.resumen}</div>
            </div>
          </div>
          <div className="smart-chips">
            {smartRes.fechaLimite && <span className="chip">Límite: {smartRes.fechaLimite}</span>}
            {smartRes.montoTotal!=null && <span className="chip">{smartRes.moneda} ${smartRes.montoTotal.toLocaleString("es-MX")}</span>}
            {smartRes.partes.map((p,i)=><span key={i} className="chip">{p.rol}: {p.nombre}</span>)}
          </div>
          {/* ← NUEVO: fases detectadas en el contrato */}
            {(smartRes.fases||[]).length>0 && (<>
              <div className="smart-list-t">Fases del contrato ({smartRes.fases.length})</div>
              <div className="rev-fases">
                {smartRes.fases.map((f,i)=>(
                  <div key={f.id} className="rev-fase">
                    <span className="fase-num">{i+1}</span>
                    <div className="rev-fase-b">
                      <div className="rev-fase-t">{f.titulo}</div>
                      <div className="rev-fase-m">
                        {f.fechaLimite ? `Límite ${fmtFecha(f.fechaLimite)}` : "Sin fecha en el contrato"}
                        {` · ${smartRes.requisitos.filter(r=>r.fase===f.id).length} comprobante(s)`}
                      </div>
                    </div>
                    <button className="smart-x" onClick={()=>dropFase(f.id)} title="Quitar fase">×</button>
                  </div>
                ))}
              </div>
            </>)}
            <div className="smart-list-t">Comprobantes que se pedirán ({smartRes.requisitos.length})</div>
          {smartRes.requisitos.map((r,i)=>(
            <div key={r.id} className="smart-item">
              <span className="smart-num">{i+1}</span>
              <div className="smart-item-b">
                <div className="smart-item-t">{r.titulo}</div>
                <div className="smart-item-d">{r.descripcion}</div>
                <div className="smart-tags">
                  <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                  {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                  {r.fechaLimite && <span className="tag">{r.fechaLimite}</span>}
                  {!r.obligatorio && <span className="tag">opcional</span>}
                  {r.fase && (smartRes.fases||[]).some(f=>f.id===r.fase) &&
                    <span className="tag t-fase">Fase {(smartRes.fases||[]).findIndex(f=>f.id===r.fase)+1}</span>}
                </div>
              </div>
              <button className="smart-x" onClick={()=>dropReq(r.id)} title="Quitar">×</button>
            </div>
          ))}
          <p className="imp-hint" style={{marginTop:14}}>
            El documento no se duplica: conserva su ID, su historial y sus firmas.
            La conversión queda registrada como un bloque más de su cadena.
          </p>
        </div>
      )}

      <div className="modal-row">
        <button className="btn btn-secondary" disabled={smartBusy||saving}
          onClick={()=>{setModal(null);setSmartRes(null);setSmartErr("");}}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmarConversion}
          disabled={!smartRes || !smartRes.requisitos.length || smartBusy || saving}>
          {saving ? "Convirtiendo…" : "Convertir"}
        </button>
      </div>
    </div></div>
  );

  if(modal.t==="linkTo") return (
    <div className="ov" onClick={()=>{if(!linkBusy)setModal(null);}}><div className="modal wide" onClick={e=>e.stopPropagation()}>
      <h2>Adjuntar a un expediente</h2>

      {!linkExp ? (<>
        {/* ← NUEVO: si ya justifica un contrato, no puede justificar otro */}
        {exps!==null && linkSitios.length>0 && (()=>{
          const que = d.tplId==="recibo" ? "Este recibo" : d.tplId==="factura" ? "Esta factura" : "Este documento";
          return (
            <div className="bloqueo">
              <div className="bloqueo-h">
                <Icon n="block" size={20}/>
                <strong>{que} ya está adjuntado a un contrato</strong>
              </div>
              <p>
                Un comprobante sólo puede justificar un contrato. Si lo adjuntaras a otro,
                el mismo gasto quedaría comprobado dos veces. Para moverlo, primero
                retíralo de donde está.
              </p>
              <div className="dup-lugares">
                {linkSitios.map((x,i)=>(
                  <button key={i} className="dup-lugar"
                    onClick={()=>{ setModal(null); openDoc(x.expId, `doc:${d.id}`); }}>
                    {x.expTitulo} → {x.reqTitulo} ↗
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <p className="sub">
          {linkSitios.length
            ? "Sólo puedes agregarlo a otro requisito del mismo contrato."
            : "Elige el contrato inteligente donde este documento servirá como comprobante."}
        </p>
        {exps===null ? (
          <div className="imp-msg"><span className="mini-spin"/>Buscando expedientes…</div>
        ) : exps.length===0 ? (
          <p className="adj-empty">
            Todavía no tienes contratos inteligentes. Crea uno desde «Crear documento» → «Contrato inteligente».
          </p>
        ) : (
          <div className="link-list">
            {exps.map(x=>{
              const st = expedienteStatus(x);
              const ajeno = x.ownerUid!==uid;
              // ← NUEVO: con el documento ya adjunto, sólo queda disponible su propio contrato
              const bloqueado = linkSitios.length>0 && !linkSitios.some(z=>z.expId===x.id);
              return (
                <div key={x.id} className={`link-row ${bloqueado?"bloqueado":""}`}
                  aria-disabled={bloqueado}
                  onClick={()=>{ if(!bloqueado) setLinkExp(x); }}>
                  <div className="link-row-b">
                    <div className="link-row-t">{x.title}</div>
                    <div className="link-row-m">
                      {st.cumplidos}/{st.total} comprobantes
                      {x.fechaLimite && ` · límite ${x.fechaLimite}`}
                      {ajeno && ` · compartido por ${x.owner}`}
                    </div>
                  </div>
                  {bloqueado
                    ? <span className="chip chip-bloq">No disponible</span>
                    : <span className={`chip chip-exp ${st.estado}`}>
                        {st.completo ? "Completo" : st.vencido ? "Vencido" : `${st.porcentaje}%`}
                      </span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </>) : (<>
        <p className="sub">
          ¿Qué requisito de <strong>{linkExp.title}</strong> cumple este documento?
        </p>
        {linkErr && <div className="share-err">{linkErr}</div>}

        {/* ← NUEVO: avisa ANTES de adjuntar si este documento ya está
            comprobando un gasto en otro expediente. */}
        {(()=>{
          const otros = dondeEstaAdjunto(d.id, docs).filter(s=>s.expId!==linkExp.id);
          if(!otros.length) return null;
          return (
            <div className="share-err" style={{marginBottom:14}}>
              <strong>Este documento ya comprueba otro gasto.</strong>
              <div style={{marginTop:4,fontWeight:400}}>
                Si lo adjuntas aquí también, el mismo comprobante justificará dos operaciones distintas.
              </div>
              {/* ← ACTUALIZADO: cada lugar lleva a ese expediente */}
              <div className="dup-lugares">
                {otros.map((x,i)=>(
                  <button key={i} className="dup-lugar"
                    onClick={()=>{ setModal(null); openDoc(x.expId, `doc:${d.id}`); }}>
                    {x.expTitulo} → {x.reqTitulo} ↗
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="link-list">
          {/* ← ACTUALIZADO: un requisito con comprobantes ya no se ve
              bloqueado; ahora se le pueden sumar más. */}
          {linkExp.requisitos.map((r,i)=>{
            const lista = archivosDe(r);
            const suma  = comprobadoDe(r);
            const listo = lista.length>0;
            const mio   = lista.some(a=>a.docId===d.id);
            return (
            <div key={r.id}
              className={`link-row ${mio?"ocupado":""}`}
              onClick={()=>{ if(!linkBusy && !mio) linkToExpediente(linkExp,r.id); }}>
              <span className="smart-num">{listo?"✓":i+1}</span>
              <div className="link-row-b">
                <div className="link-row-t">{r.titulo}</div>
                <div className="link-row-m">
                  {mio
                    ? "Este documento ya está adjuntado aquí"
                    : listo
                      ? `Ya tiene ${lista.length} comprobante${lista.length===1?"":"s"} — se agregará uno más`
                      : r.descripcion}
                </div>
                <div className="smart-tags">
                  <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                  {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                  {/* ← NUEVO: cuánto falta para cubrir el monto pactado */}
                  {r.monto!=null && suma!=null && (
                    <span className={`tag ${suma>=r.monto-1?"t-documento":""}`}>
                      {suma>=r.monto-1
                        ? "cubierto"
                        : `faltan $${(r.monto-suma).toLocaleString("es-MX")}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
        <div className="modal-row">
          <button className="btn btn-secondary" disabled={linkBusy}
            onClick={()=>{setLinkExp(null);setLinkErr("");}}>Atrás</button>
          {linkBusy && <span className="imp-msg"><span className="mini-spin"/>Adjuntando…</span>}
        </div>
      </>)}
    </div></div>
  );

  return null;
}