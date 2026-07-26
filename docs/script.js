const root = document.documentElement;
const opening = document.querySelector(".opening");
const horizontal = document.querySelector(".horizontal");
const track = document.querySelector("#track");
const walker = document.querySelector("#walker");
const introScene = document.querySelector(".scene--intro");
const lamps = [...document.querySelectorAll(".lamp")];
const callouts = [...document.querySelectorAll(".lamp__callout")];
const phoneImages = [...document.querySelectorAll(".walker__pose--phone")];
const frontImages = [...document.querySelectorAll(".walker__pose--front")];
const upImages = [...document.querySelectorAll(".walker__pose--up")];
const topButton = document.querySelector("#topButton");
const lampNavButtons = [...document.querySelectorAll("[data-lamp-index]")];
const WALK_FRAME_COUNT = 4;
const WALK_CYCLE_COUNT = 9;
const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 900;
const SITE_OPENED_AT_KEY = "group-i-site-opened-at";
const TOP_IMAGE_SWITCH_DELAY = 30000;
const BACKGROUND_IMAGE_URLS = ["images/top/building.webp"];

let distance = 1;
let trackDistance = 1;
let transitionDistance = 1;
let canvasScale = 1;
let canvasWidth = CANVAS_WIDTH;
let horizontalStart = 0;
let previousProgress = 0;
let walkingBackward = false;
let ticking = false;
let isNavigatingToDetail = false;
let navigationFrame = 0;
let lampTrackOffsets = [];
let lampImageTrackBounds = [];
let introTrackRight = 0;
let walkerMetrics = null;
let activeNavigationIndex = null;
let activeWalkingImage = document.querySelector(".walker__pose.is-active");
let pageReady = false;
let directionInputEnabled = false;

walker.classList.remove("is-walking-backward");

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function updateCanvasScale() {
  canvasScale = window.innerHeight / CANVAS_HEIGHT;
  canvasWidth = window.innerWidth / canvasScale;
  root.style.setProperty("--canvas-scale", canvasScale.toFixed(6));
  root.style.setProperty("--canvas-width", `${canvasWidth.toFixed(2)}px`);
}

updateCanvasScale();

function getSiteOpenedAt() {
  try {
    const savedTime = Number(sessionStorage.getItem(SITE_OPENED_AT_KEY));

    if (Number.isFinite(savedTime) && savedTime > 0) {
      return savedTime;
    }

    const openedAt = Date.now();
    sessionStorage.setItem(SITE_OPENED_AT_KEY, String(openedAt));
    return openedAt;
  } catch {
    return Date.now();
  }
}

function scheduleOpeningImageChange() {
  const elapsedTime = Date.now() - getSiteOpenedAt();
  const remainingTime = Math.max(TOP_IMAGE_SWITCH_DELAY - elapsedTime, 0);

  if (remainingTime === 0) {
    opening?.classList.add("is-later-image");
    return;
  }

  window.setTimeout(() => {
    opening?.classList.add("is-later-image");
  }, remainingTime);
}

function getContainedImageBox(image) {
  const boxWidth = image.offsetWidth;
  const boxHeight = image.offsetHeight;
  const naturalWidth = image.naturalWidth || boxWidth;
  const naturalHeight = image.naturalHeight || boxHeight;
  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    left: image.offsetLeft + (boxWidth - width) / 2,
    top: image.offsetTop + boxHeight - height,
    right: image.offsetLeft + (boxWidth + width) / 2,
    width,
    height,
  };
}

function measure() {
  updateCanvasScale();
  trackDistance = Math.max(track.scrollWidth - canvasWidth, 1);
  distance = trackDistance * canvasScale;
  transitionDistance = CANVAS_HEIGHT * canvasScale;
  horizontal.style.height = `${transitionDistance + distance + window.innerHeight}px`;
  horizontalStart = horizontal.offsetTop;
  lampTrackOffsets = lamps.map((lamp) => {
    const focusX = Number(lamp.dataset.focusX || 0.5);
    const lampPosition = lamp.offsetLeft + lamp.offsetWidth * focusX;

    return clamp(lampPosition - canvasWidth / 2, 0, trackDistance);
  });

  introTrackRight = introScene.offsetLeft + introScene.offsetWidth;
  walkerMetrics = {
    left: walker.offsetLeft,
    width: walker.offsetWidth,
    height: walker.offsetHeight,
  };

  lampImageTrackBounds = lamps.map((lamp) => {
    const image = lamp.querySelector(".lamp__image--off");
    if (!image) return null;

    const imageBox = getContainedImageBox(image);
    return {
      left: lamp.offsetLeft + imageBox.left,
      right: lamp.offsetLeft + imageBox.right,
    };
  });
}

