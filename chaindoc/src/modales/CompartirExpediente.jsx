// Compartir un EXPEDIENTE: quién entra, con qué papel, y cómo se le
// manda el contrato a la otra parte.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE (23 nov) ─────────────────────
//
// Hasta hoy esto y «compartir un documento de texto» eran la misma
// función, con `esExpediente` repartiendo por dentro. Lo mandó
// separar Ricardo, y con el motivo dicho:
//
//   «Como son similares pero tienen cosas o funcionalidades en
//    común, si usan el mismo puede interferir, haber fallos.»
//
// No era una sospecha. Al separarlos salió uno: el modo «sólo
// pedirle comprobantes» vive en `shareModo`, que es estado de la
// aplicación y no del documento. Con ese modo puesto, abrir un
// DOCUMENTO DE TEXTO enseñaba su caja de «Mensaje (opcional): qué
// necesitas exactamente» —de pedir comprobantes— en un documento que
// no tiene ninguno que pedir. Aquí abajo ya no puede pasar: cada
// archivo sólo sabe de lo suyo.
//
// ── LO QUE DECIDE ESTA PANTALLA ──────────────────────────────
//
// Una pregunta binaria primero: ¿ve todo el expediente, o sólo lo
// que tiene que entregar? Los roles siguen existiendo, pero dejaron
// de ser lo primero que hay que entender.
//
// Y una regla de seguridad que se ve: el enlace SIN CUENTA sólo se
// ofrece para «sólo entregar» y para la otra parte del contrato. Un
// enlace que deje leer un expediente entero sin identificar a nadie
// se reenvía por WhatsApp y acaba donde no debía; uno que sólo deja
// subir archivos a una lista de pendientes, si se filtra, lo peor
// que permite es que un desconocido suba un PDF de más, que el dueño
// ve y retira.
//
// ── UNA SOLA PUERTA ──────────────────────────────────────────
//
// Mandar un contrato a firmar vivía en otro botón, dentro del
// expediente. Ricardo lo probó tres veces por el camino que le pedía
// la cabeza —Compartir— y el contrato nunca llegó a ponerse en
// firme: la otra parte entraba sin que nadie le pidiera firmar nada.
//
// La lección no es «faltaba un aviso». Es que cuando hay dos verbos
// para una intención, la gente elige el que dice su cabeza, no el
// que programamos. Así que compartir un contrato con la otra parte
// ES mandárselo a firmar, y pasa aquí.

import { IcoLink, Icon } from "../ui/iconos";
import { tiempoRestante } from "../nucleo/invitaciones";
import { fmtFull } from "../nucleo/formato";
import { fmtMonto } from "../smartContract";
import { ROLES_OFRECIDOS } from "../nucleo/accesos";
import { permiteEstado } from "../nucleo/acuerdo";
import { renderBotonBio } from "../ui/BotonBio";

const PLAZOS = [3, 7, 15, 30];

