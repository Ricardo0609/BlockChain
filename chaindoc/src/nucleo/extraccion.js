// Extrae campos de factura desde texto de OCR o PDF.

// ── EXTRACCIÓN DE DATOS DESDE OCR / PDF ───────────────────────
// ← NUEVO: lee el texto crudo del escaneo y rellena los campos.
const num = (m)=> m ? m[1].replace(/,/g,"") : "";

export function parseFactura(text){
  const t = text.replace(/\s+/g," ");
  const rfcs = [...t.matchAll(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g)].map(m=>m[1]);
  const f = {};

  const uuid = t.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  if(uuid) f.uuid = uuid[0].toUpperCase();

  if(rfcs[0]) f.rfcEmisor   = rfcs[0];
  if(rfcs[1]) f.rfcReceptor = rfcs[1];

  const folio = t.match(/folio\s*(?:interno)?[:\s]*([A-Z0-9][A-Z0-9-]{0,15})/i);
  if(folio && !/fiscal/i.test(folio[0])) f.folio = folio[1];

  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const dmy = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if(iso) f.fecha = iso[1];
  else if(dmy) f.fecha = `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;

  // Se permite texto intermedio sin '$' para tolerar etiquetas como "IVA (16%)"
  const total    = t.match(/\btotal\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  const subtotal = t.match(/\bsub\s?total\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  const iva      = t.match(/\biva\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  if(total)    f.total    = num(total);
  if(subtotal) f.subtotal = num(subtotal);
  if(iva)      f.iva      = num(iva);

  const emisor = text.match(/emisor[:\s]*\n?\s*([^\n]{3,60})/i);
  if(emisor) f.emisor = emisor[1].trim();
  const receptor = text.match(/receptor[:\s]*\n?\s*([^\n]{3,60})/i);
  if(receptor) f.receptor = receptor[1].trim();

  const concepto = text.match(/(?:concepto|descripci[oó]n)[:\s]*\n?\s*([^\n]{3,120})/i);
  if(concepto) f.concepto = concepto[1].trim();

  return f;
}
