"use client";

import { useEffect, useRef, useState } from "react";

function estimateRate(values: number[], sampleHz: number, minRate: number, maxRate: number) {
  if (values.length < sampleHz * 6) return null;
  const recent = values.slice(-Math.min(values.length, sampleHz * 20));
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const centred = recent.map((value) => value - mean);
  let bestRate = 0;
  let bestScore = -Infinity;
  for (let rate = minRate; rate <= maxRate; rate += 1) {
    const lag = Math.round((sampleHz * 60) / rate);
    if (lag >= centred.length - 2) continue;
    let score = 0;
    let energy = 0;
    for (let index = lag; index < centred.length; index += 1) {
      score += centred[index] * centred[index - lag];
      energy += centred[index] ** 2;
    }
    const normalised = score / Math.max(energy, 1e-9);
    if (normalised > bestScore) { bestScore = normalised; bestRate = rate; }
  }
  return bestScore > 0.08 ? bestRate : null;
}

function CameraDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Camera is off");
  const [bpm, setBpm] = useState<number | null>(null);
  const [rr, setRr] = useState<number | null>(null);
  const [signal, setSignal] = useState<number[]>([]);
  const stop = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; samplesRef.current = []; setRunning(false); setBpm(null); setRr(null); setSignal([]); setStatus("Camera is off");
  };
  useEffect(() => () => stop(), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream; await videoRef.current.play(); setRunning(true); setStatus("Look at the camera and keep still");
      const canvas = canvasRef.current; const video = videoRef.current; const context = canvas?.getContext("2d", { willReadFrequently: true });
      const sample = () => {
        if (!canvas || !context || video.readyState < 2) { frameRef.current = requestAnimationFrame(sample); return; }
        canvas.width = 160; canvas.height = 120; context.drawImage(video, 0, 0, 160, 120);
        const image = context.getImageData(40, 18, 80, 72).data; let green = 0; let count = 0;
        for (let index = 0; index < image.length; index += 16) { green += image[index + 1]; count += 1; }
        const values = samplesRef.current; values.push(green / Math.max(count, 1)); if (values.length > 700) values.shift();
        if (values.length % 5 === 0) { setBpm(estimateRate(values, 10, 45, 180)); setRr(estimateRate(values, 10, 8, 30)); setSignal(values.slice(-70)); }
        frameRef.current = window.setTimeout(() => { frameRef.current = requestAnimationFrame(sample); }, 100) as unknown as number;
      };
      sample();
    } catch { setStatus("Camera access was not allowed"); }
  };
  return <div className="camera-demo"><div className="camera-preview"><video ref={videoRef} muted playsInline /><div className="face-guide"><span></span><small>Keep your face here</small></div><canvas ref={canvasRef} className="hidden-canvas" /></div><div className="camera-demo-stats"><div><small>Pulse</small><strong>{bpm ?? "--"}</strong><em>BPM</em></div><div><small>Breathing</small><strong>{rr ?? "--"}</strong><em>breaths/min</em></div></div><div className="signal-chart camera-signal"><svg viewBox="0 0 560 100" role="img" aria-label="Live green-channel camera signal"><polyline points={(signal.length ? signal : Array.from({ length: 70 }, (_, index) => 45 + Math.sin(index / 2) * 3)).map((value, index, values) => `${index * (560 / Math.max(values.length - 1, 1))},${value}`).join(" ")} /></svg></div><div className="demo-status"><span className={running ? "status-dot active" : "status-dot"}></span>{status}{running && samplesRef.current.length < 60 ? " · calibrating" : ""}</div><button className="primary" onClick={running ? stop : start}>{running ? "Stop camera check" : "Start camera check"}</button><p className="camera-note">Your video stays in this browser. Results are experimental and not for diagnosis.</p></div>;
}

