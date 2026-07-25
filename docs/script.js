const root = document.documentElement;
const horizontal = document.querySelector(".horizontal");
const track = document.querySelector("#track");
const walker = document.querySelector("#walker");
const introScene = document.querySelector(".scene--intro");
const lamps = [...document.querySelectorAll(".lamp")];
const alphaHitLamps = lamps.filter((lamp) => lamp.hasAttribute("data-alpha-hit"));
const callouts = [...document.querySelectorAll(".lamp__callout")];
const calloutImages = [...document.querySelectorAll(".lamp__callout-image")];
const phoneImages = [...document.querySelectorAll(".walker__pose--phone")];
const frontImages = [...document.querySelectorAll(".walker__pose--front")];
const upImages = [...document.querySelectorAll(".walker__pose--up")];
const walkingImages = [...phoneImages, ...frontImages, ...upImages];
const topButton = document.querySelector("#topButton");
const lampNavButtons = [...document.querySelectorAll("[data-lamp-index]")];
const WALK_FRAME_COUNT = 4;
const WALK_CYCLE_COUNT = 9;

const imageMasks = new Map();
let pointerX = -1;
let pointerY = -1;
let distance = 1;
let transitionDistance = 1;
let horizontalStart = 0;
let previousProgress = 0;
let walkingBackward = false;
let ticking = false;
let isNavigatingToDetail = false;
let navigationFrame = 0;
let hoverRefreshTimer = 0;
let lampTrackOffsets = [];

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function measure() {
  distance = Math.max(track.scrollWidth - window.innerWidth, 1);
  transitionDistance = window.innerHeight;
  horizontal.style.height = `${transitionDistance + distance + window.innerHeight}px`;
  horizontalStart = horizontal.offsetTop;
  lampTrackOffsets = lamps.map((lamp) => {
    const focusX = Number(lamp.dataset.focusX || 0.5);
    const lampPosition = lamp.offsetLeft + lamp.offsetWidth * focusX;

    return clamp(lampPosition - window.innerWidth / 2, 0, distance);
  });
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
  let isClickableLampHovered = false;

  alphaHitLamps.forEach((lamp) => {
    const isHovered = hasPointer && isColoredPixel(lamp, pointerX, pointerY);
    lamp.classList.toggle("is-alpha-hovered", isHovered);

    if (isHovered && lamp.dataset.detailUrl) {
      isClickableLampHovered = true;
    }
  });

  root.classList.toggle("is-clickable-lamp-hovered", isClickableLampHovered);
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
  const images = [...lampImages, ...calloutImages, ...walkingImages].filter(Boolean);

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

  positionCallouts();
  render();
}

