// Pantalla de un documento: bloqueo, papel, firmas, adjuntos e historial.

import { FORMS } from "../ui/formularios";
import { FormDoc } from "../ui/FormDoc";
import { IcoBack, IcoEye, IcoFinger, Icon } from "../ui/iconos";
import { Timeline } from "../ui/Timeline";
import { aiConfigured, dondeEstaAdjunto, hayQueRevisarRFCs } from "../smartContract";
import { deviceLabel } from "../biometric";
import { fmtFull, fmtShort } from "../nucleo/formato";
import { renderAccesos, conAccesoDe } from "./Accesos";
import { renderExpediente } from "./Expediente";
import { renderMenu } from "./MenuLateral";
import { renderModales } from "../modales";
import { selloUrl } from "../nucleo/catalogos";
import { selloDe, firmaDe } from "../nucleo/bloques";
import { Sello } from "../ui/Sello";
import { esSelloViejo } from "../nucleo/sello";
import { estaProtegido } from "../nucleo/datos";
import { SECCIONES, motivoOcupada } from "../nucleo/secciones";
import { ESTILOS } from "../ui/estilos";
export function renderDocumento(ctx){
  const {
    MAX_IMGS, abrirProtegido, addImage, bioBusy, bioCreds, bioOk, content, convOculto, d, doVerify,
    docs, editMode, exportarPaquete, fields, getFile, goHome, histOpen, histTab, ocupado,
    iniciarConversion, lockInput, menuOpen, modal, notif, openDoc, openExpedientes,
    ocultarConvertir, puedeConvertir, removeImage, save, saving, setContent, setDirty, setEdit, setFields,
    setHist, setHistTab, setLinkErr, setLinkExp, setLock, setLockInput, setMIn, setMenu,
    setModal, setPass, setShowHashes, setTitle, showHashes, smartBusy, title, uid,
    setEnlaceNuevo, setShareModo, setShareTodo, setShareReqs,
    // ← NUEVO (21 oct): pestañas de accesos y secciones apagables.
    // Lo que usa el panel de accesos por dentro (cambiarRol, rolBusy,
    // revokeShare) lo saca él de `ctx`; aquí sólo hace falta saber
    // CUÁNTOS hay, para decidir si la pestaña existe.
    accesos, docTab, setDocTab, secciones, setSecciones,
    // ← ACTUALIZADO (14 oct): sólo queda anclajesPorHash, que es lo que
    // la Línea de tiempo usa para marcar las fechas ya publicadas en
    // Bitcoin. resumenDeAnclaje, anclando y anclarYa se fueron con el
    // aviso; siguen existiendo en App.jsx por si vuelven a hacer falta.
    anclajesPorHash,
    unlockDocBio, unlocked, user, verifVin, verificarVinculos, verifyRes,
    puedo, miRol, ROL_TEXTO, revisarProveedores, revisando69B, hallazgos69B,
  } = ctx;
  // ← NUEVO (Etapa 3): no se ofrecen botones que el servidor va a
  // rechazar. Quien sólo viene a entregar un comprobante no ve
  // «Editar» ni «Firmar»; la decisión real la toma el servidor.
  const puede = (accion)=> !puedo || puedo(accion);
  const sigs = d.chain.filter(b=>b.action==="FIRMA");

  // ← NUEVO (21 oct): quién más ve este documento, para las pestañas.
  const conAcceso = conAccesoDe(accesos);
  const DOC_TABS = [
    { id:"documento", txt:"Documento" },
    { id:"accesos",   txt:"Con acceso", n:conAcceso.length },
  ];
  const dtab = (d.kind!=="expediente" && conAcceso.length>0
    && DOC_TABS.some(x=>x.id===docTab)) ? docTab : "documento";

  // ← NUEVO (21 oct): las secciones de debajo del papel se pueden
  // apagar. Una sección vacía que no se puede quitar no es neutra:
  // parece un pendiente. Ver `nucleo/secciones.js`.
  const cuentas = { imagenes:(d.imagenes||[]).length, firmas:sigs.length };
  const verSec = (id)=> secciones?.[id] !== false;
  const apagar = (id)=>{ setSecciones({...secciones, [id]:false}); setDirty(true); };
  const prender = (id)=>{ setSecciones({...secciones, [id]:true}); setDirty(true); };
  // Quitar una sección: sólo en edición y sólo si está vacía.
  // Esconder una firma o una foto ya puestas sería esconder una
  // prueba.
  //
  // Cuando NO se puede, sale el motivo escrito en vez de un botón
  // apagado. Un botón gris sólo se explica al pasar el ratón por
  // encima, y en un teléfono no hay ratón que pasar.
  const quitarSec = (id)=>{
    if(!editMode || d.kind==="expediente" || !puede("editar")) return null;
    const motivo = motivoOcupada(id, cuentas);
    if(motivo) return <span className="sec-no">{motivo}</span>;
    return (
      <button className="sec-x" onClick={()=>apagar(id)}>
        <Icon n="close" size={16}/> Quitar sección
      </button>
    );
  };
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

      {/* ── PESTAÑAS (21 oct) ──────────────────────────────────
          Sólo salen si el documento está compartido. Un documento
          que es nada más tuyo no tiene accesos que mirar, y una
          pestaña que lleva a una lista vacía es una pestaña que
          estorba.

          Van aquí, entre el título y el papel, como en los
          expedientes: lo primero es el documento, y quién más lo ve
          está a un clic sin tener que abrir el modal de compartir. */}
      {d.kind!=="expediente" && conAcceso.length>0 && (
        <nav className="exp-tabs doc-tabs" role="tablist" aria-label="Secciones del documento">
          {DOC_TABS.map((x,i)=>(
            <button key={x.id} role="tab" id={`d${x.id}-tab`}
              aria-selected={dtab===x.id} aria-controls={`d${x.id}-panel`}
              tabIndex={dtab===x.id ? 0 : -1}
              className={`exp-tab ${dtab===x.id?"on":""}`}
              onClick={()=>setDocTab(x.id)}
              onKeyDown={e=>{
                const paso = e.key==="ArrowRight" ? 1 : e.key==="ArrowLeft" ? -1 : 0;
                if(!paso) return;
                e.preventDefault();
                setDocTab(DOC_TABS[(i + paso + DOC_TABS.length) % DOC_TABS.length].id);
              }}>
              {x.txt}
              {x.n!=null && <span className="exp-tab-n">{x.n}</span>}
            </button>
          ))}
        </nav>
      )}

      {/* ── Quién más lo ve, y con qué papel ── */}
      {dtab==="accesos" && renderAccesos(ctx, { panelId:"daccesos-panel", tabId:"daccesos-tab" })}

      {dtab==="documento" && (<>

      {/* ← NUEVO: en edición, un documento de texto puede volverse contrato inteligente */}
      {editMode && puedeConvertir(d) && !(convOculto||[]).includes(d.id) && (
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
          {/* ← NUEVO (10 oct): la X para quitarlo. Quien ya decidió que su
              documento no es un contrato no tiene por qué volver a leer
              esto cada vez que entra a editar. */}
          <div className="convertir-acc">
            <button className="btn btn-primary" onClick={iniciarConversion}
              disabled={smartBusy || saving || !aiConfigured()}>
              Convertir a contrato inteligente
            </button>
            <button className="convertir-x" title="Quitar este aviso"
              aria-label="Quitar este aviso"
              onClick={()=>ocultarConvertir(d.id)}>
              <Icon n="close" size={20}/>
            </button>
          </div>
        </div>
      )}

      {/* ← MOVIDO (14 oct): el resultado de la comprobación se fue al
          historial, junto al botón que la dispara. Salía aquí arriba
          mientras el botón vivía al final de la página: había que
          comprobar, subir a leer, y volver a bajar. */}

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
      {d.kind!=="expediente" && verSec("evidencia") && (()=>{
        const imgs = d.imagenes||[];
        return (
          <div className="galeria">
            <div className="adj-h">
              <span className="adj-t">Evidencia visual</span>
              <span className="adj-n">{imgs.length}</span>
              {quitarSec("evidencia")}
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

      {verSec("firmas") && (<>
      {/* La cabecera sólo existe mientras editas: es el percherode
          donde cuelga «Quitar sección». Fuera de edición el documento
          se ve exactamente como siempre, con sus sellos y ya. */}
      {editMode && d.kind!=="expediente" && puede("editar") && (
        <div className="sec-cab">
          <span className="adj-t">Firmas</span>
          <span className="adj-n">{sigs.length}</span>
          {quitarSec("firmas")}
        </div>
      )}
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
            {/* ← ACTUALIZADO (10 oct): el sello se dibuja, ya no es una
                imagen de un catálogo de ocho.
                Las firmas viejas traen un sello del sistema anterior
                (LG1…LG8) y siguen saliendo de su PNG: lo que ya quedó
                asentado no se redibuja. Si el archivo no está —LG8
                nunca lo tuvo— cae al nombre, que es lo que hacía
                cualquier firma antes de que existieran los sellos. */}
            {!selloDe(b) ? (
              <div className="sign-mark">{b.author}</div>
            ) : esSelloViejo(selloDe(b)) ? (
              <img className="sello" src={selloUrl(selloDe(b))} alt={`Sello de ${b.author}`}
                onError={e=>{e.currentTarget.style.display="none";}} />
            ) : (
              <Sello key={selloDe(b)} clave={selloDe(b)} semilla={b?.meta?.selloSemilla ?? null}/>
            )}
            <p>Firmado por: {b.author}</p>
          </div>
        ))}
        {sigs.length===0 && <div className="sign-slot"><p>Firma pendiente</p></div>}
      </div>
      </>)}

      {/* ── Volver a poner lo que se quitó (21 oct) ──────────────
          Sólo en edición y sólo lo que falta: dos botones fijos que
          dijeran siempre lo mismo serían dos botones que casi siempre
          sobran. Quien no quitó nada no ve ninguno. */}
      {editMode && d.kind!=="expediente" && puede("editar") &&
       SECCIONES.some(s=>!verSec(s.id)) && (
        <div className="sec-add">
          {SECCIONES.filter(s=>!verSec(s.id)).map(s=>(
            <button key={s.id} className="btn btn-secondary" onClick={()=>prender(s.id)}>
              <Icon n="add" size={18}/> {s.agregar}
            </button>
          ))}
        </div>
      )}

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

      {/* ← QUITADO (14 oct): el aviso del anclaje ya no se pinta aquí.
          Era la caja que más jerga soltaba de toda la pantalla —bloques
          en espera, bloques que se minan, «Anclar ahora»— y lo hacía
          justo arriba del documento, antes de que nadie la pidiera. El
          anclaje corre solo todas las madrugadas, así que no hay nada
          que el usuario tenga que decidir ni vigilar.

          La prueba no se pierde: cuando Bitcoin confirma la fecha,
          sigue apareciendo en el historial, pestaña Línea de tiempo,
          con su enlace para comprobarla fuera de chaindoc. Ahí se mira
          cuando se busca; ya no se grita cuando no se busca.

          Los estilos .ancla-caja siguen en estilos.js, sin usar, por si
          algún día quieres volver a enseñar el estado en algún sitio. */}

      {/* ← MOVIDO (14 oct): «Verificar integridad» se fue al historial,
          pestaña Ediciones. Aquí era el primero de cuatro botones y el
          más críptico de todos: lo que comprueba son las ediciones, y
          ahí es donde se mira.
          ← ACTUALIZADO (14 oct): la barra sólo se pinta si lleva algo.
          Los otros tres botones son de expediente, así que en un
          documento de texto se quedaba vacía: 40 px de hueco al pie. */}
      {d.kind==="expediente" && (
      <div className="acc-final">
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
      )}
      </>)}
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
            {/* ← MOVIDO (14 oct): la comprobación vive donde se mira lo que
                comprueba. Debajo de la última edición: primero lees qué
                pasó, y ahí mismo compruebas que nadie lo cambió después.
                Antes el botón estaba al final del documento y el
                resultado salía arriba del todo. */}
            {histTab==="Ediciones" && eds.length>0 && (
              <div className="hist-check">
                <button className="btn btn-secondary" onClick={doVerify}>
                  Comprobar que nada se alteró
                </button>
                {verifyRes && (
                  <div className={`vban ${verifyRes.valid?"ok":"bad"}`}>
                    {verifyRes.valid
                      ? "✓ Todo cuadra — ninguno de estos registros se cambió después de guardarse"
                      /* ← ACTUALIZADO (14 oct): antes decía «fallo en el
                         bloque #N». El número es el índice interno: el
                         primer registro es el #0, y «el bloque 0» no le
                         dice a nadie qué revisar. Mejor por quién y
                         cuándo, que es lo que se busca en la lista. */
                      : (()=>{
                          const mal = d.chain?.[verifyRes.failedAt];
                          return mal
                            ? `✗ Hay una alteración — no cuadra el registro de ${mal.author} del ${fmtFull(mal.timestamp)}`
                            : "✗ Hay una alteración — el historial no cuadra con lo que se guardó";
                        })()}
                  </div>
                )}
                <div className="hist-check-n">
                  Se recalcula la huella de cada registro y se compara con la
                  que quedó guardada. Si alguien hubiera editado el historial
                  por su cuenta, las huellas dejarían de coincidir.
                </div>
              </div>
            )}
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