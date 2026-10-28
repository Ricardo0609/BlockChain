// Quién más ve esto, y con qué papel.
//
// Vive aparte porque lo usan dos pantallas: el documento de texto y el
// expediente. Son la misma pregunta —«¿quién entra aquí y qué puede
// hacer?»— y la respuesta tiene que verse y comportarse igual en las
// dos. Dos copias del mismo panel se separan a la primera corrección
// que se haga en una sola.
//
// Antes esto sólo existía dentro del modal de compartir, y para
// cambiarle el papel a alguien que YA estaba en la lista había que
// volver a escribir su correo. Aquí se cambia en sitio.

import { ROLES_OFRECIDOS } from "../nucleo/accesos";
import { enlacesCompartidos, enlacesVivos, ESTADO_ENLACE } from "../nucleo/enlacesCompartidos";

/** Los que tienen acceso sin contar al dueño, que no se toca. */
export const conAccesoDe = (accesos) =>
  (accesos || []).filter((a) => a.rol !== "propietario");

/**
 * Cuántos accesos hay de verdad: personas y enlaces todavía vivos.
 *
 * ← NUEVO (28 oct): un enlace de entrega es acceso concedido aunque
 * del otro lado no haya una cuenta, así que cuenta. Los vencidos y los
 * retirados no: salen en la lista por su historia, no porque abran
 * ninguna puerta.
 */
export const cuantosAcceden = (accesos, chain) =>
  conAccesoDe(accesos).length + enlacesVivos(chain).length;

// Los ids van explícitos porque cada pantalla nombra sus pestañas a su
// manera —el expediente usa `tab-x`/`panel-x`, el documento `dx-tab`/
// `dx-panel`— y un lector de pantalla necesita que la pestaña y su
// panel se apunten de verdad el uno al otro.
export function renderAccesos(ctx, { panelId, tabId } = {}){
  const {
    accesos, cambiarRol, revokeShare, rolBusy, ROL_TEXTO, d, revocarEnlace,
    setMIn, setModal, setEnlaceNuevo, setShareModo, setShareTodo, setShareReqs,
    puedo,
  } = ctx;

  const lista = conAccesoDe(accesos);
  const enlaces = enlacesCompartidos(d?.chain);
  const puedeRepartir = !puedo || puedo("compartir");

  const abrirCompartir = ()=>{
    setMIn(""); setEnlaceNuevo(null);
    setShareModo("completo"); setShareTodo(true); setShareReqs([]);
    setModal({t:"share"});
  };

  return (
    <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="doc-acc">
      <p className="gal-sub">
        {puedeRepartir
          ? "Cambia el papel de cada quien aquí mismo. El cambio queda asentado en el historial, con quién lo hizo y cuándo."
          : "Quien reparte los accesos es quien puede cambiarlos."}
        {enlaces.length > 0 && (
          <> Los enlaces de entrega también aparecen aquí: no tienen papel que cambiar,
          pero sí quedan a nombre de quien los compartió.</>
        )}
      </p>

      <div className="share-list">
        {lista.map(a=>(
          <div key={a.correo} className="share-row">
            <div className="avatar sm">{a.correo.slice(0,2).toUpperCase()}</div>
            <span className="share-row-m">{a.correo}</span>
            {puedeRepartir ? (
              <select className="rol-sel" value={a.rol} disabled={rolBusy===a.correo}
                aria-label={`Papel de ${a.correo}`}
                onChange={e=>cambiarRol(a.correo, e.target.value)}>
                {/* El suyo va siempre, aunque ya no se ofrezca: si entró
                    como Editor hay que poder verlo tal cual antes de
                    decidir cambiarlo. */}
                {[...new Set([a.rol, ...ROLES_OFRECIDOS])].map(r=>(
                  <option key={r} value={r}>{ROL_TEXTO[r]||r}</option>
                ))}
              </select>
            ) : (
              <span className="rol-tag">{ROL_TEXTO[a.rol]||a.rol}</span>
            )}
            {puedeRepartir && (
              <button className="smart-x" title="Retirar acceso"
                disabled={rolBusy===a.correo}
                onClick={()=>revokeShare(a.correo)}>×</button>
            )}
          </div>
        ))}

        {/* ← NUEVO (28 oct): los enlaces de entrega.
            Del otro lado no hay una cuenta, así que no hay papel que
            cambiar: en vez del desplegable va lo que pasó. Quien
            aparece es QUIEN LO COMPARTIÓ, que es de quien hay que
            poder seguir el rastro — el enlace en sí no tiene dueño.
            Sale de la cadena, que es el registro que nadie reescribe. */}
        {enlaces.map(x=>(
          <div key={x.clave} className={`share-row enlace ${x.estado}`}>
            <div className="avatar sm enl">↗</div>
            <span className="share-row-m">
              {x.creadoPor || "Alguien"}
              <span className="enl-dest">
                {x.correo ? ` → ${x.correo}` : " → enlace sin destinatario"}
                {x.requisitos ? ` · ${x.requisitos} comprobante${x.requisitos===1?"":"s"}` : ""}
              </span>
            </span>
            <span className="rol-tag enl-tag">{ESTADO_ENLACE[x.estado]}</span>
            {puedeRepartir && x.estado==="vigente" && x.huella && (
              <button className="smart-x" title="Retirar el enlace"
                onClick={()=>revocarEnlace(x.huella)}>×</button>
            )}
          </div>
        ))}
      </div>

      {puedeRepartir && (
        <div className="doc-acc-pie">
          <button className="btn btn-secondary" onClick={abrirCompartir}>
            Dar acceso a alguien más
          </button>
        </div>
      )}
    </div>
  );
}
