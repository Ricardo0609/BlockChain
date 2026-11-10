// ─────────────────────────────────────────────────────────────
// Accion.jsx — Las pantallas de los enlaces que llegan por correo
//
// Hasta hoy, confirmar el correo, restablecer la contraseña y deshacer
// un cambio de correo caían en una página de Firebase: en inglés, con
// su marca y su diseño. Es la segunda pantalla que ve alguien que
// acaba de registrarse en un producto en español.
//
// El esqueleto sale del lienzo «Pantalla de confirmación de correo»,
// donde quedaron fijadas las cuatro situaciones: logo arriba, círculo
// con icono, título, párrafo, una acción, y una nota pequeña al pie.
// Aquí está escrito UNA vez y se rellena según el caso, en vez de
// cuatro pantallas copiadas que se separarían a la primera corrección
// que se hiciera en una sola.
//
// Esta pantalla se pinta ANTES de saber si hay sesión: quien llega por
// un enlace de contraseña justamente no la tiene.
//
// Funciones y no componentes, como el resto de pantallas del proyecto:
// el estado vive en App.jsx y llega por `ctx`.
// ─────────────────────────────────────────────────────────────

const BIEN = "#16a34a";
const AVISO = "#b45309";
const GRIS = "#7b7b7b";

/** Los tres dibujos del lienzo, en un trazo de 24. */
function icono(nombre, color){
  const c = {
    viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2.2,
    strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
  };
  if(nombre === "palomita"){
    return <svg {...c} width="34" height="34" strokeWidth="2.4"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg>;
  }
  if(nombre === "reloj"){
    return <svg {...c} width="32" height="32"><circle cx="12" cy="12" r="9"/><path d="M12 7.2v5.3l3.4 2"/></svg>;
  }
  // La llave es para el formulario de contraseña nueva: ahí no ha
  // salido nada mal, y el signo de admiración decía lo contrario.
  if(nombre === "llave"){
    return <svg {...c} width="32" height="32"><circle cx="8.6" cy="15.4" r="3.4"/><path d="M11 13L19 5"/><path d="M16.4 7.6l2.2 2.2"/></svg>;
  }
  return <svg {...c} width="32" height="32"><circle cx="12" cy="12" r="9"/><path d="M12 7.6v5"/><path d="M12 16.2h.01"/></svg>;
}

/**
 * El marco común. Todo lo que cambia entra por el objeto.
 *
 * `pie` va en gris claro y pequeño: es la frase que quita el susto
 * —«tu cuenta sigue ahí»— y no debe competir con la acción.
 */
function marco({ ico, color, titulo, texto, dato, dentro, pie }){
  return (
    <div className="acc">
      <div className="acc-marca">OCTAVIN</div>

      {ico === "giro"
        ? <div className="acc-giro" role="img" aria-label="Comprobando"/>
        : <div className="acc-circulo" style={{ borderColor: color }}>{icono(ico, color)}</div>}

      <h1 className="acc-t">{titulo}</h1>
      {texto && <p className="acc-p">{texto}</p>}
      {dato && <p className="acc-dato">{dato}</p>}
      {dentro}
      {pie && <p className="acc-pie">{pie}</p>}
    </div>
  );
}