function positionCallouts() {
  const baseCalloutWidth = clamp(window.innerHeight * 0.25, 170, 260);
  const visibleCalloutWidth = baseCalloutWidth * 1.5;
  const referenceLamp = document.querySelector(".lamp--4");
  const referenceLampImage = referenceLamp?.querySelector(".lamp__image--off");
  const referenceCalloutImage = referenceLamp?.querySelector(
    ".lamp__callout-image",
  );
  const referenceLampMask = imageMasks.get(referenceLampImage);
  const referenceCalloutMask = imageMasks.get(referenceCalloutImage);
  let alignedCalloutTop = null;

  if (referenceLampImage && referenceLampMask && referenceCalloutMask) {
    const referenceLampBounds = getColoredScreenBounds(
      getContainedImageGeometry(
        referenceLampImage.getBoundingClientRect(),
        referenceLampMask,
      ),
      referenceLampMask,
    );
    const referenceVisibleWidth =
      referenceCalloutMask.bounds.right -
      referenceCalloutMask.bounds.left +
      1;
    const referenceVisibleHeight =
      referenceCalloutMask.bounds.bottom -
      referenceCalloutMask.bounds.top +
      1;
    const referenceScale = baseCalloutWidth / referenceVisibleWidth;

    alignedCalloutTop =
      referenceLampBounds.top - referenceVisibleHeight * referenceScale * 0.46;
  }

  lamps.forEach((lamp) => {
    const lampImage = lamp.querySelector(".lamp__image--off");
    const callout = lamp.querySelector(".lamp__callout");
    const lampMask = imageMasks.get(lampImage);

    if (!lampImage || !callout || !lampMask) return;

    const lampRect = lamp.getBoundingClientRect();
    const lampBounds = getColoredScreenBounds(
      getContainedImageGeometry(lampImage.getBoundingClientRect(), lampMask),
      lampMask,
    );

    callout.style.left = `${lampBounds.left - lampRect.left}px`;
    callout.style.top = `${
      alignedCalloutTop === null
        ? lampBounds.top - lampRect.top
        : alignedCalloutTop - lampRect.top
    }px`;

    const calloutImage = callout.querySelector(".lamp__callout-image");
    const calloutMask = imageMasks.get(calloutImage);

    if (calloutImage && calloutMask) {
      const visibleWidth = calloutMask.bounds.right - calloutMask.bounds.left + 1;
      const visibleHeight = calloutMask.bounds.bottom - calloutMask.bounds.top + 1;
      const imageScale = visibleCalloutWidth / visibleWidth;

      callout.style.width = `${visibleCalloutWidth}px`;
      callout.style.height = `${visibleHeight * imageScale}px`;
      calloutImage.style.width = `${calloutMask.width * imageScale}px`;
      calloutImage.style.height = `${calloutMask.height * imageScale}px`;
      calloutImage.style.left = `${-calloutMask.bounds.left * imageScale}px`;
      calloutImage.style.top = `${-calloutMask.bounds.top * imageScale}px`;
    }

    callout.classList.add("is-positioned");
  });
}

function openLampDetail(lamp, url) {
  if (!lamp || !url || isNavigatingToDetail) return;

  isNavigatingToDetail = true;
  lamp.classList.add("is-selected");

  window.setTimeout(() => {
    window.location.href = url;
  }, 280);
}

function render() {
  const localScroll = Math.max(window.scrollY - horizontalStart, 0);
  const reveal = clamp(localScroll / transitionDistance);
  const progress = clamp((localScroll - transitionDistance) / distance);
  const trackOffset = progress * distance;
  const step = Math.floor(progress * WALK_FRAME_COUNT * WALK_CYCLE_COUNT);
  const frameIndex = step % WALK_FRAME_COUNT;
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
  walker.classList.toggle("is-walking-backward", walkingBackward);
  updateNavigation(localScroll, trackOffset);

  const walkerRect = walker.getBoundingClientRect();
  const hasPassedIntro = introScene.getBoundingClientRect().right < walkerRect.left;
  const currentWalkingImage = hasPassedIntro
    ? frontImages[frameIndex]
    : phoneImages[frameIndex];

  walker.classList.toggle("has-passed-intro", hasPassedIntro);

  const shouldLookUp = lamps.some((lamp) =>
    isWithinLampRange(currentWalkingImage, lamp),
  );

  walker.classList.toggle("is-looking-up", shouldLookUp);

  const activeImages = shouldLookUp
    ? upImages
    : hasPassedIntro
      ? frontImages
      : phoneImages;

  walkingImages.forEach((image) => {
    image.classList.toggle("is-active", image === activeImages[frameIndex]);
  });

  ticking = false;
}

function requestRender() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(render);
}

function getLampTrackOffset(lamp) {
  const lampIndex = lamps.indexOf(lamp);

  if (lampIndex >= 0 && Number.isFinite(lampTrackOffsets[lampIndex])) {
    return lampTrackOffsets[lampIndex];
  }

  const focusX = Number(lamp.dataset.focusX || 0.5);
  return clamp(
    lamp.offsetLeft + lamp.offsetWidth * focusX - window.innerWidth / 2,
    0,
    distance,
  );
}

