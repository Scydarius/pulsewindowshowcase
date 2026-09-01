import { useCallback, useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  FINAL_MEASUREMENT_SECONDS,
  INITIAL_CALIBRATION_SECONDS,
  chestRegionsFromPose,
  estimateFinalBPM,
  estimateFinalRespiratoryRate,
  estimateLiveBPM,
  faceRegions,
  median,
  motionGrid,
  sampleRegions,
  verticalMotion,
  type MotionSample,
  type Region,
  type Sample,
} from "./rppg";

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;
const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

function overlayStyle(region: Region) {
  return {
    left: `${100 - ((region.x + region.width) / CANVAS_WIDTH) * 100}%`,
    top: `${(region.y / CANVAS_HEIGHT) * 100}%`,
    width: `${(region.width / CANVAS_WIDTH) * 100}%`,
    height: `${(region.height / CANVAS_HEIGHT) * 100}%`,
  };
}

function normaliseSignal(values: number[]) {
  if (!values.length) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviations = values.map((value) => value - mean);
  const scale = Math.max(...deviations.map(Math.abs), 0.01);
  return deviations.map((value) => 50 - (value / scale) * 35);
}

export default function CameraDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const faceRef = useRef<Region | null>(null);
  const chestRef = useRef<Region[]>([]);
  const regionSamplesRef = useRef<Sample[][]>([[], [], []]);
  const recordingSamplesRef = useRef<Sample[][]>([[], [], []]);
  const motionSamplesRef = useRef<MotionSample[][]>([[], [], []]);
  const previousGridsRef = useRef<(number[] | null)[]>([null, null, null]);
  const cumulativeMotionRef = useRef([0, 0, 0]);
  const candidatesRef = useRef<number[]>([]);
  const pendingJumpRef = useRef<number[]>([]);
  const rawSignalRef = useRef<number[]>([]);
  const bpmRef = useRef<number | null>(null);
  const lastDetectionRef = useRef(0);
  const lastEstimateRef = useRef(0);
  const lastFaceSeenRef = useRef(0);
  const respiratoryCheckStartedRef = useRef<number | null>(null);
  const respiratoryCompleteRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Camera is off");
  const [breathingStatus, setBreathingStatus] = useState("A confirmed breathing estimate needs a full 60-second recording");
  const [bpm, setBpm] = useState<number | null>(null);
  const [rr, setRr] = useState<number | null>(null);
  const [signal, setSignal] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [face, setFace] = useState<Region | null>(null);
  const [chestRegions, setChestRegions] = useState<Region[]>([]);

  const resetMeasurement = useCallback(() => {
    faceRef.current = null;
    chestRef.current = [];
    regionSamplesRef.current = [[], [], []];
    recordingSamplesRef.current = [[], [], []];
    motionSamplesRef.current = [[], [], []];
    previousGridsRef.current = [null, null, null];
    cumulativeMotionRef.current = [0, 0, 0];
    candidatesRef.current = [];
    pendingJumpRef.current = [];
    rawSignalRef.current = [];
    bpmRef.current = null;
    lastFaceSeenRef.current = 0;
    respiratoryCheckStartedRef.current = null;
    respiratoryCompleteRef.current = false;
    setFace(null);
    setChestRegions([]);
    setBpm(null);
    setRr(null);
    setSignal([]);
    setProgress(0);
    setBreathingStatus("A confirmed breathing estimate needs a full 60-second recording");
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

  const loadTrackers = useCallback(async () => {
    if (faceDetectorRef.current && poseLandmarkerRef.current) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const [faceDetector, poseLandmarker] = await Promise.all([
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.45,
      }),
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    ]);
    faceDetectorRef.current = faceDetector;
    poseLandmarkerRef.current = poseLandmarker;
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

    if (nowMs - lastDetectionRef.current >= 150) {
      lastDetectionRef.current = nowMs;
      const detection = faceDetectorRef.current?.detectForVideo(video, nowMs).detections[0]?.boundingBox;
      if (detection) {
        const scaleX = CANVAS_WIDTH / (video.videoWidth || CANVAS_WIDTH);
        const scaleY = CANVAS_HEIGHT / (video.videoHeight || CANVAS_HEIGHT);
        const detected = { x: detection.originX * scaleX, y: detection.originY * scaleY, width: detection.width * scaleX, height: detection.height * scaleY };
        const previous = faceRef.current;
        const smoothing = previous ? 0.18 : 1;
        const tracked = previous ? {
          x: previous.x + (detected.x - previous.x) * smoothing,
          y: previous.y + (detected.y - previous.y) * smoothing,
          width: previous.width + (detected.width - previous.width) * smoothing,
          height: previous.height + (detected.height - previous.height) * smoothing,
        } : detected;
        faceRef.current = tracked;
        lastFaceSeenRef.current = nowMs;
        setFace(tracked);
      } else if (nowMs - lastFaceSeenRef.current > 700) {
        faceRef.current = null;
        setFace(null);
      }

      const pose = poseLandmarkerRef.current?.detectForVideo(video, nowMs).landmarks[0];
      const regions = pose ? chestRegionsFromPose(pose, CANVAS_WIDTH, CANVAS_HEIGHT) : null;
      if (regions) {
        chestRef.current = regions;
        setChestRegions(regions);
      } else {
        chestRef.current = [];
        setChestRegions([]);
        previousGridsRef.current = [null, null, null];
      }
    }

    const trackedFace = faceRef.current;
    if (!trackedFace) {
      setStatus("Paused — face not found");
      if (lastFaceSeenRef.current > 0 && nowMs - lastFaceSeenRef.current > 3000) {
        resetMeasurement();
        setStatus("Face lost — measurement restarted");
      }
      frameRef.current = requestAnimationFrame(analyseFrame);
      return;
    }

    const colours = sampleRegions(context, trackedFace);
    const brightness = colours.reduce((sum, rgb) => sum + (rgb[0] + rgb[1] + rgb[2]) / 3, 0) / colours.length;
    if (brightness < 40 || brightness > 235) {
      setStatus(brightness < 40 ? "Paused — more light needed" : "Paused — too much light");
      frameRef.current = requestAnimationFrame(analyseFrame);
      return;
    }

    regionSamplesRef.current = regionSamplesRef.current.map((samples, index) => [...samples, { time: now, rgb: colours[index] }].filter((sample) => now - sample.time <= 20.5));
    recordingSamplesRef.current = recordingSamplesRef.current.map((samples, index) => [...samples, { time: now, rgb: colours[index] }].filter((sample) => now - sample.time <= 60.5));
    const greens = recordingSamplesRef.current.map((samples) => samples.at(-1)?.rgb[1] ?? 0);
    const combinedGreen = median(greens);
    rawSignalRef.current = [...rawSignalRef.current, combinedGreen].slice(-70);
    setSignal(normaliseSignal(rawSignalRef.current));

    if (chestRef.current.length === 3) {
      chestRef.current.map((region) => motionGrid(context, region)).forEach((grid, index) => {
        const previous = previousGridsRef.current[index];
        const motion = previous ? verticalMotion(previous, grid) : null;
        if (motion !== null) {
          cumulativeMotionRef.current[index] += motion;
          motionSamplesRef.current[index].push({ time: now, value: cumulativeMotionRef.current[index] });
          motionSamplesRef.current[index] = motionSamplesRef.current[index].filter((sample) => now - sample.time <= 60.5);
        }
        previousGridsRef.current[index] = grid;
      });
      if (!respiratoryCompleteRef.current) setBreathingStatus("Tracking chest movement — keep your shoulders visible and stay still");
    } else if (!respiratoryCompleteRef.current) {
      setBreathingStatus("Move farther back so both shoulders and your upper chest are visible");
    }

    const first = recordingSamplesRef.current[0][0];
    const duration = first ? now - first.time : 0;
    setProgress(Math.min(FINAL_MEASUREMENT_SECONDS, Math.floor(duration)));
    if (now - lastEstimateRef.current >= 1) {
      lastEstimateRef.current = now;
      if (duration < INITIAL_CALIBRATION_SECONDS - 0.5) {
        setStatus(`Calibrating — ${Math.max(1, Math.ceil(INITIAL_CALIBRATION_SECONDS - duration))} seconds`);
      } else if (duration >= FINAL_MEASUREMENT_SECONDS - 0.5) {
        const finalPulse = estimateFinalBPM(recordingSamplesRef.current);
        if (finalPulse) {
          bpmRef.current = finalPulse.bpm;
          setBpm(finalPulse.bpm);
          setStatus("Pulse confirmed from the full recording");
        } else setStatus("60 seconds recorded — unable to confirm a stable pulse");

        if (!respiratoryCompleteRef.current) {
          respiratoryCheckStartedRef.current ??= now;
          const breathing = estimateFinalRespiratoryRate(motionSamplesRef.current);
          if (breathing) {
            respiratoryCompleteRef.current = true;
            setRr(breathing.rate);
            setBreathingStatus("Breathing rate confirmed from agreeing chest regions");
          } else if (now - respiratoryCheckStartedRef.current >= 12) {
            respiratoryCompleteRef.current = true;
            setRr(null);
            setBreathingStatus("Unable to confirm breathing rate from this recording");
          } else setBreathingStatus("Pulse complete — keep still while breathing rate is confirmed");
        }
      } else {
        const estimate = estimateLiveBPM(regionSamplesRef.current);
        if (!estimate) setStatus("Signal weak — keep your face steady in even lighting");
        else {
          candidatesRef.current = [...candidatesRef.current, estimate.bpm].slice(-7);
          const recent = candidatesRef.current.slice(-5);
          if (recent.length < 5 || Math.max(...recent) - Math.min(...recent) > 6) setStatus("Confirming pulse — keep still");
          else {
            let stable = median(recent);
            const current = bpmRef.current;
            if (current !== null && Math.abs(stable - current) > 10) {
              pendingJumpRef.current = [...pendingJumpRef.current, stable].slice(-6);
              const pending = pendingJumpRef.current;
              if (pending.length < 6 || Math.max(...pending) - Math.min(...pending) > 6) {
                setStatus("Checking a possible change");
                frameRef.current = requestAnimationFrame(analyseFrame);
                return;
              }
              stable = median(pending);
            } else pendingJumpRef.current = [];
            const displayed = current === null ? stable : 0.85 * current + 0.15 * stable;
            bpmRef.current = displayed;
            setBpm(displayed);
            setStatus("Pulse found — keep still for the final result");
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
      setStatus("Loading the original face and shoulder trackers");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      await loadTrackers();
      setRunning(true);
      setStatus("Finding your face");
      frameRef.current = requestAnimationFrame(analyse);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError" ? "Camera permission is blocked. Allow it in the address-bar camera settings, then try again" : name === "NotFoundError" ? "No available camera was found" : name === "NotReadableError" ? "The camera is already being used by another app or tab" : "The camera or tracking models could not start");
    }
  };

  const chartSignal = signal.length ? signal : Array.from({ length: 70 }, (_, index) => 50 + Math.sin(index / 2) * 2);
  return <div className="camera-demo">
    <button type="button" className="primary camera-start" onClick={running ? stop : start}>{running ? "Stop camera check" : "Start 60-second camera check"}</button>
    <div className="demo-status camera-status" aria-live="polite"><span className={running ? "status-dot active" : "status-dot"}></span>{status}</div>
    <div className="measurement-progress"><span style={{ width: `${(progress / FINAL_MEASUREMENT_SECONDS) * 100}%` }}></span></div>
    <small className="progress-label">{running ? `${progress} of ${FINAL_MEASUREMENT_SECONDS} seconds` : "15-second calibration · 60 seconds for a confirmed result"}</small>
    <div className="camera-preview">
      <video ref={videoRef} muted playsInline />
      {!face && <div className="face-guide"><span></span><small>Keep your face and shoulders in view</small></div>}
      {face && <div className="tracked-face" style={overlayStyle(face)} />}
      {face && faceRegions(face).map((region, index) => <i className="tracked-skin" key={index} style={overlayStyle(region)} />)}
      {chestRegions.map((region, index) => <div className="tracked-chest" key={index} style={overlayStyle(region)} />)}
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden-canvas" />
    </div>
    <div className="camera-demo-stats"><div><small>Pulse</small><strong>{bpm === null ? "--" : Math.round(bpm)}</strong><em>BPM</em></div><div><small>Breathing</small><strong>{rr === null ? "--" : Math.round(rr)}</strong><em>breaths/min</em></div></div>
    <p className="breathing-status" aria-live="polite">{breathingStatus}</p>
    <div className="signal-chart camera-signal"><svg viewBox="0 0 560 100" role="img" aria-label="Live green-channel camera signal"><polyline points={chartSignal.map((value, index) => `${index * (560 / Math.max(chartSignal.length - 1, 1))},${value}`).join(" ")} /></svg></div>
    <p className="camera-note">Original multi-region PulseWindow processing. Your video stays in this browser. Results remain experimental and are not for diagnosis.</p>
  </div>;
}
