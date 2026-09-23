export type RGB = [number, number, number];
export type Sample = { time: number; rgb: RGB };
export type Region = { x: number; y: number; width: number; height: number };
export type LandmarkPoint = { x: number; y: number; z?: number; visibility?: number };

export type PulseWindowEstimate = {
  bpm: number;
  confidenceInterval: number;
  snrDb: number;
  quality: number;
  state: "CALIBRATING" | "LOCKED" | "HOLDING";
  waveform: number[];
  roiWeights: number[];
  respiratoryRate: number | null;
  respiratoryQuality: number;
};

export const INITIAL_CALIBRATION_SECONDS = 5;
export const FINAL_MEASUREMENT_SECONDS = 20;
export const ANALYSIS_WINDOW_SECONDS = 8;

const FPS = 30;
const MIN_BPM = 48;
const MAX_BPM = 150;
const STEP_BPM = 0.25;
const ROI_NAMES = ["Forehead", "Left cheek", "Right cheek"] as const;
const ROI_LANDMARKS = [
  [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109],
  [116, 123, 147, 213, 192, 138, 214, 120, 119, 118],
  [345, 352, 376, 433, 416, 367, 434, 349, 348, 347],
] as const;
const MOTION_LANDMARKS = [1, 168, 33, 133, 263, 362] as const;

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function normalise(values: number[]) {
  const average = mean(values);
  const scale = standardDeviation(values);
  return values.map((value) => (value - average) / Math.max(scale, 1e-9));
}

function linearDetrend(values: number[]) {
  if (values.length < 3) return values.map((value) => value - mean(values));
  const centre = (values.length - 1) / 2;
  const average = mean(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    const offset = index - centre;
    numerator += offset * (value - average);
    denominator += offset * offset;
  });
  const slope = numerator / Math.max(denominator, 1e-9);
  return values.map((value, index) => value - average - slope * (index - centre));
}

function lowPass(values: number[], cutoffHz: number) {
  if (!values.length) return [];
  const dt = 1 / FPS;
  const alpha = dt / (1 / (2 * Math.PI * cutoffHz) + dt);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push(output[index - 1] + alpha * (values[index] - output[index - 1]));
  }
  return output;
}

function highPass(values: number[], cutoffHz: number) {
  if (!values.length) return [];
  const dt = 1 / FPS;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  const output = [0];
  for (let index = 1; index < values.length; index += 1) {
    output.push(alpha * (output[index - 1] + values[index] - values[index - 1]));
  }
  return output;
}

function zeroPhase(values: number[], filter: (input: number[]) => number[]) {
  return filter(filter(values).reverse()).reverse();
}

function bandpass(values: number[], lowHz: number, highHz: number, passes = 2) {
  let output = linearDetrend(values);
  for (let pass = 0; pass < passes; pass += 1) output = zeroPhase(output, (data) => highPass(data, lowHz));
  for (let pass = 0; pass < passes; pass += 1) output = zeroPhase(output, (data) => lowPass(data, highHz));
  return output;
}

function interpolateSamples(samples: Sample[], seconds: number) {
  if (samples.length < 2) return [] as RGB[];
  const end = samples.at(-1)!.time;
  const start = Math.max(samples[0].time, end - seconds);
  const count = Math.floor((end - start) * FPS);
  const output: RGB[] = [];
  let source = Math.max(0, samples.findIndex((sample) => sample.time >= start) - 1);
  for (let index = 0; index < count; index += 1) {
    const time = start + index / FPS;
    while (source + 1 < samples.length && samples[source + 1].time < time) source += 1;
    if (source + 1 >= samples.length) break;
    const a = samples[source];
    const b = samples[source + 1];
    const fraction = (time - a.time) / Math.max(b.time - a.time, 1e-6);
    output.push([
      a.rgb[0] + (b.rgb[0] - a.rgb[0]) * fraction,
      a.rgb[1] + (b.rgb[1] - a.rgb[1]) * fraction,
      a.rgb[2] + (b.rgb[2] - a.rgb[2]) * fraction,
    ]);
  }
  return output;
}