export default function Home() {
  const [demoOpen, setDemoOpen] = useState(false);
  return <main>
    <nav className="nav"><div className="brand"><span className="brand-icon">♥</span><span>PulseWindow</span></div><a href="#how">How it works</a><a href="#care">For care teams</a><button className="nav-cta" onClick={() => setDemoOpen(true)}>See the concept</button></nav>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">REMOTE HEALTH SUPPORT</p><h1>A clearer window into how a patient is doing.</h1><p className="lead">PulseWindow is a research prototype that helps patients capture pulse and breathing-rate trends from a phone or laptop camera, ready to discuss during a remote consultation.</p><div className="hero-actions"><button className="primary" onClick={() => setDemoOpen(true)}>Explore the prototype <span>→</span></button><a className="text-link" href="#how">Learn how it works <span>↓</span></a></div><p className="note">Wellness prototype only. It does not diagnose, prescribe, or replace clinical equipment.</p></div><div className="hero-card"><div className="card-top"><span className="live-dot"></span><span>Illustrative patient check-in</span><span className="lock">⌁ Private by design</span></div><div className="reading"><div><small>Latest pulse</small><strong>74 <em>BPM</em></strong><span className="trend">↗ Steady over this check-in</span></div><div className="pulse-ring"><span>♥</span></div></div><div className="mini-chart"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div className="card-foot"><span>Camera signal: acceptable</span><span>08:42 AM</span></div></div></section>
    <section className="trust"><p>Designed for the moments between appointments</p><div><span>Patient-friendly</span><span>Medication-aware</span><span>Doctor-ready summaries</span></div></section>
    <section id="how" className="section"><div className="section-heading"><p className="eyebrow">THE IDEA</p><h2>From a quick check-in to a useful conversation.</h2><p>PulseWindow turns small colour changes and gentle movement into a simple trend that a patient can share with their healthcare team.</p></div><div className="steps"><article><b>01</b><h3>Look at the camera</h3><p>The app guides the patient into a steady position and checks signal quality before recording.</p></article><article><b>02</b><h3>Capture a short reading</h3><p>Remote photoplethysmography, or rPPG, estimates pulse from subtle changes in reflected facial light.</p></article><article><b>03</b><h3>Share the context</h3><p>Medication timing, symptoms, and trends can be reviewed together during a telehealth appointment.</p></article></div></section>
    <section id="care" className="care-section"><div><p className="eyebrow">BUILT AROUND CARE</p><h2>Useful context, not another number.</h2><p>Patients can see when a check is due, record how they feel, and keep their information organised. Clinicians can receive a concise timeline instead of disconnected readings.</p><button className="secondary" onClick={() => setDemoOpen(true)}>View the care-team concept <span>→</span></button></div><div className="care-list"><div><span>01</span><strong>Medication-aware check-ins</strong><p>Prompts can be set by a clinician around an existing care plan.</p></div><div><span>02</span><strong>Simple trend history</strong><p>Pulse and experimental breathing-rate estimates sit beside the date and context.</p></div><div><span>03</span><strong>Exportable summaries</strong><p>A readable report can support, never replace, professional judgement.</p></div></div></section>
    <section className="closing"><p className="eyebrow">A RESEARCH-LED CONCEPT</p><h2>Better remote conversations start with better context.</h2><p>PulseWindow is being developed with pharmacists, patients, and healthcare collaborators to explore what a calm, accessible check-in could look like.</p><button className="primary" onClick={() => setDemoOpen(true)}>See the concept <span>→</span></button></section>
    <footer><div className="brand"><span className="brand-icon">♥</span><span>PulseWindow</span></div><span>Remote monitoring concept · Built for discussion</span><span>© 2026 PulseWindow</span></footer>
    {demoOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="PulseWindow camera prototype"><div className="modal demo-modal"><button className="close" onClick={() => setDemoOpen(false)} aria-label="Close">×</button><p className="eyebrow">CAMERA PROTOTYPE</p><h2>Try a live check-in.</h2><p>Allow camera access to see the prototype read a green-channel signal locally in your browser.</p><CameraDemo /><button className="modal-back" onClick={() => setDemoOpen(false)}>Back to overview</button></div></div>}
  </main>;
}
