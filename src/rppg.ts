export type RGB = [number, number, number];
export type Sample = { time: number; rgb: RGB };
export type MotionSample = { time: number; value: number };
export type Region = { x: number; y: number; width: number; height: number };
export type PosePoint = { x: number; y: number; visibility?: number };
export type Estimate = { bpm: number; quality: number; beatAge: number };

export const INITIAL_CALIBRATION_SECONDS = 15;
export const FINAL_MEASUREMENT_SECONDS = 60;
const SIGNAL_WINDOW_SECONDS = 20;
const MIN_BPM = 45;
const MAX_BPM = 180;
const MIN_QUALITY = 0.3;
const MIN_REGION_QUALITY = 0.18;
const MIN_COMBINED_QUALITY = 0.22;
const REGION_AGREEMENT_BPM = 10;
const MIN_RESPIRATION_RATE = 6;
const MAX_RESPIRATION_RATE = 30;
const MIN_RESPIRATION_QUALITY = 0.2;

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function standardDeviation(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function interpolateSamples(samples: Sample[], fps = 30) {
  const start = samples[0].time;
  const end = samples.at(-1)!.time;
  const count = Math.floor((end - start) * fps);
  const output: RGB[] = [];
  let source = 0;
  for (let index = 0; index < count; index += 1) {
    const time = start + index / fps;
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

export function combineRegionSamples(regionSamples: Sample[][]) {
  const count = Math.min(...regionSamples.map((samples) => samples.length));
  if (!Number.isFinite(count) || count === 0) return [];
  const starts = regionSamples.map((samples) => samples.length - count);
  return Array.from({ length: count }, (_, index) => {
    const samples = regionSamples.map((region, regionIndex) => region[starts[regionIndex] + index]);
    return {
      time: samples[0].time,
      rgb: [0, 1, 2].map((channel) => median(samples.map((sample) => sample.rgb[channel]))) as RGB,
    };
  });
}

export function estimateBPM(samples: Sample[]): Estimate | null {
  if (samples.length < 200 || samples.at(-1)!.time - samples[0].time < INITIAL_CALIBRATION_SECONDS - 0.5) return null;
  const fps = 30;
  const colours = interpolateSamples(samples, fps);
  const windowSize = Math.round(1.6 * fps);
  if (colours.length <= windowSize) return null;
  const pulse = new Array(colours.length).fill(0);
  const weights = new Array(colours.length).fill(0);
  for (let start = 0; start <= colours.length - windowSize; start += 1) {
    const segment = colours.slice(start, start + windowSize);
    const means = [0, 1, 2].map((channel) => segment.reduce((sum, colour) => sum + colour[channel], 0) / windowSize);
    const x: number[] = [];
    const y: number[] = [];
    segment.forEach((colour) => {
      const red = colour[0] / means[0] - 1;
      const green = colour[1] / means[1] - 1;
      const blue = colour[2] / means[2] - 1;
      x.push(green - blue);
      y.push(green + blue - 2 * red);
    });
    const alpha = standardDeviation(x) / Math.max(standardDeviation(y), 1e-10);
    const projected = x.map((value, index) => value + alpha * y[index]);
    const mean = projected.reduce((sum, value) => sum + value, 0) / windowSize;
    projected.forEach((value, offset) => {
      pulse[start + offset] += value - mean;
      weights[start + offset] += 1;
    });
  }
  pulse.forEach((_, index) => { if (weights[index] > 0) pulse[index] /= weights[index]; });
  const pulseMean = pulse.reduce((sum, value) => sum + value, 0) / pulse.length;
  pulse.forEach((_, index) => (pulse[index] -= pulseMean));
  const powers: Array<{ bpm: number; power: number; real: number; imaginary: number }> = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const frequency = bpm / 60;
    let real = 0;
    let imaginary = 0;
    pulse.forEach((value, index) => {
      const angle = (2 * Math.PI * frequency * index) / fps;
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, pulse.length - 1));
      real += value * hann * Math.cos(angle);
      imaginary -= value * hann * Math.sin(angle);
    });
    powers.push({ bpm, power: real ** 2 + imaginary ** 2, real, imaginary });
  }
  let peak = powers.reduce((best, item) => (item.power > best.power ? item : best));
  if (peak.bpm >= 90) {
    const half = powers.reduce((best, item) => Math.abs(item.bpm - peak.bpm / 2) < Math.abs(best.bpm - peak.bpm / 2) ? item : best);
    if (half.power >= peak.power * 0.65) peak = half;
  }
  const total = powers.reduce((sum, item) => sum + item.power, 0);
  const local = powers.filter((item) => Math.abs(item.bpm - peak.bpm) <= 9).reduce((sum, item) => sum + item.power, 0);
  const angularFrequency = (2 * Math.PI * (peak.bpm / 60)) / fps;
  const phase = Math.atan2(-peak.imaginary, peak.real);
  const lastIndex = pulse.length - 1;
  const completedCycles = Math.floor((angularFrequency * lastIndex + phase) / (2 * Math.PI));
  const lastPeakIndex = (completedCycles * 2 * Math.PI - phase) / angularFrequency;
  return { bpm: peak.bpm, quality: total > 0 ? local / total : 0, beatAge: Math.max(0, (lastIndex - lastPeakIndex) / fps) };
}

