// Pantalla pública de entrega por invitación.
//
// La ve alguien que no tiene cuenta: el proveedor al que le pediste
// sus facturas. Por eso no hay menú ni barra de navegación. Una lista
// de lo que le toca entregar y un botón por cada cosa.
//
// Lo que NO está aquí importa tanto como lo que sí: no ve el contrato,
// ni los montos pactados, ni las otras partes, ni los archivos que
// subieron los demás. Esa limitación no es de esta pantalla — es del
// servidor, que sólo le manda esto.
//
// ← ACTUALIZADO (28 oct): hasta hoy aquí no había NADA que invitara a
// registrarse, a propósito. Ahora hay una invitación, pero al final de
// todo y después de que ya entregó: primero cumple con quien se lo
// pidió, y sólo entonces se le ofrece algo. Nada de lo que tiene que
// hacer en esta página pasa por crear una cuenta, y el texto no
// insinúa que sí.

import { Icon } from "../ui/iconos";
import { ESTILOS } from "../ui/estilos";
import { tiempoRestante } from "../nucleo/invitaciones";
import { fmtFull } from "../nucleo/formato";
import { CampoEnlace } from "../ui/CampoEnlace";

/**
 * A dónde lleva «Conoce chaindoc».
 *
 * De momento, a la portada de la propia app. Cuando exista la landing
 * que explica qué ofrecemos, se cambia AQUÍ y en ningún otro sitio.
 */
export const LANDING = "/";

