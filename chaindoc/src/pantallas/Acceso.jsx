// Pantalla de registro e inicio de sesión.

import { IcoFinger } from "../ui/iconos";
import { deviceLabel } from "../biometric";
import { ESTILOS } from "../ui/estilos";
export function renderAcceso(ctx){
  const {
    authBusy, authMode, authStep, bioBusy, bioOk, doLogin, doReset, doSignCode,
    doSignup, email, enrollBio, finishAuth, mIn, notif, pass, setEmail, setMIn, setPass,
    switchAuth,
    legalOk, setLegalOk, setLegalTab, setModal,
  } = ctx;
  // ← NUEVO: abre el aviso o los términos sin salir del registro.
  const verLegal = (cual)=>{ setLegalTab(cual); setModal({t:"legal"}); };
  return (<><style>{ESTILOS}</style>
    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
    <div className="auth-wrap"><div className="auth-card">
      {/* ← NUEVO: pantalla de inicio de sesión */}
      {authMode==="login" && (<>
        <h1 className="auth-title">Iniciar sesión</h1>
        <p className="auth-sub">Entra con la cuenta que ya creaste.</p>
        <input className="inp" type="email" autoComplete="email" placeholder="Correo electrónico"
          value={email} onChange={e=>setEmail(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&doLogin()} />
        <input className="inp" type="password" autoComplete="current-password" placeholder="Contraseña"
          value={pass} onChange={e=>setPass(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&doLogin()} />
        <div className="auth-actions">
          <button className="btn btn-tertiary" onClick={()=>switchAuth("signup")}>
            ¿No tienes cuenta? Créala
          </button>
          <button className="btn btn-primary" onClick={doLogin} disabled={authBusy}>
            {authBusy ? "Entrando…" : "Entrar"}
          </button>
        </div>
        <button className="btn btn-tertiary" style={{marginTop:4}} onClick={doReset}>
          ¿Olvidaste tu contraseña?
        </button>
      </>)}

      {authMode==="signup" && authStep===0 && (<>
        <h1 className="auth-title">Crear cuenta</h1>
        <p className="auth-sub">Documentos con registro inalterable en cadena criptográfica.</p>
        <input className="inp" placeholder="Nombre completo" value={mIn} onChange={e=>setMIn(e.target.value)} />
        <input className="inp" type="email" autoComplete="email" placeholder="Correo electrónico"
          value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="inp" type="password" autoComplete="new-password"
          placeholder="Contraseña (mínimo 6 caracteres)" value={pass} onChange={e=>setPass(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&doSignup()} />
        {/* ← NUEVO: el consentimiento. Sin marcar por omisión a propósito:
            una casilla premarcada no es consentimiento, es un descuido
            del que se aprovecha quien la puso. */}
        <label className="legal-check">
          <input type="checkbox" checked={legalOk} onChange={e=>setLegalOk(e.target.checked)} />
          <span>
            He leído y acepto el{" "}
            <button type="button" className="lnk" onClick={()=>verLegal("aviso")}>aviso de privacidad</button>
            {" "}y los{" "}
            <button type="button" className="lnk" onClick={()=>verLegal("terminos")}>términos de uso</button>.
          </span>
        </label>
        <div className="legal-nota">
          Versión piloto: el servicio puede cambiar o interrumpirse. Guarda tus propias
          copias de lo que sea importante.
        </div>

        <div className="auth-actions">
          {/* ← ACTUALIZADO: este botón no tenía onClick, por eso no hacía nada */}
          <button className="btn btn-tertiary" onClick={()=>switchAuth("login")}>
            ¿Ya tienes cuenta? Inicia sesión
          </button>
          <button className="btn btn-primary" onClick={doSignup} disabled={authBusy||!legalOk}>
            {authBusy ? "Creando…" : "Continuar"}
          </button>
        </div>
        <div className="dots"><span className="dot on"/><span className="dot"/></div>
      </>)}

      {authMode==="signup" && authStep===1 && (<>
        <h1 className="auth-title">Código de firma</h1>
        <p className="auth-sub" style={{marginBottom:24,textAlign:"left"}}>
          Crea un código para firmar tus documentos. Este código es independiente a tu contraseña de la cuenta;
          lo podrás cambiar las veces que quieras en configuración.
        </p>
        <input className="inp" type="password" placeholder="Código de firma" value={pass}
          onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSignCode()} />
        <div className="auth-actions">
          {/* ← ACTUALIZADO: ya no hay "Atrás". La cuenta ya existe en este punto;
              regresar al formulario intentaría crearla otra vez. */}
          <button className="btn btn-primary" onClick={doSignCode}>Continuar</button>
        </div>
        <div className="dots"><span className="dot"/><span className="dot on"/></div>
      </>)}

      {authMode==="signup" && authStep===2 && (<>
        {/* ← ACTUALIZADO: antes sólo mostraba una notificación sin hacer nada. */}
        <p className="auth-sub" style={{fontSize:20,color:"var(--negro)",marginBottom:12}}>
          {bioOk
            ? "¿Deseas activar el desbloqueo biométrico para firmar tus documentos?"
            : "Este dispositivo no tiene verificación biométrica disponible."}
        </p>
        <p className="auth-sub" style={{fontSize:14,marginBottom:24}}>
          {bioOk
            ? `Se registrará en ${deviceLabel()}. Tu código de firma seguirá funcionando como respaldo.`
            : window.isSecureContext
              ? "Podrás activarla más tarde desde Configuración."
              : "La biometría requiere una conexión segura (HTTPS)."}
        </p>
        <div className="auth-actions">
          <button className="btn btn-secondary" onClick={finishAuth} disabled={bioBusy}>
            {bioOk ? "Ahora no" : "Continuar"}
          </button>
          {bioOk && (
            <button className="btn btn-primary" disabled={bioBusy}
              onClick={async()=>{ await enrollBio(); finishAuth(); }}>
              {bioBusy ? "Esperando…" : "Activar"}
            </button>
          )}
        </div>
        {bioOk && (
          <div className="fingerprint" onClick={async()=>{ if(!bioBusy){ await enrollBio(); finishAuth(); } }}>
            <IcoFinger/>
          </div>
        )}
      </>)}
    </div></div>
  </>);
}