function positionCallouts() {
  const baseCalloutWidth = clamp(CANVAS_HEIGHT * 0.25, 170, 260);
  const visibleCalloutWidth = baseCalloutWidth * 1.5;
  const referenceLamp = document.querySelector(".lamp--4");
  const referenceLampImage = referenceLamp?.querySelector(".lamp__image--off");
  const referenceCalloutImage = referenceLamp?.querySelector(
    ".lamp__callout-image",
  );
  let alignedCalloutCenter = null;

  if (referenceLampImage && referenceCalloutImage) {
    const referenceLampBox = getContainedImageBox(referenceLampImage);
    const referenceAnchorHeight =
      baseCalloutWidth *
      (referenceCalloutImage.naturalHeight / referenceCalloutImage.naturalWidth);
    const referenceVisibleHeight =
      visibleCalloutWidth *
      (referenceCalloutImage.naturalHeight / referenceCalloutImage.naturalWidth);
    const referenceTop =
      referenceLamp.offsetTop +
      referenceLampBox.top -
      referenceAnchorHeight * 0.46;

    alignedCalloutCenter = referenceTop + referenceVisibleHeight / 2;
  }

  lamps.forEach((lamp) => {
    const lampImage = lamp.querySelector(".lamp__image--off");
    const callout = lamp.querySelector(".lamp__callout");
    if (!lampImage || !callout) return;

    const lampBox = getContainedImageBox(lampImage);
    callout.style.left = `${lampBox.left}px`;

    const calloutImage = callout.querySelector(".lamp__callout-image");
    if (calloutImage) {
      const calloutScale = lamp.classList.contains("lamp--4") ? 1.25 : 1;
      const calloutWidth = visibleCalloutWidth * calloutScale;
      const calloutHeight =
        calloutWidth *
        (calloutImage.naturalHeight / calloutImage.naturalWidth);

      callout.style.width = `${calloutWidth}px`;
      callout.style.height = `${calloutHeight}px`;
      calloutImage.style.inset = "0";
      calloutImage.style.width = "100%";
      calloutImage.style.height = "100%";

      callout.style.top = `${
        alignedCalloutCenter === null
          ? lampBox.top
          : alignedCalloutCenter - calloutHeight / 2 - lamp.offsetTop
      }px`;
    }

    callout.classList.add("is-positioned");
  });
}

function getWalkerScreenBounds(walkingImage) {
  const naturalWidth = walkingImage.naturalWidth || walkerMetrics.width;
  const naturalHeight = walkingImage.naturalHeight || walkerMetrics.height;
  const scale = Math.min(
    walkerMetrics.width / naturalWidth,
    walkerMetrics.height / naturalHeight,
  );
  const imageWidth = naturalWidth * scale;
  const walkerLeft = walkingBackward
    ? canvasWidth - walkerMetrics.left - walkerMetrics.width
    : walkerMetrics.left;
  const left = walkerLeft + (walkerMetrics.width - imageWidth) / 2;

  return { left, right: left + imageWidth };
}

function isWithinLampRange(walkerBounds, lampBounds, trackOffset) {
  if (!lampBounds) return false;

  const lampLeft = lampBounds.left - trackOffset;
  const lampRight = lampBounds.right - trackOffset;
  return (
    lampLeft - walkerBounds.right <= 100 &&
    walkerBounds.left <= lampRight
  );
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
  const trackOffset = progress * trackDistance;
  const step = Math.floor(progress * WALK_FRAME_COUNT * WALK_CYCLE_COUNT);
  const frameIndex = step % WALK_FRAME_COUNT;
  const bob = Math.sin(progress * Math.PI * 18) * 4;
  const movement = (progress - previousProgress) * trackDistance;

  if (directionInputEnabled && Math.abs(movement) >= 0.5) {
    walkingBackward = movement < 0;
  }
  previousProgress = progress;

  root.style.setProperty(
    "--panel-x",
    `${
      ((1 - reveal) *
        (canvasWidth + CANVAS_HEIGHT * 0.5)).toFixed(2)
    }px`,
  );
  root.style.setProperty("--track-x", `${(-trackOffset).toFixed(2)}px`);
  root.style.setProperty("--walker-bob", `${bob.toFixed(2)}px`);
  walker.classList.toggle("is-walking-backward", walkingBackward);
  updateNavigation(localScroll, trackOffset);

  const provisionalImage =
    introTrackRight - trackOffset < walkerMetrics.left
      ? frontImages[frameIndex]
      : phoneImages[frameIndex];
  const provisionalBounds = getWalkerScreenBounds(provisionalImage);
  const hasPassedIntro =
    introTrackRight - trackOffset < provisionalBounds.left;
  const currentWalkingImage = hasPassedIntro
    ? frontImages[frameIndex]
    : phoneImages[frameIndex];

  walker.classList.toggle("has-passed-intro", hasPassedIntro);

  const currentWalkerBounds = getWalkerScreenBounds(currentWalkingImage);
  const shouldLookUp = lampImageTrackBounds.some((lampBounds) =>
    isWithinLampRange(currentWalkerBounds, lampBounds, trackOffset),
  );

  walker.classList.toggle("is-looking-up", shouldLookUp);

  const activeImages = shouldLookUp
    ? upImages
    : hasPassedIntro
      ? frontImages
      : phoneImages;

  const nextWalkingImage = activeImages[frameIndex];
  if (nextWalkingImage !== activeWalkingImage) {
    activeWalkingImage?.classList.remove("is-active");
    nextWalkingImage.classList.add("is-active");
    activeWalkingImage = nextWalkingImage;
  }

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
    lamp.offsetLeft + lamp.offsetWidth * focusX - canvasWidth / 2,
    0,
    trackDistance,
  );
}

