import { type FormEvent, type ReactNode } from "react";
import CameraDemo from "../src/CameraDemo";
import { SiteFooter, SiteNav } from "./SiteChrome";

function PageHero({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <header className="page-hero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{children}</p></header>;
}

export function HowItWorksPage() {
  return <main><SiteNav />
    <PageHero eyebrow="HOW IT WORKS" title="A guided check inside the remote consultation.">PulseWindow is designed to make a camera measurement feel clear for the patient and useful for the clinician.</PageHero>
    <section className="section-shell journey">
      <article><span>01</span><div><h2>Connect</h2><p>The patient joins a secure remote consultation using a phone or computer. The normal video conversation continues until a measurement is useful.</p></div><div className="journey-card"><small>Consultation</small><strong>Patient connected</strong><i className="connected-dot"></i></div></article>
      <article><span>02</span><div><h2>Position</h2><p>The clinician starts the check. The patient follows clear guidance for camera position, lighting and movement.</p></div><div className="journey-card face-card"><div className="mini-face"></div><strong>Face positioned</strong><small>Lighting looks good</small></div></article>
      <article><span>03</span><div><h2>Measure</h2><p>PulseWindow processes the patient’s original local camera frames before video-call compression can remove useful colour information.</p></div><div className="journey-card wave-card"><span></span><span></span><span></span><span></span><span></span><small>Analysing RGB signal</small></div></article>
      <article><span>04</span><div><h2>Review</h2><p>The heart-rate estimate and signal-quality status can be discussed immediately and recorded with relevant consultation context.</p></div><div className="journey-card result-card"><small>Heart rate</small><strong>74 <em>BPM</em></strong><span>Good signal</span></div></article>
    </section>
    <section className="split-callout"><div><p className="eyebrow">FOR THE PATIENT</p><h2>Simple guidance, not technical diagnostics.</h2><p>The interface explains what to do in everyday language and asks for a repeat measurement when the signal is not good enough.</p></div><div><p className="eyebrow">FOR THE CLINICIAN</p><h2>A result with visible quality and context.</h2><p>The clinician sees whether a reading is current, held or complete and can decide how it should inform the conversation.</p></div></section>
    <SiteFooter />
  </main>;
}

export function TechnologyPage() {
  const pipeline = [
    ["01", "Camera frames", "The patient’s original video is sampled locally."],
    ["02", "Facial landmarks", "Forehead and cheek regions are tracked."],
    ["03", "Skin signal", "Suitable RGB skin pixels are collected."],
    ["04", "Noise filtering", "Movement, drift and poor signals are rejected."],
    ["05", "Pulse detection", "POS or CHROM isolates the pulse waveform."],
    ["06", "Quality check", "Only a stable estimate is presented."],
  ];
  return <main><SiteNav />
    <PageHero eyebrow="THE TECHNOLOGY" title="Small colour changes. A structured signal-processing pipeline.">PulseWindow uses remote photoplethysmography, or rPPG, to estimate heart rate from ordinary RGB camera frames.</PageHero>
    <section className="section-shell"><div className="pipeline-full" aria-label="PulseWindow rPPG processing sequence">{pipeline.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="algorithm-section"><div><p className="eyebrow">ALGORITHM, NOT A BLACK BOX</p><h2>The heart-rate calculation is mathematical signal processing.</h2><p>Machine learning assists facial landmark detection, but the pulse estimate itself is produced by explainable POS and CHROM algorithms, frequency analysis and quality rules. The system does not learn from a patient while it measures them.</p></div><div className="algorithm-card"><small>Example processing path</small><code>RGB(t) → POS/CHROM → detrend → bandpass → spectrum → BPM</code><p>Multiple regions are assessed independently so a cleaner forehead or cheek signal can receive more weight.</p></div></section>
    <section className="section-shell detail-grid"><article><span>01</span><h3>Multiple facial regions</h3><p>Forehead and cheek signals reduce reliance on one patch of skin.</p></article><article><span>02</span><h3>Movement awareness</h3><p>Measurements pause or hold rather than accepting sudden motion as a heartbeat.</p></article><article><span>03</span><h3>Signal-quality checks</h3><p>A clean, repeatable pulse peak is required before a result is accepted.</p></article><article><span>04</span><h3>Local-first design</h3><p>Processing the original camera signal locally preserves detail and supports privacy.</p></article></section>
    <section className="notice-panel"><div><p className="eyebrow">CURRENT WEB DEMO</p><h2>The newer PulseWindow engine now runs in the browser.</h2></div><p>The web prototype ports the local research pipeline's dense facial tracking, anatomical regions, skin filtering, POS extraction, motion rejection, signal-quality weighting and stabilisation.</p><a className="button secondary" href="/demo">Open the demo</a></section>
    <SiteFooter />
  </main>;
}

export function CliniciansPage() {
  return <main><SiteNav />
    <PageHero eyebrow="FOR CLINICIANS" title="More context during remote care.">PulseWindow is being designed to support clinical conversations with a guided heart-rate estimate, signal quality and relevant patient context.</PageHero>
    <section className="section-shell clinician-grid"><div className="clinician-copy"><p className="eyebrow">DURING THE CONSULTATION</p><h2>The clinician stays in control of the workflow.</h2><p>A measurement can be requested when it is relevant rather than running continuously while the patient speaks or moves.</p><ul className="check-list"><li>Request a guided camera check</li><li>See whether the signal is suitable</li><li>Review the result with the patient</li><li>Repeat the measurement when needed</li></ul></div><div className="consult-card"><div className="consult-head"><span><i></i> Patient check</span><small>Ready to review</small></div><div className="consult-result"><small>Heart rate</small><strong>74 <em>BPM</em></strong><span>Good signal · 10:42 AM</span></div><div className="consult-context"><div><small>Medication context</small><b>2 hours after scheduled dose</b></div><div><small>Patient note</small><b>“Feeling well today”</b></div></div><button type="button">Add to consultation record</button></div></section>
    <section className="context-band"><div><span>01</span><h3>Medication-aware context</h3><p>Relate a measurement to timing, dose changes and symptoms where clinically relevant.</p></div><div><span>02</span><h3>Longitudinal trends</h3><p>Organise repeated readings without presenting an isolated number as a diagnosis.</p></div><div><span>03</span><h3>Clear summaries</h3><p>Prepare concise information for review while retaining signal-quality details.</p></div></section>
    <section className="final-cta compact"><p className="eyebrow">HELP SHAPE THE WORKFLOW</p><h2>We are looking for clinical and research collaborators.</h2><p>We welcome input on appropriate use cases, patient instructions, validation and responsible implementation.</p><a className="button primary" href="/contact">Contact the team <span>→</span></a></section>
    <SiteFooter />
  </main>;
}

export function ResearchPage() {
  return <main><SiteNav />
    <PageHero eyebrow="RESEARCH & DEVELOPMENT" title="Building the evidence behind the experience.">PulseWindow is an early-stage research prototype. We are separating what works today from what still needs to be engineered and tested.</PageHero>
    <section className="section-shell research-columns"><article><div className="research-title"><i className="ready"></i><span><small>AVAILABLE IN THE RESEARCH ENGINE</small><h2>Working now</h2></span></div><ul><li>Contactless heart-rate estimation</li><li>Forehead and cheek signal extraction</li><li>POS and CHROM processing</li><li>Movement and signal-quality checks</li><li>Heart-rate stabilisation</li><li>Desktop diagnostic view</li></ul></article><article><div className="research-title"><i></i><span><small>ACTIVE DEVELOPMENT</small><h2>What comes next</h2></span></div><ul><li>New browser and iPhone implementation</li><li>Telehealth video-call workflow</li><li>Clinician-controlled measurements</li><li>Reference-device comparison</li><li>Testing across devices and environments</li><li>Experimental respiratory-rate refinement</li></ul></article></section>
    <section className="research-principles"><div><p className="eyebrow">OUR APPROACH</p><h2>Useful claims should follow the evidence.</h2></div><div className="principle-list"><p><b>01</b><span><strong>Start with heart rate</strong>Build the strongest measurement first before expanding the product.</span></p><p><b>02</b><span><strong>Show signal quality</strong>Make uncertainty visible instead of always returning a number.</span></p><p><b>03</b><span><strong>Compare properly</strong>Test against suitable reference equipment and report failures as well as successes.</span></p></div></section>
    <section className="collab-banner"><div><p className="eyebrow">COLLABORATE WITH US</p><h2>Interested in telehealth, rPPG or pilot design?</h2><p>We would value conversations with clinicians, researchers, engineers and digital-health mentors.</p></div><a className="button primary light" href="/contact">Start a conversation <span>→</span></a></section>
    <SiteFooter />
  </main>;
}

export function DemoPage() {
  return <main><SiteNav />
    <PageHero eyebrow="CAMERA PROTOTYPE" title="Try the new PulseWindow engine.">This demonstration runs a browser port of the same multi-region signal pipeline used by our newer local research program.</PageHero>
    <section className="demo-page section-shell"><div className="demo-main"><div className="demo-version"><span>New engine</span><p>Dense face mesh, anatomical skin regions, POS extraction, quality weighting and stabilisation now run locally in your browser.</p></div><CameraDemo /></div><aside className="demo-aside"><div><span>01</span><h3>Find even lighting</h3><p>Face a steady light source and avoid strong light behind you.</p></div><div><span>02</span><h3>Position your face</h3><p>Keep your whole face clearly visible in the frame.</p></div><div><span>03</span><h3>Remain still</h3><p>The engine holds the last clean result when it detects head movement.</p></div><div className="privacy-box"><strong>Local camera processing</strong><p>The demo processes camera frames in your browser. It does not upload or store your facial video.</p></div></aside></section>
    <SiteFooter />
  </main>;
}

export function ContactPage() {
  function sendContactMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const replyTo = String(form.get("email") ?? "").trim();
    const subject = String(form.get("subject") ?? "PulseWindow website enquiry").trim();
    const message = String(form.get("message") ?? "").trim();
    const body = [`Name: ${name}`, `Reply email: ${replyTo}`, "", message].join("\n");
    window.location.href = `mailto:admin@pulsewindow.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return <main><SiteNav />
    <section className="contact-page section-shell"><div className="contact-copy"><p className="eyebrow">CONTACT PULSEWINDOW</p><h1>Start a conversation with our team.</h1><p>Interested in clinical collaboration, research, mentoring or the technology? Send us a message and we will get back to you.</p><div className="direct-email"><small>EMAIL US DIRECTLY</small><a href="mailto:admin@pulsewindow.me">admin@pulsewindow.me</a></div></div><form className="contact-form" onSubmit={sendContactMessage}><div className="contact-row"><label>Your name<input name="name" type="text" autoComplete="name" required /></label><label>Your email<input name="email" type="email" autoComplete="email" required /></label></div><label>Subject<input name="subject" type="text" defaultValue="PulseWindow website enquiry" required /></label><label>Message<textarea name="message" rows={6} required /></label><button className="button primary" type="submit">Prepare email <span>→</span></button><small>This opens your email app so you can review the message before sending.</small></form></section>
    <SiteFooter />
  </main>;
}

export function NotFoundPage() {
  return <main><SiteNav /><section className="page-hero not-found"><p className="eyebrow">PAGE NOT FOUND</p><h1>There is nothing at this address.</h1><a className="button primary" href="/">Return home</a></section><SiteFooter /></main>;
}