/** Plane-Orthogonal-to-Skin projection used by the local PulseWindow engine. */
function extractPOS(colours: RGB[]) {
  if (colours.length < 2) return [];
  const channelMeans = [0, 1, 2].map((channel) => mean(colours.map((colour) => colour[channel])));
  const s1: number[] = [];
  const s2: number[] = [];
  colours.forEach((colour) => {
    const red = colour[0] / Math.max(channelMeans[0], 1e-9);
    const green = colour[1] / Math.max(channelMeans[1], 1e-9);
    const blue = colour[2] / Math.max(channelMeans[2], 1e-9);
    s1.push(green - blue);
    s2.push(-2 * red + green + blue);
  });
  const alpha = standardDeviation(s1) / Math.max(standardDeviation(s2), 1e-9);
  const projected = s1.map((value, index) => value + alpha * s2[index]);
  const average = mean(projected);
  return projected.map((value) => value - average);
}

type SpectrumPoint = { bpm: number; power: number };

function periodogram(signal: number[], lowBpm = MIN_BPM, highBpm = MAX_BPM, stepBpm = STEP_BPM) {
  const centred = linearDetrend(signal);
  const powers: SpectrumPoint[] = [];
  for (let bpm = lowBpm; bpm <= highBpm + 1e-6; bpm += stepBpm) {
    const frequency = bpm / 60;
    let real = 0;
    let imaginary = 0;
    centred.forEach((value, index) => {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, centred.length - 1));
      const angle = (2 * Math.PI * frequency * index) / FPS;
      real += value * window * Math.cos(angle);
      imaginary -= value * window * Math.sin(angle);
    });
    powers.push({ bpm, power: real * real + imaginary * imaginary });
  }
  return powers;
}

function refinedPeak(points: SpectrumPoint[], index: number) {
  if (index <= 0 || index >= points.length - 1) return points[index].bpm;
  const y1 = Math.log(Math.max(points[index - 1].power, 1e-12));
  const y2 = Math.log(Math.max(points[index].power, 1e-12));
  const y3 = Math.log(Math.max(points[index + 1].power, 1e-12));
  const denominator = y1 - 2 * y2 + y3;
  const delta = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (y1 - y3) / denominator, -0.5, 0.5) : 0;
  return points[index].bpm + delta * (points[1]?.bpm - points[0]?.bpm || STEP_BPM);
}

function calculateSnr(points: SpectrumPoint[], pulseBpm: number) {
  const total = points.reduce((sum, point) => sum + point.power, 0);
  const signal = points
    .filter((point) => Math.abs(point.bpm - pulseBpm) <= 9 || Math.abs(point.bpm - pulseBpm * 2) <= 9)
    .reduce((sum, point) => sum + point.power, 0);
  return clamp(10 * Math.log10(Math.max(signal, 1e-12) / Math.max(total - signal, 1e-12)), -20, 30);
}

function spectralEntropy(points: SpectrumPoint[]) {
  const total = points.reduce((sum, point) => sum + point.power, 0);
  if (total <= 1e-12) return 1;
  const probabilities = points.map((point) => point.power / total).filter((value) => value > 0);
  return -probabilities.reduce((sum, value) => sum + value * Math.log2(value), 0) / Math.log2(Math.max(points.length, 2));
}

function autocorrelationBpm(signal: number[]) {
  const centred = linearDetrend(signal);
  const energy = centred.reduce((sum, value) => sum + value * value, 0);
  let bestLag = 0;
  let best = -Infinity;
  for (let lag = Math.floor(FPS / (MAX_BPM / 60)); lag <= Math.ceil(FPS / (MIN_BPM / 60)); lag += 1) {
    let correlation = 0;
    for (let index = lag; index < centred.length; index += 1) correlation += centred[index] * centred[index - lag];
    correlation /= Math.max(energy, 1e-9);
    if (correlation > best) { best = correlation; bestLag = lag; }
  }
  return bestLag > 0 && best >= 0.2 ? (FPS / bestLag) * 60 : null;
}

