'use strict';

function clampNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeCategory(category) {
  const text = String(category || '').trim().toLowerCase();
  if (text === 'tv' || text === 'tvshow' || text === 'series') {
    return 'TV';
  }
  return 'Movie';
}

function sanitizeCount(count) {
  const num = Math.round(clampNumber(count, 6));
  return Math.max(3, Math.min(12, num));
}

function buildUaScreenshotTimes(options) {
  const durationSeconds = clampNumber(options?.durationSeconds, 0);
  const frameRate = clampNumber(options?.frameRate, 0);
  if (!durationSeconds || !frameRate) {
    return [];
  }

  const baseCount = sanitizeCount(options?.count);
  const isDisc = Boolean(options?.isDisc);
  const totalScreens = isDisc ? baseCount + 1 : baseCount;
  const totalFrames = Math.max(1, Math.floor(durationSeconds * frameRate));

  const retakeCount = Math.max(0, Math.floor(clampNumber(options?.retakeCount, 0)));
  const retakeOffset = retakeCount > 0 ? retakeCount * 0.01 : 0;
  const category = normalizeCategory(options?.category);

  let startPct = 0.05;
  if (retakeCount > 0 && category === 'TV') {
    startPct = 0.1;
  }

  let startFrame = Math.floor(totalFrames * (startPct + retakeOffset));
  let endFrame = Math.floor(totalFrames * 0.9);
  const maxStartFrame = Math.floor(totalFrames * 0.4);
  if (startFrame > maxStartFrame) {
    startFrame = maxStartFrame;
  }
  if (endFrame < startFrame) {
    endFrame = startFrame;
  }

  const usableFrames = Math.max(0, endFrame - startFrame);
  const frameInterval = totalScreens > 1 ? Math.floor(usableFrames / totalScreens) : usableFrames;
  const times = [];

  for (let i = 0; i < totalScreens; i += 1) {
    const frame = startFrame + (i * frameInterval);
    const time = frame / frameRate;
    times.push(time);
  }

  return times.sort((a, b) => a - b);
}

function buildUaScreenshotTimesDebug(options) {
  const durationSeconds = clampNumber(options?.durationSeconds, 0);
  const frameRate = clampNumber(options?.frameRate, 0);
  const baseCount = sanitizeCount(options?.count);
  const isDisc = Boolean(options?.isDisc);
  const totalScreens = isDisc ? baseCount + 1 : baseCount;
  const totalFrames = durationSeconds && frameRate
    ? Math.max(1, Math.floor(durationSeconds * frameRate))
    : 0;
  const retakeCount = Math.max(0, Math.floor(clampNumber(options?.retakeCount, 0)));
  const retakeOffset = retakeCount > 0 ? retakeCount * 0.01 : 0;
  const category = normalizeCategory(options?.category);
  let startPct = 0.05;
  if (retakeCount > 0 && category === 'TV') {
    startPct = 0.1;
  }
  let startFrame = totalFrames ? Math.floor(totalFrames * (startPct + retakeOffset)) : 0;
  let endFrame = totalFrames ? Math.floor(totalFrames * 0.9) : 0;
  const maxStartFrame = totalFrames ? Math.floor(totalFrames * 0.4) : 0;
  if (startFrame > maxStartFrame) {
    startFrame = maxStartFrame;
  }
  if (endFrame < startFrame) {
    endFrame = startFrame;
  }
  const usableFrames = Math.max(0, endFrame - startFrame);
  const frameInterval = totalScreens > 1 ? Math.floor(usableFrames / totalScreens) : usableFrames;
  const times = buildUaScreenshotTimes(options);
  return {
    durationSeconds,
    frameRate,
    baseCount,
    totalScreens,
    totalFrames,
    startFrame,
    endFrame,
    usableFrames,
    frameInterval,
    retakeCount,
    retakeOffset,
    category,
    isDisc,
    timesCount: times.length,
    times
  };
}

module.exports = {
  buildUaScreenshotTimes,
  buildUaScreenshotTimesDebug
};
