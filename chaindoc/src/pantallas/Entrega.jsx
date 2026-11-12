// Pantalla pública de entrega por invitación.
//
// La ve alguien que no tiene cuenta: el proveedor al que le pediste
// sus facturas. Por eso no hay menú ni barra de navegación. Una lista
// de lo que le toca entregar y un botón por cada cosa.
//
// ← CAMBIADO (12 nov): AHORA SÍ VE EL CONTRATO, Y PRIMERO.
//
// Hasta hoy esta pantalla empezaba por «Te piden comprobantes» y la
// lista de archivos. Lo encontró Ricardo probando: se le pedía a
// alguien la factura del material sin dejarle ver el contrato que
// dice qué material, por cuánto y para cuándo. Cumplir a ciegas.
//
// Ahora el orden es el mismo que tiene quien sí tiene cuenta: leer,
// y sólo después responder. Si además le toca aceptar el contrato
// —porque el enlace se mandó al correo que es parte del acuerdo— lo
// acepta aquí, escribiendo su nombre completo.
//
// Lo que sigue sin salir: la cadena, los archivos que subieron otros,
// y los requisitos que no le tocan. Puede leer el acuerdo del que
// forma parte, no asomarse al trabajo de los demás.
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
 * A dónde lleva «Conoce OCTAVIN».
 *
 * ← ACTUALIZADO (29 oct): ya existe la landing. Vive en
 * `public/landing.html`, así que se sirve tal cual sin pasar por la
 * aplicación: quien llega aquí no tiene cuenta y no hay motivo para
 * hacerle cargar la app entera.
 */
export const LANDING = "/landing.html";

