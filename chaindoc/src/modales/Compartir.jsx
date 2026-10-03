// Compartir: el único lugar donde se decide quién entra y qué puede.
//
// ← REDISEÑADO (Etapa 4 · Bloque B). Antes había tres caminos para lo
// mismo: Compartir, «Pedir a alguien» y «Pedir por enlace». Ahora hay
// uno, con dos preguntas encadenadas.
//
// La primera pregunta es la que importa y es deliberadamente binaria:
// ¿ve todo, o sólo lo que tiene que entregar? Los seis roles siguen
// existiendo, pero dejaron de ser lo primero que hay que entender.
//
// Y una regla de seguridad que se ve en la interfaz: el enlace sin
// cuenta SÓLO se ofrece para «sólo entregar». Un enlace que deje leer
// un contrato entero sin identificar a nadie se reenvía por WhatsApp y
// acaba donde no debía; uno que sólo deja subir archivos a una lista
// de pendientes, si se filtra, lo peor que permite es que un
// desconocido suba un PDF de más, que el dueño ve y retira.

import { IcoLink, Icon } from "../ui/iconos";
import { tiempoRestante } from "../nucleo/invitaciones";
import { fmtFull } from "../nucleo/formato";

const COMPLETOS = ["editor", "aprobador", "lector", "auditor"];

const PLAZOS = [3, 7, 15, 30];

