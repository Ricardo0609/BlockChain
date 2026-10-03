// Modal de configuración de la cuenta.

import { deviceLabel } from "../biometric";
import { enServidor } from "../nucleo/datos";

export function modalAjustes(ctx){
  const {
    bioBusy, bioCreds, bioOk, enrollBio, mIn, modal, pass, saveSettings, setMIn,
    setModal, setPass, migrarDatos, migrando, migrarArchivosDatos, migrandoArch,
  } = ctx;
  if(modal.t==="settings") return (
    <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>Configuración</h2>
      <p className="sub">Cambia tu nombre o tu código de firma.</p>
      <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Nombre:</p>
      {/* ← ACTUALIZADO: se edita en un campo temporal y se confirma al guardar */}
      <input className="inp" placeholder="Tu nombre" value={mIn} onChange={e=>setMIn(e.target.value)} />
      <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Nuevo código de firma:</p>
      <input className="inp" type="password" placeholder="Déjalo vacío para no cambiarlo"
        value={pass} onChange={e=>setPass(e.target.value)} />
      {/* ← NUEVO: activar o añadir biometría después del registro */}
      {bioOk && (<>
        <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Verificación biométrica:</p>
        {bioCreds.length>0 && (
          <p style={{fontSize:13,color:"var(--gris-300)",marginBottom:8}}>
            Activa en: {bioCreds.map(c=>c.device).join(", ")}
          </p>
        )}
        <button className="btn btn-secondary" style={{width:"100%",marginBottom:16}}
          disabled={bioBusy} onClick={enrollBio}>
          {bioBusy ? "Esperando…"
            : bioCreds.some(c=>c.device===deviceLabel())
              ? `Volver a registrar ${deviceLabel()}`
              : `Activar en ${deviceLabel()}`}
        </button>
      </>)}
      {/* ← NUEVO (Etapa 2): traslado al formato nuevo, donde la cadena
          la escribe el servidor. Se puede correr las veces que haga falta. */}
      {enServidor() && (<>
        <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Documentos del formato anterior:</p>
        <button className="btn btn-secondary" style={{width:"100%",marginBottom:8}}
          disabled={migrando} onClick={migrarDatos}>
          {migrando ? "Trasladando…" : "Trasladar mis documentos al formato nuevo"}
        </button>
        <button className="btn btn-secondary" style={{width:"100%",marginBottom:16}}
          disabled={migrandoArch} onClick={migrarArchivosDatos}>
          {migrandoArch ? "Trasladando archivos…" : "Trasladar mis archivos al almacén nuevo"}
        </button>
      </>)}
      <div className="modal-row">
        <button className="btn btn-secondary" onClick={()=>{setPass("");setModal(null);}}>Cancelar</button>
        {/* ← ACTUALIZADO: ahora persiste en Firestore, antes sólo vivía en memoria */}
        <button className="btn btn-primary" onClick={saveSettings}>Guardar</button>
      </div>
    </div></div>
  );

  return null;
}