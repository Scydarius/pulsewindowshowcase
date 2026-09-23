import { SiteFooter, SiteNav } from "./SiteChrome";

function TelehealthVisual() {
  return <div className="telehealth-visual" aria-label="Illustration of a guided PulseWindow measurement during a video consultation">
    <div className="call-bar"><span><i></i> Consultation in progress</span><small>12:08</small></div>
    <div className="call-layout">
      <div className="patient-view">
        <div className="patient-silhouette"><span></span></div>
        <div className="face-frame"><i></i><i></i><i></i></div>
        <span className="video-label">Patient camera</span>
        <div className="clinician-tile"><div className="clinician-avatar">DR</div><small>Dr Chen</small></div>
      </div>
      <aside className="measure-panel">
        <span className="measure-kicker"><i></i> Guided check</span>
        <h3>Heart rate</h3>
        <div className="hero-reading"><strong>74</strong><span>BPM</span></div>
        <div className="signal-quality"><i></i><span><b>Good signal</b><small>Patient is positioned well</small></span></div>
        <div className="progress-track"><span></span></div>
        <small>Measurement complete</small>
      </aside>
    </div>
    <div className="call-controls"><span>Mic</span><span>Camera</span><strong>End call</strong></div>
  </div>;
}

export default function Home() {
  return <main>
    <SiteNav />
    <section className="home-hero">
      <div className="hero-copy">
        <p className="eyebrow">A NEW LAYER FOR REMOTE CARE</p>
        <h1>Heart-rate measurement built into telehealth.</h1>
        <p className="lead">PulseWindow is developing a telehealth platform that uses an ordinary phone or computer camera to estimate heart rate during a guided remote consultation.</p>
        <div className="button-row"><a className="button primary" href="/how-it-works">See how it works <span>→</span></a><a className="button secondary" href="/demo">Try the camera demo</a></div>
        <p className="prototype-note"><span></span> Research prototype under active development</p>
      </div>
      <TelehealthVisual />
    </section>

    <section className="problem-strip">
      <p className="eyebrow">THE OPPORTUNITY</p>
      <div><h2>Video calls show the patient.<br />PulseWindow adds physiological context.</h2><p>Remote consultations often rely on conversation and visual observation alone. A guided camera check could give clinicians an additional heart-rate measurement without requiring the patient to own a wearable.</p></div>
    </section>

    <section className="section-shell workflow-section">
      <div className="section-heading"><p className="eyebrow">ONE CONNECTED WORKFLOW</p><h2>A measurement that fits inside the appointment.</h2><p>The clinician and patient remain connected while PulseWindow guides a short, focused check.</p></div>
      <div className="workflow-grid">
        <article><span>01</span><div className="step-icon">◉</div><h3>Join the consultation</h3><p>The patient opens the appointment on a phone or computer with a camera.</p></article>
        <article><span>02</span><div className="step-icon">⌁</div><h3>Start a guided check</h3><p>The clinician requests a measurement and the patient follows simple positioning instructions.</p></article>
        <article><span>03</span><div className="step-icon">≈</div><h3>Measure locally</h3><p>The algorithm analyses subtle facial colour changes before accepting a result.</p></article>
        <article><span>04</span><div className="step-icon">✓</div><h3>Review together</h3><p>Heart rate and signal quality are available in the consultation with relevant context.</p></article>
      </div>
    </section>

    <section className="technology-band">
      <div className="tech-copy"><p className="eyebrow">THE TECHNOLOGY</p><h2>Signal processing, made understandable.</h2><p>PulseWindow uses remote photoplethysmography, or rPPG. It tracks small colour changes in facial skin associated with blood flow, then applies mathematical signal-processing algorithms to estimate heart rate.</p><a className="text-link" href="/technology">Explore the technology <span>→</span></a></div>
      <div className="pipeline-preview" aria-label="PulseWindow measurement pipeline"><div><b>01</b><span>Camera</span></div><i>→</i><div><b>02</b><span>Face regions</span></div><i>→</i><div><b>03</b><span>RGB signal</span></div><i>→</i><div><b>04</b><span>Heart rate</span></div></div>
    </section>

    <section className="section-shell use-section">
      <div className="section-heading"><p className="eyebrow">DESIGNED AROUND CARE</p><h2>More useful than a number on its own.</h2></div>
      <div className="use-grid">
        <article><span className="feature-mark">Rx</span><h3>Medication context</h3><p>Measurements can sit alongside medication timing, changes and patient-reported symptoms.</p></article>
        <article><span className="feature-mark">↗</span><h3>Trends over time</h3><p>Repeated guided checks can help organise information for later clinical review.</p></article>
        <article><span className="feature-mark">▤</span><h3>Doctor-friendly summaries</h3><p>Clear reports are intended to support a more informed conversation, not replace clinical judgement.</p></article>
      </div>
    </section>

    <section className="status-section">
      <div><p className="eyebrow">CURRENT STATUS</p><h2>A working research engine, moving toward telehealth.</h2><p>Our current desktop engine can estimate heart rate using multiple facial regions, motion checks and signal-quality filtering. We are now preparing that newer method for browser and iPhone integration.</p></div>
      <div className="status-lists"><div><strong><i className="ready"></i>Working now</strong><ul><li>Contactless heart-rate estimation</li><li>Multi-region facial tracking</li><li>Motion and signal-quality checks</li><li>Desktop research engine</li></ul></div><div><strong><i></i>In development</strong><ul><li>Integrated telehealth calls</li><li>New browser and iPhone engine</li><li>Clinician-controlled checks</li><li>Experimental respiratory rate</li></ul></div></div>
    </section>

    <section className="final-cta"><p className="eyebrow">SEE THE IDEA IN ACTION</p><h2>Try the current browser prototype.</h2><p>The demo shows how a camera-based check could feel for a patient. It uses our earlier browser-compatible measurement method while the newer engine is prepared for integration.</p><div className="button-row centered"><a className="button primary" href="/demo">Open camera demo <span>→</span></a><a className="button secondary" href="/contact">Talk to the team</a></div></section>
    <SiteFooter />
  </main>;
}