export function renderEntrega(ctx){
  const {
    invitacion, invError, invPaso, invBusy, invSubiendo, entregas, entregar, notif,
    abrirEnlace, cerrarEnlace, entregarEnlaceReq,
    enlReq, enlUrl, enlNom, enlErr, enlBusy, setEnlUrl, setEnlNom,
  } = ctx;

  const Marco = ({ children }) => (<><style>{ESTILOS}</style>
    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
    <div className="entrega-wrap">
      <div className="entrega">
        <div className="entrega-marca">chaindoc</div>
        {children}
      </div>
    </div></>);

  if(invitacion === undefined) return (
    <Marco><div className="loading"><div className="spin"/><p>Abriendo el enlace…</p></div></Marco>
  );

  if(invError) return (
    <Marco>
      <div className="entrega-mal">
        <Icon n="link_off" size={40}/>
        <h1>Este enlace no se puede usar</h1>
        <p>{invError}</p>
        <p className="entrega-pie">
          Si crees que es un error, responde el correo de quien te lo envió y pídele uno nuevo.
        </p>
      </div>
    </Marco>
  );

  const reqs = invitacion.requisitos || [];
  const entregados = reqs.filter(r=>r.entregado || entregas[r.id]).length;
  const listo = entregados === reqs.length;
  const queda = tiempoRestante(invitacion.expiraEn);

  return (
    <Marco>
      <div className="entrega-cab">
        <h1>{listo ? "Ya entregaste todo" : "Te piden comprobantes"}</h1>
        {invitacion.pedidoPor && (
          <p className="entrega-de">
            <b>{invitacion.pedidoPor}</b> te pidió esto para «{invitacion.documento}».
          </p>
        )}
        {reqs.length > 1 && (
          <p className="entrega-cuenta">{entregados} de {reqs.length} entregados</p>
        )}
      </div>

      <div className="entrega-lista">
        {reqs.map(r=>{
          const hecho = entregas[r.id];
          const yaEstaba = r.entregado && !hecho;
          const subiendo = invSubiendo === r.id;

          return (
            <div key={r.id} className={`entrega-item ${hecho||yaEstaba?"hecho":""}`}>
              <div className="entrega-item-b">
                <div className="entrega-item-t">
                  {(hecho || yaEstaba) && <Icon n="check_circle" size={16}/>}
                  {r.titulo}
                </div>
                {r.descripcion && !hecho && (
                  <div className="entrega-item-d">{r.descripcion}</div>
                )}
                {hecho && (
                  <div className="entrega-item-ok">
                    Entregado: {hecho.nombre}
                    {hecho.url && (
                      <a className="entrega-item-u" href={hecho.url}
                         target="_blank" rel="noopener noreferrer nofollow">{hecho.url}</a>
                    )}
                    <div className="entrega-item-h">{hecho.hash}</div>
                  </div>
                )}
                {yaEstaba && <div className="entrega-item-d">Ya se entregó.</div>}
              </div>

              {/* ← ACTUALIZADO (10 oct): no todo entregable es un
                  archivo. Un sitio publicado o un repositorio se
                  entrega con su dirección, y antes había que mandar una
                  captura de pantalla que prueba menos. Los dos caminos
                  van juntos y sin jerarquía: cuál sirve lo sabe quien
                  entrega, no nosotros. */}
              {!hecho && enlReq!==r.id && (
                <div className="entrega-acts">
                  <label className={`entrega-btn ${subiendo?"ocupado":""} ${yaEstaba?"otra":""}`}>
                    {subiendo
                      ? <><span className="mini-spin"/> {invPaso || "Subiendo…"}</>
                      : <><Icon n="upload_file" size={17}/> {yaEstaba ? "Subir otro" : "Subir"}</>}
                    <input type="file" style={{display:"none"}} disabled={invBusy}
                      onChange={e=>{ entregar(r.id, e.target.files?.[0]); e.target.value=""; }} />
                  </label>
                  <button className="entrega-btn otra" disabled={invBusy}
                    onClick={()=>abrirEnlace(r.id)}>
                    <Icon n="link" size={17}/> Enlace
                  </button>
                </div>
              )}

              {/* .entrega-item ya envuelve, asi que el formulario cae
                  solo a su propio renglon a lo ancho. */}
              {enlReq===r.id && (
                <CampoEnlace
                  url={enlUrl} nombre={enlNom} error={enlErr} ocupado={enlBusy}
                  onUrl={setEnlUrl} onNombre={setEnlNom}
                  onGuardar={entregarEnlaceReq} onCancelar={cerrarEnlace}
                  textoGuardar="Entregar enlace"/>
              )}
            </div>
          );
        })}
      </div>

      {/* Si es una factura, el XML vale mucho más que el PDF: es el
          documento fiscal, y con él se comprueba ante el SAT. */}
      <div className="entrega-tip">
        <Icon n="lightbulb" size={16}/>
        <span>
          Si es una factura, sube el <b>XML</b> y no sólo el PDF: con el XML se comprueba
          automáticamente ante el SAT y no hay que capturar nada a mano.
        </span>
      </div>

      {listo && (
        <div className="entrega-listo">
          <Icon n="task_alt" size={20}/>
          <span>
            Listo, no falta nada. Ya puedes cerrar esta página —
            no necesitas crear ninguna cuenta.
          </span>
        </div>
      )}

      <div className="entrega-pie">
        Las huellas que ves son de tus archivos: identifican cada uno de forma única, y si
        alguien lo cambiara aunque fuera un carácter dejarían de coincidir. Puedes guardarlas.
        {" "}
        {queda && queda !== "vencido" && <>Este enlace vence en {queda}</>}
        {invitacion.expiraEn && <>, el {fmtFull(invitacion.expiraEn)}</>}.
        {" "}Sólo sirve para entregar estos comprobantes, y quien te lo envió puede retirarlo
        cuando quiera. Hasta {invitacion.archivosRestantes} archivos más.
      </div>

      {/* ← NUEVO (28 oct): la invitación a tener esto del lado propio.
          Va la última y sin competir con los botones de entregar: quien
          abre esta página viene a cumplirle a alguien, no a conocernos.
          Y el texto no dice que le haga falta una cuenta, porque no le
          hace falta: entregó sin crear nada y eso se mantiene. */}
      <div className="entrega-cta">
        <Icon n="shield" size={22}/>
        <div className="entrega-cta-b">
          <strong>¿Y si lo tuyo también quedara probado?</strong>
          <p>
            Acabas de entregar con huella y fecha, sin crear ninguna cuenta. Eso mismo
            puede trabajar de tu lado: tus contratos, lo que entregas y la prueba de lo
            que cumpliste, guardados de forma que nadie los pueda cambiar después.
          </p>
          <a className="entrega-cta-btn" href={LANDING}
             target="_blank" rel="noopener noreferrer">
            Conoce chaindoc
          </a>
        </div>
      </div>
    </Marco>
  );
}