// Vista del contrato inteligente: fases, montos, requisitos, línea de tiempo.

import { Icon } from "../ui/iconos";
import { LIMITE_MB, isPreviewable } from "../storage";
import { Timeline } from "../ui/Timeline";
import {
  aidDe,
  archivosDe,
  calcularMontos,
  claveDup,
  comprobadoDe,
  destinoDuplicado,
  duplicados,
  duplicadosDe,
  estadoFases,
  expedienteStatus,
  faseActual,
  fmtMonto,
  resumenConsultas,
  resumenVinculos,
  solicitudesDe,
} from "../smartContract";
import { fmtFecha, fmtFull, fmtShort } from "../nucleo/formato";
import { SelloFiscal } from "../ui/SelloFiscal";
import { CampoEnlace } from "../ui/CampoEnlace";
import { esEnlace } from "../nucleo/enlaces";

export function renderExpediente(ctx){
  const {
    attachEvidence, bioCreds, bioOk, cancelarSolicitud, d, docs, faseSel, filesOpen,
    focoDup, getFile, irADuplicado, openDoc, removeEvidence, saving, setFaseSel,
    setFilesOpen, setFocoDup, setMIn, setModal, setMontoReq, setPass,
    uid, verifVin, vinculos,
    puedo, puedoSubirA, verificarFiscal, verificandoFiscal, setEnlaceNuevo,
    setShareModo, setShareTodo, setShareReqs, anclajesPorHash,
    abrirEnlace, cerrarEnlace, guardarEnlace,
    enlReq, enlUrl, enlNom, enlErr, enlBusy, setEnlUrl, setEnlNom,
  } = ctx;
  const st = expedienteStatus(d);
  const mt = calcularMontos(d);   // ← NUEVO: derivado, no almacenado
  const rv = resumenVinculos(vinculos);   // ← NUEVO
  // ← ACTUALIZADO: se usa la versión viva del expediente abierto, no la
  // copia de la lista, para que un vínculo recién hecho ya cuente.
  const docsVivos = docs.some(x=>x.id===d.id) ? docs.map(x=>x.id===d.id?d:x) : [...docs, d];
  const dups = duplicadosDe(duplicados(docsVivos), d.id);
  const dupPorClave = Object.fromEntries(dups.map(g=>[g.clave, g]));
  const focoGrupo = focoDup ? dupPorClave[focoDup] : null;
  const fases = estadoFases(d);          // ← NUEVO
  const fActual = faseActual(d);         // ← NUEVO
  const faseSelOk = faseSel && fases.some(f=>f.id===faseSel) ? faseSel : null;
  return (<div className="exp">
    <div className={`exp-head ${st.estado}`}>
      <div className="exp-bar-wrap">
        <div className="exp-bar"><div className="exp-fill" style={{width:`${st.porcentaje}%`}}/></div>
        <span className="exp-count">{st.cumplidos} de {st.total}</span>
      </div>
      <div className="exp-state">
        {st.completo ? "Expediente completo"
         : st.vencido ? "Fecha límite vencida"
         : st.dias!=null ? `Faltan ${st.dias} día${st.dias===1?"":"s"}`
         : "En curso"}
        {/* ← NUEVO: el siguiente hito, si vence antes que el contrato */}
        {!st.completo && fActual && fActual.dias!=null && (
          <span className={`exp-hito ${fActual.vencida?"mal":""}`}>
            {" · "}Fase {fActual.n} «{fActual.titulo}»{" "}
            {fActual.vencida ? `venció hace ${Math.abs(fActual.dias)} d`
              : fActual.dias===0 ? "vence hoy" : `en ${fActual.dias} d`}
          </span>
        )}
      </div>
    </div>

    {/* ← NUEVO: alerta de integridad. Sólo aparece cuando hay algo
        que reportar; el caso normal no dice nada. */}
    {(rv.alterados>0 || rv.faltantes>0) && (
      <div className="vin-alerta">
        <Icon n="warning" size={20}/>
        <div>
          <strong>
            {rv.alterados>0 && `${rv.alterados} comprobante${rv.alterados===1?"":"s"} con la cadena reescrita`}
            {rv.alterados>0 && rv.faltantes>0 && " · "}
            {rv.faltantes>0 && `${rv.faltantes} sin acceso`}
          </strong>
          <div className="vin-alerta-s">
            La huella que se registró al adjuntarlos ya no corresponde con su historia actual.
          </div>
        </div>
      </div>
    )}
    {/* ← NUEVO: el mismo archivo comprobando dos gastos distintos */}
    {/* ← NUEVO: fases del contrato, cada una con su propio contador.
        Tocar una fase filtra los requisitos que le corresponden. */}
    {fases.length>0 && (
      <div className="fases">
        <div className="fases-h">
          <span className="fases-t">Fases del contrato</span>
          <span className="adj-n">{fases.filter(f=>f.completa).length}/{fases.length}</span>
        </div>
        <div className="fases-lista">
          {fases.map(f=>{
            const actual = fActual && fActual.id===f.id;
            return (
              <button key={f.id}
                className={`fase ${f.estado} ${actual?"actual":""} ${faseSelOk===f.id?"sel":""}`}
                onClick={()=>setFaseSel(faseSelOk===f.id ? null : f.id)}>
                <span className="fase-num">{f.completa ? "✓" : f.n}</span>
                <span className="fase-b">
                  <span className="fase-t">{f.titulo}</span>
                  <span className="fase-m">
                    {f.fechaLimite ? fmtFecha(f.fechaLimite) : "Sin fecha"}
                    {!f.sinRequisitos && ` · ${f.hechos}/${f.total}`}
                  </span>
                  <span className={`fase-cont ${f.estado}`}>
                    {f.completa
                      ? (f.retraso ? `Cumplida con ${f.retraso} d de retraso` : "Cumplida a tiempo")
                      : f.vencida ? `Venció hace ${Math.abs(f.dias)} día${Math.abs(f.dias)===1?"":"s"}`
                      : f.dias==null ? "Sin fecha límite"
                      : f.dias===0 ? "Vence hoy"
                      : `Faltan ${f.dias} día${f.dias===1?"":"s"}`}
                  </span>
                  {f.sinRequisitos && <span className="fase-aviso">Sin comprobantes asignados</span>}
                </span>
              </button>
            );
          })}
        </div>
        {faseSelOk && (
          <div className="fases-filtro">
            Mostrando sólo los comprobantes de la fase {fases.find(f=>f.id===faseSelOk)?.n}.
            <button className="btn btn-tertiary" onClick={()=>setFaseSel(null)}>Ver todos</button>
          </div>
        )}
      </div>
    )}

    {/* ← NUEVO: anuncio cuando se llega desde un aviso de duplicado */}
    {focoGrupo && (
      <div className="dup-foco-banner">
        <div className="dup-foco-h">
          <Icon n="content_copy" size={20}/>
          <strong>
            «{focoGrupo.nombre}» está adjuntado {focoGrupo.veces} veces
          </strong>
          <button className="smart-x" title="Cerrar" onClick={()=>setFocoDup(null)}>×</button>
        </div>
        <p>
          {focoGrupo.alcance==="entre-expedientes"
            ? "El mismo comprobante está justificando gastos en expedientes distintos. Revisa cuál de los dos le corresponde y retíralo del otro."
            : "Está adjunto en dos requisitos de este mismo expediente, así que su importe se cuenta dos veces en el presupuesto."}
          {focoGrupo.monto!=null && ` Importe: ${fmtMonto(focoGrupo.monto, d.moneda||"MXN")} cada vez.`}
        </p>
        <div className="dup-lugares">
          {focoGrupo.ubicaciones.map((u,i)=>(
            u.docId===d.id
              ? <span key={i} className="dup-lugar aqui">Aquí · {u.reqTitulo||u.tipo}</span>
              : <button key={i} className="dup-lugar" onClick={()=>irADuplicado(focoGrupo, u)}>
                  {u.docTitulo}{u.reqTitulo ? ` → ${u.reqTitulo}` : ""} ↗
                </button>
          ))}
        </div>
      </div>
    )}

    {/* ← ACTUALIZADO: cada lugar del aviso es un enlace */}
    {dups.length>0 && !focoGrupo && (
      <div className="vin-alerta">
        <Icon n="content_copy" size={20}/>
        <div style={{minWidth:0,flex:1}}>
          <strong>
            {dups.length} comprobante{dups.length===1?"":"s"} con huella repetida
          </strong>
          {dups.map(g=>(
            <div key={g.clave} className="dup-linea">
              «{g.nombre}»{g.numId && ` (${g.numId})`} aparece {g.veces} veces
              {g.monto!=null && ` (${fmtMonto(g.monto, d.moneda||"MXN")} c/u)`}
              {g.alcance==="entre-expedientes" &&
                <span className="dup-grave"> en expedientes distintos</span>}
              <div className="dup-lugares">
                {g.ubicaciones.map((u,i)=>(
                  u.docId===d.id
                    ? <button key={i} className="dup-lugar aqui" onClick={()=>setFocoDup(g.clave)}>
                        Aquí · {u.reqTitulo||u.tipo}
                      </button>
                    : <button key={i} className="dup-lugar" onClick={()=>irADuplicado(g, u)}>
                        {u.docTitulo}{u.reqTitulo ? ` → ${u.reqTitulo}` : ""} ↗
                      </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {rv.ampliados>0 && rv.alterados===0 && rv.faltantes===0 && (
      <div className="vin-nota">
        <Icon n="update" size={18}/>
        {rv.ampliados} documento{rv.ampliados===1?"":"s"} {rv.ampliados===1?"tuvo":"tuvieron"} actividad
        nueva desde que se {rv.ampliados===1?"adjuntó":"adjuntaron"}. Su historia sigue intacta.
      </div>
    )}

    {d.resumen && <p className="exp-sum">{d.resumen}</p>}

    {/* ← NUEVO: aritmética del expediente. Se recalcula al abrir,
        nunca se guarda: así no puede quedar desactualizada. */}
    {mt.base!=null && (
      <div className={`mnt ${mt.excedido?"excedido":""}`}>
        <div className="mnt-fila">
          <div className="mnt-dato">
            <span className="mnt-lbl">{mt.contrato!=null?"Contrato":"Presupuesto de requisitos"}</span>
            <span className="mnt-val">{fmtMonto(mt.base, mt.moneda)}</span>
          </div>
          <div className="mnt-dato">
            <span className="mnt-lbl">Comprobado</span>
            <span className="mnt-val fuerte">{fmtMonto(mt.comprobado ?? 0, mt.moneda)}</span>
          </div>
          <div className="mnt-dato">
            <span className="mnt-lbl">{mt.excedido?"Excedente":"Restante"}</span>
            <span className={`mnt-val ${mt.excedido?"malo":""}`}>
              {fmtMonto(Math.abs(mt.restante ?? mt.base), mt.moneda)}
            </span>
          </div>
        </div>

        <div className="mnt-bar">
          <div className="mnt-fill" style={{width:`${Math.min(100, mt.porcentaje||0)}%`}}/>
        </div>
        <div className="mnt-pie">
          {mt.porcentaje!=null && `${mt.porcentaje}% comprobado`}
          {mt.sinImporte>0 && ` · ${mt.sinImporte} comprobante${mt.sinImporte===1?"":"s"} sin importe anotado`}
        </div>

        {mt.excedido && (
          <div className="mnt-aviso malo">
            Lo comprobado supera el monto del contrato en {fmtMonto(Math.abs(mt.restante), mt.moneda)}.
          </div>
        )}
        {mt.descuadre!=null && (
          <div className="mnt-aviso">
            Los requisitos suman {fmtMonto(mt.esperado, mt.moneda)}, pero el contrato dice {fmtMonto(mt.contrato, mt.moneda)}.
            Diferencia de {fmtMonto(Math.abs(mt.descuadre), mt.moneda)}.
          </div>
        )}
        {mt.desviaciones.map(dv=>(
          <div key={dv.id} className="mnt-aviso">
            «{dv.titulo}»: se pactó {fmtMonto(dv.esperado, mt.moneda)} y se comprobó {fmtMonto(dv.real, mt.moneda)}
            {dv.piezas>1 && ` en ${dv.piezas} comprobantes`}
            {" "}({dv.dif>0?"+":"−"}{fmtMonto(Math.abs(dv.dif), mt.moneda)}).
          </div>
        ))}
      </div>
    )}

    <div className="exp-chips">
      {d.fechaLimite && <span className="chip">Límite: {d.fechaLimite}</span>}
      {d.montoTotal!=null && <span className="chip">{d.moneda||"MXN"} ${d.montoTotal.toLocaleString("es-MX")}</span>}
      {(d.partes||[]).map((p,i)=><span key={i} className="chip">{p.rol}: {p.nombre}</span>)}
    </div>

    {/* ← ACTUALIZADO: cada requisito admite varios comprobantes */}
    {(d.requisitos||[]).map((r,i)=>{
      if(faseSelOk && r.fase!==faseSelOk) return null;   // ← NUEVO: filtro por fase
      const lista = archivosDe(r);
      const suma  = comprobadoDe(r);
      const listo = lista.length>0;
      const faseR = fases.find(f=>f.id===r.fase);          // ← NUEVO
      return (
      <div key={r.id} className={`exp-item ${listo?"cumplido":"pendiente"}`}>
        <div className="exp-check">{listo ? "✓" : i+1}</div>
        <div className="exp-item-b">
          <div className="exp-item-t">{r.titulo}</div>
          <div className="exp-item-d">{r.descripcion}</div>
          <div className="smart-tags">
            <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
            {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
            {r.fechaLimite && <span className="tag">{r.fechaLimite}</span>}
            {!r.obligatorio && <span className="tag">opcional</span>}
            {lista.length>1 && <span className="tag">{lista.length} comprobantes</span>}
            {/* ← NUEVO */}
            {faseR && <span className={`tag t-fase ${faseR.vencida && !listo ? "mal":""}`}>
              Fase {faseR.n} · {faseR.titulo}</span>}
          </div>

          {/* ← NUEVO: avance del requisito cuando el contrato fija un monto */}
          {r.monto!=null && suma!=null && (
            <div className={`req-avance ${suma>r.monto+1?"sobre":suma>=r.monto-1?"listo":""}`}>
              {fmtMonto(suma, d.moneda||"MXN")} de {fmtMonto(r.monto, d.moneda||"MXN")}
              {suma < r.monto-1 && ` · faltan ${fmtMonto(r.monto-suma, d.moneda||"MXN")}`}
              {suma > r.monto+1 && ` · ${fmtMonto(suma-r.monto, d.moneda||"MXN")} por encima`}
            </div>
          )}

          {lista.map(a=>{
            const aid = aidDe(a);
            return (
            <div key={aid}
              id={focoDup && claveDup(a)===focoDup ? "foco-dup" : undefined}
              className={`exp-file ${vinculos[aid]?.estado==="alterado"?"vin-malo":""}
                ${dupPorClave[claveDup(a)]?"es-dup":""} ${focoDup && claveDup(a)===focoDup?"dup-foco":""}`}>
              <div className="exp-file-n">
                {a.origen==="interno" && <span className="tag" style={{marginRight:6}}>chaindoc</span>}
                {/* ← NUEVO: el enlace se marca aparte del archivo porque
                    prueba otra cosa, y quien lo lea tiene que notarlo
                    antes de leer el nombre. */}
                {esEnlace(a) && <span className="tag tag-enl" style={{marginRight:6}}>enlace</span>}
                {a.nombre}
              </div>
              {esEnlace(a) && (
                <a className="exp-url" href={a.url} target="_blank"
                   rel="noopener noreferrer nofollow" title={a.url}>
                  <Icon n="link" size={15}/> <span>{a.url}</span>
                </a>
              )}
              {/* ← NUEVO: marca el comprobante repetido y lleva a su otra aparición */}
              {dupPorClave[claveDup(a)] && (()=>{
                const g = dupPorClave[claveDup(a)];
                const otro = destinoDuplicado(g, d.id);
                return (
                  <div className="dup-tag-row">
                    <span className="dup-tag">Adjuntado {g.veces} veces</span>
                    {otro && (
                      <button className="dup-lugar" onClick={()=>irADuplicado(g, otro)}>
                        Ver en «{otro.docTitulo}» ↗
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* ← NUEVO: marca el comprobante repetido y lleva a su otra aparición */}
              {dupPorClave[claveDup(a)] && (()=>{
                const g = dupPorClave[claveDup(a)];
                const otro = destinoDuplicado(g, d.id);
                return (
                  <div className="dup-tag-row">
                    <span className="dup-tag">Adjuntado {g.veces} veces</span>
                    {otro && (
                      <button className="dup-lugar" onClick={()=>irADuplicado(g, otro)}>
                        Ver en «{otro.docTitulo}» ↗
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="exp-file-m">
                {a.origen==="interno"
                  ? `${a.numId} · ${a.bloques} bloques al adjuntar · ${fmtFull(a.subidoEn)} · ${a.subidoPor}`
                  : esEnlace(a)
                    ? `${a.host || "enlace"} · entregado ${fmtFull(a.subidoEn)} · ${a.subidoPor}`
                    : `${(a.tam/1024).toFixed(0)} KB · ${fmtFull(a.subidoEn)} · ${a.subidoPor}`}
              </div>
              {/* La huella de un enlace es la de su DIRECCIÓN, no la de
                  lo que haya en ella. Decirlo en la etiqueta evita que
                  un SHA-256 parezca prometer más de lo que prueba. */}
              <div className="exp-file-h">
                {esEnlace(a) ? "SHA-256 de la dirección " : "SHA-256 "}{a.hash}
              </div>
              {esEnlace(a) && (
                <div className="exp-url-nota">
                  Queda probada la dirección y su fecha de entrega ({fmtFull(a.subidoEn)}).
                  Lo que haya en ella hoy puede ser distinto.
                </div>
              )}

              {/* ← NUEVO (Etapa 4): lo que dijo el SAT de esta factura.
                  No es opinión nuestra: es la respuesta del SAT, fechada
                  y guardada como validación de la operación. */}
              {a.fiscal && <SelloFiscal f={a.fiscal} aid={aid}
                onVerificar={verificarFiscal} ocupado={verificandoFiscal===aid}/>}

              {/* ← NUEVO: qué pasó con este documento desde que se adjuntó */}
              {vinculos[aid] && (
                <div className={`vin vin-${vinculos[aid].estado}`}>
                  <Icon n={
                    vinculos[aid].estado==="vigente"  ? "verified" :
                    vinculos[aid].estado==="ampliado" ? "update"   :
                    vinculos[aid].estado==="alterado" ? "warning"  : "help"
                  } size={16}/>
                  <span>{vinculos[aid].texto}</span>
                </div>
              )}
              {verifVin && a.origen==="interno" && !vinculos[aid] && (
                <div className="vin vin-cargando">
                  <span className="mini-spin"/> Verificando integridad…
                </div>
              )}

              <div className="exp-monto">
                <span className="mnt-lbl">Importe:</span>
                <input className="exp-monto-in" inputMode="decimal" placeholder="0.00"
                  defaultValue={a.monto ?? ""}
                  onBlur={e=>setMontoReq(r.id, aid, e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&e.currentTarget.blur()} />
                {a.origen==="interno" && a.monto!=null &&
                  <span className="tag">leído del documento</span>}
              </div>

              {a.origen==="interno" && (
                <button className="btn btn-tertiary" style={{marginRight:8}}
                  onClick={()=>openDoc(a.docId)}>Abrir documento</button>
              )}
              {esEnlace(a) && (
                <a className="btn btn-tertiary" style={{marginRight:8}} href={a.url}
                   target="_blank" rel="noopener noreferrer nofollow">Abrir enlace</a>
              )}
              <button className="btn btn-tertiary"
                onClick={()=>removeEvidence(r.id, aid)}>Retirar</button>
            </div>
            );
          })}

          {/* ← NUEVO: a quién se le pidió este comprobante */}
          {solicitudesDe(d, r.id).map(sl=>(
            <div key={sl.sid} className="sol-row">
              <Icon n="forward_to_inbox" size={16}/>
              <div className="sol-b">
                <span className="sol-t">Pedido a {sl.paraNombre||sl.paraEmail}</span>
                {sl.mensaje && <div className="sol-m">«{sl.mensaje}»</div>}
                <div className="sol-d">{fmtShort(sl.creadaEn)}</div>
              </div>
              {sl.deUid===uid &&
                <button className="smart-x" title="Cancelar"
                  onClick={()=>cancelarSolicitud(sl.sid)}>×</button>}
            </div>
          ))}

          <div className="exp-acts">
            {/* ← ACTUALIZADO (Etapa 3): adjuntar sólo donde se puede.
                El aportador sube nada más a los requisitos que le
                pidieron; el lector y el auditor no suben nada. */}
            {(!puedoSubirA || puedoSubirA(r.id)) && (
              <label className="exp-up">
                <span>{listo ? "Agregar otro comprobante" : "Adjuntar comprobante"}</span>
                <input type="file" style={{display:"none"}} disabled={saving}
                  onChange={e=>{ attachEvidence(r.id, e.target.files?.[0]); e.target.value=""; }} />
              </label>
            )}
            {/* ← ACTUALIZADO (rediseño): antes había dos botones aquí
                —«Pedir a alguien» y «Pedir por enlace»— y un tercer
                camino arriba, en Compartir. Tres puertas al mismo
                cuarto. Ahora es una sola que abre Compartir con este
                requisito ya marcado; ahí se decide si va por correo o
                por enlace, y si quien lo recibe necesita cuenta. */}
            {/* ← NUEVO (10 oct): el tercer camino. Va junto a adjuntar
                y no escondido en un menú: para un requisito de tipo
                «entregable» suele ser LA forma de cumplirlo, no la
                excepción. */}
            {(!puedoSubirA || puedoSubirA(r.id)) && enlReq!==r.id && (
              <button className="exp-up como-btn" disabled={saving}
                onClick={()=>abrirEnlace(r.id)}>
                Entregar un enlace
              </button>
            )}
            {(!puedo || puedo("pedir")) && (
              <button className="exp-up como-btn"
                onClick={()=>{ setMIn(""); setEnlaceNuevo(null);
                               setShareModo("entregar"); setShareTodo(false);
                               setShareReqs([r.id]); setModal({t:"share"}); }}>
                Pedir este comprobante
              </button>
            )}
          </div>

          {enlReq===r.id && (
            <CampoEnlace
              url={enlUrl} nombre={enlNom} error={enlErr} ocupado={enlBusy}
              onUrl={setEnlUrl} onNombre={setEnlNom}
              onGuardar={guardarEnlace} onCancelar={cerrarEnlace}/>
          )}
        </div>
      </div>
      );
    })}

    {/* ← NUEVO: la historia de la operación, abierta por defecto.
        Es lo que distingue un expediente de una carpeta de archivos. */}
    <details className="exp-src tl-wrap" open>
      <summary>Línea de tiempo de la operación</summary>
      <Timeline chain={d.chain} anclajes={anclajesPorHash}/>
    </details>

    {/* ← NUEVO: quién ha consultado este expediente */}
    {(()=>{
      const cs = resumenConsultas(d.chain);
      if(!cs.length) return null;
      return (
        <details className="exp-src">
          <summary>Quién lo ha consultado ({cs.length})</summary>
          <div className="cons">
            {cs.map(c=>(
              <div key={c.email||c.quien} className="cons-row">
                <div className="avatar sm">{(c.quien||"?").slice(0,2).toUpperCase()}</div>
                <div className="cons-b">
                  <div className="cons-n">{c.quien}</div>
                  {c.email && <div className="cons-m">{c.email}</div>}
                </div>
                <div className="cons-d">
                  {fmtFull(c.ultima)}
                  {c.veces>1 && <div className="cons-v">{c.veces} días distintos</div>}
                </div>
              </div>
            ))}
            <p className="cons-nota">
              Se registra una consulta por persona y día, sólo en documentos compartidos.
            </p>
          </div>
        </details>
      );
    })()}

    <details className="exp-src">
      <summary>Ver contrato base</summary>
      <div className="paper-ro">{d.content}</div>
    </details>

    {/* ← NUEVO: documentos adjuntos, protegidos por el código de firma */}
    {(()=>{
      // ← ACTUALIZADO: se aplanan todos los comprobantes de todos los requisitos
      const conArchivo = (d.requisitos||[]).flatMap(r=>
        archivosDe(r).map(a=>({ ...a, reqId:r.id, reqTitulo:r.titulo })));
      return (
        <div className="adj">
          <div className="adj-h">
            <span className="adj-t">Documentos adjuntos</span>
            <span className="adj-n">{conArchivo.length}</span>
          </div>

          {conArchivo.length===0 ? (
            <p className="adj-empty">
              Aún no se ha adjuntado ningún comprobante. Límite actual: {LIMITE_MB} MB por archivo
              (PDF, imágenes o cualquier archivo, sin comprimir).
            </p>
          ) : !filesOpen ? (
            <div className="adj-lock">
              <p>
                Los comprobantes están protegidos. Verifica tu identidad
                {bioOk && bioCreds.length>0 ? " con tu biometría o tu código de firma" : " con tu código de firma"} para
                consultarlos y descargarlos.
              </p>
              <button className="btn btn-secondary"
                onClick={()=>{setPass("");setModal({t:"files"});}}>
                Desbloquear documentos
              </button>
            </div>
          ) : (
            <>
              {conArchivo.map(a=>(
                <div key={aidDe(a)} className="adj-row">
                  <div className="adj-row-b">
                    <div className="adj-row-t">{a.nombre}</div>
                    <div className="adj-row-m">
                      {a.reqTitulo} · {a.origen==="interno"
                        ? `documento ${a.numId}`
                        : `${(a.tam/1024).toFixed(0)} KB${a.comprimida?" (comprimida)":""}`}
                      {a.monto!=null && ` · ${fmtMonto(a.monto, d.moneda||"MXN")}`}
                      {" · "}{fmtFull(a.subidoEn)}
                    </div>
                    <div className="exp-file-h">SHA-256 {a.hash}</div>
                  </div>
                  <div className="adj-acts">
                    {a.origen==="interno" ? (
                      <button className="btn btn-tertiary" onClick={()=>openDoc(a.docId)}>Abrir</button>
                    ) : (<>
                      {isPreviewable(a.tipo) && (
                        <button className="btn btn-tertiary" onClick={()=>getFile(a,false)}>Ver</button>
                      )}
                      <button className="btn btn-tertiary" onClick={()=>getFile(a,true)}>Descargar</button>
                    </>)}
                  </div>
                </div>
              ))}
              <button className="btn btn-tertiary" style={{marginTop:10}}
                onClick={()=>setFilesOpen(false)}>Volver a bloquear</button>
            </>
          )}
        </div>
      );
    })()}
    {d.analisis && (
      <p className="exp-foot">
        Requisitos extraídos por {d.analisis.modelo} el {fmtFull(d.analisis.fecha)}.
        Revisados y aceptados por {d.owner}.
      </p>
    )}
  </div>);
}