function updateNavigation(localScroll, trackOffset) {
  const isTopActive = localScroll < transitionDistance;

  topButton.classList.toggle("is-active", isTopActive);

  if (isTopActive) {
    topButton.setAttribute("aria-current", "location");
  } else {
    topButton.removeAttribute("aria-current");
  }

  let activeLampIndex = -1;
  let nearestDistance = Infinity;

  if (!isTopActive) {
    lamps.forEach((lamp, index) => {
      const lampDistance = Math.abs(getLampTrackOffset(lamp) - trackOffset);

      if (lampDistance < nearestDistance) {
        nearestDistance = lampDistance;
        activeLampIndex = index;
      }
    });
  }

  lampNavButtons.forEach((button, index) => {
    const isActive = index === activeLampIndex;

    button.classList.toggle("is-active", isActive);

    if (isActive) {
      button.setAttribute("aria-current", "location");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function cancelNavigationScroll() {
  if (!navigationFrame) return;

  cancelAnimationFrame(navigationFrame);
  navigationFrame = 0;
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

function animateScrollTo(targetScroll, behavior = "smooth") {
  cancelNavigationScroll();

  const startScroll = window.scrollY;
  const scrollDistance = targetScroll - startScroll;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (
    behavior === "auto" ||
    prefersReducedMotion ||
    Math.abs(scrollDistance) < 1
  ) {
    window.scrollTo({ top: targetScroll, behavior: "auto" });
    updateAlphaHover();
    return;
  }

  const duration = clamp(
    450 + Math.abs(scrollDistance) * 0.025,
    500,
    900,
  );
  const startedAt = performance.now();

  function animateFrame(currentTime) {
    const progress = clamp((currentTime - startedAt) / duration);
    const easedProgress = easeInOutCubic(progress);

    window.scrollTo({
      top: startScroll + scrollDistance * easedProgress,
      behavior: "auto",
    });

    if (progress < 1) {
      navigationFrame = requestAnimationFrame(animateFrame);
      return;
    }

    navigationFrame = 0;
    updateAlphaHover();
  }

  navigationFrame = requestAnimationFrame(animateFrame);
}

function scrollToLamp(lampIndex, behavior = "smooth") {
  const lamp = lamps[lampIndex - 1];
  if (!lamp) return;

  measure();

  const centeredTrackOffset = getLampTrackOffset(lamp);
  const targetScroll =
    horizontalStart + transitionDistance + centeredTrackOffset;

  animateScrollTo(targetScroll, behavior);
}

topButton.addEventListener("click", () => {
  animateScrollTo(0);
});

lampNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    scrollToLamp(Number(button.dataset.lampIndex));
  });
});

callouts.forEach((callout) => {
  const lamp = callout.closest(".lamp");
  if (!lamp) return;

  callout.addEventListener("pointerenter", () => {
    lamp.classList.add("is-callout-hovered");
  });

  callout.addEventListener("pointerleave", () => {
    lamp.classList.remove("is-callout-hovered");
  });
});

lamps.forEach((lamp) => {
  lamp.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    openLampDetail(lamp, lamp.getAttribute("href"));
  });
});

window.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;

  const clickedLamp = alphaHitLamps.find(
    (lamp) =>
      lamp.dataset.detailUrl &&
      isColoredPixel(lamp, event.clientX, event.clientY),
  );

  if (clickedLamp) {
    openLampDetail(clickedLamp, clickedLamp.dataset.detailUrl);
  }
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

window.addEventListener(
  "scroll",
  () => {
    requestRender();
    window.clearTimeout(hoverRefreshTimer);
    hoverRefreshTimer = window.setTimeout(updateAlphaHover, 80);
  },
  { passive: true },
);
window.addEventListener("wheel", cancelNavigationScroll, { passive: true });
window.addEventListener("touchstart", cancelNavigationScroll, { passive: true });
window.addEventListener("keydown", (event) => {
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
    ].includes(event.key)
  ) {
    cancelNavigationScroll();
  }
});
window.addEventListener("resize", () => {
  cancelNavigationScroll();
  measure();
  positionCallouts();
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
