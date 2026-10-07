// Modales de firma, archivos protegidos y contraseña.

import { IcoFinger } from "../ui/iconos";
import { deviceLabel } from "../biometric";
import { aceptaEfirma } from "../nucleo/catalogos";   // ← NUEVO (Etapa 5)

export function modalFirma(ctx){
  const {
    bioBusy, bioCreds, bioOk, d, modal, pass, saving, setLock, setModal, setPass, signWithBio,
    trySign, unlockFiles, unlockFilesBio, user,
  } = ctx;
  if(modal.t==="sign"){
    const canBio = bioOk && bioCreds.length>0;   // ← NUEVO
    return (
    <div className="ov" onClick={()=>{if(!bioBusy)setModal(null);}}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Firmar documento</h2>
      <p className="sub">
        La firma quedará registrada permanentemente en la cadena a nombre de <strong>{user}</strong>.
      </p>

      {/* ← NUEVO: la huella ahora sí dispara la verificación real */}
      {canBio && (<>
        <button className="btn btn-primary" style={{width:"100%"}} disabled={bioBusy}
          onClick={signWithBio}>
          {bioBusy ? "Esperando verificación…" : `Firmar con ${deviceLabel()==="iPhone"||deviceLabel()==="iPad"?"Face ID":"tu biometría"}`}
        </button>
        <div className="fingerprint" onClick={()=>{ if(!bioBusy) signWithBio(); }}><IcoFinger/></div>
        <div className="sign-or"><span>o usa tu código</span></div>
      </>)}

      <input className="inp" type="password" placeholder="Código de firma" value={pass}
        onChange={e=>setPass(e.target.value)} autoFocus={!canBio}
        onKeyDown={e=>{if(e.key==="Enter"){ trySign(); }}} />
      <div className="modal-row">
        <button className="btn btn-secondary" onClick={()=>setModal(null)} disabled={bioBusy}>Cancelar</button>
        <button className={`btn btn-primary ${saving?"esperando":""}`}
          onClick={()=>{ trySign(); }} disabled={bioBusy||saving}>
          {saving ? "Firmando…" : "Firmar"}
        </button>
      </div>
      {!canBio && <div className="fingerprint" onClick={()=>{ trySign(); }}><IcoFinger/></div>}

      {/* ← NUEVO (Etapa 5): la vía formal. Va la última y sin destacar
          a propósito: el día a día es el código o la huella. */}
      {aceptaEfirma(d) && (<>
        <div className="sign-or"><span>o firma formalmente</span></div>
        <button className="btn btn-secondary efirma-abrir" disabled={bioBusy}
          onClick={()=>{ setPass(""); setModal({ t:"efirma" }); }}>
          Firmar con mi e.firma del SAT
        </button>
        <p className="efirma-pie">
          Tus archivos no se suben: la firma se hace en este dispositivo.
        </p>
      </>)}
    </div></div>
    );
  }

  // ← ACTUALIZADO: ahora también se puede abrir con biometría
  if(modal.t==="files"){
    const canBio = bioOk && bioCreds.length>0;
    return (
    <div className="ov" onClick={()=>{if(!bioBusy)setModal(null);}}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Documentos adjuntos</h2>
      <p className="sub">
        Verifica tu identidad para consultar y descargar los comprobantes de este expediente.
      </p>

      {canBio && (<>
        <button className="btn btn-primary" style={{width:"100%"}} disabled={bioBusy}
          onClick={unlockFilesBio}>
          {bioBusy ? "Esperando verificación…"
            : `Desbloquear con ${deviceLabel()==="iPhone"||deviceLabel()==="iPad"?"Face ID":"tu biometría"}`}
        </button>
        <div className="fingerprint" onClick={()=>{ if(!bioBusy) unlockFilesBio(); }}><IcoFinger/></div>
        <div className="sign-or"><span>o usa tu código</span></div>
      </>)}

      <input className="inp" type="password" placeholder="Código de firma" value={pass}
        onChange={e=>setPass(e.target.value)} autoFocus={!canBio}
        onKeyDown={e=>e.key==="Enter"&&unlockFiles()} />
      <div className="modal-row">
        <button className="btn btn-secondary" disabled={bioBusy}
          onClick={()=>{setPass("");setModal(null);}}>Cancelar</button>
        <button className="btn btn-primary" onClick={unlockFiles} disabled={bioBusy}>Desbloquear</button>
      </div>
    </div></div>
    );
  }

  if(modal.t==="lock") return (
    <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Proteger documento</h2>
      <p className="sub">Establece una contraseña para este documento. Quien tenga el enlace deberá ingresarla para verlo.</p>
      <input className="inp" type="password" placeholder="Contraseña del documento" value={pass}
        onChange={e=>setPass(e.target.value)} autoFocus
        onKeyDown={e=>e.key==="Enter"&&pass.trim()&&setLock(pass.trim())} />
      <div className="modal-row">
        <button className="btn btn-warning" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="btn btn-primary" onClick={()=>pass.trim()&&setLock(pass.trim())}>Proteger</button>
      </div>
    </div></div>
  );

  // ← NUEVO: elegir expediente y después el requisito que cumple
  return null;
}
