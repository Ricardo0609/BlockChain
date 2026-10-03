// Sello fiscal: lo que el SAT dice de una factura adjunta.
//
// ← NUEVO (Etapa 4). El color no es decorativo: verde es «el SAT la
// reconoce y nadie está fichado»; rojo es «no la deduzcas»; ámbar es
// «revísala». Un expediente puede verse completo y estar lleno de
// facturas canceladas, y eso es justo lo que esto evita.

import { Icon } from "./iconos";
import { fmtMonto } from "../smartContract";
import { fmtFecha, fmtFull } from "../nucleo/formato";

const SEMAFORO = {
  verde: { icono: "verified",  titulo: "Comprobante verificado" },
  ambar: { icono: "warning",   titulo: "Comprobante con observaciones" },
  rojo:  { icono: "dangerous", titulo: "Comprobante con problema grave" },
};

export function SelloFiscal({ f, aid, onVerificar, ocupado }){
  const s = SEMAFORO[f.semaforo] || SEMAFORO.ambar;
  return (
    <div className={`fiscal fiscal-${f.semaforo}`}>
      <div className="fiscal-h">
        <Icon n={s.icono} size={16}/>
        <span className="fiscal-t">{s.titulo}</span>
        {onVerificar && (
          <button className="fiscal-re" disabled={ocupado} onClick={()=>onVerificar(aid)}>
            {ocupado ? "Consultando…" : "Volver a consultar"}
          </button>
        )}
      </div>

      <div className="fiscal-sat">{f.textoSAT}</div>

      {f.uuid && <div className="fiscal-uuid">Folio fiscal {f.uuid}</div>}
      {(f.rfcEmisor || f.total != null) && (
        <div className="fiscal-datos">
          {f.emisor && <span>{f.emisor}</span>}
          {f.rfcEmisor && <span className="mono">{f.rfcEmisor}</span>}
          {f.total != null && <span>{fmtMonto(f.total, f.moneda)}</span>}
          {f.fecha && <span>{fmtFecha(f.fecha)}</span>}
        </div>
      )}

      {/* ← NUEVO: la factura ya se usó en otro requisito. Deducir dos
          veces el mismo comprobante es de los errores que más caro
          salen en una auditoría, y en un expediente grande no se ve. */}
      {f.repetido && (
        <div className="fiscal-69b">
          <Icon n="content_copy" size={15}/>
          <span>
            Este folio fiscal <b>ya se usó</b> en «{f.repetido.titulo || "otro expediente"}»
            {f.repetido.usadaEn ? ` el ${fmtFecha(String(f.repetido.usadaEn).slice(0,10))}` : ""}.
            Una misma factura no puede comprobar dos cosas distintas.
          </span>
        </div>
      )}

      {/* ← NUEVO: existe y es válida, pero ¿es la que correspondía? */}
      {(f.cotejo||[]).map(c=>(
        <div key={c.clave} className="fiscal-cotejo">
          <Icon n="rule" size={15}/>
          <span>{c.texto}</span>
        </div>
      ))}

      {/* Lo más valioso de todo: enterarte tú antes que el auditor. */}
      {(f.listaNegra||[]).map(x=>(
        <div key={x.rfc} className="fiscal-69b">
          <Icon n="gpp_maybe" size={15}/>
          <span>
            <b className="mono">{x.rfc}</b> aparece en la lista 69-B del SAT como{" "}
            <b>{x.situacion}</b>
            {x.riesgo==="alto" && ": sus comprobantes no sirven para deducir."}
            {x.riesgo==="medio" && ": todavía puede desvirtuarlo, pero conviene revisarlo."}
          </span>
        </div>
      ))}

      {(f.problemas||[]).includes("sin-timbre") && (
        <div className="fiscal-69b"><Icon n="gpp_maybe" size={15}/>
          <span>El XML no está timbrado: es un borrador, no un comprobante fiscal.</span></div>
      )}
      {(f.problemas||[]).includes("descuadre") && (
        <div className="fiscal-69b"><Icon n="gpp_maybe" size={15}/>
          <span>Los conceptos del CFDI no suman lo que dice su subtotal.</span></div>
      )}

      {f.revisadoEn && <div className="fiscal-fecha">Consultado el {fmtFull(f.revisadoEn)}</div>}
    </div>
  );
}