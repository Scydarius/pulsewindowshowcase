type SiteNavProps = {
  onDemo?: () => void;
};

export function SiteNav({ onDemo }: SiteNavProps) {
  return <nav className="nav" aria-label="Primary navigation">
    <a className="brand brand-link" href="/"><span className="brand-icon">♥</span><span>PulseWindow</span></a>
    <a href="/how-it-works">How it works</a>
    <a href="/for-care-teams">For care teams</a>
    <a href="/contact">Contact</a>
    {onDemo
      ? <button className="nav-cta" onClick={onDemo}>See the concept</button>
      : <a className="nav-cta" href="/">View the prototype</a>}
  </nav>;
}

export function SiteFooter() {
  return <footer>
    <a className="brand brand-link" href="/"><span className="brand-icon">♥</span><span>PulseWindow</span></a>
    <span>Remote monitoring concept · Built for discussion</span>
    <a href="mailto:admin@pulsewindow.me">admin@pulsewindow.me</a>
    <span>© 2026 PulseWindow</span>
  </footer>;
}
