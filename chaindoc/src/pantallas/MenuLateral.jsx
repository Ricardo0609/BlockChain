// Menú lateral (cuenta, inicio, cerrar sesión, crear).

import { IcoGear, Icon } from "../ui/iconos";

export function renderMenu(ctx){
  const {
    acctEmail, doLogout, goHome, openCreate, setMIn, setMenu, setModal, setPass, user,
    setLegalTab,
  } = ctx;
  return (
    <div className="menu-ov" onClick={()=>setMenu(false)}>
      <div className="menu" onClick={e=>e.stopPropagation()}>
        <div className="menu-av"><Icon n="account_circle" size={38}/></div>
        <div className="menu-name">{user}</div>
        <div className="menu-mail">{acctEmail}</div>{/* ← NUEVO */}
        <button className="menu-item" onClick={()=>{setMenu(false);setPass("");setMIn(user);setModal({t:"settings"});}}>
          <IcoGear/> Configuración
        </button>
        <button className="menu-item" onClick={()=>{setMenu(false);goHome();}}><Icon n="home" size={22}/> Inicio</button>
        {/* ← NUEVO: el aviso y los términos tienen que estar siempre a
            mano, no sólo en el registro. Lo pide la ley y además es lo
            primero que busca quien duda si subir algo. */}
        <button className="menu-item"
          onClick={()=>{setMenu(false);setLegalTab("aviso");setModal({t:"legal"});}}>
          <Icon n="policy" size={22}/> Privacidad y términos
        </button>
        {/* ← NUEVO: sin esto no había forma de cambiar de cuenta */}
        <button className="menu-item" onClick={doLogout}><Icon n="logout" size={22}/> Cerrar sesión</button>
        <button className="create-btn" style={{marginTop:8}}
          onClick={()=>{setMenu(false);openCreate();}}>
          <span>Crear documento</span><b>+</b>
        </button>
        <button className="menu-x" onClick={()=>setMenu(false)}>✕</button>
      </div>
    </div>
  );
}