// Compartir: el único lugar donde se decide quién entra y qué puede.
//
// ← REDISEÑADO (Etapa 4 · Bloque B). Antes había tres caminos para lo
// mismo: Compartir, «Pedir a alguien» y «Pedir por enlace». Ahora hay
// uno, con dos preguntas encadenadas.
//
// La primera pregunta es la que importa y es deliberadamente binaria:
// ¿ve todo, o sólo lo que tiene que entregar? Los seis roles siguen
// existiendo, pero dejaron de ser lo primero que hay que entender.
//
// Y una regla de seguridad que se ve en la interfaz: en un EXPEDIENTE,
// el enlace sin cuenta sólo se ofrece para «sólo entregar». Un enlace
// que deje leer un contrato entero sin identificar a nadie se reenvía
// por WhatsApp y acaba donde no debía; uno que sólo deja subir
// archivos a una lista de pendientes, si se filtra, lo peor que
// permite es que un desconocido suba un PDF de más, que el dueño ve y
// retira.
//
// ── UN DOCUMENTO DE TEXTO NO ES UN EXPEDIENTE (15 nov) ───────
//
// Este modal se escribió para expedientes y luego se le pasó por
// encima a los documentos de texto, que no tienen requisitos, ni
// montos, ni partes, ni acuerdo. El resultado lo vio Ricardo: a un
// documento de texto le preguntaba «¿acceso completo o sólo pedirle
// comprobantes?» —cuando no hay comprobantes que pedir— y le ofrecía
// «Auditor», que es un papel de expediente.
//
// Así que aquí hay dos modales, y el que sale depende del documento:
//
//   · UN EXPEDIENTE — lo de siempre, intacto.
//   · UN DOCUMENTO DE TEXTO SIN SECCIÓN DE FIRMAS — una sola
//     pregunta, «¿cómo quieres compartirlo?», con dos respuestas:
//     Editor o Lector.
//   · UN DOCUMENTO DE TEXTO CON SECCIÓN DE FIRMAS — ninguna
//     pregunta. Quien entra está ahí para firmarlo, y eso no se
//     elige: se le da acceso y firma. Por eso sólo queda «¿a quién?».
//
// En los dos casos de texto se puede mandar un enlace a alguien SIN
// CUENTA, que es lo que pidió Ricardo pensando en un freelance. Y ahí
// la regla de arriba no se rompe: un documento de texto compartido
// por enlace es exactamente lo que su dueño quiso compartir —el
// texto—, no el expediente de otras cinco personas.

import { IcoLink, Icon } from "../ui/iconos";
import { tiempoRestante } from "../nucleo/invitaciones";
import { fmtFull } from "../nucleo/formato";
import { fmtMonto } from "../smartContract";
import { ROLES_OFRECIDOS } from "../nucleo/accesos";
import { seVe } from "../nucleo/secciones";
import { esComprobante, porQueNoSale } from "../nucleo/comprobantes";
import { renderBotonBio } from "../ui/BotonBio";

/**
 * Los roles que se ofrecen en un documento de texto.
 *
 * ← CAMBIADO (15 nov): eran tres y ahora son dos. «Auditor» entra al
 * expediente completo y firma como testigo; en un documento de texto
 * no hay expediente al que entrar, así que era un papel sin papel.
 * Lo quitó Ricardo: «eso solo es para expedientes».
 *
 * «Involucrado» tampoco está, y por lo mismo de siempre: es la otra
 * parte de un contrato, y sólo se ofrece en los expedientes. Ver
 * ROLES_OFRECIDOS en `nucleo/accesos.js`.
 */
const COMPLETOS = ["editor", "lector"];

/**
 * El papel de quien recibe un documento de texto QUE SE FIRMA.
 *
 * No se pregunta, se deduce: si el documento tiene sección de firmas,
 * a quien se lo mandas es para que lo firme. `aprobador` es justo eso
 * —ver, firmar, exportar— y nada más: no puede editar el texto que
 * está firmando, que es la garantía entera. Ver PERMISOS en
 * `nucleo/accesos.js`.
 */
const PARA_FIRMAR = "aprobador";