function analyseSpectrum(signal: number[]) {
  const points = periodogram(signal);
  let peakIndex = points.reduce((best, point, index) => point.power > points[best].power ? index : best, 0);
  if (points[peakIndex].bpm / 2 >= MIN_BPM) {
    const halfIndex = points.reduce((best, point, index) =>
      Math.abs(point.bpm - points[peakIndex].bpm / 2) < Math.abs(points[best].bpm - points[peakIndex].bpm / 2) ? index : best, 0);
    if (points[halfIndex].power >= points[peakIndex].power * 0.25) peakIndex = halfIndex;
  }
  const bpm = refinedPeak(points, peakIndex);
  const snrDb = calculateSnr(points, bpm);
  const entropy = spectralEntropy(points);
  const autocorr = autocorrelationBpm(signal);
  const periodicity = autocorr !== null && Math.abs(autocorr - bpm) > 15 ? 0.75 : 1;
  const quality = clamp((1 / (1 + Math.exp(-0.4 * snrDb))) * (0.4 + 0.6 * (1 - entropy)) * periodicity, 0, 1);
  return { bpm, snrDb, quality, points };
}

function respirationFromPulse(rawPulse: number[]) {
  if (rawPulse.length < FPS * 14) return { rate: null, quality: 0 };
  const filtered = bandpass(rawPulse, 0.12, 0.45, 1);
  const points = periodogram(filtered, 7.2, 27, 0.25);
  const peakIndex = points.reduce((best, point, index) => point.power > points[best].power ? index : best, 0);
  const rate = refinedPeak(points, peakIndex);
  const total = points.reduce((sum, point) => sum + point.power, 0);
  const local = points.filter((point) => Math.abs(point.bpm - rate) <= 1.5).reduce((sum, point) => sum + point.power, 0);
  const snrDb = 10 * Math.log10(Math.max(local, 1e-12) / Math.max(total - local, 1e-12));
  const quality = clamp(1 / (1 + Math.exp(-0.45 * (snrDb - 1.5))), 0, 1);
  return snrDb >= 1.5 ? { rate, quality } : { rate: null, quality };
}

export class PulseWindowEngine {
  private lockedBpm: number | null = null;
  private kalmanFrequency = 72 / 60;
  private kalmanVariance = 0.04;
  private kalmanInitialised = false;
  private overrideCandidate: number | null = null;
  private overrideCount = 0;
  private roiWeights = [0.5, 0.25, 0.25];
  private lastGood: PulseWindowEstimate | null = null;

  reset() {
    this.lockedBpm = null;
    this.kalmanFrequency = 72 / 60;
    this.kalmanVariance = 0.04;
    this.kalmanInitialised = false;
    this.overrideCandidate = null;
    this.overrideCount = 0;
    this.roiWeights = [0.5, 0.25, 0.25];
    this.lastGood = null;
  }

