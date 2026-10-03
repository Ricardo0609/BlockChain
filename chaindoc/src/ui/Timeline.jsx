// Línea de tiempo de la operación, agrupada por día.

import { Icon } from "./iconos";
import { agruparPorDia, eventoDe } from "./eventos";
import { fmtDia, fmtHora } from "../nucleo/formato";
import { enlaceDeBloque } from "../nucleo/anclaje";

// ── APP ───────────────────────────────────────────────────────
// ← NUEVO: la historia de la operación en orden, no una lista de bloques.
// Es la pantalla que hace visible la tesis: se valida la operación
// completa, no cada documento por separado.

export function Timeline({ chain, anclajes }){
  const dias = agruparPorDia(chain||[]);
  if(!dias.length) return <p className="tl-vacio">Todavía no hay actividad registrada.</p>;

  return (
    <div className="tl">
      {dias.map(dia=>(
        <div key={dia.clave} className="tl-dia">
          <div className="tl-fecha">{fmtDia(dia.clave)}</div>
          {dia.bloques.map(b=>{
            const ev = eventoDe(b);
            return (
              <div key={b.hash} className={`tl-item tono-${ev.tono}`}>
                <div className="tl-linea"><span className="tl-punto"><Icon n={ev.ico} size={17}/></span></div>
                <div className="tl-cuerpo">
                  <div className="tl-titulo">{ev.titulo(b)}</div>
                  {b.content && b.action!=="EDICIÓN" && (
                    <div className="tl-detalle">{b.content}</div>
                  )}
                  <div className="tl-pie">
                    {b.author} · {fmtHora(b.timestamp)} · bloque #{b.index}
                  </div>
                  {/* ← NUEVO (Etapa 5): la fecha, respaldada por algo
                      que no somos nosotros. Sólo se enseña cuando ya
                      está en Bitcoin: «pendiente» no le dice nada útil
                      a nadie y el anclaje corre una vez al día. */}
                  {anclajes?.[b.hash]?.estado === "confirmado" && (
                    <a className="tl-ancla" target="_blank" rel="noreferrer"
                      href={enlaceDeBloque(anclajes[b.hash].altura)}
                      title="La fecha de este bloque está publicada en la cadena de Bitcoin. Ábrelo para comprobarlo tú.">
                      <Icon n="link" size={13}/>
                      Fecha anclada en Bitcoin · bloque {anclajes[b.hash].altura}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}