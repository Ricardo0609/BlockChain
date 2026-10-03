// Dibuja un documento legal (el aviso o los términos).
//
// Vive en ui/ y no en modales/ porque se usa en más de un sitio: el
// modal que se abre desde el registro, y la sección de configuración.
// Uno solo, para que nadie pueda ver una versión distinta de la que
// aceptó.

import { trozos } from "../nucleo/legal";

/** Pinta un texto respetando el **resaltado**. */
const Trozos = ({ texto }) =>
  trozos(texto).map((t, i) =>
    t.fuerte ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>);

export function LegalDoc({ doc }){
  return (
    <div className="legal-doc">
      <div className="legal-meta">Versión {doc.version} · {doc.fecha}</div>
      <p className="legal-intro"><Trozos texto={doc.intro}/></p>

      {doc.secciones.map((s, i) => (
        <section key={i} className="legal-sec">
          <h3>{s.t}</h3>
          {(s.p || []).map((p, k) => <p key={k}><Trozos texto={p}/></p>)}
          {s.lista && (
            <ul className="legal-lista">
              {s.lista.map((l, k) => <li key={k}><Trozos texto={l}/></li>)}
            </ul>
          )}
          {s.cierre && <p className="legal-cierre"><Trozos texto={s.cierre}/></p>}
        </section>
      ))}
    </div>
  );
}