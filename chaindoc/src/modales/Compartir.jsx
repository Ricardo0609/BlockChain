// Compartir un DOCUMENTO DE TEXTO o un COMPROBANTE: quién entra y
// qué puede hacer con él.
//
// ── POR QUÉ ESTE ARCHIVO SE QUEDÓ SOLO (23 nov) ──────────────
//
// Hasta hoy esto y «compartir un expediente» eran la misma función,
// con `esExpediente` repartiendo por dentro. Lo mandó separar
// Ricardo, y con el motivo dicho:
//
//   «Como son similares pero tienen cosas o funcionalidades en
//    común, si usan el mismo puede interferir, haber fallos.»
//
// No era una sospecha. Al separarlos salió uno, y de los que no se
// ven leyendo el código: el modo «sólo pedirle comprobantes» vive en
// `shareModo`, que es estado de la APLICACIÓN y no del documento. Si
// elegías ese modo en un expediente y después abrías un documento de
// texto, el modo seguía puesto y aquí salía su caja de «Mensaje
// (opcional): qué necesitas exactamente» —de pedir comprobantes— en
// un documento que no tiene ninguno que pedir.
//
// Ya no puede pasar: en este archivo la palabra `shareModo` no
// aparece. El expediente vive en `CompartirExpediente.jsx`.
//
// ── LAS TRES FORMAS QUE CABEN AQUÍ ───────────────────────────
//
//   · UN DOCUMENTO DE TEXTO CON SECCIÓN DE FIRMAS — ninguna
//     pregunta. Quien entra está ahí para firmarlo, y eso no se
//     elige: se le da acceso y firma. Por eso sólo queda «¿a quién?».
//   · UN DOCUMENTO DE TEXTO SIN FIRMAS — una pregunta, «¿cómo
//     quieres compartirlo?», con dos respuestas: Editor o Lector.
//   · UN COMPROBANTE —una factura o un recibo— tampoco pregunta
//     nada, y además no sale por enlace: ver abajo el porqué.
//
// En los dos casos de texto se puede mandar un enlace a alguien SIN
// CUENTA, que es lo que pidió Ricardo pensando en un freelance. Y la
// regla de seguridad del expediente no se rompe aquí: un documento
// de texto compartido por enlace es exactamente lo que su dueño
// quiso compartir —el texto—, no el expediente de otras cinco
// personas.

import { IcoLink, Icon } from "../ui/iconos";
import { tiempoRestante } from "../nucleo/invitaciones";
import { fmtFull } from "../nucleo/formato";
import { seVe } from "../nucleo/secciones";
import { esComprobante, porQueNoSale } from "../nucleo/comprobantes";

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

export function modalCompartir(ctx){
  const {
    d, modal, setModal, uid, mIn, setMIn, saving,
    doShare, revokeShare, shareBusy, shareErr, shareFound, setShareErr, setShareFound,
    setShareModo, shareRol, setShareRol,
    setShareReqs, setShareTodo, setSolMsg,
    crearEnlace, enlaceNuevo, setEnlaceNuevo, copiarEnlace,
    enlaces, verEnlaces, revocarEnlace, copyLink,
    ROL_TEXTO, ROL_AYUDA, accesos, acctEmail,
    puedo, verificado, reenviarVerificacion, verifBusy,
    user,
  } = ctx;
  // Este archivo NO dibuja expedientes: eso es `CompartirExpediente`.
  // El despachador llama a los dos, y el que no es suyo da null.
  if(modal.t !== "share" || d.kind === "expediente") return null;

  const puedeCompartir = puedo("compartir");
  const otros = (accesos||[]).filter(a=>a.rol!=="propietario");
  // Tu propia fila en la lista de accesos: se ve, pero no se toca.
  const esMiFila = (a) =>
    String(a?.correo||"").toLowerCase() === String(acctEmail||"").toLowerCase();

  // ── LAS TRES FORMAS DE ESTE MODAL ──────────────────────────
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
  const paraFirmar = !comprobante && seVe(d, "firmas");
  const soloLectura = !comprobante && !paraFirmar;

  // En un documento que se firma el papel no se elige: ver PARA_FIRMAR.
  // En un comprobante tampoco se elige: «lector» y punto. Quien lo
  // recibe está ahí para verlo, y cambiarlo no podría aunque se le
  // diera el papel de editor —ver `soloSuDueno` en comprobantes.js,
  // que deja la edición de un recibo sólo a su dueño—. Ofrecer
  // «Editor» seria prometer algo que la regla de abajo no cumple.
  const rol = paraFirmar ? PARA_FIRMAR
    : comprobante ? "lector"
    : (COMPLETOS.includes(shareRol) ? shareRol : COMPLETOS[0]);

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
      <h2>{enlaceNuevo.proposito==="firma"
        ? "Mándale esto para que lo firme" : "Enlace listo"}</h2>
      <p className="sub">
        {/* Los dos enlaces de un documento de texto no se explican
            con el mismo párrafo: lo que quien lo recibe va a poder
            hacer cambia, y eso es justo lo que quien lo manda
            necesita saber ANTES de mandarlo. */}
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
        </> : <>        </>}
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

          {soloLectura && (<>
          <div className="rec-lbl">¿Cómo quieres compartirlo?</div>
          <div className="modo-lista">
            {COMPLETOS.map(r=>(
              <label key={r} className={`modo ${rol===r?"on":""}`}>
                <input type="radio" name="modo" checked={rol===r}
                  onChange={()=>setShareRol(r)} />
                <span className="modo-n">{ROL_TEXTO[r]}</span>
                <span className="modo-d">{AYUDA_TEXTO[r] || ROL_AYUDA[r]}</span>
              </label>
            ))}
          </div>
          </>)}

          {/* ── A quién ── */}
          {/* La etiqueta dice para qué sirve el campo. Era «¿A quién?»
              a secas, y hay dos caminos de los que sólo uno lo usa: el
              enlace sin cuenta no va atado a ningún correo. Sin esta
              línea, un campo vacío arriba parece algo que falta por
              rellenar aunque vayas a mandar el enlace. */}
          <div className="rec-lbl">¿A quién? <span className="rec-lbl-d">Su correo de OCTAVIN, si tiene cuenta</span></div>
          <input className="inp" type="email" placeholder="correo@ejemplo.com" value={mIn}
            disabled={shareBusy||saving||!verificado}
            onChange={e=>{setMIn(e.target.value);setShareErr("");setShareFound(null);}}
            onKeyDown={e=>e.key==="Enter"&&doShare()} />

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
          </>) : (<>
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
              Enlaces sin cuenta ({enlaces.length}):
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
          {/* Si se pueden crear enlaces, hace falta poder verlos y
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