function updateNavigation(localScroll, trackOffset) {
  const isTopActive = localScroll < transitionDistance;
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

  const nextNavigationIndex = isTopActive ? 0 : activeLampIndex + 1;
  if (nextNavigationIndex === activeNavigationIndex) return;
  activeNavigationIndex = nextNavigationIndex;

  topButton.classList.toggle("is-active", isTopActive);

  if (isTopActive) {
    topButton.setAttribute("aria-current", "location");
  } else {
    topButton.removeAttribute("aria-current");
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
    return;
  }

  const duration = clamp(
    450 + Math.sqrt(Math.abs(scrollDistance)) * 12,
    550,
    2200,
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
  }

  navigationFrame = requestAnimationFrame(animateFrame);
}

function scrollToLamp(lampIndex, behavior = "smooth") {
  const lamp = lamps[lampIndex - 1];
  if (!lamp || !pageReady) return;

  const centeredTrackOffset = getLampTrackOffset(lamp);
  const targetScroll =
    horizontalStart + transitionDistance + centeredTrackOffset * canvasScale;

  animateScrollTo(targetScroll, behavior);
}

topButton.addEventListener("click", () => {
  if (!pageReady) return;
  directionInputEnabled = true;
  animateScrollTo(0);
});

lampNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    directionInputEnabled = true;
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

window.addEventListener("scroll", requestRender, { passive: true });
window.addEventListener(
  "wheel",
  () => {
    directionInputEnabled = true;
    cancelNavigationScroll();
  },
  { passive: true },
);
window.addEventListener(
  "touchstart",
  () => {
    directionInputEnabled = true;
    cancelNavigationScroll();
  },
  { passive: true },
);
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
    directionInputEnabled = true;
    cancelNavigationScroll();
  }
});
window.addEventListener("resize", () => {
  if (!pageReady) {
    updateCanvasScale();
    return;
  }

  const previousLocalScroll = Math.max(window.scrollY - horizontalStart, 0);
  const wasInReveal = previousLocalScroll < transitionDistance;
  const previousReveal = clamp(previousLocalScroll / transitionDistance);
  const previousTrackProgress = clamp(
    (previousLocalScroll - transitionDistance) / distance,
  );

  cancelNavigationScroll();
  measure();

  const resizedScroll =
    wasInReveal
      ? horizontalStart + previousReveal * transitionDistance
      : horizontalStart +
        transitionDistance +
        previousTrackProgress * distance;

  window.scrollTo({ top: resizedScroll, behavior: "auto" });
  positionCallouts();
  render();
});
async function decodeTopImages() {
  const backgroundImages = BACKGROUND_IMAGE_URLS.map((url) => {
    const image = new Image();
    image.src = url;
    return image;
  });

  await Promise.allSettled(
    [...document.images, ...backgroundImages].map((image) => {
      if (typeof image.decode === "function") return image.decode();
      if (image.complete) return Promise.resolve();

      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }),
  );
}

async function initializePage() {
  await decodeTopImages();
  if (document.fonts?.ready) await document.fonts.ready;

  measure();
  positionCallouts();
  pageReady = true;
  render();

  const requestedLamp = Number(
    new URLSearchParams(window.location.search).get("streetlight"),
  );

  if (requestedLamp >= 1 && requestedLamp <= lamps.length) {
    scrollToLamp(requestedLamp, "auto");
    render();
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("is-preparing");
      document.body.removeAttribute("aria-busy");
    });
  });
}

scheduleOpeningImageChange();
initializePage();
