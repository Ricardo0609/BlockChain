// Dibuja una plantilla visual como formulario.

import { FORMS, dinero, fechaLegible } from "./formularios";
import { errorDeRFC } from "../nucleo/rfc";

// ── PLANTILLA VISUAL ──────────────────────────────────────────
// ← NUEVO: dibuja el esquema de FORMS como formulario.
// En modo lectura muestra los valores; vacíos aparecen atenuados.

// ── DE DÓNDE SALIÓ CADA DATO (19 nov) ─────────────────────────
//
// Regla de Ricardo: los campos los llena el archivo, el usuario sólo
// corrige, y el original se queda pegado «para que la otra persona
// pueda corroborar los datos y que no fueron alterados».
//
// Corroborar exige saber QUÉ mirar. Un comprobante con doce campos
// iguales a su archivo y uno cambiado se lee igual que uno intacto.
//
// SÓLO SE MARCA LO ESCRITO A MANO, no lo que vino del archivo. Venir
// del archivo es lo normal y lo esperado: marcarlo también sería
// poner una etiqueta en cada línea, y doce avisos no avisan de nada.
// Lo que destaca es la excepción.
const marcaDeOrigen = (origen, k) => origen?.[k] === "mano" ? (
  <span className="fd-mano" title="Este dato no salió del archivo: lo escribió una persona. Compáralo con el original adjunto.">
    a mano
  </span>
) : null;

export function FormDoc({ formKey, fields, onChange, editable, origen, corregir }){
  const s = FORMS[formKey];
  if(!s) return null;
  const set = (k,v)=>onChange({ ...fields, [k]:v });
  const val = (k)=>fields?.[k] ?? "";

  // ← ACTUALIZADO: esto era un componente declarado dentro del render.
  // React lo trataba como un tipo distinto en cada tecleo, remontaba el
  // input y se perdía el foco. Como función que devuelve JSX, no ocurre.
  const field = (f)=>{
    const v = val(f.k);

    if(f.type==="toggle") return (
      <label key={f.k} className={`fd-toggle ${v?"on":""}`}>
        <span>{f.label}</span>
        <input type="checkbox" checked={!!v} disabled={!editable}
          onChange={e=>set(f.k, e.target.checked)} />
        <span className="fd-switch"/>
      </label>
    );

    if(f.type==="radio") return (
      <div key={f.k} className="fd-radio-wrap">
        <span className="fd-label">{f.label}:{marcaDeOrigen(origen, f.k)}</span>
        <div className="fd-radios">
          {f.options.map(o=>(
            <label key={o} className="fd-radio">
              <input type="radio" name={`${formKey}-${f.k}`} checked={v===o} disabled={!editable}
                onChange={()=>set(f.k,o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </div>
    );

    // ← NUEVO (Etapa 4): el RFC trae un dígito de control calculado a
    // partir del resto, así que un dedazo se detecta al instante, sin
    // preguntarle a nadie. Se avisa mientras se escribe, pero no se
    // bloquea el campo: el aviso es para que lo revises, no para
    // discutir contigo.
    const esRFC = /^rfc/i.test(f.k);
    const avisoRFC = esRFC && v.length >= 12 ? errorDeRFC(v) : "";

    return (
      <div key={f.k} className={`fd-field ${f.w===2?"wide":""}`}>
        <span className="fd-label">{f.label}:{marcaDeOrigen(origen, f.k)}</span>
        {editable ? (
          f.type==="area"
            ? <textarea className="fd-input area" value={v} placeholder={f.placeholder||""}
                onChange={e=>set(f.k,e.target.value)} />
            : <input className={`fd-input ${f.mono?"mono":""} ${avisoRFC?"mal":""}`}
                type={f.type==="date"?"date":"text"}
                inputMode={f.type==="money"?"decimal":undefined}
                placeholder={f.type==="money"?"$0.00":(f.placeholder||"")}
                value={v}
                onChange={e=>set(f.k, esRFC ? e.target.value.toUpperCase() : e.target.value)} />
        ) : (
          <span className={`fd-value ${!v?"empty":""} ${f.mono?"mono":""}`}>
            {v
              ? (f.type==="money" ? dinero(v)
                : f.type==="date" ? fechaLegible(v)
                : v)
              : (f.placeholder || "—")}
          </span>
        )}
        {avisoRFC && <span className="fd-aviso">{avisoRFC}</span>}
      </div>
    );
  };

  return (
    <div className="fd">
      {/* ← QUITADO (3 nov): el encabezado de la plantilla.
          La pantalla enseñaba DOS títulos: el del documento, que le
          pone quien lo crea, y encima este, fijo, que decía siempre
          «Recibo de nómina» aunque el recibo fuera de la compra de
          cemento. El segundo no añadía nada y contradecía al primero. */}
      <div className="fd-head">
        {(s.header||[]).map(field)}
      </div>
      <div className="fd-body">
        {s.rows.map((row,i)=>(
          <div key={i} className="fd-row">
            {row.map(field)}
          </div>
        ))}
        {/* ── CORREGIR EL ARCHIVO (24 nov) ────────────────────
            Donde estaba «Enviar periódicamente», que no encendía
            nada. Ricardo: «¿qué tal si subí el que no era?».

            Antes la única salida era borrar el comprobante entero y
            registrarlo de nuevo, porque el original NO se puede
            quitar. Eso sigue en pie: esto no lo quita, lo
            SUSTITUYE, y el cambio queda asentado en la cadena con
            la huella del que estaba. Quitar sin rastro es lo que no
            se puede; cambiar diciéndolo, sí. */}
        {corregir && (
          <div className="fd-acts">
            <label className={`fd-corregir ${corregir.ocupado?"ocupado":""}`}>
              <span>{corregir.ocupado
                ? "Leyendo el archivo…"
                : `Corregir ${formKey === "factura" ? "factura" : "recibo"}`}</span>
              <input type="file" style={{display:"none"}} disabled={corregir.ocupado}
                accept={corregir.acepta}
                onChange={e=>{ corregir.alElegir(e.target.files?.[0]); e.target.value=""; }} />
            </label>
            <span className="fd-corregir-n">
              Sube el archivo bueno: los datos se vuelven a leer de él
              y el cambio queda asentado, con la huella del anterior.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
