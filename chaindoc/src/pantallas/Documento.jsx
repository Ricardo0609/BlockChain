// Pantalla de un documento: bloqueo, papel, firmas, adjuntos e historial.

import { FORMS } from "../ui/formularios";
import { FormDoc } from "../ui/FormDoc";
import { IcoBack, IcoEye, IcoFinger, Icon } from "../ui/iconos";
import { Timeline } from "../ui/Timeline";
import { enlaceDeBloque } from "../nucleo/anclaje";
import { aiConfigured, dondeEstaAdjunto, hayQueRevisarRFCs } from "../smartContract";
import { deviceLabel } from "../biometric";
import { fmtFull, fmtShort } from "../nucleo/formato";
import { renderExpediente } from "./Expediente";
import { renderMenu } from "./MenuLateral";
import { renderModales } from "../modales";
import { selloUrl } from "../nucleo/catalogos";
import { selloDe, firmaDe } from "../nucleo/bloques";
import { estaProtegido } from "../nucleo/datos";
import { ESTILOS } from "../ui/estilos";
export function renderDocumento(ctx){
  const {
    MAX_IMGS, abrirProtegido, addImage, bioBusy, bioCreds, bioOk, content, d, doVerify,
    docs, editMode, exportarPaquete, fields, getFile, goHome, histOpen, histTab, ocupado,
    iniciarConversion, lockInput, menuOpen, modal, notif, openDoc, openExpedientes,
    puedeConvertir, removeImage, save, saving, setContent, setDirty, setEdit, setFields,
    setHist, setHistTab, setLinkErr, setLinkExp, setLock, setLockInput, setMIn, setMenu,
    setModal, setPass, setShowHashes, setTitle, showHashes, smartBusy, title, uid,
    setEnlaceNuevo, setShareModo, setShareTodo, setShareReqs,
    anclajesPorHash, resumenDeAnclaje, anclando, anclarYa,
    unlockDocBio, unlocked, user, verifVin, verificarVinculos, verifyRes,
    puedo, miRol, ROL_TEXTO, revisarProveedores, revisando69B, hallazgos69B,
  } = ctx;
  // ← NUEVO (Etapa 3): no se ofrecen botones que el servidor va a
  // rechazar. Quien sólo viene a entregar un comprobante no ve
  // «Editar» ni «Firmar»; la decisión real la toma el servidor.
  const puede = (accion)=> !puedo || puedo(accion);
  const sigs = d.chain.filter(b=>b.action==="FIRMA");
  const eds  = d.chain.filter(b=>b.action==="EDICIÓN"||b.action==="CREACIÓN");
  // ← ACTUALIZADO: los vínculos a expedientes también salen en esta pestaña
  const shs  = d.chain.filter(b=>b.action==="COMPARTIDO"||b.action==="VINCULADO");
  const iSigned = sigs.some(b=>b.author===user);

  if(estaProtegido(d) && !unlocked){
    const puedeBio = bioOk && bioCreds.length>0 && d.ownerUid===uid;   // ← NUEVO
    return (<><style>{ESTILOS}</style>
      {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
      <nav className="nav">
        <div className="nav-id"><button className="icon-btn" onClick={goHome}><IcoBack/></button>Documento protegido</div>
      </nav>
      <div className="lock-wrap">
        <div className="lock-ico">🔒</div>
        <div className="lock-t">Este documento está protegido</div>
        <div className="lock-s">
          {puedeBio ? "Usa tu biometría o ingresa la contraseña." : "Ingresa la contraseña para verlo."}
        </div>

        {/* ← NUEVO: atajo biométrico, sólo visible para el dueño */}
        {puedeBio && (<>
          <button className="btn btn-primary" style={{maxWidth:360,width:"100%"}}
            disabled={bioBusy} onClick={unlockDocBio}>
            {bioBusy ? "Esperando verificación…"
              : `Desbloquear con ${deviceLabel()==="iPhone"||deviceLabel()==="iPad"?"Face ID":"tu biometría"}`}
          </button>
          <div className="fingerprint" onClick={()=>{ if(!bioBusy) unlockDocBio(); }}><IcoFinger/></div>
          <div className="sign-or" style={{maxWidth:360,width:"100%"}}><span>o usa la contraseña</span></div>
        </>)}

        <input className="inp" style={{maxWidth:360}} type="password" placeholder="Contraseña"
          value={lockInput} onChange={e=>setLockInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter") abrirProtegido(); }} />
        <button className="btn btn-primary" onClick={abrirProtegido}>Desbloquear</button>
      </div>
    </>);
  }

  return (<><style>{ESTILOS}</style>
    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}

    <nav className="nav">
      <div className="nav-id">
        <button className="icon-btn" onClick={goHome}><IcoBack/></button>
        ID:<span className="num">{d.numId||d.id}</span>
        {/* ← NUEVO: quien no es el dueño ve con qué papel entró */}
        {miRol && miRol!=="propietario" && (
          <span className="rol-tag" title="Tu papel en este documento">{ROL_TEXTO?.[miRol]||miRol}</span>
        )}
      </div>
      <div className="nav-actions">
        {editMode && (
          <div className="toggle-wrap" onClick={()=>{ if(estaProtegido(d)) setLock(null); else {setPass("");setModal({t:"lock"});} }}>
            <span className="toggle-lbl">candado de seguridad</span>
            <div className={`toggle ${estaProtegido(d)?"on":""}`}/>
          </div>
        )}
        {!editMode && puede("editar") && <button className="btn btn-secondary" onClick={()=>setEdit(true)}>Editar</button>}
        {editMode && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Guardando…":"Guardar"}</button>}
        {/* ← NUEVO: vincula este documento a un expediente como comprobante.
            No aparece en los expedientes: uno no se adjunta a sí mismo. */}
        {d.kind!=="expediente" && puede("vincular") && (
          <button className="btn btn-secondary"
            onClick={()=>{setLinkExp(null);setLinkErr("");setModal({t:"linkTo"});openExpedientes();}}>
            Adjuntar a
          </button>
        )}
        {/* ← ACTUALIZADO (rediseño): entrar por aquí arranca en «acceso
            completo», que es lo que se espera de un botón que dice
            Compartir. Entrar desde un requisito arranca en «sólo
            entregar», con ese requisito ya marcado. */}
        <button className="btn btn-secondary"
          onClick={()=>{ setMIn(""); setEnlaceNuevo(null);
                         setShareModo("completo"); setShareTodo(true); setShareReqs([]);
                         setModal({t:"share"}); }}>Compartir</button>
        <button className="btn btn-secondary" onClick={()=>setHist(true)}>Ver historial</button>
        <button className="hamburger" onClick={()=>setMenu(true)}><span/><span/><span/></button>
      </div>
    </nav>

    <div className="page">
      <div className="doc-title-bar">
        {editMode
          ? <input className="doc-title" value={title} placeholder="Título del documento"
              onChange={e=>{setTitle(e.target.value);setDirty(true);}} />
          : <h1 className="doc-title">{d.title}</h1>}
      </div>

      {/* ← NUEVO: en edición, un documento de texto puede volverse contrato inteligente */}
      {editMode && puedeConvertir(d) && (
        <div className="convertir">
          <div className="convertir-b">
            <Icon n="rule" size={22}/>
            <div>
              <strong>¿Es un contrato?</strong>
              <span>
                Conviértelo en contrato inteligente: la IA extrae los comprobantes que habrá que
                reunir y el documento conserva su historial, firmas e ID.
              </span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={iniciarConversion}
            disabled={smartBusy || saving || !aiConfigured()}>
            Convertir a contrato inteligente
          </button>
        </div>
      )}

      {verifyRes && (
        <div className={`vban ${verifyRes.valid?"ok":"bad"}`}>
          {verifyRes.valid
            ? "✓ Cadena íntegra — todos los bloques son criptográficamente válidos"
            : `✗ Cadena comprometida — fallo detectado en el bloque #${verifyRes.failedAt}`}
        </div>
      )}

      <div className="paper">
        {/* ← NUEVO: los expedientes se ven como lista de comprobantes, no como papel */}
        {d.kind==="expediente" ? renderExpediente(ctx)
        : d.tplId && FORMS[d.tplId] ? (
          <FormDoc formKey={d.tplId} fields={fields} editable={editMode}
            onChange={f=>{setFields(f);setDirty(true);}} />
        ) : editMode
          ? <textarea className="paper-ta" value={content} placeholder="Comienza a escribir…"
              onChange={e=>{setContent(e.target.value);setDirty(true);}} />
          : <div className={`paper-ro ${!d.content?"empty-txt":""}`}>{d.content||"Este documento aún no tiene contenido. Presiona «Editar» para comenzar."}</div>}
      </div>

      {/* ← NUEVO: dónde está adjunto este documento. Si comprueba gastos
          en más de un expediente, se avisa y se puede ir a cada uno. */}
      {d.kind!=="expediente" && (()=>{
        const sitios = dondeEstaAdjunto(d.id, docs);
        if(!sitios.length) return null;
        const exps = new Set(sitios.map(x=>x.expId));
        const grave = exps.size>1 || sitios.length>1;
        return (
          <div className={`adjunto-en ${grave?"grave":""}`}>
            <div className="adjunto-en-h">
              <Icon n={grave?"content_copy":"link"} size={18}/>
              <strong>
                {grave
                  ? `Este documento está adjuntado ${sitios.length} veces`
                  : "Adjuntado como comprobante"}
              </strong>
            </div>
            {grave
              ? <p>El mismo comprobante está justificando más de un gasto.</p>
              : <p>Mientras esté aquí no puede adjuntarse a otro contrato. Para moverlo, retíralo primero de ese expediente.</p>}
            <div className="dup-lugares">
              {sitios.map((x,i)=>(
                <button key={i} className="dup-lugar"
                  onClick={()=>openDoc(x.expId, grave ? `doc:${d.id}` : null)}>
                  {x.expTitulo} → {x.reqTitulo} ↗
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ← NUEVO: evidencia visual del documento (no aplica a expedientes,
          que ya tienen su propia lista de comprobantes por requisito) */}
      {d.kind!=="expediente" && (()=>{
        const imgs = d.imagenes||[];
        return (
          <div className="galeria">
            <div className="adj-h">
              <span className="adj-t">Evidencia visual</span>
              <span className="adj-n">{imgs.length}</span>
            </div>
            <p className="gal-sub">
              Fotos que respaldan este documento: el ticket físico, el producto recibido,
              el comprobante de la transferencia. Cada una queda registrada en la cadena con su huella.
            </p>

            {imgs.length>0 && (
              <div className="gal-grid">
                {imgs.map(img=>(
                  <div key={img.path} className="gal-item">
                    <button className="gal-thumb" onClick={()=>getFile(img,false)}
                      title={`Ver ${img.nombre}`}>
                      {img.thumb
                        ? <img src={img.thumb} alt={img.nombre}/>
                        : <span className="gal-noimg">Sin vista previa</span>}
                    </button>
                    <div className="gal-n" title={img.nombre}>{img.nombre}</div>
                    <div className="gal-m">
                      {(img.tam/1024).toFixed(0)} KB · {fmtShort(img.subidoEn)}
                    </div>
                    <div className="gal-acts">
                      <button className="btn btn-tertiary" onClick={()=>getFile(img,true)}>Descargar</button>
                      <button className="smart-x" title="Retirar"
                        onClick={()=>removeImage(img.path)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {imgs.length<MAX_IMGS && (
              <label className="exp-up">
                <span>{saving ? "Procesando…" : "Adjuntar imagen"}</span>
                <input type="file" accept="image/*" style={{display:"none"}} disabled={saving}
                  onChange={e=>{ addImage(e.target.files?.[0]); e.target.value=""; }} />
              </label>
            )}
          </div>
        );
      })()}

      <div className="sign-bar">
        {!iSigned && puede("firmar") && (
          <div className="sign-group">
            <button className="btn btn-primary" onClick={()=>{setPass("");setModal({t:"sign"});}}>Firmar documento</button>
            <button className="fp-btn" onClick={()=>{setPass("");setModal({t:"sign"});}}><IcoFinger/></button>
          </div>
        )}
        {/* ← ACTUALIZADO: sello de imagen en vez de la línea con el nombre.
            Las firmas antiguas no traen sello, así que conservan el estilo viejo. */}
        {sigs.map((b,i)=>(
          <div key={i} className={`sign-slot sign-done ${selloDe(b)?"con-sello":""}`}>
            {selloDe(b) ? (
              <img className="sello" src={selloUrl(selloDe(b))} alt={`Sello de ${b.author}`}
                onError={e=>{e.currentTarget.style.display="none";}} />
            ) : (
              <div className="sign-mark">{b.author}</div>
            )}
            <p>Firmado por: {b.author}</p>
          </div>
        ))}
        {sigs.length===0 && <div className="sign-slot"><p>Firma pendiente</p></div>}
      </div>

      {/* ← ACTUALIZADO: antes no podía saltar de línea y ensanchaba toda la página en móvil */}
      {/* ← NUEVO (Etapa 4): resultado de la revisión de proveedores */}
      {hallazgos69B && (
        <div className={`p69 ${hallazgos69B.lista.length ? "mal" : "bien"}`}>
          {hallazgos69B.lista.length === 0 ? (
            <>
              <Icon n="verified" size={18}/>
              <div>
                <b>Ningún proveedor de este expediente está en la lista 69-B.</b>
                {hallazgos69B.actualizadoEn &&
                  <div className="p69-f">Lista del SAT actualizada el {fmtFull(hallazgos69B.actualizadoEn)}</div>}
              </div>
            </>
          ) : (
            <>
              <Icon n="dangerous" size={18}/>
              <div>
                <b>{hallazgos69B.lista.length === 1
                  ? "Un RFC de este expediente está en la lista 69-B del SAT."
                  : `${hallazgos69B.lista.length} RFC de este expediente están en la lista 69-B del SAT.`}</b>
                {hallazgos69B.lista.map(h=>(
                  <div key={h.rfc} className="p69-r">
                    <span className="mono">{h.rfc}</span> — {h.texto}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ← NUEVO (Etapa 5): lo único de esta pantalla que no depende
          de nosotros. Todo lo demás lo afirma chaindoc; esto lo afirma
          la cadena de Bitcoin, y el enlace lleva a comprobarlo fuera. */}
      {resumenDeAnclaje && resumenDeAnclaje.total > 0 && (
        <div className={`ancla-caja ${resumenDeAnclaje.completo ? "lista" : "espera"}`}>
          <Icon n={resumenDeAnclaje.completo ? "verified" : "schedule"} size={18}/>
          <div className="ancla-b">
            {resumenDeAnclaje.confirmados > 0 ? (<>
              <b>
                {resumenDeAnclaje.completo
                  ? "La fecha de esta historia está publicada en Bitcoin."
                  : `${resumenDeAnclaje.confirmados} de ${resumenDeAnclaje.total} bloques con fecha publicada en Bitcoin.`}
              </b>
              <div className="ancla-d">
                Ya no depende de nosotros: cualquiera puede comprobarla por su cuenta,
                y nadie —chaindoc incluido— puede cambiarla.
                {resumenDeAnclaje.primeraAltura && <>
                  {" "}<a href={enlaceDeBloque(resumenDeAnclaje.primeraAltura)}
                    target="_blank" rel="noreferrer">Ver el bloque {resumenDeAnclaje.primeraAltura} ↗</a>
                </>}
              </div>
            </>) : (<>
              <b>Todavía sin publicar en Bitcoin.</b>
              <div className="ancla-d">
                El anclaje corre una vez al día, de madrugada. Hasta entonces la fecha
                la sostiene nuestro servidor, que es justo lo que esto viene a resolver.
              </div>
            </>)}
            {(resumenDeAnclaje.sinAnclar > 0 || resumenDeAnclaje.pendientes > 0) && (
              <div className="ancla-pie">
                {resumenDeAnclaje.sinAnclar > 0 &&
                  `${resumenDeAnclaje.sinAnclar} bloque${resumenDeAnclaje.sinAnclar===1?"":"s"} en espera del próximo anclaje. `}
                {resumenDeAnclaje.pendientes > 0 &&
                  `${resumenDeAnclaje.pendientes} ya mandado${resumenDeAnclaje.pendientes===1?"":"s"}, esperando a que se mine el bloque de Bitcoin. `}
                <button className="lnk" disabled={anclando} onClick={anclarYa}>
                  {anclando ? "Anclando…" : "Anclar ahora"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="acc-final">
        <button className="btn btn-secondary" onClick={doVerify}>⬡ Verificar integridad</button>
        {/* ← NUEVO: revisa de nuevo los documentos adjuntos */}
        {d.kind==="expediente" && (
          <button className="btn btn-secondary" disabled={verifVin}
            onClick={()=>verificarVinculos(d)}>
            {verifVin ? "Revisando…" : "Revisar adjuntos"}
          </button>
        )}
        {/* ← NUEVO (Etapa 4): cruza los RFC del expediente contra la
            lista 69-B del SAT, la de los emisores de facturas de
            operaciones inexistentes. Si un proveedor tuyo está ahí, te
            enteras tú antes que el auditor.
            ← ACTUALIZADO: sólo cuando hay algún RFC que revisar. En un
            expediente sin facturas no hacía nada, y le decía al usuario
            que esto es para gente con proveedores. */}
        {d.kind==="expediente" && hayQueRevisarRFCs(d) && (
          <button className="btn btn-secondary" disabled={revisando69B}
            onClick={revisarProveedores}>
            {revisando69B ? "Consultando al SAT…" : "Revisar proveedores"}
          </button>
        )}
        {/* ← NUEVO: el paquete que un tercero verifica por su cuenta */}
        {d.kind==="expediente" && puede("exportar") && (
          <button className={`btn btn-primary ${ocupado==="exportando"?"esperando":""}`}
            disabled={ocupado==="exportando"} onClick={exportarPaquete}>
            {ocupado==="exportando"
              ? "Generando el paquete…"
              : <><Icon n="download" size={18}/> Exportar evidencia</>}
          </button>
        )}
      </div>
    </div>

    {histOpen && (
      <div className="hist-ov" onClick={()=>setHist(false)}>
        <div className="hist" onClick={e=>e.stopPropagation()}>
          <h2 className="hist-title">Historial</h2>
          <div className="tabs">
            {["Línea de tiempo","Ediciones","Firmas","Compartidos"].map(t=>(
              <button key={t} className={`tab ${histTab===t?"on":""}`} onClick={()=>setHistTab(t)}>{t}</button>
            ))}
          </div>
          <div className="hist-list">
            {/* ← NUEVO: vista cronológica completa, en vez de listas por tipo */}
            {histTab==="Línea de tiempo" && <Timeline chain={d.chain} anclajes={anclajesPorHash}/>}
            {histTab!=="Línea de tiempo" &&
             (histTab==="Ediciones"?eds:histTab==="Firmas"?sigs:shs).slice().reverse().map(b=>(
              <div key={b.index} className="hcard">
                <div className="hcard-a">{b.author}</div>
                <div className="hcard-d">{fmtFull(b.timestamp)}</div>
                <div className="hcard-box">
                  {b.action==="EDICIÓN" ? (b.content?b.content.slice(0,90)+(b.content.length>90?"…":""):"Edición del documento")
                   : b.action==="FIRMA" ? "Firma"
                   : b.content}
                </div>
                {/* ← NUEVO (Etapa 5): una firma con e.firma la comprobó el
                    servidor contra los certificados del SAT. Si no hubiera
                    subido hasta una raíz del SAT, este bloque no existiría. */}
                {firmaDe(b)?.method==="efirma" && (
                  <div className="efirma-badge"
                    title={`Certificado ${firmaDe(b).numeroDeSerie||""} · ${firmaDe(b).emisor||""}`}>
                    <span className="eb-sat">SAT</span>
                    Firmada con e.firma
                    {firmaDe(b).rfc ? ` · ${firmaDe(b).rfc}` : ""}
                  </div>
                )}
                {/* ← NUEVO: distingue una firma biométrica de una con código */}
                {firmaDe(b)?.method==="webauthn" && (
                  <div className={`bio-badge ${firmaDe(b).verified?"ok":""}`}>
                    <IcoFinger/>
                    {firmaDe(b).verified
                      ? `Verificada biométricamente en ${firmaDe(b).device||"dispositivo"}`
                      : `Firmada con biometría en ${firmaDe(b).device||"dispositivo"}`}
                  </div>
                )}
                <button className="hcard-eye" onClick={()=>setShowHashes({...showHashes,[b.index]:!showHashes[b.index]})}>
                  <IcoEye/> Ver hashes
                </button>
                {showHashes[b.index] && (
                  <div className="hashes">
                    <div><div className="h-l">Hash de este bloque</div><div className="h-v cur">{b.hash}</div></div>
                    <div><div className="h-l">Hash anterior</div><div className="h-v prv">{b.previousHash}</div></div>
                    <div><div className="h-l">Bloque</div><div className="h-v" style={{color:"var(--gris-300)"}}>#{b.index}</div></div>
                  </div>
                )}
              </div>
            ))}
            {histTab!=="Línea de tiempo" &&
             (histTab==="Ediciones"?eds:histTab==="Firmas"?sigs:shs).length===0 &&
              <div className="empty">Sin registros en esta categoría.</div>}
          </div>
          <button className="btn btn-warning" onClick={()=>setHist(false)}>Cerrar</button>
        </div>
      </div>
    )}

    {menuOpen && renderMenu(ctx)}
    {modal && renderModales(ctx)}
  </>);
}