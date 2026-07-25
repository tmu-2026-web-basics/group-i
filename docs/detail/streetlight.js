const halftone = document.querySelector(".halftone");
const dotField = document.querySelector(".dot-field");
const locationSection = document.querySelector(".location");
const streetPhoto = document.querySelector(".street-photo");
const otherLights = document.querySelector(".other-lights");
const otherLightsTrack = document.querySelector(".other-lights__track");
let resizeFrame = 0;
let speedFrame = 0;
let loopAnimation = null;
let currentOtherLightsSpeed = 1;
let targetOtherLightsSpeed = 1;
let lastWheelTime = 0;

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function createOtherLightsSet(streetlightIds, isDuplicate = false) {
  const set = document.createElement("div");
  set.className = "other-lights__set";

  if (isDuplicate) {
    set.setAttribute("aria-hidden", "true");
  }

  streetlightIds.forEach((streetlightId) => {
    const link = document.createElement("a");
    const image = document.createElement("img");
    const paddedId = String(streetlightId).padStart(2, "0");

    link.href = `../streetlight_${paddedId}/streetlight_${paddedId}.html`;
    image.src = `../../images/streetlight/streetlight_${paddedId}/detail-top_${paddedId}.webp`;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";

    if (isDuplicate) {
      link.tabIndex = -1;
    } else {
      link.setAttribute("aria-label", `街灯${streetlightId}を見る`);
    }

    link.append(image);
    set.append(link);
  });

  return set;
}

function renderOtherLights() {
  const currentStreetlight = Number(document.body.dataset.streetlight);
  const streetlightIds = [1, 2, 3, 4, 5, 6, 7].filter(
    (streetlightId) => streetlightId !== currentStreetlight,
  );

  otherLightsTrack.replaceChildren(
    createOtherLightsSet(streetlightIds),
    createOtherLightsSet(streetlightIds, true),
  );
}

function smoothstep(value) {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function drawHalftone() {
  streetPhoto.style.setProperty(
    "--street-photo-half-height",
    `${streetPhoto.getBoundingClientRect().height / 2}px`,
  );

  const rect = dotField.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(Math.round(rect.width), 1);
  const height = Math.max(Math.round(rect.height), 1);
  const spacing = 48;
  const transitionStart = clamp(
    locationSection.getBoundingClientRect().top - rect.top,
    0,
    height,
  );
  const transitionHeight = Math.max(height - transitionStart, 1);
  const firstX = (width % spacing) / 2 + spacing / 2;
  const firstY = spacing / 2;
  const minimumRadius = 10;
  const maximumRadius = spacing * 0.78;

  halftone.width = Math.round(width * pixelRatio);
  halftone.height = Math.round(height * pixelRatio);

  const context = halftone.getContext("2d");
  if (!context) return;

  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = "#86ddcf";
  context.fillRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--brown2")
    .trim();

  for (let y = firstY; y < height + spacing; y += spacing) {
    const progress = smoothstep(
      (y - transitionStart) / transitionHeight,
    );
    const radius =
      minimumRadius + (maximumRadius - minimumRadius) * progress;

    for (let x = firstX - spacing; x < width + spacing; x += spacing) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function requestHalftoneDraw() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(drawHalftone);
}

function setOtherLightsSpeed(animation, speed) {
  if (typeof animation.updatePlaybackRate === "function") {
    animation.updatePlaybackRate(speed);
    return;
  }

  animation.playbackRate = speed;
}

function animateOtherLightsSpeed(time) {
  if (!loopAnimation) {
    speedFrame = 0;
    return;
  }

  if (time - lastWheelTime > 120) {
    targetOtherLightsSpeed += (1 - targetOtherLightsSpeed) * 0.08;
  }

  currentOtherLightsSpeed +=
    (targetOtherLightsSpeed - currentOtherLightsSpeed) * 0.22;
  setOtherLightsSpeed(loopAnimation, currentOtherLightsSpeed);

  const isBackToNormal =
    Math.abs(currentOtherLightsSpeed - 1) < 0.01 &&
    Math.abs(targetOtherLightsSpeed - 1) < 0.01;

  if (isBackToNormal) {
    currentOtherLightsSpeed = 1;
    targetOtherLightsSpeed = 1;
    setOtherLightsSpeed(loopAnimation, 1);
    speedFrame = 0;
    return;
  }

  speedFrame = requestAnimationFrame(animateOtherLightsSpeed);
}

function accelerateOtherLights(event) {
  event.preventDefault();

  const [animation] = otherLightsTrack.getAnimations();
  if (!animation) return;

  const scrollAmount = event.deltaY || event.deltaX;
  if (scrollAmount === 0) return;

  loopAnimation = animation;
  const direction = scrollAmount > 0 ? 1 : -1;

  if (direction < 0) {
    const duration = Number(animation.effect?.getTiming().duration) || 24000;
    const currentTime = Number(animation.currentTime) || 0;

    if (currentTime < duration * 2) {
      animation.currentTime = currentTime + duration * 10;
    }
  }

  const boostedSpeed = clamp(5 + Math.abs(scrollAmount) / 12, 5, 14);

  targetOtherLightsSpeed = direction * boostedSpeed;
  lastWheelTime = performance.now();

  if (!speedFrame) {
    speedFrame = requestAnimationFrame(animateOtherLightsSpeed);
  }
}

renderOtherLights();
window.addEventListener("load", drawHalftone);
window.addEventListener("resize", requestHalftoneDraw);
otherLights.addEventListener("wheel", accelerateOtherLights, {
  passive: false,
});
