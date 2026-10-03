// Iconos (Material Symbols). Nuevos iconos: agrégalos también en index.html.

// ── Iconos SVG inline ─────────────────────────────────────────
// ── ICONOS ────────────────────────────────────────────────────
// ← ACTUALIZADO: antes eran SVG dibujados a mano. Ahora usan
// Material Symbols (el set de Google). Los nombres de componente
// se conservan para no tocar las decenas de sitios que los usan.
export const Icon = ({ n, size=24, fill=false, weight=300 }) => (
  <span className="msym" aria-hidden="true"
    style={{ fontSize:size, width:size, height:size,
             fontVariationSettings:`'FILL' ${fill?1:0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}` }}>
    {n}
  </span>
);

export const IcoFolder = () => <Icon n="folder"      size={26} />;
export const IcoDots   = () => <Icon n="more_vert"   size={22} weight={400} />;
export const IcoEye    = () => <Icon n="visibility"  size={18} />;
export const IcoFinger = () => <Icon n="fingerprint" size={24} />;
export const IcoBack   = () => <Icon n="arrow_back"  size={32} />;
export const IcoGear   = () => <Icon n="settings"    size={22} />;
export const IcoLink   = () => <Icon n="link"        size={20} />;
