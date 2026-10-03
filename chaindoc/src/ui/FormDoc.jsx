// Dibuja una plantilla visual como formulario.

import { FORMS } from "./formularios";
import { errorDeRFC } from "../nucleo/rfc";

// ── PLANTILLA VISUAL ──────────────────────────────────────────
// ← NUEVO: dibuja el esquema de FORMS como formulario.
// En modo lectura muestra los valores; vacíos aparecen atenuados.

export function FormDoc({ formKey, fields, onChange, editable }){
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
        <span className="fd-label">{f.label}:</span>
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
        <span className="fd-label">{f.label}:</span>
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
            {v ? (f.type==="money" ? `$${v}` : v) : (f.placeholder || "—")}
          </span>
        )}
        {avisoRFC && <span className="fd-aviso">{avisoRFC}</span>}
      </div>
    );
  };

  return (
    <div className="fd">
      <div className="fd-head">
        <h2 className="fd-heading">{s.heading}</h2>
        {(s.header||[]).map(field)}
      </div>
      <div className="fd-body">
        {s.rows.map((row,i)=>(
          <div key={i} className="fd-row">
            {row.map(field)}
          </div>
        ))}
      </div>
    </div>
  );
}
