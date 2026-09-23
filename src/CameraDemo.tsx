import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  FINAL_MEASUREMENT_SECONDS,
  INITIAL_CALIBRATION_SECONDS,
  PulseWindowEngine,
  assessLandmarkMotion,
  meshRegions,
  sampleMeshRegions,
  type LandmarkPoint,
  type Region,
  type Sample,
} from "./rppg";

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;
const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

function overlayStyle(region: Region) {
  return {
    left: `${100 - ((region.x + region.width) / CANVAS_WIDTH) * 100}%`,
    top: `${(region.y / CANVAS_HEIGHT) * 100}%`,
    width: `${(region.width / CANVAS_WIDTH) * 100}%`,
    height: `${(region.height / CANVAS_HEIGHT) * 100}%`,
  };
}

function faceBounds(landmarks: LandmarkPoint[]): Region {
  const xs = landmarks.map((point) => point.x * CANVAS_WIDTH);
  const ys = landmarks.map((point) => point.y * CANVAS_HEIGHT);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = right - left;
  const height = bottom - top;
  return {
    x: Math.max(0, left - width * 0.08),
    y: Math.max(0, top - height * 0.08),
    width: Math.min(CANVAS_WIDTH - Math.max(0, left - width * 0.08), width * 1.16),
    height: Math.min(CANVAS_HEIGHT - Math.max(0, top - height * 0.08), height * 1.16),
  };
}

function chartSignal(values: number[]) {
  if (!values.length) return Array.from({ length: 70 }, (_, index) => 50 + Math.sin(index / 2) * 2);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centred = values.map((value) => value - average);
  const scale = Math.max(...centred.map(Math.abs), 0.01);
  return centred.map((value) => 50 - (value / scale) * 35);
}

