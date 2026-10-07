// Pantalla de inicio: pendientes, vencimientos y lista de documentos.

import { IcoDots, IcoFolder, Icon } from "../ui/iconos";
import {
  destinoDuplicado,
  expedienteStatus,
  fmtMonto,
  misEsperas,
  misPendientes,
  panelExpedientes,
} from "../smartContract";
import { fmtShort } from "../nucleo/formato";
import { renderMenu } from "./MenuLateral";
import { renderModales } from "../modales";
import { ESTILOS } from "../ui/estilos";
import { TEXTO_AVISO, ordenar, esGrave } from "../nucleo/avisos";
import { estaProtegido } from "../nucleo/datos";
import { TIPOS_DOC, esApaisado, tipoDeDocumento } from "../nucleo/catalogos";
export function renderInicio(ctx){
  const {
    acctEmail, copyLink, docs, drop, filterF, folders, irADuplicado, menuOpen, modal,
    notif, openCreate, openDoc, openSec, setDrop, setFilterF, setFolders, setMIn,
    setMIn2, setMenu, setModal, setOpenSec, setView, uid, user, view,
    verificado, verifBusy, reenviarVerificacion, comprobarVerificacion, avisos,
    legalPend, aceptarLegal, setLegalTab,
  } = ctx;
  const recientes = docs.slice(0,3);
  // ← ACTUALIZADO: se compara por uid, no por nombre (dos personas pueden llamarse igual)
  const mine      = docs.filter(x=>x.ownerUid===uid);
  const shared    = docs.filter(x=>x.ownerUid!==uid);
  const shown     = filterF ? docs.filter(x=>x.folder===filterF) : (view==="documentos"?mine:docs);

  const Card = (x)=>{
    const sg = x.chain.filter(b=>b.action==="FIRMA").length;
    // ← NUEVO: estado del expediente para el distintivo de la tarjeta
    const ex = x.kind==="expediente" ? expedienteStatus(x) : null;
    // ← NUEVO: el tipo decide el color del borde, la etiqueta de debajo
    // del título y si la tarjeta va de pie o acostada.
    const tipo = tipoDeDocumento(x);
    return (
      <div key={x.id} className={`card tipo-${tipo}${esApaisado(tipo)?" ancha":""}`}
        onClick={()=>openDoc(x.id)}>
        <div className="card-h">
          <span className="card-t">{x.title}</span>
          <button className="icon-btn" style={{color:"var(--gris-200)"}}
            onClick={e=>{e.stopPropagation();setDrop(drop===x.id?null:x.id);}}><IcoDots/></button>
        </div>
        <span className="chip chip-tipo">{TIPOS_DOC[tipo].nombre}</span>
        <div className="card-prev">{x.content||"Sin contenido aún…"}</div>
        <div className="card-meta">Última edición: {fmtShort(x.lastModified)}</div>
        <div className="chips">
          {/* ← NUEVO: los expedientes muestran su avance */}
          {ex && (
            <span className={`chip chip-exp ${ex.estado}`}>
              {ex.completo ? "✓ Expediente completo"
               : ex.vencido ? `⚠ Vencido · ${ex.cumplidos}/${ex.total}`
               : `${ex.cumplidos}/${ex.total} comprobantes`}
            </span>
          )}
          <span className="chip chip-b">{x.chain.length} bloques</span>
          {sg>0 && <span className="chip chip-s">✦ {sg} firma{sg!==1?"s":""}</span>}
          {x.folder && <span className="chip chip-f">📁 {x.folder}</span>}
          {estaProtegido(x) && <span className="chip chip-l">🔒 Protegido</span>}
          {x.source==="importado" && <span className="chip chip-l">📄 Importado</span>}
          {x.source==="escaneo" && <span className="chip chip-l">📷 Escaneado</span>}
        </div>
        {drop===x.id && (
          <div className="drop" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>{openDoc(x.id);setDrop(null);}}>Abrir</button>
            <button onClick={()=>{setMIn2(x.folder||"");setModal({t:"move",id:x.id});setDrop(null);}}>Mover a carpeta</button>
            <button onClick={()=>{copyLink(x.id);setDrop(null);}}>Copiar enlace</button>
            <button className="danger" onClick={()=>{setModal({t:"del",id:x.id,name:x.title});setDrop(null);}}>Eliminar</button>
          </div>
        )}
      </div>
    );
  };

  return (<><style>{ESTILOS}</style>
    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}

    <nav className="nav">
      <span className="nav-title">Hola {user.split(" ")[0]}</span>
      <div className="nav-actions">
        <button className={`btn btn-secondary ${view==="inicio"?"on":""}`} onClick={()=>{setView("inicio");setFilterF(null);}}>Inicio</button>
        <button className={`btn btn-secondary ${view==="carpetas"?"on":""}`} onClick={()=>{setView("carpetas");setFilterF(null);}}>Mis carpetas</button>
        <button className={`btn btn-secondary ${view==="documentos"?"on":""}`} onClick={()=>{setView("documentos");setFilterF(null);}}>Mis documentos</button>
        <button className={`btn btn-secondary ${view==="compartidos"?"on":""}`} onClick={()=>{setView("compartidos");setFilterF(null);}}>Compartidos conmigo</button>
        <button className="hamburger" onClick={()=>setMenu(true)}><span/><span/><span/></button>
      </div>
    </nav>

    <div className="page">
      {/* ← NUEVO: quien se registró antes de que existieran el aviso y
          los términos, o aceptó una versión anterior, tiene que volver a
          aceptarlos. Va arriba de todo y no se puede cerrar: es la base
          legal de que podamos tratar sus datos. */}
      {legalPend && (
        <div className="aviso-legal">
          <span className="aviso-t">
            Actualizamos el aviso de privacidad y los términos de uso. Léelos y
            acéptalos para seguir usando tu cuenta.
          </span>
          <button onClick={()=>{setLegalTab("aviso");setModal({t:"legal"});}}>
            Leer el aviso
          </button>
          <button onClick={()=>{setLegalTab("terminos");setModal({t:"legal"});}}>
            Leer los términos
          </button>
          <button className="principal" onClick={aceptarLegal}>Los acepto</button>
        </div>
      )}

      {/* ← NUEVO (Etapa 3): sin el correo confirmado no se puede invitar
          a nadie ni aparecer en el directorio, así que se avisa arriba. */}
      {!verificado && (
        <div className="aviso-verif">
          <span className="aviso-t">
            Confirma tu correo ({acctEmail}) para poder compartir documentos y
            que otros puedan encontrarte. Te mandamos un enlace al registrarte.
          </span>
          <button disabled={verifBusy} onClick={reenviarVerificacion}>Reenviar enlace</button>
          <button disabled={verifBusy} onClick={comprobarVerificacion}>Ya lo confirmé</button>
        </div>
      )}

      {/* ← NUEVO (Etapa 4 · Bloque B): lo que encontró la revisión de
          anoche. Va arriba porque una factura cancelada convierte un
          expediente completo en uno falso, y eso no puede esperar a
          que alguien entre a mirar requisito por requisito. */}
      {avisos?.avisos?.length > 0 && (
        <div className="avisos">
          <div className="avisos-h">
            <Icon n="notifications_active" size={18}/>
            <span>
              {avisos.total === 1 ? "1 cosa que revisar" : `${avisos.total} cosas que revisar`}
            </span>
          </div>
          {ordenar(avisos.avisos).slice(0,8).map((a,i)=>(
            <button key={i} className={`aviso ${esGrave(a)?"grave":""}`}
              onClick={()=>a.opId && openDoc(a.opId)}>
              <Icon n={esGrave(a)?"error":"schedule"} size={15}/>
              <span>{TEXTO_AVISO(a)}</span>
            </button>
          ))}
          {avisos.total > 8 && (
            <div className="avisos-mas">y {avisos.total - 8} más</div>
          )}
        </div>
      )}

      {view==="inicio" && (<>
        {/* ← NUEVO: lo que otras personas te pidieron. Va primero
            porque es trabajo de alguien más esperando por ti. */}
        {(()=>{
          const pend = misPendientes(docs, uid, acctEmail);
          const esperas = misEsperas(docs, uid);
          if(!pend.length && !esperas.length) return null;
          return (
            <div className="pv pend">
              {pend.length>0 && (<>
                <div className="pv-h">
                  <Icon n="assignment_late" size={20}/>
                  <span className="pv-titulo">Te pidieron</span>
                  <span className="adj-n">{pend.length}</span>
                </div>
                {pend.map(({sol,doc,req,dias,vencido})=>(
                  <div key={sol.sid} className="pv-row" onClick={()=>openDoc(doc.id)}>
                    <div className="pv-b">
                      <div className="pv-t">{sol.reqTitulo}</div>
                      <div className="pv-m">
                        {doc.title} · lo pidió {sol.deNombre}
                        {req?.monto!=null && ` · ${fmtMonto(req.monto, doc.moneda||"MXN")}`}
                        {sol.mensaje && ` — «${sol.mensaje}»`}
                      </div>
                    </div>
                    <span className={`pv-chip ${vencido?"vencido":dias!=null&&dias<=7?"urgente":""}`}>
                      {vencido ? "vencido" : dias!=null ? (dias===0?"hoy":`en ${dias} d`) : "sin fecha"}
                    </span>
                  </div>
                ))}
              </>)}

              {esperas.length>0 && (<>
                <div className="pv-h" style={{marginTop:pend.length?16:0}}>
                  <Icon n="hourglass_empty" size={20}/>
                  <span className="pv-titulo">Esperas respuesta</span>
                  <span className="adj-n">{esperas.length}</span>
                </div>
                {esperas.map(({sol,doc})=>(
                  <div key={sol.sid} className="pv-row" onClick={()=>openDoc(doc.id)}>
                    <div className="pv-b">
                      <div className="pv-t">{sol.reqTitulo}</div>
                      <div className="pv-m">
                        {doc.title} · se lo pediste a {sol.paraNombre||sol.paraEmail}
                      </div>
                    </div>
                    <span className="pv-chip">{fmtShort(sol.creadaEn)}</span>
                  </div>
                ))}
              </>)}
            </div>
          );
        })()}

        {/* ← NUEVO: panel de vencimientos. Lo que exige atención hoy,
            cruzando todos los expedientes. Sólo aparece si hay algo. */}
        {(()=>{
          const pl = panelExpedientes(docs);
          if(!pl.total) return null;
          const urgentes = [...pl.vencidos, ...pl.porVencer];
          const dupGraves = pl.duplicados.filter(g=>g.alcance==="entre-expedientes");
          if(!urgentes.length && !pl.detenidos.length && !dupGraves.length) return null;

          const Fila = (f, tono)=>(
            <div key={f.doc.id} className={`pv-row ${tono}`} onClick={()=>openDoc(f.doc.id)}>
              <div className="pv-b">
                <div className="pv-t">{f.doc.title}</div>
                <div className="pv-m">
                  {f.st.cumplidos}/{f.st.total} comprobantes
                  {f.mt.base!=null && ` · ${fmtMonto(f.mt.comprobado ?? 0, f.mt.moneda)} de ${fmtMonto(f.mt.base, f.mt.moneda)}`}
                </div>
                {/* ← NUEVO: cuando lo que apremia es una fase intermedia, se dice cuál */}
                {f.hito && tono!=="quieto" && (
                  <div className="pv-fase">Fase {f.hito.n}: {f.hito.titulo}</div>
                )}
              </div>
              <span className={`pv-chip ${tono}`}>
                {/* ← ACTUALIZADO: usa los días de la fase más apremiante si la hay */}
                {tono==="vencido"  ? `venció hace ${Math.abs(f.dias)} d`
               : tono==="urgente"  ? (f.dias===0 ? "vence hoy" : `en ${f.dias} d`)
               : `${f.inactivo} d sin actividad`}
              </span>
            </div>
          );

          return (
            <div className="pv">
              <div className="pv-h">
                <Icon n="notifications" size={20}/>
                <span className="pv-titulo">Requiere atención</span>
                <span className="adj-n">{pl.alertas}</span>
              </div>

              {pl.vencidos.map(f=>Fila(f,"vencido"))}
              {pl.porVencer.map(f=>Fila(f,"urgente"))}
              {pl.detenidos.map(f=>Fila(f,"quieto"))}

              {/* ← ACTUALIZADO: ahora lleva al último lugar donde se adjuntó */}
              {dupGraves.map(g=>{
                const dest = destinoDuplicado(g);
                return (
                <div key={g.clave} className="pv-row dup" onClick={()=>irADuplicado(g)}>
                  <div className="pv-b">
                    <div className="pv-t">«{g.nombre}» en {g.veces} expedientes</div>
                    <div className="pv-m">
                      {g.ubicaciones.map(u=>u.docTitulo).join(" · ")}
                      {g.monto!=null && ` — ${fmtMonto(g.monto,"MXN")} c/u`}
                    </div>
                    {dest && <div className="pv-ir">Ver en «{dest.docTitulo}» →</div>}
                  </div>
                  <span className="pv-chip dup">huella repetida</span>
                </div>
                );
              })}

              <div className="pv-pie">
                {pl.enCurso.length} en curso · {pl.completos.length} completo{pl.completos.length===1?"":"s"}
              </div>
            </div>
          );
        })()}

        <h2 className="page-title">Recientes</h2>

        <div className="sec-h" onClick={()=>setOpenSec({...openSec,carp:!openSec.carp})}>
          <span className={`sec-arrow ${openSec.carp?"":"closed"}`}><Icon n="expand_more" size={28}/></span>
          <span className="sec-t">Carpetas</span>
        </div>
        {openSec.carp && (
          <div className="folders">
            {folders.map(f=>(
              <div key={f} className="folder" onClick={()=>{setFilterF(f);setView("documentos");}}>
                <IcoFolder/><span className="folder-n">{f}</span>
                <button className="icon-btn" style={{color:"var(--gris-200)",fontSize:20}}
                  onClick={e=>{e.stopPropagation();setDrop(drop===`f-${f}`?null:`f-${f}`);}}><IcoDots/></button>
                {drop===`f-${f}` && (
                  <div className="drop" style={{top:"100%",marginTop:4}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>{setFilterF(f);setView("documentos");setDrop(null);}}>Ver documentos</button>
                    <button className="danger" onClick={()=>{setFolders(folders.filter(y=>y!==f));setDrop(null);}}>Eliminar carpeta</button>
                  </div>
                )}
              </div>
            ))}
            <div className="folder dashed" onClick={()=>{setMIn("");setModal({t:"newFolder"});}}>
              <IcoFolder/><span className="folder-n">Nueva carpeta</span>
            </div>
          </div>
        )}

        <div className="sec-h" onClick={()=>setOpenSec({...openSec,docs:!openSec.docs})}>
          <span className={`sec-arrow ${openSec.docs?"":"closed"}`}><Icon n="expand_more" size={28}/></span>
          <span className="sec-t">Documentos</span>
        </div>
        {openSec.docs && (recientes.length
          ? <div className="cards">{recientes.map(Card)}</div>
          : <div className="empty">No hay documentos aún.<br/>Crea el primero con el botón de abajo.</div>)}

        <div className="sec-h" onClick={()=>setOpenSec({...openSec,comp:!openSec.comp})}>
          <span className={`sec-arrow ${openSec.comp?"":"closed"}`}><Icon n="expand_more" size={28}/></span>
          <span className="sec-t">Compartidos conmigo</span>
        </div>
        {openSec.comp && (shared.length
          ? <div className="cards">{shared.slice(0,3).map(Card)}</div>
          : <div className="empty">Aún no te han compartido documentos.</div>)}
      </>)}

      {view==="carpetas" && (<>
        <h2 className="page-title">Mis carpetas</h2>
        <div className="folders">
          {folders.map(f=>(
            <div key={f} className="folder" onClick={()=>{setFilterF(f);setView("documentos");}}>
              <IcoFolder/><span className="folder-n">{f}</span>
              <button className="icon-btn" style={{color:"var(--gris-200)"}}
                onClick={e=>{e.stopPropagation();setDrop(drop===`f2-${f}`?null:`f2-${f}`);}}><IcoDots/></button>
              {drop===`f2-${f}` && (
                <div className="drop" style={{top:"100%",marginTop:4}} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>{setFilterF(f);setView("documentos");setDrop(null);}}>Ver documentos</button>
                  <button className="danger" onClick={()=>{setFolders(folders.filter(y=>y!==f));setDrop(null);}}>Eliminar carpeta</button>
                </div>
              )}
            </div>
          ))}
          <div className="folder dashed" onClick={()=>{setMIn("");setModal({t:"newFolder"});}}>
            <IcoFolder/><span className="folder-n">Nueva carpeta</span>
          </div>
        </div>
      </>)}

      {view==="documentos" && (<>
        <h2 className="page-title">{filterF?`Carpeta: ${filterF}`:"Documentos"}
          {filterF && <button className="btn btn-tertiary" style={{marginLeft:16,fontSize:15}} onClick={()=>setFilterF(null)}>✕ Quitar filtro</button>}
        </h2>
        {shown.length ? <div className="cards">{shown.map(Card)}</div>
                      : <div className="empty">No hay documentos aquí.</div>}
      </>)}

      {view==="compartidos" && (<>
        <h2 className="page-title">Compartidos conmigo</h2>
        {shared.length ? <div className="cards">{shared.map(Card)}</div>
                       : <div className="empty">Aún no te han compartido documentos.</div>}
      </>)}

      <div className="create-zone">
        <button className="create-btn" onClick={openCreate}>
          <span>Crear documento</span><b>+</b>
        </button>
      </div>
    </div>

    {menuOpen && renderMenu(ctx)}
    {modal && renderModales(ctx)}
  </>);
}
