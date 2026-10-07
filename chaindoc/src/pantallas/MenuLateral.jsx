// Menú lateral (cuenta, inicio, cerrar sesión, crear).

import { IcoGear, Icon } from "../ui/iconos";

export function renderMenu(ctx){
  const {
    acctEmail, goHome, openCreate, setMIn, setMenu, setModal, setPass, user,
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
            primero que busca quien duda si subir algo.
            ← ACTUALIZADO: el icono era «policy», que ni siquiera estaba
            en el juego de iconos que se descarga, así que salía como
            texto suelto. Un escudo se lee de inmediato como protección. */}
        <button className="menu-item"
          onClick={()=>{setMenu(false);setLegalTab("aviso");setModal({t:"legal"});}}>
          <Icon n="shield" size={22}/> Privacidad y términos
        </button>
        {/* ← ACTUALIZADO: en rojo y con confirmación. Está a un dedo de
            los demás, y quien le da sin querer pierde lo que estuviera
            escribiendo. */}
        <button className="menu-item peligro"
          onClick={()=>{setMenu(false);setModal({t:"logout"});}}>
          <Icon n="logout" size={22}/> Cerrar sesión
        </button>
        <button className="create-btn" style={{marginTop:8}}
          onClick={()=>{setMenu(false);openCreate();}}>
          <span>Crear documento</span><b>+</b>
        </button>
        <button className="menu-x" aria-label="Cerrar el menú" onClick={()=>setMenu(false)}>
          <Icon n="close" size={28}/>
        </button>
      </div>
    </div>
  );
}