function agreeAcrossRegions(estimates: Estimate[]) {
  const pairs: [Estimate, Estimate][] = [];
  for (let first = 0; first < estimates.length; first += 1) {
    for (let second = first + 1; second < estimates.length; second += 1) {
      if (Math.abs(estimates[first].bpm - estimates[second].bpm) <= REGION_AGREEMENT_BPM) pairs.push([estimates[first], estimates[second]]);
    }
  }
  let pair = pairs.sort((a, b) => b[0].quality + b[1].quality - a[0].quality - a[1].quality)[0];
  if (!pair) {
    const harmonicPairs: [Estimate, Estimate][] = [];
    for (let first = 0; first < estimates.length; first += 1) {
      for (let second = first + 1; second < estimates.length; second += 1) {
        const lower = estimates[first].bpm <= estimates[second].bpm ? estimates[first] : estimates[second];
        const higher = lower === estimates[first] ? estimates[second] : estimates[first];
        if (higher.bpm >= 90 && Math.abs(higher.bpm / 2 - lower.bpm) <= REGION_AGREEMENT_BPM) harmonicPairs.push([lower, { ...higher, bpm: higher.bpm / 2, quality: higher.quality * 0.85 }]);
      }
    }
    pair = harmonicPairs.sort((a, b) => b[0].quality + b[1].quality - a[0].quality - a[1].quality)[0];
  }
  if (!pair) return null;
  const weights = pair.map((estimate) => estimate.quality ** 2);
  const strongest = pair[0].quality >= pair[1].quality ? pair[0] : pair[1];
  return {
    bpm: (pair[0].bpm * weights[0] + pair[1].bpm * weights[1]) / (weights[0] + weights[1]),
    quality: (pair[0].quality + pair[1].quality) / 2,
    beatAge: strongest.beatAge,
  };
}

export function estimateLiveBPM(regionSamples: Sample[][]) {
  const regional = regionSamples.map(estimateBPM).filter((estimate): estimate is Estimate => estimate !== null && estimate.quality >= MIN_REGION_QUALITY);
  let estimate = agreeAcrossRegions(regional);
  if (estimate && estimate.quality < MIN_QUALITY) estimate = null;
  if (!estimate) {
    const combined = estimateBPM(combineRegionSamples(regionSamples));
    if (combined && combined.quality >= MIN_COMBINED_QUALITY) estimate = combined;
  }
  if (!estimate) {
    const strongest = [...regional].sort((a, b) => b.quality - a.quality)[0];
    if (strongest?.quality >= 0.34) estimate = strongest;
  }
  return estimate;
}

export function estimateFinalBPM(regionSamples: Sample[][]) {
  const first = Math.max(...regionSamples.map((samples) => samples[0]?.time ?? Infinity));
  const last = Math.min(...regionSamples.map((samples) => samples.at(-1)?.time ?? -Infinity));
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first < 45) return null;
  const estimates: Estimate[] = [];
  for (let start = first; start + SIGNAL_WINDOW_SECONDS <= last + 0.25; start += 10) {
    const regions = regionSamples.map((samples) => samples.filter((sample) => sample.time >= start && sample.time <= start + SIGNAL_WINDOW_SECONDS));
    let estimate = agreeAcrossRegions(regions.map(estimateBPM).filter((item): item is Estimate => item !== null && item.quality >= MIN_REGION_QUALITY));
    if (!estimate) {
      const combined = estimateBPM(combineRegionSamples(regions));
      if (combined && combined.quality >= MIN_COMBINED_QUALITY) estimate = combined;
    }
    if (estimate && estimate.quality >= MIN_QUALITY) estimates.push(estimate);
  }
  if (estimates.length < 3) return null;
  const centre = median(estimates.map((estimate) => estimate.bpm));
  const inliers = estimates.filter((estimate) => Math.abs(estimate.bpm - centre) <= 6);
  if (inliers.length < 3) return null;
  const rates = inliers.map((estimate) => estimate.bpm);
  if (Math.max(...rates) - Math.min(...rates) > 8) return null;
  const meanQuality = inliers.reduce((sum, estimate) => sum + estimate.quality, 0) / inliers.length;
  const consistency = Math.max(0, 1 - (Math.max(...rates) - Math.min(...rates)) / 12);
  const quality = meanQuality * (0.65 + 0.35 * consistency);
  if (quality < MIN_QUALITY) return null;
  return { bpm: median(rates), quality, beatAge: inliers.at(-1)!.beatAge };
}