  estimate(regionSamples: Sample[][], motionDetected: boolean): PulseWindowEstimate | null {
    if (regionSamples.length !== 3 || regionSamples.some((samples) => samples.length < FPS * 3)) return null;
    const availableSeconds = Math.min(...regionSamples.map((samples) => samples.at(-1)!.time - samples[0].time));
    if (availableSeconds < 3.2) return null;
    const colours = regionSamples.map((samples) => interpolateSamples(samples, Math.min(ANALYSIS_WINDOW_SECONDS, availableSeconds)));
    const count = Math.min(...colours.map((samples) => samples.length));
    if (count < FPS * 3) return null;

    const raw = colours.map((values) => extractPOS(values.slice(-count)));
    const filtered = raw.map((signal) => bandpass(signal, 0.8, 2.5));
    const regionSpectra = filtered.map(analyseSpectrum);
    const rawWeights = regionSpectra.map((result) => Math.max(0.05, result.snrDb + 5) ** 2);
    const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
    const targets = rawWeights.map((value) => value / Math.max(weightTotal, 1e-9));
    this.roiWeights = this.roiWeights.map((weight, index) => 0.85 * weight + 0.15 * targets[index]);
    const smoothedTotal = this.roiWeights.reduce((sum, value) => sum + value, 0);
    this.roiWeights = this.roiWeights.map((value) => value / smoothedTotal);

    const normalised = filtered.map(normalise);
    const fused = Array.from({ length: count }, (_, index) =>
      normalised.reduce((sum, signal, regionIndex) => sum + this.roiWeights[regionIndex] * signal[index], 0));
    const spectrum = analyseSpectrum(fused);
    let candidateBpm = spectrum.bpm;

    if (this.lockedBpm !== null && Math.abs(candidateBpm - this.lockedBpm) > 15) {
      const locked = spectrum.points.reduce((best, point) =>
        Math.abs(point.bpm - this.lockedBpm!) < Math.abs(best.bpm - this.lockedBpm!) ? point : best);
      const candidate = spectrum.points.reduce((best, point) =>
        Math.abs(point.bpm - candidateBpm) < Math.abs(best.bpm - candidateBpm) ? point : best);
      if (locked.power >= candidate.power * 0.35) {
        candidateBpm = this.lockedBpm;
        this.overrideCount = 0;
      } else {
        if (this.overrideCandidate !== null && Math.abs(this.overrideCandidate - candidateBpm) <= 4) this.overrideCount += 1;
        else { this.overrideCandidate = candidateBpm; this.overrideCount = 1; }
        if (this.overrideCount < 3) candidateBpm = this.lockedBpm;
      }
    } else {
      this.overrideCandidate = null;
      this.overrideCount = 0;
    }

    const valid = spectrum.snrDb >= -2 && spectrum.quality >= 0.25;
    if (!motionDetected && valid) this.lockedBpm = candidateBpm;
    this.kalmanVariance = Math.min(0.2, this.kalmanVariance + 0.002);
    if (!motionDetected && spectrum.snrDb >= -2.5) {
      const measured = clamp(candidateBpm / 60, MIN_BPM / 60, MAX_BPM / 60);
      if (!this.kalmanInitialised && spectrum.snrDb >= -0.5) {
        this.kalmanFrequency = measured;
        this.kalmanVariance = 0.03;
        this.kalmanInitialised = true;
      } else if (this.kalmanInitialised) {
        let measurementVariance = 0.01 * (1 + 6 * Math.exp(-0.35 * clamp(spectrum.snrDb, -3, 14)));
        if (Math.abs(measured - this.kalmanFrequency) > 0.33) measurementVariance *= 50;
        const gain = this.kalmanVariance / (this.kalmanVariance + measurementVariance);
        this.kalmanFrequency = clamp(this.kalmanFrequency + gain * (measured - this.kalmanFrequency), MIN_BPM / 60, MAX_BPM / 60);
        this.kalmanVariance *= 1 - gain;
      }
    }

    const respiratoryColours = regionSamples.map((samples) => interpolateSamples(samples, Math.min(20, availableSeconds)));
    const respiratoryCount = Math.min(...respiratoryColours.map((samples) => samples.length));
    const respiratorySignals = respiratoryColours.map((values) => normalise(extractPOS(values.slice(-respiratoryCount))));
    const respiratoryRaw = Array.from({ length: respiratoryCount }, (_, index) =>
      respiratorySignals.reduce((sum, signal, regionIndex) => sum + this.roiWeights[regionIndex] * signal[index], 0));
    const respiration = respirationFromPulse(respiratoryRaw);

    const result: PulseWindowEstimate = {
      bpm: this.kalmanInitialised ? this.kalmanFrequency * 60 : candidateBpm,
      confidenceInterval: valid ? clamp(1.2 + 6 * Math.exp(-0.35 * Math.max(0, spectrum.snrDb)), 0.8, 5) : 8,
      snrDb: spectrum.snrDb,
      quality: spectrum.quality,
      state: motionDetected ? "HOLDING" : valid && this.kalmanInitialised ? "LOCKED" : "CALIBRATING",
      waveform: fused.slice(-180),
      roiWeights: [...this.roiWeights],
      respiratoryRate: respiration.rate,
      respiratoryQuality: respiration.quality,
    };
    if (result.state === "LOCKED") this.lastGood = result;
    return motionDetected && this.lastGood ? { ...this.lastGood, state: "HOLDING" } : result;
  }
}