export function renderAccion(ctx){
  const {
    accCaso, accEstado, accCorreo, accError, accBusy,
    accPass, setAccPass, accPass2, setAccPass2,
    guardarContrasena, irALaApp, pedirOtroEnlace,
  } = ctx;

  const entrar = (
    <button type="button" className="btn btn-primary" onClick={irALaApp}>Entrar a OCTAVIN</button>
  );

  // ── Mientras se comprueba ──
  if(accEstado === "comprobando"){
    return marco({
      ico: "giro",
      titulo: "Comprobando tu enlace",
      texto: "Un momento. No cierres esta página.",
    });
  }

  // ── El enlace venció ──
  if(accEstado === "vencido"){
    return marco({
      ico: "reloj", color: AVISO,
      titulo: "Este enlace ya venció",
      texto: "Los enlaces duran tres días. Pide uno nuevo y te lo mandamos al mismo correo.",
      pie: "Tu cuenta sigue ahí y puedes usarla.",
      dentro: (
        <div className="acc-botones">
          <button type="button" className="btn btn-primary" disabled={accBusy}
            onClick={pedirOtroEnlace}>
            {accBusy ? "Enviando…" : "Enviarme otro enlace"}
          </button>
          <button type="button" className="acc-link" onClick={irALaApp}>Entrar con otra cuenta</button>
        </div>
      ),
    });
  }

  // ── El enlace ya se usó ──
  //
  // El caso que más se da y el que peor se explicaba: Gmail y Outlook
  // abren los enlaces solos para revisarlos, así que mucha gente llega
  // a uno gastado sin haberlo tocado. Decirle «no es válido» es
  // acusarla de algo que no hizo, y por eso el pie lo explica.
  if(accEstado === "usado"){
    return marco({
      ico: "info", color: GRIS,
      titulo: "Este enlace ya se usó",
      texto: accCaso === "contrasena"
        ? "Cada enlace sirve una sola vez. Si ya cambiaste tu contraseña, entra con la nueva."
        : "Cada enlace sirve una sola vez. Lo más probable es que ya esté hecho: entra y compruébalo.",
      pie: "Tu programa de correo abre los enlaces para revisarlos, así que a veces se gastan sin que los toques.",
      dentro: entrar,
    });
  }

  if(accEstado === "roto" || accEstado === "sin-cuenta"){
    return marco({
      ico: "info", color: AVISO,
      titulo: "No pudimos usar este enlace",
      texto: accEstado === "sin-cuenta"
        ? "La cuenta de este enlace ya no existe."
        : "Puede que esté incompleto: algunos programas de correo los cortan al mandarlos.",
      pie: accError || null,
      dentro: entrar,
    });
  }

  // ── Salió bien ──
  if(accEstado === "hecho" && accCaso === "confirmar"){
    return marco({
      ico: "palomita", color: BIEN,
      titulo: "Tu correo quedó confirmado",
      texto: "Ya puedes compartir documentos y que otros te encuentren para pedirte comprobantes.",
      dato: accCorreo, dentro: entrar,
    });
  }

  if(accEstado === "hecho" && accCaso === "recuperar"){
    return marco({
      ico: "palomita", color: BIEN,
      titulo: "Tu correo volvió a ser el de antes",
      texto: "También te mandamos un enlace para poner una contraseña nueva.",
      dato: accCorreo,
      pie: "Cámbiala: quien movió tu correo pudo haber entrado a tu cuenta.",
      dentro: entrar,
    });
  }

  if(accEstado === "hecho" && accCaso === "contrasena"){
    return marco({
      ico: "palomita", color: BIEN,
      titulo: "Tu contraseña quedó cambiada",
      texto: "Entra con la nueva.", dato: accCorreo, dentro: entrar,
    });
  }

  // ── El formulario de contraseña nueva ──
  //
  // El único caso que no es una pantalla de estado. Va dentro del
  // mismo marco para que no parezca otra aplicación.
  return marco({
    ico: "llave", color: GRIS,
    titulo: "Elige una contraseña nueva",
    texto: "Para la cuenta de:", dato: accCorreo,
    dentro: (
      <form className="acc-form" onSubmit={e=>{ e.preventDefault(); guardarContrasena(); }}>
        {/* El correo, oculto pero presente: sin él, el gestor de
            contraseñas del navegador no sabe de cuál es la que guarda. */}
        <input type="email" value={accCorreo || ""} readOnly autoComplete="username"
          style={{display:"none"}} aria-hidden="true" tabIndex={-1}/>
        <label className="acc-lbl" htmlFor="acc-p1">Contraseña nueva</label>
        <input id="acc-p1" className="inp" type="password" value={accPass} autoFocus
          autoComplete="new-password" minLength={6}
          onChange={e=>setAccPass(e.target.value)}/>
        <label className="acc-lbl" htmlFor="acc-p2">Repítela</label>
        <input id="acc-p2" className="inp" type="password" value={accPass2}
          autoComplete="new-password" minLength={6}
          onChange={e=>setAccPass2(e.target.value)}/>
        {accError && <p className="acc-err">{accError}</p>}
        <button type="submit" className="btn btn-primary" disabled={accBusy}
          style={{width:"100%", marginTop:4}}>
          {accBusy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    ),
  });
}
