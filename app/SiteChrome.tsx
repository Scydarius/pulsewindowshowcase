import { useState } from "react";

const navigation = [
  ["Home", "/"],
  ["How it works", "/how-it-works"],
  ["Technology", "/technology"],
  ["For clinicians", "/for-clinicians"],
  ["Research", "/research"],
  ["Demo", "/demo"],
  ["Contact", "/contact"],
] as const;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Brand() {
  return <a className="brand" href="/" aria-label="PulseWindow home">
    <span className="brand-mark" aria-hidden="true"><i></i><b>♥</b></span>
    <span>PulseWindow</span>
  </a>;
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  return <header className="site-header">
    <div className="nav-shell">
      <Brand />
      <button className="menu-button" type="button" aria-expanded={open} aria-controls="primary-menu" onClick={() => setOpen(!open)}>
        <span></span><span></span><span></span><em>{open ? "Close" : "Menu"}</em>
      </button>
      <nav id="primary-menu" className={open ? "nav-links open" : "nav-links"} aria-label="Primary navigation">
        {navigation.map(([label, href]) => <a key={href} href={href} className={href === "/demo" ? "demo-link" : ""} aria-current={isActive(path, href) ? "page" : undefined}>{label}</a>)}
      </nav>
    </div>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-main">
      <div><Brand /><p>A guided camera measurement for better remote health conversations.</p></div>
      <div className="footer-links"><strong>Explore</strong><a href="/how-it-works">How it works</a><a href="/technology">Technology</a><a href="/research">Research</a></div>
      <div className="footer-links"><strong>Connect</strong><a href="/for-clinicians">For clinicians</a><a href="/demo">Camera demo</a><a href="mailto:admin@pulsewindow.me">admin@pulsewindow.me</a></div>
    </div>
    <div className="footer-bottom"><span>© 2026 PulseWindow</span><span>Research prototype · Not a diagnostic device</span></div>
  </footer>;
}