export function modalCompartir(ctx){
  const {
    d, modal, setModal, uid, mIn, setMIn, saving,
    doShare, revokeShare, shareBusy, shareErr, shareFound, setShareErr, setShareFound,
    shareModo, setShareModo, shareRol, setShareRol,
    shareReqs, setShareReqs, shareTodo, setShareTodo, pedirConCuenta,
    solMsg, setSolMsg,
    invDias, setInvDias, crearEnlace, enlaceNuevo, setEnlaceNuevo, copiarEnlace,
    enlaces, verEnlaces, revocarEnlace, copyLink,
    ROL_TEXTO, ROL_AYUDA, accesos, puedo, verificado, reenviarVerificacion, verifBusy,
  } = ctx;
  if(modal.t !== "share") return null;

  const puedeCompartir = puedo("compartir");
  const otros = (accesos||[]).filter(a=>a.rol!=="propietario");
  const pendientes = (d.requisitos||[]).filter(r=>r.estado!=="cumplido");
  const esExpediente = d.kind==="expediente";
  const modo = shareModo || "completo";

  const cerrar = ()=>{
    setModal(null); setEnlaceNuevo(null); setMIn("");
    setShareErr(""); setShareFound(null); setShareReqs([]); setShareTodo(true);
    setShareModo("completo"); setSolMsg("");
  };

  // ── El enlace recién creado: se enseña una sola vez ──
  if(enlaceNuevo) return (
    <div className="ov" onClick={cerrar}><div className="modal wide" onClick={e=>e.stopPropagation()}>
      <h2>Enlace listo</h2>
      <p className="sub">
        Mándaselo por donde quieras: correo, WhatsApp, lo que uses. Quien lo abra
        podrá entregar {enlaceNuevo.requisitos?.length === 1
          ? `«${enlaceNuevo.requisitos[0]}»`
          : `${enlaceNuevo.requisitos?.length || ""} comprobantes`} sin crear ninguna cuenta.
      </p>

      <div className="enl-caja">
        <code className="enl-url">{enlaceNuevo.url}</code>
        <button className="btn btn-primary" onClick={()=>copiarEnlace(enlaceNuevo.url)}>
          Copiar enlace
        </button>
      </div>

      <div className="enl-aviso">
        <Icon n="info" size={16}/>
        <span>
          Guárdalo ahora: por seguridad no se queda almacenado y no se puede volver a ver.
          Si lo pierdes, crea uno nuevo y retira éste.
          {enlaceNuevo.expiraEn && ` Vence el ${fmtFull(enlaceNuevo.expiraEn)}.`}
        </span>
      </div>

      <div className="modal-row">
        <button className="btn btn-primary" onClick={cerrar}>Listo</button>
      </div>
    </div></div>
  );

  return (
    <div className="ov" onClick={()=>{ if(!shareBusy && !saving) cerrar(); }}>
      <div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Compartir «{d.title}»</h2>

        {!verificado && (
          <div className="share-err">
            Confirma tu correo para poder invitar a alguien.{" "}
            <button className="lnk" disabled={verifBusy} onClick={reenviarVerificacion}>
              Reenviar el enlace
            </button>
          </div>
        )}

        {!puedeCompartir ? (
          <p className="sub">
            Sólo quien tiene permiso para repartir accesos puede invitar a más
            personas a este documento.
          </p>
        ) : (<>

          {/* ── La pregunta que importa ── */}
          <div className="rec-lbl">¿Cómo quieres compartirlo?</div>
          <div className="modo-lista">
            <label className={`modo ${modo==="completo"?"on":""}`}>
              <input type="radio" name="modo" checked={modo==="completo"}
                onChange={()=>setShareModo("completo")} />
              <span className="modo-n">Acceso completo</span>
              <span className="modo-d">
                Ve todo el expediente: el contenido, los montos, la historia y los
                comprobantes de todos.
              </span>
            </label>

            {esExpediente && (
              <label className={`modo ${modo==="entregar"?"on":""}`}>
                <input type="radio" name="modo" checked={modo==="entregar"}
                  onChange={()=>setShareModo("entregar")} />
                <span className="modo-n">Sólo entregar comprobantes</span>
                <span className="modo-d">
                  Ve nada más la lista de lo que le toca subir. No ve el contenido,
                  ni los montos, ni lo que subieron los demás.
                </span>
              </label>
            )}
          </div>

          {/* ── El detalle, según lo que eligió ── */}
          {modo==="completo" ? (
            <div className="modo-det">
              <div className="rec-lbl">¿Qué puede hacer?</div>
              <div className="rol-lista">
                {COMPLETOS.map(r=>(
                  <label key={r} className={`rol-op ${shareRol===r?"on":""}`}>
                    <input type="radio" name="rol" checked={shareRol===r}
                      onChange={()=>setShareRol(r)} />
                    <span className="rol-n">{ROL_TEXTO[r]}</span>
                    <span className="rol-d">{ROL_AYUDA[r]}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="modo-det">
              <div className="rec-lbl">¿Qué le toca entregar?</div>
              <label className={`req-todo ${shareTodo?"on":""}`}>
                <input type="radio" name="alcance" checked={shareTodo}
                  onChange={()=>setShareTodo(true)} />
                <span>Todo lo que falta ({pendientes.length})</span>
              </label>
              <label className={`req-todo ${!shareTodo?"on":""}`}>
                <input type="radio" name="alcance" checked={!shareTodo}
                  onChange={()=>setShareTodo(false)} />
                <span>Elegir requisitos…</span>
              </label>

              {!shareTodo && (
                <div className="req-lista">
                  {(d.requisitos||[]).map(r=>(
                    <label key={r.id} className={`req-op ${shareReqs.includes(r.id)?"on":""}`}>
                      <input type="checkbox" checked={shareReqs.includes(r.id)}
                        onChange={()=>setShareReqs(
                          shareReqs.includes(r.id)
                            ? shareReqs.filter(x=>x!==r.id)
                            : [...shareReqs, r.id])} />
                      <span>{r.titulo}</span>
                      {r.estado==="cumplido" && <span className="req-ok">ya entregado</span>}
                    </label>
                  ))}
                </div>
              )}

              <div className="rec-lbl">El enlace vence en:</div>
              <div className="enl-plazos">
                {PLAZOS.map(p=>(
                  <button key={p} className={`enl-plazo ${(invDias||7)===p?"on":""}`}
                    onClick={()=>setInvDias(p)}>{p} días</button>
                ))}
              </div>
            </div>
          )}

          {/* ── A quién ── */}
          <div className="rec-lbl">¿A quién?</div>
          <input className="inp" type="email" placeholder="correo@ejemplo.com" value={mIn}
            disabled={shareBusy||saving||!verificado}
            onChange={e=>{setMIn(e.target.value);setShareErr("");setShareFound(null);}}
            onKeyDown={e=>e.key==="Enter"&&modo==="completo"&&doShare()} />
          {modo==="entregar" && (<>
            <textarea className="inp" style={{minHeight:64,resize:"vertical"}}
              placeholder="Mensaje (opcional): qué necesitas exactamente"
              value={solMsg} disabled={shareBusy||saving}
              onChange={e=>setSolMsg(e.target.value)} />
            <div className="enl-nota">
              Si ya tiene cuenta en chaindoc, pídeselo por correo: cada entrega queda
              a su nombre. Si no la tiene —o no quieres que se registre— el enlace
              funciona igual, y el correo aquí es sólo para tu registro.
            </div>
          </>)}

          {shareErr && <div className="share-err">{shareErr}</div>}
          {shareFound && (
            <div className="share-ok">
              <div className="avatar">{(shareFound.nombre||shareFound.email).slice(0,2).toUpperCase()}</div>
              <div>
                <div className="share-ok-n">{shareFound.nombre||"Sin nombre"}</div>
                <div className="share-ok-m">{shareFound.email}</div>
              </div>
            </div>
          )}

          {/* ── Cómo se lo mandas ── */}
          <div className="modal-row">
            {modo==="completo" ? (
              <button className="btn btn-primary" onClick={doShare}
                disabled={shareBusy||!mIn.trim()||!verificado}>
                {shareBusy ? "Verificando…" : "Dar acceso"}
              </button>
            ) : (<>
              <button className="btn btn-secondary" onClick={pedirConCuenta}
                disabled={shareBusy||!mIn.trim()||!verificado}>
                {shareBusy ? "Verificando…" : "Pedírselo por correo"}
              </button>
              <button className="btn btn-primary" disabled={saving||!verificado}
                onClick={crearEnlace}>
                {saving ? "Creando…" : "Copiar enlace sin cuenta"}
              </button>
            </>)}
          </div>

          {modo==="completo" && (
            <div className="enl-nota">
              Para acceso completo hace falta cuenta y correo confirmado. Un enlace que
              deje leer todo sin identificar a nadie se reenvía y acaba donde no debía.
            </div>
          )}
        </>)}

        {/* ── Quiénes tienen acceso ── */}
        {otros.length>0 && (<>
          <div className="rec-lbl">Con acceso ({otros.length}):</div>
          <div className="share-list">
            {otros.map(a=>(
              <div key={a.correo} className="share-row">
                <div className="avatar sm">{a.correo.slice(0,2).toUpperCase()}</div>
                <span className="share-row-m">{a.correo}</span>
                <span className="rol-tag">{ROL_TEXTO[a.rol]||a.rol}</span>
                {(puedeCompartir || d.ownerUid===uid) && (
                  <button className="smart-x" title="Retirar acceso"
                    onClick={()=>revokeShare(a.correo)}>×</button>
                )}
              </div>
            ))}
          </div>
        </>)}

        {/* ── Enlaces vivos ── */}
        {enlaces && (
          <div className="enl-lista">
            <div className="rec-lbl">Enlaces de entrega ({enlaces.length}):</div>
            {enlaces.length === 0 && <div className="enl-nota">Todavía no has creado ninguno.</div>}
            {enlaces.map(e=>(
              <div key={e.huella} className={`enl-fila ${e.estado!=="vigente"?"muerto":""}`}>
                <div className="enl-fila-b">
                  <div className="enl-fila-t">
                    {e.reqIds?.length === 1 ? "1 comprobante" : `${e.reqIds?.length||0} comprobantes`}
                  </div>
                  <div className="enl-fila-d">
                    {e.correo ? `${e.correo} · ` : ""}
                    {e.estado === "vigente"
                      ? `vence en ${tiempoRestante(e.expiraEn)}`
                      : { vencida:"vencido", revocada:"retirado", agotada:"tope alcanzado" }[e.estado] || e.estado}
                    {e.entregas > 0 && ` · ${e.entregas} entregas`}
                  </div>
                </div>
                {e.estado === "vigente" && (
                  <button className="smart-x" title="Retirar este enlace"
                    onClick={()=>revocarEnlace(e.huella)}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="modal-row">
          {esExpediente && (
            <button className="btn btn-tertiary" onClick={verEnlaces}>Ver enlaces creados</button>
          )}
          <button className="btn btn-tertiary" onClick={()=>copyLink()}><IcoLink/> Copiar enlace del documento</button>
          <button className="btn btn-warning" disabled={shareBusy} onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}