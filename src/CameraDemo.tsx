import { useCallback, useEffect, useRef, useState } from "react";

type LiveTelemetry = { bpm: number | null; respiratoryRate: number | null; quality: number; snr: number | null; latency: number | null; state: string; waveform: number[] };
const initialTelemetry: LiveTelemetry = { bpm: null, respiratoryRate: null, quality: 0, snr: null, latency: null, state: "READY", waveform: [] };
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const MAX_DIAGNOSTIC_SAMPLES = 100;

function chartSignal(values: number[]) {
  if (values.length < 2) return Array.from({ length: 70 }, (_, index) => 50 + Math.sin(index / 2) * 2);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const scale = Math.max(...values.map((value) => Math.abs(value - average)), .001);
  return values.map((value) => 50 - ((value - average) / scale) * 35);
}

export default function CameraDemo() {
  const videoRef = useRef<HTMLVideoElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const streamRef = useRef<MediaStream | null>(null); const socketRef = useRef<WebSocket | null>(null); const intervalRef = useRef<number | null>(null); const busyRef = useRef(false);
  const [running, setRunning] = useState(false); const [status, setStatus] = useState("Camera is off"); const [telemetry, setTelemetry] = useState<LiveTelemetry>(initialTelemetry); const [sampleCount, setSampleCount] = useState(0);
  const stop = useCallback(() => { if (intervalRef.current !== null) window.clearInterval(intervalRef.current); intervalRef.current = null; socketRef.current?.close(); socketRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; setRunning(false); setStatus("Camera is off"); }, []);
  useEffect(() => () => stop(), [stop]);
  const sendFrame = useCallback(() => { const video = videoRef.current; const canvas = canvasRef.current; const socket = socketRef.current; if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN || busyRef.current || video.readyState < 2) return; canvas.width = FRAME_WIDTH; canvas.height = FRAME_HEIGHT; canvas.getContext("2d")?.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT); busyRef.current = true; canvas.toBlob((blob) => { busyRef.current = false; if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob); }, "image/jpeg", .78); }, []);
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("This browser does not support camera access"); return; }
    try {
      setStatus("Requesting camera access and secure live session…"); setTelemetry(initialTelemetry); setSampleCount(0);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream; if (!videoRef.current) throw new Error("Camera preview is unavailable."); videoRef.current.srcObject = stream; await videoRef.current.play();
      const response = await fetch("/api/rppg-ticket", { method: "POST" }); const ticket = await response.json().catch(() => ({ error: "The live signal service did not respond." })) as { websocketUrl?: string; error?: string };
      if (!response.ok || !ticket.websocketUrl) throw new Error(ticket.error ?? "Could not open the live signal service.");
      const socket = new WebSocket(ticket.websocketUrl); socketRef.current = socket;
      socket.addEventListener("message", (event) => {
        let data: Record<string, unknown>; try { data = JSON.parse(event.data) as Record<string, unknown>; } catch { return; }
        if (data.type === "error") { setStatus(String(data.message ?? "The live signal service could not start.")); stop(); return; }
        if (data.type === "ready") { setRunning(true); setStatus("FUSION engine connected — sit comfortably and face the camera"); intervalRef.current = window.setInterval(sendFrame, 1000 / 15); return; }
        if (data.type !== "telemetry") return;
        const cardiac = (data.cardiac ?? {}) as Record<string, unknown>; const respiration = (data.respiration ?? {}) as Record<string, unknown>; const bpm = Number(cardiac.bpm); const respiratoryRate = Number(respiration.brpm); const waveform = Array.isArray(cardiac.waveform) ? cardiac.waveform.map(Number).filter(Number.isFinite).slice(-MAX_DIAGNOSTIC_SAMPLES) : []; const snr = Number(data.snr_db); const latency = Number(data.processing_latency_ms);
        setTelemetry({ bpm: Number.isFinite(bpm) ? bpm : null, respiratoryRate: Number.isFinite(respiratoryRate) ? respiratoryRate : null, quality: Number(data.quality_score ?? 0), snr: Number.isFinite(snr) ? snr : null, latency: Number.isFinite(latency) ? latency : null, state: String(data.tracking_state ?? "ANALYSING"), waveform });
        if (Number.isFinite(bpm)) setSampleCount((count) => Math.min(MAX_DIAGNOSTIC_SAMPLES, count + 1));
      });
      socket.addEventListener("error", () => { setStatus("The live signal connection could not be opened."); stop(); });
    } catch (error) { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; const name = error instanceof DOMException ? error.name : ""; setStatus(name === "NotAllowedError" ? "Camera permission is blocked. Allow it in the address bar, then try again." : error instanceof Error ? error.message : "The camera could not start."); }
  };
  const plottedSignal = chartSignal(telemetry.waveform);
  return <div className="camera-demo">
    <div className="camera-toolbar">
      <button type="button" className="button primary camera-start" onClick={running ? stop : () => void start()}>{running ? "Stop camera check" : "Start live camera check"}</button>
      <div className="demo-status camera-status" aria-live="polite"><span className={running ? "status-dot active" : "status-dot"}></span>{status}</div>
    </div>
    <div className="measurement-progress"><span style={{ width: `${Math.max(0, Math.min(100, telemetry.quality * 100))}%` }}></span></div>
    <small className="progress-label">FUSION rPPG engine · live processing at 15 frames per second · {sampleCount}/{MAX_DIAGNOSTIC_SAMPLES} pulse samples</small>
    <div className="camera-preview"><video ref={videoRef} muted playsInline />{!running && <div className="face-guide"><span></span><small>Keep your face in view</small></div>}<canvas ref={canvasRef} className="hidden-canvas" /></div>
    <div className="camera-demo-stats">
      <div><small>Heart rate</small><strong>{telemetry.bpm === null ? "--" : Math.round(telemetry.bpm)}</strong><em>BPM</em></div>
      <div><small>Respiratory rate</small><strong>{telemetry.respiratoryRate === null ? "--" : Math.round(telemetry.respiratoryRate)}</strong><em>breaths/min</em></div>
    </div>
    <p className="engine-detail">FUSION · {telemetry.state} · SNR {telemetry.snr === null ? "—" : `${telemetry.snr >= 0 ? "+" : ""}${telemetry.snr.toFixed(1)} dB`} · signal quality {Math.round(Math.max(0, telemetry.quality) * 100)}% · latency {telemetry.latency === null ? "—" : `${Math.round(telemetry.latency)} ms`}</p>
    <p className="breathing-status" aria-live="polite">Live waveform and telemetry are generated by the PulseWindow signal engine.</p>
    <div className="signal-chart camera-signal"><svg viewBox="0 0 560 100" role="img" aria-label="Live FUSION photoplethysmogram waveform"><polyline points={plottedSignal.map((value, index) => `${index * (560 / Math.max(plottedSignal.length - 1, 1))},${value}`).join(" ")} /></svg></div>
    <p className="camera-note">This showcase sends temporary camera frames through a short-lived, secure session. No permanent API key is exposed in your browser. This is not a diagnostic device.</p>
  </div>;
}
