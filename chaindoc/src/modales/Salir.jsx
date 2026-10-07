// Confirmación antes de cerrar sesión.
//
// Cerrar sesión está a un dedo de «Privacidad y términos» en el menú, y
// quien le da sin querer pierde lo que estuviera escribiendo y tiene que
// volver a entrar. No es grave, pero es molesto y se evita con una
// pregunta. Es el único sitio del menú donde un dedazo cuesta algo.

export function modalSalir(ctx){
  if(ctx.modal?.t !== "logout") return null;
  const { acctEmail, doLogout, setModal, user } = ctx;

  return (
    <div className="ov" onClick={()=>setModal(null)}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>¿Cerrar sesión?</h2>
        <p className="sub">
          Vas a salir de la cuenta de <strong>{user}</strong>
          {acctEmail ? <> ({acctEmail})</> : null}. Tus documentos quedan donde están;
          para volver a verlos tendrás que iniciar sesión otra vez.
        </p>
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-warning" onClick={()=>{ setModal(null); doLogout(); }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