export function renderEntrega(ctx){
  const {
    invitacion, invError, invPaso, invBusy, invSubiendo, entregas, entregar, notif,
    abrirEnlace, cerrarEnlace, entregarEnlaceReq,
    enlReq, enlUrl, enlNom, enlErr, enlBusy, setEnlUrl, setEnlNom,
    invNombre, setInvNombre, aceptarInvitacion, invAceptando, invAceptError,
    invRechazando, setInvRechazando, invMotivo, setInvMotivo, rechazarInvitacion,
  } = ctx;

  const Marco = ({ children }) => (<><style>{ESTILOS}</style>
    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
    <div className="entrega-wrap">
      <div className="entrega">
        <div className="entrega-marca">OCTAVIN</div>
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

  // ── EL CONTRATO, PRIMERO ──
  //
  // Antes de cualquier botón. Quien va a cumplir algo tiene derecho a
  // leer qué. Va plegado por defecto cuando ya no hay nada que
  // decidir —si ya aceptó, lo que importa es lo que le falta
  // entregar— y abierto cuando todavía le toca responder.
  const acu = invitacion.acuerdo || null;
  const meToca = Boolean(acu?.puedeAceptar) && !acu?.yaRespondido;

  const contrato = invitacion.contrato && (
    <details className="entrega-contrato" open={meToca}>
      <summary>
        <Icon n="description" size={18}/>
        <span>Leer el contrato</span>
      </summary>
      {/* Ya viene limpio del servidor: es el mismo `content` que la
          cadena sella, guardado en su día por `normalizar()`. */}
      <div className="entrega-contrato-c"
        dangerouslySetInnerHTML={{ __html: invitacion.contrato }}/>
    </details>
  );

  // ── ACEPTARLO, SI LE TOCA ──
  const aceptar = acu && acu.yaRespondido ? (
    <div className="entrega-aceptado">
      <Icon n="check_circle" size={18}/>
      {/* Sin punto final propio: `fmtFull` acaba en «a.m.» o «p.m.»,
          que ya lleva el suyo, y salían dos seguidos. */}
      <span>
        Aceptado{acu.aceptadoPor?.nombre ? ` por ${acu.aceptadoPor.nombre}` : ""}
        {acu.aceptadoPor?.fecha ? ` el ${fmtFull(acu.aceptadoPor.fecha)}` : "."}
      </span>
    </div>
  ) : meToca ? (
    <div className="entrega-aceptar">
      <h2>Léelo y dinos si estás de acuerdo</h2>
      <p className="entrega-aceptar-p">
        Escribe tu nombre completo. Si aceptas, el contrato queda en vigor con la
        fecha de hoy; si no, di por qué y quien lo mandó podrá corregirlo.
      </p>
      <label className="entrega-aceptar-l" htmlFor="inv-nombre">Tu nombre completo</label>
      <input id="inv-nombre" className="inp" value={invNombre} disabled={invAceptando}
        placeholder="Como aparece en tu identificación" autoComplete="name"
        onChange={e=>setInvNombre(e.target.value)}/>

      {/* El motivo aparece sólo al decir que no. Pedirlo de entrada
          sugiere que la respuesta esperada es el rechazo, y encima
          llena de campos una pantalla que debería ser una decisión. */}
      {invRechazando && (
        <>
          <label className="entrega-aceptar-l" htmlFor="inv-motivo">¿Por qué no lo aceptas?</label>
          <input id="inv-motivo" className="inp" value={invMotivo} disabled={invAceptando}
            placeholder="Ej.: el monto no es el que acordamos"
            onChange={e=>setInvMotivo(e.target.value)}/>
        </>
      )}

      {invAceptError && <p className="entrega-aceptar-e">{invAceptError}</p>}

      <div className="entrega-aceptar-b">
        {invRechazando ? (
          <>
            <button className="btn btn-secondary" disabled={invAceptando}
              onClick={()=>{ setInvRechazando(false); setInvMotivo(""); }}>
              Volver
            </button>
            {/* La acción de este paso, así que va de principal. No en
                rojo: no aceptar un contrato no es destruir nada, es
                una respuesta legítima, y pintarla de alarma empuja a
                aceptar al que dudaba. */}
            <button className={`btn btn-primary ${invAceptando?"esperando":""}`}
              disabled={invAceptando} onClick={rechazarInvitacion}>
              {invAceptando ? "Enviando…" : "Enviar mi respuesta"}
            </button>
          </>
        ) : (
          <>
            {/* Los dos a la vista y sin esconder el «no». Un contrato
                con una sola salida no es un acuerdo. */}
            <button className="btn btn-secondary" disabled={invAceptando}
              onClick={()=>setInvRechazando(true)}>
              No lo acepto
            </button>
            <button className={`btn btn-primary ${invAceptando?"esperando":""}`}
              disabled={invAceptando} onClick={aceptarInvitacion}>
              {invAceptando ? "Aceptando…" : "Acepto este contrato"}
            </button>
          </>
        )}
      </div>

      {/* Dicho antes de pulsar, no después. Que no se lleve la idea
          de que esto prueba quién es: prueba que alguien con este
          enlace respondió y dio este nombre, que es otra cosa. */}
      <p className="entrega-aceptar-n">
        Quedará escrito que respondió quien declara llamarse así, desde el enlace
        enviado a {invitacion.correo || "tu correo"}.
      </p>
    </div>
  ) : acu && acu.porQueNo ? (
    // ← NUEVO (12 nov): CUANDO NO SE PUEDE, DECIR POR QUÉ.
    //
    // Esto antes era `null`: si no te tocaba aceptar, la pantalla no
    // enseñaba nada. Ni el botón ni una explicación. Quien abría el
    // enlace veía el contrato y se quedaba sin saber si le faltaba
    // algo por hacer, y quien lo mandó tampoco entendía por qué no
    // pasaba nada.
    //
    // Una puerta que se cierra en silencio es peor que una cerrada
    // con un cartel. Las tres razones son distintas y cada una lleva
    // a un sitio distinto, así que se dicen distinto.
    <div className="entrega-nota">
      <Icon n="info" size={18}/>
      <div>
        {acu.porQueNo === "sin-mandar" ? <>
          <strong>Este contrato todavía no se manda a firmar.</strong>
          <p>
            Por ahora es un borrador. Quien lo escribió tiene que mandarlo desde
            «Compartir», y entonces te llegará para que lo leas y lo aceptes.
            Mientras tanto puedes leerlo aquí.
          </p>
        </> : acu.porQueNo === "no-eres-parte" ? <>
          <strong>Este enlace es para entregar comprobantes.</strong>
          <p>
            El contrato lo firma la otra parte, no tú. Puedes leerlo para saber a
            qué corresponde lo que subes.
          </p>
        </> : <>
          <strong>Ya no hay nada que responder.</strong>
          <p>Este contrato ya pasó de esa fase. Puedes leerlo y entregar lo que te toque.</p>
        </>}
      </div>
    </div>
  ) : null;

  return (
    <Marco>
      <div className="entrega-cab">
        {/* El titular dice qué toca AHORA. Si lo primero es aceptar un
            contrato, encabezar con «Te piden comprobantes» manda a la
            persona a buscar archivos cuando lo que tiene delante es
            una decisión. */}
        <h1>{meToca ? "Te mandaron un contrato"
             : listo ? "Ya entregaste todo" : "Te piden comprobantes"}</h1>
        {invitacion.pedidoPor && (
          <p className="entrega-de">
            {meToca
              ? <><b>{invitacion.pedidoPor}</b> te mandó «{invitacion.documento}» para que lo revises.</>
              : <><b>{invitacion.pedidoPor}</b> te pidió esto para «{invitacion.documento}».</>}
          </p>
        )}
        {/* El contador se calla mientras lo que toca es leer y
            decidir. «0 de 2 entregados» ahí no informa de nada: se
            adelanta a un paso que todavía no empieza, y lo que hace
            es apurar a alguien que debería estar leyendo. */}
        {reqs.length > 1 && !meToca && (
          <p className="entrega-cuenta">{entregados} de {reqs.length} entregados</p>
        )}
      </div>

      {contrato}
      {aceptar}

      {/* ← NUEVO (12 nov): MIENTRAS NO HAYA RESPONDIDO, NADA MÁS.
          Lo pidió Ricardo, y es el mismo orden que tiene quien sí
          tiene cuenta: primero lees y decides, y sólo entonces se
          abre el resto.
          No es cosmético. Una lista de «Subir» debajo de un contrato
          sin aceptar invita a hacer el trabajo antes de decir que
          sí, y quien sube primero ya no decide libre: decide con el
          esfuerzo hecho. Y si acaba rechazándolo, habrá entregado
          evidencia a un contrato que no existe. */}
      {meToca ? null : <>

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
            Conoce OCTAVIN
          </a>
        </div>
      </div>

      </>}
    </Marco>
  );
}