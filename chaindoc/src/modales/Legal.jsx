// Aviso de privacidad y términos de uso.
//
// Se abre desde tres sitios: el registro (antes de aceptar), el menú
// lateral y configuración. Es el mismo componente en los tres, para
// que nadie pueda ver una versión distinta de la que aceptó.
//
// Dos pestañas y no dos modales: la ley pide que el aviso se pueda
// leer antes de dar el consentimiento, y partirlo en dos pantallas
// distintas hace que la mitad de la gente lea sólo una.

import { DOCUMENTOS } from "../nucleo/legal";
import { LegalDoc } from "../ui/LegalDoc";

export function modalLegal(ctx){
  const { modal, setModal, legalTab, setLegalTab } = ctx;
  if(modal.t !== "legal") return null;

  const cual = legalTab === "terminos" ? "terminos" : "aviso";

  return (
    <div className="ov" onClick={()=>setModal(null)}>
      <div className="modal wide legal" onClick={e=>e.stopPropagation()}>
        <div className="legal-tabs">
          <button className={`legal-tab ${cual==="aviso"?"on":""}`}
            onClick={()=>setLegalTab("aviso")}>Aviso de privacidad</button>
          <button className={`legal-tab ${cual==="terminos"?"on":""}`}
            onClick={()=>setLegalTab("terminos")}>Términos de uso</button>
        </div>

        {/* Mientras dure el piloto, la advertencia va arriba del texto y
            no en letra chiquita al final: es lo que de verdad cambia lo
            que alguien decide subir. */}
        <div className="legal-piloto">
          Versión piloto. El servicio puede cambiar o interrumpirse, y estos textos
          están pendientes de revisión por un abogado. Conserva tus propias copias
          de lo que sea importante.
        </div>

        <div className="legal-cuerpo">
          <LegalDoc doc={DOCUMENTOS[cual]}/>
        </div>

        <div className="modal-row">
          <button className="btn btn-primary" onClick={()=>setModal(null)}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}