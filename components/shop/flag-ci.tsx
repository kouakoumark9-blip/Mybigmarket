/** Drapeau de la Côte d'Ivoire (orange, blanc, vert) dessiné en SVG : s'affiche partout, contrairement à l'émoji de drapeau. */
export function FlagCI({ width = 30 }: { width?: number }) {
  return <svg className="mb-flag" width={width} height={Math.round(width * 2 / 3)} viewBox="0 0 3 2" role="img" aria-label="Drapeau de la Côte d'Ivoire" xmlns="http://www.w3.org/2000/svg">
    <rect width="1" height="2" fill="#F77F00"/>
    <rect x="1" width="1" height="2" fill="#FFFFFF"/>
    <rect x="2" width="1" height="2" fill="#009E60"/>
  </svg>;
}