function polygonBounds(points: Array<{ x: number; y: number }>): Region {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let first = 0, second = polygon.length - 1; first < polygon.length; second = first++) {
    const a = polygon[first];
    const b = polygon[second];
    const intersects = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(clamp(fraction, 0, 1) * (sorted.length - 1))];
}

export function meshRegions(landmarks: LandmarkPoint[], width: number, height: number) {
  return ROI_LANDMARKS.map((indices) =>
    polygonBounds(indices.map((index) => ({ x: landmarks[index].x * width, y: landmarks[index].y * height }))));
}

/** Anatomical ROIs with the local engine's shadow, highlight and trimmed-mean rejection. */
export function sampleMeshRegions(context: CanvasRenderingContext2D, landmarks: LandmarkPoint[]) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const image = context.getImageData(0, 0, width, height).data;
  const polygons = ROI_LANDMARKS.map((indices) =>
    indices.map((index) => ({ x: landmarks[index].x * width, y: landmarks[index].y * height })));
  const colours = polygons.map((polygon) => {
    const bounds = polygonBounds(polygon);
    const pixels: Array<{ r: number; g: number; b: number; luminance: number }> = [];
    for (let y = Math.max(0, Math.floor(bounds.y)); y <= Math.min(height - 1, Math.ceil(bounds.y + bounds.height)); y += 1) {
      for (let x = Math.max(0, Math.floor(bounds.x)); x <= Math.min(width - 1, Math.ceil(bounds.x + bounds.width)); x += 1) {
        if (!pointInPolygon(x + 0.5, y + 0.5, polygon)) continue;
        const offset = (y * width + x) * 4;
        const r = image[offset], g = image[offset + 1], b = image[offset + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (r < 245 && g < 245 && b < 245 && luminance > 20) pixels.push({ r, g, b, luminance });
      }
    }
    if (pixels.length < 40) return null;
    const luminances = pixels.map((pixel) => pixel.luminance);
    const low = percentile(luminances, 0.1);
    const high = percentile(luminances, 0.9);
    const trimmed = pixels.filter((pixel) => pixel.luminance >= low && pixel.luminance <= high);
    const selected = trimmed.length >= 40 ? trimmed : pixels;
    return [mean(selected.map((pixel) => pixel.r)), mean(selected.map((pixel) => pixel.g)), mean(selected.map((pixel) => pixel.b))] as RGB;
  });
  if (colours.some((colour) => colour === null)) return null;
  return { colours: colours as RGB[], regions: polygons.map(polygonBounds), names: ROI_NAMES };
}

export function assessLandmarkMotion(current: LandmarkPoint[], previous: LandmarkPoint[] | null, dt: number) {
  if (!previous || current.length < 468 || previous.length < 468) return { moving: false, velocity: 0 };
  const iod = Math.max(20, Math.hypot((current[33].x - current[263].x) * 320, (current[33].y - current[263].y) * 240));
  const displacement = mean(MOTION_LANDMARKS.map((index) => Math.hypot(
    (current[index].x - previous[index].x) * 320,
    (current[index].y - previous[index].y) * 240,
  )));
  const velocity = displacement / Math.max(dt, 1e-4) / iod;
  return { moving: velocity > 0.85, velocity };
}
