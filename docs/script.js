const root = document.documentElement;
const horizontal = document.querySelector(".horizontal");
const track = document.querySelector("#track");
const walker = document.querySelector("#walker");
const introScene = document.querySelector(".scene--intro");
const lamps = [...document.querySelectorAll(".lamp")];
const alphaHitLamps = lamps.filter((lamp) => lamp.hasAttribute("data-alpha-hit"));
const phoneImages = [...document.querySelectorAll(".walker__pose--phone")];
const frontImages = [...document.querySelectorAll(".walker__pose--front")];
const walkingImages = [...phoneImages, ...frontImages];
const topButton = document.querySelector("#topButton");
const lampNavButtons = [...document.querySelectorAll("[data-lamp-index]")];

const imageMasks = new Map();
let pointerX = -1;
let pointerY = -1;
let distance = 1;
let transitionDistance = 1;
let horizontalStart = 0;
let previousProgress = 0;
let walkingBackward = false;
let ticking = false;

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function measure() {
  distance = Math.max(track.scrollWidth - window.innerWidth, 1);
  transitionDistance = window.innerHeight;
  horizontal.style.height = `${transitionDistance + distance + window.innerHeight}px`;
  horizontalStart = horizontal.offsetTop;
}

function getContainedImageGeometry(rect, mask, translateY = 0) {
  const scale = Math.min(rect.width / mask.width, rect.height / mask.height);
  const width = mask.width * scale;
  const height = mask.height * scale;

  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.bottom - height + translateY,
    right: rect.left + (rect.width + width) / 2,
    bottom: rect.bottom + translateY,
    scale,
  };
}

function isColoredPixel(lamp, clientX, clientY) {
  const image = lamp.querySelector(".lamp__image--off");
  const mask = imageMasks.get(image);
  if (!image || !mask) return false;

  const geometry = getContainedImageGeometry(image.getBoundingClientRect(), mask);
  const coloredBounds = getColoredScreenBounds(geometry, mask);
  const hitPadding = Number(lamp.dataset.hitPadding || 0);

  if (
    clientX < coloredBounds.left - hitPadding ||
    clientX > coloredBounds.right + hitPadding ||
    clientY < coloredBounds.top - hitPadding ||
    clientY > coloredBounds.bottom + hitPadding
  ) {
    return false;
  }

  const imageX = Math.floor((clientX - geometry.left) / geometry.scale);
  const imageY = Math.floor((clientY - geometry.top) / geometry.scale);
  const radius = Math.ceil(hitPadding / geometry.scale);

  if (
    imageX < -radius ||
    imageX >= mask.width + radius ||
    imageY < -radius ||
    imageY >= mask.height + radius
  ) {
    return false;
  }

  const startX = Math.max(imageX - radius, 0);
  const endX = Math.min(imageX + radius, mask.width - 1);
  const startY = Math.max(imageY - radius, 0);
  const endY = Math.min(imageY + radius, mask.height - 1);
  const radiusSquared = radius * radius;

  for (let y = startY; y <= endY; y += 1) {
    const deltaY = y - imageY;
    const row = y * mask.width;

    for (let x = startX; x <= endX; x += 1) {
      const deltaX = x - imageX;

      if (
        deltaX * deltaX + deltaY * deltaY <= radiusSquared &&
        mask.alpha[row + x] > 0
      ) {
        return true;
      }
    }
  }

  return false;
}

function updateAlphaHover() {
  const hasPointer = pointerX >= 0 && pointerY >= 0;

  alphaHitLamps.forEach((lamp) => {
    const isHovered = hasPointer && isColoredPixel(lamp, pointerX, pointerY);
    lamp.classList.toggle("is-alpha-hovered", isHovered);
  });
}

function getWalkerImageGeometry(walkingImage, walkingMask) {
  const walkerRect = walker.getBoundingClientRect();
  const imageTranslateY = walkerRect.height * 0.04;

  return getContainedImageGeometry(walkerRect, walkingMask, imageTranslateY);
}

function getColoredScreenBounds(geometry, mask) {
  return {
    left: geometry.left + mask.bounds.left * geometry.scale,
    top: geometry.top + mask.bounds.top * geometry.scale,
    right: geometry.left + (mask.bounds.right + 1) * geometry.scale,
    bottom: geometry.top + (mask.bounds.bottom + 1) * geometry.scale,
  };
}