export default function CameraDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const landmarksRef = useRef<LandmarkPoint[] | null>(null);
  const previousLandmarksRef = useRef<LandmarkPoint[] | null>(null);
  const regionSamplesRef = useRef<Sample[][]>([[], [], []]);
  const engineRef = useRef(new PulseWindowEngine());
  const lastDetectionRef = useRef(0);
  const lastEstimateRef = useRef(0);
  const lastFaceSeenRef = useRef(0);
  const lastMotionTimeRef = useRef(0);
  const motionCooldownUntilRef = useRef(0);
  const lockedSecondsRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Camera is off");
  const [breathingStatus, setBreathingStatus] = useState("Respiratory rate is experimental and appears only when the optical signal is strong enough");
  const [bpm, setBpm] = useState<number | null>(null);
  const [rr, setRr] = useState<number | null>(null);
  const [signal, setSignal] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [face, setFace] = useState<Region | null>(null);
  const [skinRegions, setSkinRegions] = useState<Region[]>([]);
  const [engineDetail, setEngineDetail] = useState("Dense face mesh · POS signal extraction · quality-controlled result");

  const resetMeasurement = useCallback(() => {
    landmarksRef.current = null;
    previousLandmarksRef.current = null;
    regionSamplesRef.current = [[], [], []];
    engineRef.current.reset();
    lastFaceSeenRef.current = 0;
    lastMotionTimeRef.current = 0;
    motionCooldownUntilRef.current = 0;
    lockedSecondsRef.current = 0;
    setFace(null);
    setSkinRegions([]);
    setBpm(null);
    setRr(null);
    setSignal([]);
    setProgress(0);
    setEngineDetail("Dense face mesh · POS signal extraction · quality-controlled result");
    setBreathingStatus("Respiratory rate is experimental and appears only when the optical signal is strong enough");
  }, []);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    resetMeasurement();
    setRunning(false);
    setStatus("Camera is off");
  }, [resetMeasurement]);

  useEffect(() => () => stop(), [stop]);

  const loadTracker = useCallback(async () => {
    if (faceLandmarkerRef.current) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }, []);

  const analyse = useCallback(function analyseFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(analyseFrame);
      return;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const nowMs = performance.now();
    const now = nowMs / 1000;

    if (nowMs - lastDetectionRef.current >= 100) {
      const previousDetectionTime = lastDetectionRef.current;
      lastDetectionRef.current = nowMs;
      const landmarks = faceLandmarkerRef.current?.detectForVideo(video, nowMs).faceLandmarks[0] as LandmarkPoint[] | undefined;
      if (landmarks?.length >= 468) {
        const motion = assessLandmarkMotion(landmarks, previousLandmarksRef.current, Math.max((nowMs - previousDetectionTime) / 1000, 1 / 30));
        if (motion.moving) motionCooldownUntilRef.current = now + 0.6;
        lastMotionTimeRef.current = motion.velocity;
        previousLandmarksRef.current = landmarks.map((point) => ({ ...point }));
        landmarksRef.current = landmarks;
        lastFaceSeenRef.current = nowMs;
        setFace(faceBounds(landmarks));
        setSkinRegions(meshRegions(landmarks, CANVAS_WIDTH, CANVAS_HEIGHT));
      } else if (nowMs - lastFaceSeenRef.current > 700) {
        landmarksRef.current = null;
        previousLandmarksRef.current = null;
        setFace(null);
        setSkinRegions([]);
      }
    }

    const landmarks = landmarksRef.current;
    if (!landmarks) {
      setStatus("Paused — face not found");
      if (lastFaceSeenRef.current > 0 && nowMs - lastFaceSeenRef.current > 3500) {
        resetMeasurement();
        setStatus("Face lost — measurement restarted");
      }
      frameRef.current = requestAnimationFrame(analyseFrame);
      return;
    }

    const sample = sampleMeshRegions(context, landmarks);
    if (!sample) {
      setStatus("Paused — facial skin regions are not clear");
      frameRef.current = requestAnimationFrame(analyseFrame);
      return;
    }
    const brightness = sample.colours.reduce((sum, rgb) => sum + (rgb[0] + rgb[1] + rgb[2]) / 3, 0) / sample.colours.length;
    if (brightness < 40 || brightness > 235) {
      setStatus(brightness < 40 ? "Paused — more light needed" : "Paused — too much light");
      frameRef.current = requestAnimationFrame(analyseFrame);
      return;
    }

    const moving = now < motionCooldownUntilRef.current;
    regionSamplesRef.current = regionSamplesRef.current.map((samples, index) => {
      const rgb = moving && samples.length ? samples.at(-1)!.rgb : sample.colours[index];
      return [...samples, { time: now, rgb }].filter((item) => now - item.time <= FINAL_MEASUREMENT_SECONDS + 1);
    });

    const first = regionSamplesRef.current[0][0];
    const duration = first ? now - first.time : 0;
    setProgress(Math.min(FINAL_MEASUREMENT_SECONDS, Math.floor(duration)));
    if (moving) setStatus("Holding result — keep your head still");

    if (now - lastEstimateRef.current >= 1) {
      lastEstimateRef.current = now;
      if (duration < INITIAL_CALIBRATION_SECONDS) {
        setStatus(`Calibrating new PulseWindow engine — ${Math.max(1, Math.ceil(INITIAL_CALIBRATION_SECONDS - duration))} seconds`);
      } else {
        const estimate = engineRef.current.estimate(regionSamplesRef.current, moving);
        if (!estimate) {
          setStatus("Building a clean multi-region signal");
        } else {
          setSignal(chartSignal(estimate.waveform));
          setEngineDetail(`POS · SNR ${estimate.snrDb >= 0 ? "+" : ""}${estimate.snrDb.toFixed(1)} dB · quality ${Math.round(estimate.quality * 100)}%`);
          if (estimate.state === "LOCKED") {
            setBpm(estimate.bpm);
            lockedSecondsRef.current += 1;
            setStatus(duration >= FINAL_MEASUREMENT_SECONDS && lockedSecondsRef.current >= 3
              ? `Measurement complete — ${Math.round(estimate.bpm)} BPM confirmed`
              : "Pulse locked — keep still for confirmation");
          } else if (estimate.state === "HOLDING") {
            setBpm(estimate.bpm);
            setStatus("Holding the last clean result while movement settles");
          } else {
            setStatus("Analysing POS signal — keep still in even light");
          }
          if (estimate.respiratoryRate !== null) {
            setRr(estimate.respiratoryRate);
            setBreathingStatus(`Experimental optical respiratory estimate · quality ${Math.round(estimate.respiratoryQuality * 100)}%`);
          } else {
            setRr(null);
            setBreathingStatus(duration < 14
              ? "Experimental respiratory estimate needs at least 14 seconds of clean optical data"
              : "Respiratory signal is not strong enough to report");
          }
        }
      }
    }
    frameRef.current = requestAnimationFrame(analyseFrame);
  }, [resetMeasurement]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser does not support camera access");
      return;
    }
    try {
      resetMeasurement();
      setStatus("Loading the new dense face-mesh tracker");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      await loadTracker();
      setRunning(true);
      setStatus("Finding anatomical skin regions");
      frameRef.current = requestAnimationFrame(analyse);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError"
        ? "Camera permission is blocked. Allow it in the address-bar camera settings, then try again"
        : name === "NotFoundError"
          ? "No available camera was found"
          : name === "NotReadableError"
            ? "The camera is already being used by another app or tab"
            : "The camera or face-mesh model could not start");
    }
  };

  const plottedSignal = signal.length ? signal : chartSignal([]);
  return <div className="camera-demo">
    <div className="camera-toolbar">
      <button type="button" className="button primary camera-start" onClick={running ? stop : start}>
        {running ? "Stop camera check" : "Start new-engine camera check"}
      </button>
      <div className="demo-status camera-status" aria-live="polite">
        <span className={running ? "status-dot active" : "status-dot"}></span>{status}
      </div>
    </div>
    <div className="measurement-progress"><span style={{ width: `${(progress / FINAL_MEASUREMENT_SECONDS) * 100}%` }}></span></div>
    <small className="progress-label">{running
      ? `${progress} of ${FINAL_MEASUREMENT_SECONDS} seconds`
      : `${INITIAL_CALIBRATION_SECONDS}-second calibration · ${FINAL_MEASUREMENT_SECONDS} seconds for confirmation`}</small>
    <div className="camera-preview">
      <video ref={videoRef} muted playsInline />
      {!face && <div className="face-guide"><span></span><small>Keep your face in view</small></div>}
      {face && <div className="tracked-face" style={overlayStyle(face)} />}
      {skinRegions.map((region, index) => <i className="tracked-skin" key={index} style={overlayStyle(region)} />)}
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden-canvas" />
    </div>
    <div className="camera-demo-stats">
      <div><small>Heart rate</small><strong>{bpm === null ? "--" : Math.round(bpm)}</strong><em>BPM</em></div>
      <div><small>Respiratory rate <span>experimental</span></small><strong>{rr === null ? "--" : Math.round(rr)}</strong><em>breaths/min</em></div>
    </div>
    <p className="engine-detail">{engineDetail}</p>
    <p className="breathing-status" aria-live="polite">{breathingStatus}</p>
    <div className="signal-chart camera-signal"><svg viewBox="0 0 560 100" role="img" aria-label="Live POS-derived camera pulse signal">
      <polyline points={plottedSignal.map((value, index) => `${index * (560 / Math.max(plottedSignal.length - 1, 1))},${value}`).join(" ")} />
    </svg></div>
    <p className="camera-note">New PulseWindow browser engine. Dense facial landmarks, anatomical skin regions, POS extraction, motion holding, SNR weighting and Kalman stabilisation run locally. Results remain experimental and are not for diagnosis.</p>
  </div>;
}
