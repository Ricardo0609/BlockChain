// El panel de notificaciones: lo que otra gente hizo contigo.
//
// Sale por la derecha, igual que el menú, porque es el mismo gesto y
// no hay razón para que se abra de otro lado. Lo que cambia es para
// qué sirve cada uno:
//
//   - el MENÚ es tu cuenta y los atajos de siempre;
//   - la BARRA de «Requiere atención» mira tu propio trabajo, lo que
//     se vence y lo que lleva días quieto, y por eso está a la vista
//     en la página;
//   - la CAMPANA mira lo que hizo alguien más. Son cosas que pasaron
//     mientras no mirabas, así que están guardadas detrás del icono.
//
// Aquí no se decide nada: `nucleo/notificaciones.js` dice qué hay y
// esto lo pinta. De cada notificación se entra al documento, que es
// lo único que se puede querer hacer desde una lista de avisos.

import { Icon } from "../ui/iconos";
import { ICONO } from "../nucleo/notificaciones";
import { fmtShort } from "../nucleo/formato";

export function renderCampana(ctx){
  const { notis, setCampana, openDoc } = ctx;
  const lista = notis || [];
  const pendientes = lista.filter(n=>n.pendiente);
  const avisos = lista.filter(n=>!n.pendiente);

  const Fila = (n)=>(
    <button key={n.clave} className={`noti ${n.grave?"grave":""}`}
      onClick={()=>{ setCampana(false); openDoc(n.docId); }}>
      <span className="noti-i"><Icon n={ICONO[n.tipo]||"info"} size={19}/></span>
      <span className="noti-b">
        <span className="noti-t">{n.texto}</span>
        {n.fecha && <span className="noti-f">{fmtShort(n.fecha)}</span>}
      </span>
    </button>
  );

  return (
    <div className="menu-ov" onClick={()=>setCampana(false)}>
      <div className="menu camp" onClick={e=>e.stopPropagation()}>
        <div className="camp-h">
          <Icon n="notifications" size={22}/>
          <span className="camp-t">Notificaciones</span>
          <button className="icon-btn" title="Cerrar" aria-label="Cerrar"
            onClick={()=>setCampana(false)}>
            <Icon n="close" size={22}/>
          </button>
        </div>

        {lista.length===0 ? (
          <div className="camp-vacio">
            <Icon n="task_alt" size={34}/>
            <strong>Nada nuevo</strong>
            <span>
              Aquí aparece lo que otra gente haga: cuando te compartan un
              documento, te manden un contrato a firmar o te pidan un
              comprobante.
            </span>
          </div>
        ) : (<>
          {/* Lo que te toca hacer va primero y aparte. Mezclado con los
              avisos se pierde, y es lo único de esta lista que alguien
              está esperando de ti. */}
          {pendientes.length>0 && (
            <div className="camp-grupo">
              <div className="camp-g">Te toca a ti</div>
              {pendientes.map(Fila)}
            </div>
          )}
          {avisos.length>0 && (
            <div className="camp-grupo">
              {pendientes.length>0 && <div className="camp-g">Para enterarte</div>}
              {avisos.map(Fila)}
            </div>
          )}
          <div className="camp-pie">
            Los avisos se quitan solos al abrir el documento. Lo que te toca
            hacer se queda hasta que lo hagas.
          </div>
        </>)}
      </div>
    </div>
  );
}

/** El botón de la barra de arriba, con su globito. */
export function botonCampana(ctx){
  const { notis, setCampana } = ctx;
  const n = (notis||[]).length;
  const urge = (notis||[]).some(x=>x.pendiente);
  return (
    <button className={`camp-btn ${n?"con":""}`} onClick={()=>setCampana(true)}
      title={n ? `${n} notificación${n===1?"":"es"}` : "Notificaciones"}
      aria-label={n ? `Notificaciones: ${n} sin ver` : "Notificaciones"}>
      <Icon n={n ? "notifications_active" : "notifications"} size={26}/>
      {n>0 && <span className={`camp-n ${urge?"urge":""}`}>{n>9?"9+":n}</span>}
    </button>
  );
}