function isWithinLampRange(walkingImage, lamp) {
  const lampImage = lamp.querySelector(".lamp__image--off");
  const walkingMask = imageMasks.get(walkingImage);
  const lampMask = imageMasks.get(lampImage);

  if (!lampImage || !walkingMask || !lampMask) return false;

  const walkingBounds = getColoredScreenBounds(
    getWalkerImageGeometry(walkingImage, walkingMask),
    walkingMask,
  );
  const lampBounds = getColoredScreenBounds(
    getContainedImageGeometry(lampImage.getBoundingClientRect(), lampMask),
    lampMask,
  );
  const distanceBeforeLamp = lampBounds.left - walkingBounds.right;
  const hasNotPassedLamp = walkingBounds.left <= lampBounds.right;

  return distanceBeforeLamp <= 100 && hasNotPassedLamp;
}

async function readAlphaMask(image) {
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  const bounds = {
    left: canvas.width,
    top: canvas.height,
    right: 0,
    bottom: 0,
  };

  for (
    let pixelIndex = 0, alphaIndex = 3;
    pixelIndex < alpha.length;
    pixelIndex += 1, alphaIndex += 4
  ) {
    alpha[pixelIndex] = pixels[alphaIndex];

    if (pixels[alphaIndex] > 0) {
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    }
  }

  return {
    width: canvas.width,
    height: canvas.height,
    alpha,
    bounds,
  };
}

async function prepareAlphaMasks() {
  const lampImages = lamps.map((lamp) =>
    lamp.querySelector(".lamp__image--off"),
  );
  const images = [...lampImages, ...walkingImages].filter(Boolean);

  await Promise.all(
    images.map(async (image) => {
      try {
        const mask = await readAlphaMask(image);
        if (mask) imageMasks.set(image, mask);
      } catch {
        imageMasks.delete(image);
      }
    }),
  );

  render();
}

function render() {
  const localScroll = Math.max(window.scrollY - horizontalStart, 0);
  const reveal = clamp(localScroll / transitionDistance);
  const progress = clamp((localScroll - transitionDistance) / distance);
  const trackOffset = progress * distance;
  const step = Math.floor(progress * 18);
  const bob = Math.sin(progress * Math.PI * 18) * 4;
  const movement = (progress - previousProgress) * distance;

  if (Math.abs(movement) >= 0.5) {
    walkingBackward = movement < 0;
    previousProgress = progress;
  }

  root.style.setProperty(
    "--panel-x",
    `${((1 - reveal) * window.innerWidth).toFixed(2)}px`,
  );
  root.style.setProperty("--track-x", `${(-trackOffset).toFixed(2)}px`);
  root.style.setProperty("--walker-bob", `${bob.toFixed(2)}px`);
  walker.classList.toggle("is-step-two", step % 2 === 1);
  walker.classList.toggle("is-walking-backward", walkingBackward);

  const walkerRect = walker.getBoundingClientRect();
  const hasPassedIntro = introScene.getBoundingClientRect().right < walkerRect.left;
  const currentWalkingImage = hasPassedIntro
    ? frontImages[step % 2]
    : phoneImages[step % 2];

  walker.classList.toggle("has-passed-intro", hasPassedIntro);

  const shouldLookUp = lamps.some((lamp) =>
    isWithinLampRange(currentWalkingImage, lamp),
  );

  walker.classList.toggle("is-looking-up", shouldLookUp);
  updateAlphaHover();
  ticking = false;
}

function requestRender() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(render);
}

function scrollToLamp(lampIndex, behavior = "smooth") {
  const lamp = lamps[lampIndex - 1];
  if (!lamp) return;

  measure();

  const focusX = Number(lamp.dataset.focusX || 0.5);
  const lampPosition = lamp.offsetLeft + lamp.offsetWidth * focusX;
  const centeredTrackOffset = clamp(
    lampPosition - window.innerWidth / 2,
    0,
    distance,
  );
  const targetScroll =
    horizontalStart + transitionDistance + centeredTrackOffset;

  window.scrollTo({ top: targetScroll, behavior });
}

topButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

lampNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    scrollToLamp(Number(button.dataset.lampIndex));
  });
});

window.addEventListener(
  "pointermove",
  (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    updateAlphaHover();
  },
  { passive: true },
);

document.documentElement.addEventListener("mouseleave", () => {
  pointerX = -1;
  pointerY = -1;
  updateAlphaHover();
});

window.addEventListener("scroll", requestRender, { passive: true });
window.addEventListener("resize", () => {
  measure();
  render();
});
window.addEventListener("load", () => {
  measure();
  render();
  prepareAlphaMasks();

  const requestedLamp = Number(
    new URLSearchParams(window.location.search).get("streetlight"),
  );

  if (requestedLamp >= 1 && requestedLamp <= lamps.length) {
    requestAnimationFrame(() => scrollToLamp(requestedLamp, "auto"));
  }
});
document.fonts?.ready.then(() => {
  measure();
  render();
});
