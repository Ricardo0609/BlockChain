// Formatos de fecha/hora y el parámetro ?doc= de la URL.

// ── Helpers ───────────────────────────────────────────────────
export const fmtFull  = iso => new Date(iso).toLocaleString("es-MX",{day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true});
export const fmtDia   = ymd => {
  const hoy = new Date().toISOString().slice(0,10);
  const ayer = new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(ymd===hoy)  return "Hoy";
  if(ymd===ayer) return "Ayer";
  return new Date(ymd+"T12:00:00").toLocaleDateString("es-MX",
    {weekday:"long",day:"numeric",month:"long",year:"numeric"});
};
// ← NUEVO: fecha corta ("23 sep"; con año si no es el actual)
export const fmtFecha = ymd => {
  if(!ymd) return "—";
  const f = new Date(ymd+"T12:00:00");
  const mismoAnio = f.getFullYear()===new Date().getFullYear();
  return f.toLocaleDateString("es-MX",{day:"numeric",month:"short",...(mismoAnio?{}:{year:"numeric"})});
};
export const fmtHora  = iso => new Date(iso).toLocaleTimeString("es-MX",{hour:"numeric",minute:"2-digit",hour12:true});
export const fmtShort = iso => new Date(iso).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});

export const getUrlDoc = () => new URLSearchParams(window.location.search).get("doc") || null;
export const setUrlDoc = id => {
  const u = new URL(window.location.href);
  if(id) u.searchParams.set("doc",id); else u.searchParams.delete("doc");
  window.history.replaceState({},"",u.toString());
};
