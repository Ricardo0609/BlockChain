// Modal de configuración de la cuenta.

import { deviceLabel } from "../biometric";


export function modalAjustes(ctx){
  const {
    bioBusy, bioCreds, bioOk, enrollBio, mIn, modal, pass, saveSettings, setMIn,
    setModal, setPass,
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
      {/* ← QUITADO (10 nov): los dos botones de traslado.
          Movían documentos de la colección `documents` y archivos
          guardados en base64 dentro de Firestore a donde viven ahora.
          Eran de cuando se estaba mudando de un sistema a otro, y una
          cuenta nueva nunca ha tenido nada ahí: lo único que hacían
          era prometerle a alguien recién llegado que algo suyo se
          quedó atrás. Las funciones `migrar` y `migrarArchivos` del
          servidor también se fueron. */}
      <div className="modal-row">
        <button className="btn btn-secondary" onClick={()=>{setPass("");setModal(null);}}>Cancelar</button>
        {/* ← ACTUALIZADO: ahora persiste en Firestore, antes sólo vivía en memoria */}
        <button className="btn btn-primary" onClick={saveSettings}>Guardar</button>
      </div>
    </div></div>
  );

  return null;
}