export function modalCompartirExpediente(ctx){
  const {
    acu, d, modal, setModal, uid, mIn, setMIn, saving,
    doShare, revokeShare, shareBusy, shareErr, shareFound, setShareErr, setShareFound,
    shareModo, setShareModo, shareRol, setShareRol,
    shareReqs, setShareReqs, shareTodo, setShareTodo, pedirConCuenta,
    solMsg, setSolMsg,
    invDias, setInvDias, crearEnlace, enlaceNuevo, setEnlaceNuevo, copiarEnlace,
    enlaces, verEnlaces, revocarEnlace, copyLink,
    ROL_TEXTO, ROL_AYUDA, accesos, acctEmail,
    puedo, verificado, reenviarVerificacion, verifBusy,
    enFirmeErr, firmaBusy, mandarAFirmar, pass, setPass, bioOk, bioCreds,
  } = ctx;
  // Este archivo sólo dibuja expedientes. Un documento de texto o
  // un comprobante los dibuja `Compartir.jsx`, y el despachador los
  // llama a los dos: el que no es suyo devuelve null.
  if(modal.t !== "share" || d.kind !== "expediente") return null;

  const puedeCompartir = puedo("compartir");
  const otros = (accesos||[]).filter(a=>a.rol!=="propietario");
  // Tu propia fila en la lista de accesos: se ve, pero no se toca.
  const esMiFila = (a) =>
    String(a?.correo||"").toLowerCase() === String(acctEmail||"").toLowerCase();
  const pendientes = (d.requisitos||[]).filter(r=>r.estado!=="cumplido");

  // ── UNA SOLA PUERTA (20 oct) ───────────────────────────────
  //
  // Mandar un contrato a firmar vivía en otro botón, dentro del
  // expediente. Ricardo lo probó tres veces por el camino que le
  // pedía la cabeza —Compartir— y el contrato nunca llegó a ponerse
  // en firme: la otra parte entraba al expediente sin que nadie le
  // pidiera firmar nada.
  //
  // La lección no es «faltaba un aviso». Es que cuando hay dos
  // verbos para una intención, la gente elige el que dice su cabeza,
  // no el que programamos. Así que compartir un contrato con la otra
  // parte ES mandárselo a firmar, y pasa aquí.
  //
  // Sólo en borrador: un contrato ya mandado tiene una otra parte, y
  // sólo una. A partir de ahí, compartir vuelve a ser compartir.
  // ── ¿SE PUEDE TODAVÍA ELEGIR «INVOLUCRADO»? (17 nov) ───────
  //
  // «Involucrado» es la otra parte del contrato, y elegirlo es
  // mandárselo a firmar. Eso sólo cabe mientras el contrato se pueda
  // poner en firme: una vez mandado, ya hay una otra parte.
  //
  // ← CAMBIADO: antes esto miraba `estado==="borrador"` a secas, y se
  // dejaba fuera dos estados donde SÍ se puede volver a mandar: uno
  // rechazado y uno que se quedó sin firmar. En esos dos el contrato
  // vuelve a estar en tus manos, y la pantalla decía que no.
  //
  // Se pregunta con `permiteEstado(..., "poner-en-firme")`, que es
  // literalmente la misma pregunta, contestada en el sitio donde ya
  // está contestada para el servidor. Dos copias de una regla acaban
  // discrepando; ésta ahora es una.
  const puedeMandarse = puedo("editar")
    && permiteEstado(acu?.estado || "borrador", "poner-en-firme");

  // ← CAMBIADO (17 nov): «Involucrado» YA NO SE QUITA DE LA LISTA.
  //
  // Lo pidió Ricardo —«añade el rol de involucrado en expedientes,
  // aquí sí va»— y tenía razón en el fondo: el papel existe en un
  // expediente, es el principal, y desaparecía de la pantalla sin
  // decir nada. Un sitio donde antes había tres opciones y ahora hay
  // dos no se lee como «esto ya no se puede»: se lee como un fallo.
  //
  // Así que se queda siempre y, cuando no se puede elegir, se
  // enseña apagado con el motivo. La regla de fondo no cambia: un
  // contrato ya mandado no se manda otra vez.
  const rolesCompletos = ROLES_OFRECIDOS;
  /** Por qué «Involucrado» no se puede elegir ahora, o null si sí. */
  const porQueNoInvolucrado = puedeMandarse ? null
    : !puedo("editar")
      ? "Hace falta permiso para editar el contrato."
      : acu?.estado === "en_firma"
        ? `Ya mandaste este contrato a ${acu?.paraEmail || "la otra parte"}. Espera su respuesta, o retira el envío para mandárselo a alguien más.`
        : acu?.estado === "cerrado"
          ? "Este contrato está cerrado: las dos partes dijeron que estaba todo bien."
          : "Las dos partes ya aceptaron este contrato, así que su otra parte ya está decidida.";
  const elegibles = rolesCompletos.filter(
    (r) => !(r === "involucrado" && porQueNoInvolucrado));
  const rol = elegibles.includes(shareRol) ? shareRol : elegibles[0];
  const reqs = d.requisitos || [];

  const modo = shareModo || "completo";
  // Compartir un contrato con la otra parte ES mandárselo a firmar.
  // No hace falta un modo aparte: el rol lo dice.
  const mandaAFirmar = modo==="completo" && rol==="involucrado";

  // ── DÓNDE CABE EL ENLACE SIN CUENTA (17 nov) ───────────────
  //
  // En «sólo pedirle comprobantes», siempre: ese enlace deja subir
  // archivos a una lista de pendientes y nada más.
  //
  // En «acceso completo», sólo para la otra parte del contrato. Lo
  // decidió Ricardo al preguntárselo, y es la respuesta correcta: ese
  // enlace va atado a un correo y a aceptar el contrato. Uno para
  // «lector» dejaría leer el expediente entero —montos, historial y
  // los comprobantes de todos— a cualquiera que lo reenviara, sin
  // poder saber quién lo abrió ni retirárselo a quien ya lo tenga.
  const sinCuentaAqui = modo!=="completo" || mandaAFirmar;

  // El mismo botón, dos caminos. En «entregar» crea un enlace de
  // entrega; en «completo» pone el contrato en firme y devuelve el
  // suyo. El `true` final es lo que le dice al servidor que el
  // enlace se pidió a propósito y que no se niegue por no haber
  // cuenta: ver `ponerEnFirme`.
  const mandarSinCuenta = () => mandaAFirmar
    ? mandarAFirmar(mIn, null, false, true)
    : crearEnlace();

  // ── UN MOTIVO POR BOTÓN, NO UNO PARA LOS DOS (17 nov) ──────
  //
  // Lo dijo Ricardo con el porqué dentro: «sólo el código, para que
  // este enlace se lo puedas compartir por el medio que el usuario
  // quiera y no esté atado al correo; el input de correo sólo se usa
  // para el correo atado a la cuenta».
  //
  // Antes el campo de correo vacío apagaba LOS DOS botones, y por eso
  // no pudo mandarle el contrato a alguien sin cuenta: la pantalla le
  // pedía, para dárselo, el dato que precisamente no iba a usar.
  //
  // Son dos caminos y piden cosas distintas:
  //   · Con cuenta: el correo —es a dónde llega— y el código.
  //   · Sin cuenta: sólo el código. El enlace se lo manda él por
  //     donde quiera.
  //
  // Y un botón apagado sin explicación es un callejón sin salida con
  // el cartel por dentro, que es como él se lo encontró. Por eso cada
  // camino dice el suyo.
  const faltaElCodigo = mandaAFirmar
    && !pass.trim() && !(bioOk && (bioCreds||[]).length);
  const sinVerificar = !verificado
    ? "Confirma tu correo antes de compartir. Te mandamos un enlace al registrarte, y puedes pedir otro desde tu perfil."
    : null;
  const porElCodigo = faltaElCodigo
    ? "Escribe tu código de firma: al mandar el contrato lo estás firmando tú primero."
    : null;
  const motivoConCuenta = sinVerificar
    || (!mIn.trim()
      ? "Escribe arriba el correo de esa persona: es la cuenta de OCTAVIN a la que le va a llegar."
      : porElCodigo);
  const motivoSinCuenta = sinVerificar || porElCodigo;
  // Cuando a los dos les falta LO MISMO —el código, o confirmar tu
  // correo— se dice una vez debajo de los dos, no dos veces. Lo vi
  // repetido en pantalla antes de entregarlo: dos carteles iguales
  // no explican el doble, se leen como un fallo.
  const motivoArriba = (sinCuentaAqui && motivoConCuenta === motivoSinCuenta)
    ? null : motivoConCuenta;

  const cerrar = ()=>{
    setModal(null); setEnlaceNuevo(null); setMIn("");
    setShareErr(""); setShareFound(null); setShareReqs([]); setShareTodo(true);
    setShareModo("completo"); setSolMsg("");
  };

  // ── El enlace recién creado: se enseña una sola vez ──
  if(enlaceNuevo) return (
    <div className="ov" onClick={cerrar}><div className="modal wide" onClick={e=>e.stopPropagation()}>
      {/* Los dos enlaces de un expediente no dicen lo mismo. Uno pide
          comprobantes; el otro manda un contrato a firmar, y quien lo
          recibe tiene que saber que lo primero que va a ver es el
          contrato y una decisión. */}
      <h2>{enlaceNuevo.paraFirmar ? "Mándale esto para que lo firme" : "Enlace listo"}</h2>
      <p className="sub">
        {enlaceNuevo.paraFirmar ? <>
          {/* ← AÑADIDO (17 nov): decir que esa persona NO tiene
              cuenta, cuando el servidor lo ha comprobado. Es la
              frase que le faltaba a Ricardo: vio esta pantalla
              compartiendo a alguien que SÍ la tenía y entendió que
              la plataforma no se lo había mandado. Ahora esta
              pantalla sólo sale cuando el enlace es la única vía, y
              lo dice. */}
          {enlaceNuevo.sinCuenta && <><b>Esa persona no tiene cuenta en OCTAVIN</b>,
          así que el contrato ya está firmado por ti y esperándola en este enlace: es
          la única forma de que lo lea. </>}
          Mándaselo por donde quieras: correo, WhatsApp, lo que uses. Quien lo abra
          leerá el contrato y podrá aceptarlo o no aceptarlo, <b>sin crear ninguna
          cuenta</b>. Hasta que lo acepte no verá lo que hay que entregar.
          {enlaceNuevo.correo && <> Sólo sirve para <b>{enlaceNuevo.correo}</b>, que es
          a quien mandaste el contrato.</>}
        </> : <>
          Mándaselo por donde quieras: correo, WhatsApp, lo que uses. Quien lo abra
          podrá entregar {enlaceNuevo.requisitos?.length === 1
            ? `«${enlaceNuevo.requisitos[0]}»`
            : `${enlaceNuevo.requisitos?.length || ""} comprobantes`} sin crear ninguna cuenta.
        </>}
      </p>

      <div className="enl-caja">
        <code className="enl-url">{enlaceNuevo.url}</code>
        <button className="btn btn-primary" onClick={()=>copiarEnlace(enlaceNuevo.url)}>
          Copiar enlace
        </button>
      </div>

      <div className="enl-aviso">
        <Icon n="info" size={16}/>
        <span>
          Guárdalo ahora: por seguridad no se queda almacenado y no se puede volver a ver.
          Si lo pierdes, crea uno nuevo y retira éste.
          {enlaceNuevo.expiraEn && ` Vence el ${fmtFull(enlaceNuevo.expiraEn)}.`}
        </span>
      </div>

      <div className="modal-row">
        <button className="btn btn-primary" onClick={cerrar}>Listo</button>
      </div>
    </div></div>
  );

  return (
    <div className="ov" onClick={()=>{ if(!shareBusy && !saving) cerrar(); }}>
      <div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Compartir «{d.title}»</h2>

        {!verificado && (
          <div className="share-err">
            Confirma tu correo para poder invitar a alguien.{" "}
            <button className="lnk" disabled={verifBusy} onClick={reenviarVerificacion}>
              Reenviar el enlace
            </button>
          </div>
        )}

        {!puedeCompartir ? (
          <p className="sub">
            Sólo quien tiene permiso para repartir accesos puede invitar a más
            personas a este documento.
          </p>
        ) : (<>

          {/* ── La pregunta que importa ──
              ← REVERTIDO (12 nov, por la tarde): vuelven a ser DOS
              opciones.

              Por la mañana añadí una tercera, «Mandárselo para que lo
              firme», porque Ricardo no encontraba por dónde mandar un
              contrato. Él la quitó en cuanto la vio, y con razón:
              «no debe ser una opción, porque es algo que sí o sí se
              debe hacer, es algo que está integrado».

              Tiene razón y yo me equivoqué de solución. Mandar a
              firmar no es una forma de compartir entre varias: es lo
              que pasa cuando compartes un contrato con la otra parte.
              Y eso ya lo hace el rol «Involucrado» de aquí abajo.
              Añadir una opción para algo que ya ocurre solo es
              darle a elegir a la gente sobre algo que no se elige.

              Lo que sí se queda de aquella tanda: el enlace que sale
              al mandarlo, y el texto corregido de la segunda opción. */}
          <div className="rec-lbl">¿Cómo quieres compartirlo?</div>
          <div className="modo-lista">
            <label className={`modo ${modo==="completo"?"on":""}`}>
              <input type="radio" name="modo" checked={modo==="completo"}
                onChange={()=>setShareModo("completo")} />
              <span className="modo-n">Acceso completo</span>
              <span className="modo-d">
                Ve todo el expediente: el contenido, los montos, la historia y los
                comprobantes de todos.
              </span>
            </label>

            <label className={`modo ${modo==="entregar"?"on":""}`}>
              <input type="radio" name="modo" checked={modo==="entregar"}
                onChange={()=>setShareModo("entregar")} />
              <span className="modo-n">Sólo pedirle comprobantes</span>
              {/* ← CORREGIDO (12 nov): decía «no ve el contenido ni
                  los montos», y desde ayer eso es FALSO: quien abre
                  un enlace sí lee el contrato. Dejar el texto viejo
                  sería prometerle a quien comparte una privacidad que
                  el producto ya no da. */}
              <span className="modo-d">
                Lee el contrato y sube lo que le toca, nada más. No ve la historia
                del documento ni lo que subieron los demás. No firma nada.
              </span>
            </label>
          </div>

          {/* ── El detalle, según lo que eligió ── */}
          {modo==="completo" ? (
            <div className="modo-det">
              <div className="rec-lbl">¿Quién es esta persona?</div>
              <div className="rol-lista">
                {rolesCompletos.map(r=>{
                  // Apagado y con el porqué, en vez de desaparecido.
                  const no = r==="involucrado" ? porQueNoInvolucrado : null;
                  return (
                  <label key={r} className={`rol-op ${rol===r?"on":""} ${no?"off":""}`}>
                    <input type="radio" name="rol" checked={rol===r} disabled={Boolean(no)}
                      onChange={()=>setShareRol(r)} />
                    <span className="rol-n">{ROL_TEXTO[r]}</span>
                    <span className="rol-d">{no || ROL_AYUDA[r]}</span>
                  </label>
                  );
                })}
              </div>

              {/* Lo que va a quedar fijo al firmar. Va antes del correo
                  y del código a propósito: es lo que se está firmando,
                  y tiene que leerse antes de teclear nada. */}
              {mandaAFirmar && (<>
                <div className="acu-fijo">
                  <div className="acu-fijo-t">Al firmar, esto queda fijo</div>
                  <div className="acu-fijo-l">
                    <span>{reqs.length} punto{reqs.length===1?"":"s"}</span><span>y sus importes</span>
                  </div>
                  {d.montoTotal!=null && (
                    <div className="acu-fijo-l">
                      <span>{fmtMonto(d.montoTotal, d.moneda||"MXN")}</span><span>total del contrato</span>
                    </div>
                  )}
                  {d.fechaLimite && (
                    <div className="acu-fijo-l"><span>{d.fechaLimite}</span><span>fecha límite</span></div>
                  )}
                  <div className="acu-fijo-l"><span>El texto del contrato</span><span>como está ahora</span></div>
                </div>
                <div className="enl-nota">
                  Si después hay que cambiar algo, no se edita: se manda una
                  versión nueva y se vuelve a firmar. Eso es lo que hace que la
                  firma signifique algo.
                </div>
              </>)}
            </div>
          ) : (
            <div className="modo-det">
              <div className="rec-lbl">¿Qué le toca entregar?</div>
              <label className={`req-todo ${shareTodo?"on":""}`}>
                <input type="radio" name="alcance" checked={shareTodo}
                  onChange={()=>setShareTodo(true)} />
                <span>Todo lo que falta ({pendientes.length})</span>
              </label>
              <label className={`req-todo ${!shareTodo?"on":""}`}>
                <input type="radio" name="alcance" checked={!shareTodo}
                  onChange={()=>setShareTodo(false)} />
                <span>Elegir requisitos…</span>
              </label>

              {!shareTodo && (
                <div className="req-lista">
                  {(d.requisitos||[]).map(r=>(
                    <label key={r.id} className={`req-op ${shareReqs.includes(r.id)?"on":""}`}>
                      <input type="checkbox" checked={shareReqs.includes(r.id)}
                        onChange={()=>setShareReqs(
                          shareReqs.includes(r.id)
                            ? shareReqs.filter(x=>x!==r.id)
                            : [...shareReqs, r.id])} />
                      <span>{r.titulo}</span>
                      {r.estado==="cumplido" && <span className="req-ok">ya entregado</span>}
                    </label>
                  ))}
                </div>
              )}

              <div className="rec-lbl">El enlace vence en:</div>
              <div className="enl-plazos">
                {PLAZOS.map(p=>(
                  <button key={p} className={`enl-plazo ${(invDias||7)===p?"on":""}`}
                    onClick={()=>setInvDias(p)}>{p} días</button>
                ))}
              </div>
            </div>
          )}

          {/* ── A quién ── */}
          {/* ← CAMBIADO (17 nov): la etiqueta dice para qué sirve el
              campo. Era «¿A quién?» a secas, y desde hoy hay dos
              caminos y sólo uno lo usa: el enlace sin cuenta ya no va
              atado a ningún correo. Sin esta línea, un campo vacío
              arriba parece algo que falta por rellenar aunque vayas a
              mandar el enlace. */}
          <div className="rec-lbl">¿A quién? <span className="rec-lbl-d">Su correo de OCTAVIN, si tiene cuenta</span></div>
          <input className="inp" type="email" placeholder="correo@ejemplo.com" value={mIn}
            disabled={shareBusy||saving||firmaBusy||!verificado}
            onChange={e=>{setMIn(e.target.value);setShareErr("");setShareFound(null);}}
            onKeyDown={e=>e.key==="Enter"&&modo==="completo"&&!mandaAFirmar&&doShare()} />

          {/* ── Tu firma, si es la otra parte ── */}
          {modo==="completo" && mandaAFirmar && (<>
            {/* ← QUITADO (27 oct): la casilla «pedir su conformidad al
                terminar». Ya no se pregunta porque la respuesta es
                siempre sí: firmar es el último paso de todo contrato.
                Dejarla era ofrecer la opción de que el contrato no
                terminara nunca. */}
            <p className="acu-nota">
              Al terminar de entregar todo, los dos firman la conformidad.
              Ese es el último paso del contrato.
            </p>

            {renderBotonBio({ bioOk, bioCreds, ocupado: firmaBusy,
              verbo: "Firmar y mandar",
              onBio: ()=>mandarAFirmar(mIn, null, true) })}

            <label className="rec-lbl" htmlFor="sh-codigo">Tu código de firma</label>
            <input id="sh-codigo" className="inp" type="password" placeholder="••••"
              value={pass} disabled={firmaBusy}
              onChange={e=>setPass(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&mandarAFirmar(mIn)} />
            {enFirmeErr && <div className="share-err">{enFirmeErr}</div>}
          </>)}
          {modo==="entregar" && (<>
            <textarea className="inp" style={{minHeight:64,resize:"vertical"}}
              placeholder="Mensaje (opcional): qué necesitas exactamente"
              value={solMsg} disabled={shareBusy||saving}
              onChange={e=>setSolMsg(e.target.value)} />
            <div className="enl-nota">
              Si ya tiene cuenta en OCTAVIN, pídeselo por correo: cada entrega queda
              a su nombre. Si no la tiene —o no quieres que se registre— el enlace
              funciona igual, y el correo aquí es sólo para tu registro.
            </div>
          </>)}

          {shareErr && <div className="share-err">{shareErr}</div>}
          {shareFound && (
            <div className="share-ok">
              <div className="avatar">{(shareFound.nombre||shareFound.email).slice(0,2).toUpperCase()}</div>
              <div>
                <div className="share-ok-n">{shareFound.nombre||"Sin nombre"}</div>
                <div className="share-ok-m">{shareFound.email}</div>
              </div>
            </div>
          )}

          {/* ── Cómo se lo mandas ── */}
          {/* ── LOS DOS CAMINOS, IGUAL EN LOS DOS MODOS (17 nov) ──
              Lo pidió Ricardo: «en ambas opciones, tanto en acceso
              completo como en sólo pedir comprobantes, se pueda
              compartir a alguien que no tiene cuenta».

              Arriba el de con cuenta, una «O», y abajo el de sin
              cuenta. Es la misma forma que ya tiene un documento de
              texto, y ahora las tres pantallas de compartir del
              producto se leen igual.

              Y arregla de paso lo que él vio: «compartí a alguien que
              tenía cuenta, pero me salió el modal como si le hubiera
              dado a compartir a alguien sin cuenta». Pasaba porque
              «Firmar y mandar» enseñaba SIEMPRE la pantalla del
              enlace. Ahora cada botón hace una cosa y el servidor
              sólo crea el enlace cuando va a servir. */}
          <div className="modal-row enmedio">
            {modo==="completo" ? (
              mandaAFirmar ? (
                <button className={`btn btn-primary ${firmaBusy?"esperando":""}`}
                  onClick={()=>mandarAFirmar(mIn)}
                  /* ← AÑADIDO (17 nov): el código. Lo dijo Ricardo —«el
                     único requisito para desbloquear el poder mandar por
                     correo o mandar a alguien que no tiene cuenta es
                     colocar el código»— y lo vi en pantalla antes de
                     entregarlo: debajo de este botón ENCENDIDO salía el
                     cartel «escribe tu código de firma». El servidor ya
                     se negaba; esto es no ofrecer un botón que va a
                     fallar. */
                  disabled={firmaBusy||!mIn.trim()||!verificado||faltaElCodigo}>
                  {firmaBusy ? "Mandando…" : "Firmar y mandar"}
                </button>
              ) : (
                // Llamada a mano, con el rol dentro. `onClick={doShare}`
                // le pasaría el EVENTO del clic como primer argumento,
                // que es el fallo que costó una tarde el 12 de nov.
                <button className="btn btn-primary" onClick={()=>doShare(rol)}
                  disabled={shareBusy||!mIn.trim()||!verificado}>
                  {shareBusy ? "Verificando…" : "Dar acceso"}
                </button>
              )
            ) : (
              <button className="btn btn-primary" onClick={pedirConCuenta}
                disabled={shareBusy||!mIn.trim()||!verificado}>
                {shareBusy ? "Verificando…" : "Pedírselo por correo"}
              </button>
            )}
          </div>
          {motivoArriba && <div className="enl-nota apagado">{motivoArriba}</div>}

          {sinCuentaAqui && (<>
            <div className="sign-or"><span>O</span></div>
            <div className="modal-row enmedio">
              {/* Sin `!mIn.trim()`: este enlace ya no va atado a
                  ningún correo. Ver `motivoSinCuenta` arriba. */}
              <button className="btn btn-secondary"
                disabled={saving||firmaBusy||!verificado||faltaElCodigo}
                onClick={mandarSinCuenta}>
                {(saving||firmaBusy) ? "Creando…" : "Mandar a alguien sin cuenta"}
              </button>
            </div>
            {motivoSinCuenta && <div className="enl-nota apagado">{motivoSinCuenta}</div>}
          </>)}

          {modo==="completo" && (
            <div className="enl-nota">
              {mandaAFirmar
                ? "Con cuenta le llega aquí dentro y lo ve al entrar; para eso hace falta su correo. Sin cuenta te damos un enlace suelto, que le mandas por donde quieras: lo abre, lee el contrato entero y lo acepta o no lo acepta; hasta que lo acepte no ve lo que hay que entregar, y mientras tanto el contrato no cambia."
                : "Para acceso completo hace falta cuenta y correo confirmado. Un enlace que deje leer todo sin identificar a nadie se reenvía y acaba donde no debía: el único enlace sin cuenta de un expediente es el de la otra parte, y lo primero que hace quien lo abre es decidir si acepta el contrato."}
            </div>
          )}
        </>)}

        {/* ── Quiénes tienen acceso ── */}
        {otros.length>0 && (<>
          <div className="rec-lbl">Con acceso ({otros.length}):</div>
          <div className="share-list">
            {otros.map(a=>(
              <div key={a.correo} className="share-row">
                <div className="avatar sm">{a.correo.slice(0,2).toUpperCase()}</div>
                <span className="share-row-m">{a.correo}</span>
                <span className="rol-tag">{ROL_TEXTO[a.rol]||a.rol}</span>
                {/* ← AÑADIDO (23 nov): no sobre uno mismo.
                    Lo pidió Ricardo del Auditor —«sólo puede cambiar
                    el de las otras personas, no el suyo»— y el
                    servidor ya se niega. Esto es no enseñar una «×»
                    que sólo sirve para dar un error.
                    Para salirse está «Dejar de ver este documento»,
                    que es donde la gente lo busca. */}
                {(puedeCompartir || d.ownerUid===uid) && !esMiFila(a) && (
                  <button className="smart-x" title="Retirar acceso"
                    onClick={()=>revokeShare(a.correo)}>×</button>
                )}
                {esMiFila(a) && <span className="rol-yo">tú</span>}
              </div>
            ))}
          </div>
        </>)}

        {/* ── Enlaces vivos ── */}
        {enlaces && (
          <div className="enl-lista">
            <div className="rec-lbl">
              Enlaces de entrega ({enlaces.length}):
            </div>
            {enlaces.length === 0 && <div className="enl-nota">Todavía no has creado ninguno.</div>}
            {enlaces.map(e=>(
              <div key={e.huella} className={`enl-fila ${e.estado!=="vigente"?"muerto":""}`}>
                <div className="enl-fila-b">
                  <div className="enl-fila-t">
                    {e.proposito === "firma" ? "Para leerlo y firmarlo"
                     : e.proposito === "lectura" ? "Sólo lectura"
                     : e.reqIds?.length === 1 ? "1 comprobante"
                     : `${e.reqIds?.length||0} comprobantes`}
                  </div>
                  <div className="enl-fila-d">
                    {e.correo ? `${e.correo} · ` : ""}
                    {e.estado === "vigente"
                      ? `vence en ${tiempoRestante(e.expiraEn)}`
                      : { vencida:"vencido", revocada:"retirado", agotada:"tope alcanzado" }[e.estado] || e.estado}
                    {e.respuesta
                      ? ` · ${e.respuesta.tipo==="rechazado" ? "no lo firmó" : "firmado"} por ${e.respuesta.nombre}`
                      : e.entregas > 0 ? ` · ${e.entregas} entregas` : ""}
                  </div>
                </div>
                {e.estado === "vigente" && (
                  <button className="smart-x" title="Retirar este enlace"
                    onClick={()=>revocarEnlace(e.huella)}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="modal-row">
          {/* ← CAMBIADO (15 nov): también en un documento de texto. Si
              se pueden crear enlaces, hace falta poder verlos y
              retirarlos: un enlace que no se puede retirar es un
              acceso permanente que se regaló sin saberlo. */}
          <button className="btn btn-tertiary" onClick={verEnlaces}>Ver enlaces creados</button>
          <button className="btn btn-tertiary" onClick={()=>copyLink()}><IcoLink/> Copiar enlace del documento</button>
          <button className="btn btn-secondary" disabled={shareBusy} onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}