function estimateRespiratoryRate(samples: MotionSample[]) {
  if (samples.length < 120 || samples.at(-1)!.time - samples[0].time < 25) return null;
  const fps = 10;
  const first = samples[0];
  const last = samples.at(-1)!;
  const count = Math.floor((last.time - first.time) * fps);
  const values: number[] = [];
  let source = 0;
  for (let index = 0; index < count; index += 1) {
    const time = first.time + index / fps;
    while (source + 1 < samples.length && samples[source + 1].time < time) source += 1;
    if (source + 1 >= samples.length) break;
    const a = samples[source];
    const b = samples[source + 1];
    values.push(a.value + (b.value - a.value) * ((time - a.time) / Math.max(b.time - a.time, 1e-6)));
  }
  if (values.length < 250) return null;
  const meanIndex = (values.length - 1) / 2;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  let squaredOffsets = 0;
  let offsetDeviation = 0;
  values.forEach((value, index) => {
    const offset = index - meanIndex;
    squaredOffsets += offset * offset;
    offsetDeviation += offset * (value - meanValue);
  });
  const slope = squaredOffsets > 0 ? offsetDeviation / squaredOffsets : 0;
  const detrended = values.map((value, index) => value - meanValue - slope * (index - meanIndex));
  const powers: Array<{ rate: number; power: number }> = [];
  for (let rate = MIN_RESPIRATION_RATE; rate <= MAX_RESPIRATION_RATE; rate += 0.5) {
    let real = 0;
    let imaginary = 0;
    detrended.forEach((value, index) => {
      const angle = (2 * Math.PI * (rate / 60) * index) / fps;
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, detrended.length - 1));
      real += value * hann * Math.cos(angle);
      imaginary -= value * hann * Math.sin(angle);
    });
    powers.push({ rate, power: real ** 2 + imaginary ** 2 });
  }
  const peak = powers.reduce((best, item) => item.power > best.power ? item : best);
  const total = powers.reduce((sum, item) => sum + item.power, 0);
  const local = powers.filter((item) => Math.abs(item.rate - peak.rate) <= 2).reduce((sum, item) => sum + item.power, 0);
  return { rate: peak.rate, quality: total > 0 ? local / total : 0 };
}

function respiratoryConsensus(estimates: Array<{ rate: number; quality: number }>) {
  const pairs: Array<[{ rate: number; quality: number }, { rate: number; quality: number }]> = [];
  for (let first = 0; first < estimates.length; first += 1) for (let second = first + 1; second < estimates.length; second += 1) if (Math.abs(estimates[first].rate - estimates[second].rate) <= 3) pairs.push([estimates[first], estimates[second]]);
  const pair = pairs.sort((a, b) => b[0].quality + b[1].quality - a[0].quality - a[1].quality)[0];
  if (!pair) return null;
  const quality = (pair[0].quality + pair[1].quality) / 2;
  const rate = (pair[0].rate * pair[0].quality + pair[1].rate * pair[1].quality) / Math.max(pair[0].quality + pair[1].quality, 1e-6);
  return { rate, quality };
}

export function estimateFinalRespiratoryRate(regionSamples: MotionSample[][]) {
  const first = Math.max(...regionSamples.map((samples) => samples[0]?.time ?? Infinity));
  const last = Math.min(...regionSamples.map((samples) => samples.at(-1)?.time ?? -Infinity));
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first < 42) return null;
  const estimates: Array<{ rate: number; quality: number }> = [];
  for (let start = first; start + 25 <= last + 0.25; start += 8) {
    const regional = regionSamples.map((samples) => estimateRespiratoryRate(samples.filter((sample) => sample.time >= start && sample.time <= start + 25))).filter((estimate): estimate is { rate: number; quality: number } => estimate !== null && estimate.quality >= 0.14);
    const agreed = respiratoryConsensus(regional);
    if (agreed && agreed.quality >= MIN_RESPIRATION_QUALITY) estimates.push(agreed);
  }
  if (estimates.length < 3) return null;
  const centre = median(estimates.map((estimate) => estimate.rate));
  const inliers = estimates.filter((estimate) => Math.abs(estimate.rate - centre) <= 3);
  if (inliers.length < 3) return null;
  const rates = inliers.map((estimate) => estimate.rate);
  if (Math.max(...rates) - Math.min(...rates) > 4) return null;
  return { rate: median(rates), quality: inliers.reduce((sum, estimate) => sum + estimate.quality, 0) / inliers.length };
}

