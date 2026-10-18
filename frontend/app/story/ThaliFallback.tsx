/** Flat SVG thali, used when WebGL is unavailable or the visitor prefers reduced motion. */
export default function ThaliFallback() {
  const bowls = [
    { cx: 200, cy: 128, c: "#7ec27a" },
    { cx: 140, cy: 232, c: "#f2a43a" },
    { cx: 260, cy: 232, c: "#e8603a" },
  ];
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="A steel thali with three katoris of protein, carbs and fat" className="st-fallback">
      <ellipse cx="200" cy="205" rx="176" ry="170" fill="#d8dcdd" />
      <ellipse cx="200" cy="205" rx="150" ry="144" fill="none" stroke="#9aa1a3" strokeWidth="2" />
      {bowls.map((b, i) => (
        <g key={i}>
          <circle cx={b.cx} cy={b.cy} r="52" fill="#c3c8ca" />
          <circle cx={b.cx} cy={b.cy} r="42" fill={b.c} />
        </g>
      ))}
    </svg>
  );
}