/**
 * Qué hace cada papel EN UN DOCUMENTO DE TEXTO.
 *
 * ← NUEVO (15 nov). ROL_AYUDA está escrito para expedientes y lo
 * dice con esas palabras: «Ve el expediente y cómo va» para Lector,
 * «sube y pide comprobantes» para Editor. En un documento de texto no
 * hay expediente ni comprobantes, así que esos textos describen cosas
 * que no existen —justo lo que Ricardo mandó quitar del resto del
 * modal— y encima prometen permisos que aquí no se usan.
 *
 * No se corrige ROL_AYUDA porque el modal del expediente lo usa y
 * allí está bien: es el mismo papel contado en dos sitios distintos.
 */
const AYUDA_TEXTO = {
  editor: "Lee el documento y lo puede editar, firmar y compartir.",
  lector: "Lee el documento y nada más: no lo puede editar ni firmar.",
};

const PLAZOS = [3, 7, 15, 30];

export function modalCompartir(ctx){
  const {
    acu, d, modal, setModal, uid, mIn, setMIn, saving,
    doShare, revokeShare, shareBusy, shareErr, shareFound, setShareErr, setShareFound,
    shareModo, setShareModo, shareRol, setShareRol,
    shareReqs, setShareReqs, shareTodo, setShareTodo, pedirConCuenta,
    solMsg, setSolMsg,
    invDias, setInvDias, crearEnlace, enlaceNuevo, setEnlaceNuevo, copiarEnlace,
    enlaces, verEnlaces, revocarEnlace, copyLink,
    ROL_TEXTO, ROL_AYUDA, accesos, puedo, verificado, reenviarVerificacion, verifBusy,
    enFirmeErr, firmaBusy, mandarAFirmar, pass, setPass, bioOk, bioCreds, user,
  } = ctx;
  if(modal.t !== "share") return null;

  const puedeCompartir = puedo("compartir");
  const otros = (accesos||[]).filter(a=>a.rol!=="propietario");
  const pendientes = (d.requisitos||[]).filter(r=>r.estado!=="cumplido");
  const esExpediente = d.kind==="expediente";

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
  const enBorrador = esExpediente && (acu?.estado==="borrador") && puedo("editar");

  // ── LAS TRES FORMAS DE ESTE MODAL (15 nov) ─────────────────
  //
  // `seVe` dice que una sección está encendida mientras no se haya
  // apagado, así que un documento de texto nuevo SÍ tiene firmas: la
  // versión 2 es la normal y la 1 es la de quien decidió quitarlas.
  // ← NUEVO (16 nov): un recibo o una factura. No es ninguna de las
  // dos versiones de un documento de texto y no puede caer en una por
  // descarte: `paraFirmar` miraba sólo «no es expediente», y una
  // factura tampoco lo es, así que le habría salido el botón de
  // mandar un enlace sin cuenta. Justo lo que Ricardo quiere cerrado.
  const comprobante = esComprobante(d);
  const paraFirmar = !esExpediente && !comprobante && seVe(d, "firmas");
  const soloLectura = !esExpediente && !comprobante && !paraFirmar;

  const rolesCompletos = esExpediente
    ? (enBorrador ? ROLES_OFRECIDOS : ROLES_OFRECIDOS.filter(r=>r!=="involucrado"))
    : COMPLETOS;
  // En un documento que se firma el papel no se elige: ver PARA_FIRMAR.
  // En un comprobante tampoco se elige: «lector» y punto. Quien lo
  // recibe está ahí para verlo, y cambiarlo no podría aunque se le
  // diera el papel de editor —ver `soloSuDueno` en comprobantes.js,
  // que deja la edición de un recibo sólo a su dueño—. Ofrecer
  // «Editor» seria prometer algo que la regla de abajo no cumple.
  const rol = paraFirmar ? PARA_FIRMAR
    : comprobante ? "lector"
    : (rolesCompletos.includes(shareRol) ? shareRol : rolesCompletos[0]);
  const reqs = d.requisitos || [];

  const modo = shareModo || "completo";
  // Compartir un contrato con la otra parte ES mandárselo a firmar.
  // No hace falta un modo aparte: el rol lo dice.
  const mandaAFirmar = esExpediente && modo==="completo" && rol==="involucrado";

  // Que el dueño ya lo haya firmado. Es lo que hace falta antes de
  // mandarlo a firmar, y lo pidió Ricardo con esas palabras: «primero
  // tendrá que estar firmado por él para poderlo compartir». El
  // servidor lo vuelve a comprobar; esto es para no ofrecer un botón
  // que va a fallar y decir por qué.
  const yoFirme = (d.chain||[]).some(b =>
    b.action==="FIRMA" && b.meta?.fuerza!=="enlace"
    && (b.meta?.uid ? b.meta.uid===d.ownerUid : b.author===user));
  const faltaMiFirma = paraFirmar && !yoFirme;

  const cerrar = ()=>{
    setModal(null); setEnlaceNuevo(null); setMIn("");
    setShareErr(""); setShareFound(null); setShareReqs([]); setShareTodo(true);
    setShareModo("completo"); setSolMsg("");
  };

  // ── El enlace recién creado: se enseña una sola vez ──
  if(enlaceNuevo) return (
    <div className="ov" onClick={cerrar}><div className="modal wide" onClick={e=>e.stopPropagation()}>
      {/* ← NUEVO (12 nov): el mismo modal sirve para los dos enlaces,
          pero no dicen lo mismo. Uno pide comprobantes; el otro manda
          un contrato a firmar, y quien lo recibe tiene que saber que
          lo primero que va a ver es el contrato y una decisión. */}
      <h2>{enlaceNuevo.paraFirmar || enlaceNuevo.proposito==="firma"
        ? "Mándale esto para que lo firme" : "Enlace listo"}</h2>
      <p className="sub">
        {/* ← NUEVO (15 nov): los enlaces de un documento de texto.
            Tres enlaces distintos no pueden explicarse con el mismo
            párrafo: lo que quien lo recibe va a poder hacer cambia en
            cada uno, y eso es justo lo que quien lo manda necesita
            saber antes de mandarlo. */}
        {enlaceNuevo.proposito==="firma" ? <>
          Mándaselo por donde quieras: correo, WhatsApp, lo que uses. Quien lo abra
          leerá el documento y podrá <b>firmarlo con su nombre completo</b> o decir
          que no está de acuerdo, <b>sin crear ninguna cuenta</b>. Se usa una sola
          vez: en cuanto responda, este enlace queda gastado.
          {enlaceNuevo.correo && <> Lo mandaste a <b>{enlaceNuevo.correo}</b>, y eso
          queda escrito al lado de su firma.</>}
        </> : enlaceNuevo.proposito==="lectura" ? <>
          Mándaselo por donde quieras: correo, WhatsApp, lo que uses. Quien lo abra
          podrá <b>leer el documento</b> y nada más, <b>sin crear ninguna cuenta</b>:
          no lo puede editar, ni firmar, ni ver su historial.
        </> : enlaceNuevo.paraFirmar ? <>
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
          {/* ── UN DOCUMENTO DE TEXTO QUE SE FIRMA: NINGUNA PREGUNTA ──
              «Para la versión 2 vas a quitar todas las opciones de
              antes y solo vas a dejar la pregunta: a quién». Y tiene
              razón: quien recibe un documento con firmas está ahí
              para firmarlo. Preguntar qué papel tiene sería ofrecer
              papeles que no vienen a cuento —¿editor de algo que vas
              a firmar?— y hacer elegir sobre algo que no se elige.

              Lo único que se dice es qué va a poder hacer, y eso no
              es una opción: es la consecuencia del botón. */}
          {paraFirmar && (
            <div className="enl-nota">
              Quien entre podrá <b>leerlo y firmarlo</b>. No puede editar el texto:
              es lo que está firmando.
            </div>
          )}

          {/* ── LAS PREGUNTAS, PARA QUIEN LAS NECESITA ──
              ← CAMBIADO (15 nov): en un documento de texto SIN firmas
              la primera pregunta se queda, pero las respuestas son
              los dos papeles. «Acceso completo» fuera: era el nombre
              de un modo que sólo existía porque al lado había otro
              —«sólo pedirle comprobantes»— que en un documento de
              texto no existe. Una pregunta con una sola respuesta
              posible no es una pregunta. */}
          {/* ── UN COMPROBANTE: NI PREGUNTA NI ENLACE (16 nov) ──
              Lo que puede hacer quien lo recibe, dicho como lo que
              es: una consecuencia, no una opción. */}
          {comprobante && (
            <div className="enl-nota">
              Quien entre podrá <b>ver {d.tplId==="factura" ? "la factura" : "el recibo"} y
              su archivo original</b>, para cotejar que los datos coinciden. No puede
              cambiar nada: un comprobante sólo lo edita quien lo registró.
            </div>
          )}

          {!paraFirmar && !comprobante && (<>
          <div className="rec-lbl">¿Cómo quieres compartirlo?</div>
          <div className="modo-lista">
            {soloLectura ? rolesCompletos.map(r=>(
              <label key={r} className={`modo ${rol===r?"on":""}`}>
                <input type="radio" name="modo" checked={rol===r}
                  onChange={()=>setShareRol(r)} />
                <span className="modo-n">{ROL_TEXTO[r]}</span>
                <span className="modo-d">{AYUDA_TEXTO[r] || ROL_AYUDA[r]}</span>
              </label>
            )) : (
            <label className={`modo ${modo==="completo"?"on":""}`}>
              <input type="radio" name="modo" checked={modo==="completo"}
                onChange={()=>setShareModo("completo")} />
              <span className="modo-n">Acceso completo</span>
              <span className="modo-d">
                Ve todo el expediente: el contenido, los montos, la historia y los
                comprobantes de todos.
              </span>
            </label>
            )}

            {esExpediente && (
              <label className={`modo ${modo==="entregar"?"on":""}`}>
                <input type="radio" name="modo" checked={modo==="entregar"}
                  onChange={()=>setShareModo("entregar")} />
                <span className="modo-n">Sólo pedirle comprobantes</span>
                {/* ← CORREGIDO (12 nov): decía «no ve el contenido ni
                    los montos», y desde ayer eso es FALSO: quien abre
                    un enlace sí lee el contrato. Dejar el texto viejo
                    sería prometerle a quien comparte una privacidad
                    que el producto ya no da. */}
                <span className="modo-d">
                  Lee el contrato y sube lo que le toca, nada más. No ve la historia
                  del documento ni lo que subieron los demás. No firma nada.
                </span>
              </label>
            )}
          </div>
          </>)}

          {/* ── El detalle, según lo que eligió ──
              Sólo en un expediente. En un documento de texto la
              primera pregunta YA es el papel, así que una segunda
               —«¿quién es esta persona?»— preguntaría lo mismo otra
              vez con otras palabras. */}
          {esExpediente && (modo==="completo" ? (
            <div className="modo-det">
              <div className="rec-lbl">¿Quién es esta persona?</div>
              <div className="rol-lista">
                {rolesCompletos.map(r=>(
                  <label key={r} className={`rol-op ${rol===r?"on":""}`}>
                    <input type="radio" name="rol" checked={rol===r}
                      onChange={()=>setShareRol(r)} />
                    <span className="rol-n">{ROL_TEXTO[r]}</span>
                    <span className="rol-d">{ROL_AYUDA[r]}</span>
                  </label>
                ))}
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
          ))}

          {/* ── A quién ── */}
          <div className="rec-lbl">¿A quién?</div>
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
          {comprobante ? (<>
            {/* ── UN COMPROBANTE: UN SOLO CAMINO (16 nov) ──
                Sin «O» y sin enlace. No es que el enlace esté apagado
                esperando algo: es que no existe para esto. Un botón
                apagado invita a preguntarse qué le falta, y aquí no
                le falta nada. Lo único que se dice es por qué, una
                vez, debajo. */}
            <div className="modal-row enmedio">
              <button className="btn btn-primary" onClick={()=>doShare(rol)}
                disabled={shareBusy||!mIn.trim()||!verificado||Boolean(porQueNoSale(d))}>
                {shareBusy ? "Verificando…" : "Dar acceso"}
              </button>
            </div>
            {porQueNoSale(d) ? (
              <div className="enl-nota">{porQueNoSale(d)}</div>
            ) : (
              <div className="enl-nota">
                Sólo con cuenta. Tú no emitiste {d.tplId==="factura" ? "esta factura" : "este recibo"}:
                lo estás respaldando, y un enlace sin cuenta no deja saber quién lo abrió.
              </div>
            )}
          </>) : !esExpediente ? (<>
            {/* ── UN DOCUMENTO DE TEXTO: DOS CAMINOS, UNO DEBAJO DEL OTRO ──
                «Debajo del botón de dar acceso vas a poner: O y
                debajo de eso vas a poner otro botón que diga: mandar
                a alguien sin cuenta».

                Van uno debajo del otro, no lado a lado, porque no son
                dos variantes de lo mismo: el de arriba necesita que
                la otra persona tenga cuenta en OCTAVIN, el de abajo
                existe precisamente para cuando no la tiene. La «O»
                entre los dos lo dice sin tener que explicarlo. */}
            <div className="modal-row enmedio">
              <button className="btn btn-primary" onClick={()=>doShare(rol)}
                disabled={shareBusy||!mIn.trim()||!verificado}>
                {shareBusy ? "Verificando…" : "Dar acceso"}
              </button>
            </div>

            <div className="sign-or"><span>O</span></div>

            <div className="modal-row enmedio">
              <button className="btn btn-secondary" disabled={saving||faltaMiFirma}
                title={faltaMiFirma ? "Fírmalo tú primero" : undefined}
                onClick={crearEnlace}>
                {saving ? "Creando…" : "Mandar a alguien sin cuenta"}
              </button>
            </div>

            {/* El motivo, escrito, no sólo en el `title`: un botón
                apagado con la explicación escondida en un tooltip no
                explica nada en un teléfono, donde no hay tooltip. */}
            {faltaMiFirma ? (
              <div className="enl-nota">
                Para mandarlo a firmar, <b>fírmalo tú primero</b>. Lo que mandas tiene
                que estar firmado por ti, y hasta que lo firmes el texto todavía se
                puede editar: la otra persona leería una cosa y firmaría otra.
              </div>
            ) : (
              <div className="enl-nota">
                {paraFirmar
                  ? "El enlace se abre sin cuenta: lee el texto y lo firma con su nombre completo, o dice que no y por qué. Si el documento tiene candado, le hará falta también la clave."
                  : "El enlace se abre sin cuenta y sólo deja leer: no puede editar nada ni ver la historia del documento. Si tiene candado, le hará falta también la clave."}
              </div>
            )}
          </>) : (<>
          <div className="modal-row enmedio">
            {modo==="completo" ? (
              mandaAFirmar ? (
                <button className={`btn btn-primary ${firmaBusy?"esperando":""}`}
                  onClick={()=>mandarAFirmar(mIn)}
                  disabled={firmaBusy||!mIn.trim()||!verificado}>
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
            ) : (<>
              <button className="btn btn-secondary" onClick={pedirConCuenta}
                disabled={shareBusy||!mIn.trim()||!verificado}>
                {shareBusy ? "Verificando…" : "Pedírselo por correo"}
              </button>
              <button className="btn btn-primary" disabled={saving||!verificado}
                onClick={crearEnlace}>
                {saving ? "Creando…" : "Copiar enlace sin cuenta"}
              </button>
            </>)}
          </div>

          {modo==="completo" && (
            <div className="enl-nota">
              {mandaAFirmar
                ? "Al mandarlo te damos un enlace para esa persona. Lo abre sin cuenta, lee el contrato entero y lo acepta o no lo acepta; hasta que lo acepte no ve lo que hay que entregar, y mientras tanto el contrato no cambia."
                : "Para acceso completo hace falta cuenta y correo confirmado. Un enlace que deje leer todo sin identificar a nadie se reenvía y acaba donde no debía."}
            </div>
          )}
          </>)}
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
                {(puedeCompartir || d.ownerUid===uid) && (
                  <button className="smart-x" title="Retirar acceso"
                    onClick={()=>revokeShare(a.correo)}>×</button>
                )}
              </div>
            ))}
          </div>
        </>)}

        {/* ── Enlaces vivos ── */}
        {enlaces && (
          <div className="enl-lista">
            <div className="rec-lbl">
              {esExpediente ? "Enlaces de entrega" : "Enlaces sin cuenta"} ({enlaces.length}):
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
          <button className="btn btn-warning" disabled={shareBusy} onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}