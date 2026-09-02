import { type FormEvent } from "react";
import { SiteFooter, SiteNav } from "./SiteChrome";

export function HowItWorksPage() {
  return <main>
    <SiteNav />
    <header className="page-intro"><p className="eyebrow">HOW IT WORKS</p><h1>A camera check-in built around signal quality.</h1><p>PulseWindow explores whether an ordinary phone or laptop camera can capture useful pulse and breathing trends between appointments.</p></header>
    <section className="page-content"><div className="page-grid"><article><span>01</span><h2>Position</h2><p>The patient follows a clear face guide and remains still in steady lighting. The prototype checks the camera signal before accepting a reading.</p></article><article><span>02</span><h2>Measure</h2><p>Remote photoplethysmography analyses subtle colour changes in facial skin to estimate pulse. Breathing-rate estimation remains experimental.</p></article><article><span>03</span><h2>Review</h2><p>The result can be stored with medication timing and symptoms, allowing the patient and clinician to discuss the reading in context.</p></article></div><div className="evidence-panel"><div><p className="eyebrow">CURRENT STATUS</p><h2>A research prototype, not a diagnostic device.</h2></div><p>PulseWindow must be tested against recognised reference equipment across different devices, lighting conditions and patient groups before clinical performance claims can be made.</p></div></section>
    <SiteFooter />
  </main>;
}

export function CareTeamsPage() {
  return <main>
    <SiteNav />
    <header className="page-intro"><p className="eyebrow">FOR CARE TEAMS</p><h1>Measurements with the context needed for a useful conversation.</h1><p>PulseWindow is being designed to support remote consultations and medication monitoring without replacing clinical judgement or validated equipment.</p></header>
    <section className="page-content"><div className="page-grid"><article><span>01</span><h2>Medication-aware prompts</h2><p>Measurement reminders can be connected to an agreed medication plan rather than generic notifications.</p></article><article><span>02</span><h2>Longitudinal trends</h2><p>Readings can be reviewed over time alongside dose timing, symptoms and signal-quality information.</p></article><article><span>03</span><h2>Doctor-friendly summaries</h2><p>Concise exports are intended to make remote review easier while clearly identifying experimental measurements.</p></article></div><div className="evidence-panel"><div><p className="eyebrow">COLLABORATION</p><h2>Help us validate the right clinical use case.</h2></div><p>We welcome conversations with clinicians, researchers and digital-health mentors about pilot design, privacy, regulation and responsible implementation.</p><a className="primary page-action" href="/contact">Contact the team <span>→</span></a></div></section>
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

  return <main>
    <SiteNav />
    <section className="contact-page"><div className="contact-copy"><p className="eyebrow">CONTACT PULSEWINDOW</p><h1>Start a conversation with our team.</h1><p>Interested in clinical collaboration, research, mentoring or the technology? Send us a message and we will get back to you.</p><p className="contact-email">Email us directly at <a href="mailto:admin@pulsewindow.me">admin@pulsewindow.me</a></p></div><form className="contact-form" onSubmit={sendContactMessage}><div className="contact-row"><label>Your name<input name="name" type="text" autoComplete="name" required /></label><label>Your email<input name="email" type="email" autoComplete="email" required /></label></div><label>Subject<input name="subject" type="text" defaultValue="PulseWindow website enquiry" required /></label><label>Message<textarea name="message" rows={6} required /></label><button className="primary" type="submit">Prepare email <span>→</span></button><small>This opens your email app so you can review the message before sending.</small></form></section>
    <SiteFooter />
  </main>;
}

export function NotFoundPage() {
  return <main><SiteNav /><section className="page-intro"><p className="eyebrow">PAGE NOT FOUND</p><h1>There is nothing at this address.</h1><a className="primary page-action" href="/">Return home</a></section><SiteFooter /></main>;
}