export function chestRegionsFromPose(landmarks: PosePoint[], width: number, height: number): Region[] | null {
  const left = landmarks[11];
  const right = landmarks[12];
  if (!left || !right || (left.visibility ?? 1) < 0.55 || (right.visibility ?? 1) < 0.55) return null;
  const leftX = left.x * width;
  const rightX = right.x * width;
  const shoulderY = ((left.y + right.y) / 2) * height;
  const span = Math.abs(rightX - leftX);
  if (span < width * 0.16 || shoulderY > height * 0.72) return null;
  const minX = Math.min(leftX, rightX);
  const regionHeight = Math.min(span * 0.42, height - shoulderY - 2);
  if (regionHeight < height * 0.08) return null;
  return [
    { x: minX + span * 0.18, y: shoulderY + span * 0.06, width: span * 0.64, height: regionHeight },
    { x: minX - span * 0.04, y: shoulderY + span * 0.03, width: span * 0.38, height: regionHeight * 0.72 },
    { x: minX + span * 0.66, y: shoulderY + span * 0.03, width: span * 0.38, height: regionHeight * 0.72 },
  ].map((region) => ({ x: Math.max(0, region.x), y: Math.max(0, region.y), width: Math.min(width - Math.max(0, region.x), region.width), height: Math.min(height - Math.max(0, region.y), region.height) }));
}

export function faceRegions(face: Region) {
  return [
    { x: face.x + face.width * 0.25, y: face.y + face.height * 0.1, width: face.width * 0.5, height: face.height * 0.18 },
    { x: face.x + face.width * 0.12, y: face.y + face.height * 0.48, width: face.width * 0.25, height: face.height * 0.18 },
    { x: face.x + face.width * 0.63, y: face.y + face.height * 0.48, width: face.width * 0.25, height: face.height * 0.18 },
  ];
}

export function sampleRegions(context: CanvasRenderingContext2D, face: Region) {
  return faceRegions(face).map((region) => {
    const x = Math.max(0, Math.floor(region.x));
    const y = Math.max(0, Math.floor(region.y));
    const width = Math.max(1, Math.min(context.canvas.width - x, Math.floor(region.width)));
    const height = Math.max(1, Math.min(context.canvas.height - y, Math.floor(region.height)));
    const image = context.getImageData(x, y, width, height).data;
    let red = 0, green = 0, blue = 0, pixels = 0;
    for (let index = 0; index < image.length; index += 16) {
      red += image[index]; green += image[index + 1]; blue += image[index + 2]; pixels += 1;
    }
    return [red / pixels, green / pixels, blue / pixels] as RGB;
  });
}

const MOTION_GRID_SIZE = 20;
export function motionGrid(context: CanvasRenderingContext2D, region: Region) {
  const image = context.getImageData(Math.floor(region.x), Math.floor(region.y), Math.max(1, Math.floor(region.width)), Math.max(1, Math.floor(region.height)));
  const values: number[] = [];
  for (let gridY = 0; gridY < MOTION_GRID_SIZE; gridY += 1) for (let gridX = 0; gridX < MOTION_GRID_SIZE; gridX += 1) {
    const x = Math.min(image.width - 1, Math.floor((gridX + 0.5) * image.width / MOTION_GRID_SIZE));
    const y = Math.min(image.height - 1, Math.floor((gridY + 0.5) * image.height / MOTION_GRID_SIZE));
    const offset = (y * image.width + x) * 4;
    values.push(0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2]);
  }
  return values;
}

export function verticalMotion(previous: number[], current: number[]) {
  if (previous.length !== current.length) return null;
  let numerator = 0, denominator = 0;
  for (let y = 1; y < MOTION_GRID_SIZE - 1; y += 1) for (let x = 1; x < MOTION_GRID_SIZE - 1; x += 1) {
    const index = y * MOTION_GRID_SIZE + x;
    const gradient = (current[index + MOTION_GRID_SIZE] - current[index - MOTION_GRID_SIZE]) / 2;
    numerator += gradient * (current[index] - previous[index]);
    denominator += gradient * gradient;
  }
  if (denominator < 700) return null;
  return Math.max(-1.5, Math.min(1.5, -numerator / denominator));
}
