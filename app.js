const $ = (selector) => document.querySelector(selector);
const uid = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const MAX_MEDIA_FILES = 250;
const DEFAULT_TITLE_COLOR = "#050505";
const DEFAULT_TITLE_TEXT_COLOR = "#ffffff";
const MEDIA_EXTENSIONS = {
  video: new Set(["mp4", "mov", "m4v", "webm", "ogv", "avi"]),
  image: new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"]),
};

const elements = {
  mediaList: $("#mediaList"),
  mediaCount: $("#mediaCount"),
  sceneLayer: $("#sceneLayer"),
  connections: $("#connections"),
  canvasHint: $("#canvasHint"),
  canvasViewport: $("#canvasViewport"),
  canvasGrid: $(".canvas-grid"),
  zoomLabel: $("#zoomLabel"),
  projectTitle: $("#projectTitle"),
  emptyInspector: $("#emptyInspector"),
  sceneInspector: $("#sceneInspector"),
  sceneTitle: $("#sceneTitle"),
  sceneMedia: $("#sceneMedia"),
  videoPlaybackOptions: $("#videoPlaybackOptions"),
  imagePlaybackOptions: $("#imagePlaybackOptions"),
  timedImageOptions: $("#timedImageOptions"),
  playbackUnavailable: $("#playbackUnavailable"),
  stillDuration: $("#stillDuration"),
  timedTargetScene: $("#timedTargetScene"),
  overlayList: $("#overlayList"),
  startSceneToggle: $("#startSceneToggle"),
  welcomeDialog: $("#welcomeDialog"),
  previewDialog: $("#previewDialog"),
  overlayDialog: $("#overlayDialog"),
  titleDialog: $("#titleDialog"),
  trimDialog: $("#trimDialog"),
  trimVideo: $("#trimVideo"),
  trimStartRange: $("#trimStartRange"),
  trimEndRange: $("#trimEndRange"),
  trimStartLabel: $("#trimStartLabel"),
  trimEndLabel: $("#trimEndLabel"),
  playerVideo: $("#playerVideo"),
  playerImage: $("#playerImage"),
  playerPlaceholder: $("#playerPlaceholder"),
  playerOverlays: $("#playerOverlays"),
  mediaRemovalDialog: $("#mediaRemovalDialog"),
  saveFailedDialog: $("#saveFailedDialog"),
  projectJsonDialog: $("#projectJsonDialog"),
  openProjectDialog: $("#openProjectDialog"),
  pasteProjectDialog: $("#pasteProjectDialog"),
  shareProjectDialog: $("#shareProjectDialog"),
  mediaContextMenu: $("#mediaContextMenu"),
  sceneContextMenu: $("#sceneContextMenu"),
  toast: $("#toast"),
};

const blankProject = () => ({
  version: 1,
  title: "My branching story",
  startSceneId: null,
  scenes: [],
  mediaManifest: [],
});

let project = blankProject();
let media = new Map();
let selectedSceneId = null;
let editingOverlayId = null;
let previewSceneId = null;
let stillTimer = null;
let toastTimer = null;
let pendingMediaRemovalId = null;
let contextMediaId = null;
let contextSceneId = null;
let trimmingSceneId = null;
let projectFileHandle = null;
let savedProjectTitle = null;
let latestProjectJson = "";
const view = { x: 0, y: 0, zoom: 1 };
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;

function makeSample() {
  const intro = "sample-intro";
  const forest = "sample-forest";
  const lighthouse = "sample-lighthouse";
  const end = "sample-end";
  return {
    version: 1,
    title: "The Lantern at Low Tide",
    startSceneId: intro,
    mediaManifest: [],
    scenes: [
      {
        id: intro, title: "A light in the distance", mediaId: null, playback: "hold",
        imagePlayback: "still", stillDuration: 5, timedTargetSceneId: null, x: 70, y: 175,
        overlays: [
          { id: uid("overlay"), type: "text", text: "At dusk, you see a light across the bay.", x: "center", y: "top", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Take the forest path", x: "left", y: "bottom", targetSceneId: forest },
          { id: uid("overlay"), type: "choice", text: "Walk toward the lighthouse", x: "right", y: "bottom", targetSceneId: lighthouse },
        ],
      },
      {
        id: forest, title: "The forest path", mediaId: null, playback: "loop",
        imagePlayback: "still", stillDuration: 5, timedTargetSceneId: null, x: 330, y: 70,
        overlays: [
          { id: uid("overlay"), type: "text", text: "The trees whisper your name.", x: "center", y: "top", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Follow the sound", x: "center", y: "bottom", targetSceneId: end },
        ],
      },
      {
        id: lighthouse, title: "The lighthouse door", mediaId: null, playback: "hold",
        imagePlayback: "still", stillDuration: 5, timedTargetSceneId: null, x: 330, y: 290,
        overlays: [
          { id: uid("overlay"), type: "text", text: "The door is already open.", x: "center", y: "top", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Step inside", x: "center", y: "bottom", targetSceneId: end },
        ],
      },
      {
        id: end, title: "The lantern keeper", mediaId: null, playback: "hold",
        imagePlayback: "still", stillDuration: 5, timedTargetSceneId: null, x: 555, y: 180,
        overlays: [
          { id: uid("overlay"), type: "text", text: "Some stories were waiting for you.", x: "center", y: "center", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Begin again", x: "center", y: "bottom", targetSceneId: intro },
        ],
      },
    ],
  };
}

function sceneById(id) {
  return project.scenes.find((scene) => scene.id === id);
}

function sceneIndex(id) {
  return project.scenes.findIndex((scene) => scene.id === id);
}

function nextSceneAfter(id) {
  const index = sceneIndex(id);
  return index >= 0 ? project.scenes[index + 1] || null : null;
}

function hasChoiceButton(scene) {
  return Boolean(scene?.overlays?.some((overlay) => overlay.type === "choice"));
}

function afterPlaybackDestination(scene) {
  return scene?.overlays?.find((overlay) => overlay.type === "destination" && overlay.targetSceneId) || null;
}

function isTitleScene(scene) {
  return scene?.kind === "title" && !scene.mediaId;
}

function titleColor(scene) {
  return /^#[0-9a-f]{6}$/i.test(scene?.titleColor || "") ? scene.titleColor : DEFAULT_TITLE_COLOR;
}

function titleTextColor(scene) {
  return /^#[0-9a-f]{6}$/i.test(scene?.titleTextColor || "") ? scene.titleTextColor : DEFAULT_TITLE_TEXT_COLOR;
}

function sceneMediaItem(scene) {
  return mediaById(scene?.mediaId) || project.mediaManifest.find((item) => item.id === scene?.mediaId) || null;
}

function isVideoScene(scene) {
  return sceneMediaItem(scene)?.type === "video";
}

function selectedScene() {
  return sceneById(selectedSceneId);
}

function mediaById(id) {
  return id ? media.get(id) : null;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else {
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
}

function normalizedTrim(scene, duration = null) {
  const videoDuration = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const start = Math.max(0, Number(scene?.trimStart) || 0);
  const rawEnd = Number(scene?.trimEnd);
  const end = Number.isFinite(rawEnd) && rawEnd > 0 ? Math.min(rawEnd, videoDuration) : videoDuration;
  return {
    start: Math.min(start, Math.max(0, end - 0.1)),
    end,
  };
}

function mediaType(file) {
  if (file.type?.startsWith("video/")) return "video";
  if (file.type?.startsWith("image/")) return "image";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (MEDIA_EXTENSIONS.video.has(extension)) return "video";
  if (MEDIA_EXTENSIONS.image.has(extension)) return "image";
  return null;
}

function manifestEntry(item) {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.size,
    lastModified: item.lastModified,
  };
}

async function addFiles(files) {
  const candidates = Array.from(files);
  if (!candidates.length) return;

  const folderButton = $("#folderButton");
  const originalFolderLabel = folderButton.innerHTML;
  folderButton.disabled = true;
  folderButton.innerHTML = `<span class="folder-icon" aria-hidden="true">…</span>
    <span><strong>Preparing your media</strong><small>Checking files without uploading them</small></span>`;

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const supported = candidates.filter((file) => mediaType(file));
  const accepted = supported.slice(0, MAX_MEDIA_FILES);

  try {
    for (let index = 0; index < accepted.length; index += 1) {
      const file = accepted[index];
      const type = mediaType(file);
      const relativePath = file.webkitRelativePath || file.name;
      try {
        const existingManifest = project.mediaManifest.find(
          (item) => item.path === relativePath || item.name === file.name,
        );
        const id = existingManifest?.id || uid("media");
        const old = media.get(id);
        if (old?.url) URL.revokeObjectURL(old.url);
        const item = {
          id,
          name: file.name,
          path: relativePath,
          type,
          size: file.size,
          lastModified: file.lastModified,
          file,
          url: URL.createObjectURL(file),
        };
        media.set(id, item);
        if (existingManifest) Object.assign(existingManifest, manifestEntry(item));
        else project.mediaManifest.push(manifestEntry(item));
        added += 1;
      } catch (error) {
        failed += 1;
        console.warn(`Could not prepare ${file.name}`, error);
      }

      // Give the browser a chance to paint and respond during large imports.
      if (index > 0 && index % 25 === 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  } finally {
    folderButton.disabled = false;
    folderButton.innerHTML = originalFolderLabel;
  }

  skipped = candidates.length - supported.length + Math.max(0, supported.length - accepted.length);
  render();
  if (added) {
    const details = [
      `${added} media ${added === 1 ? "file" : "files"} ready`,
      skipped ? `${skipped} skipped` : "",
      failed ? `${failed} could not be read` : "",
    ].filter(Boolean);
    showToast(details.join(" · "));
  } else {
    showToast("No supported video or image files were found");
  }
}

function renderMedia() {
  hideMediaContextMenu();
  const missingCount = project.mediaManifest.filter((entry) => !mediaById(entry.id)?.url).length;
  elements.mediaCount.textContent = `${project.mediaManifest.length} ${project.mediaManifest.length === 1 ? "item" : "items"}${missingCount ? ` · ${missingCount} missing` : ""}`;
  if (!project.mediaManifest.length) {
    elements.mediaList.innerHTML = `<div class="media-empty">Your clips and stills will appear here.<br />Nothing leaves this browser.</div>`;
    return;
  }
  elements.mediaList.innerHTML = project.mediaManifest.map((entry) => {
    const isMissing = !mediaById(entry.id)?.url;
    // Avoid decoding every large movie or photograph in a selected folder.
    // The real media is only opened when a student places it in a scene.
    const preview = `<div class="media-thumb type-icon ${entry.type} ${isMissing ? "missing" : ""}" aria-hidden="true">
      ${isMissing ? "?" : entry.type === "video" ? "▶" : "▧"}
    </div>`;
    const missingAttributes = isMissing
      ? `data-missing-media="${entry.id}" role="button" tabindex="0" aria-label="${escapeHtml(entry.name)} is missing. Click to manage."`
      : "";
    return `<div class="media-item ${isMissing ? "missing" : ""}" draggable="true" data-media-id="${entry.id}" ${missingAttributes}>
      ${preview}
      <div class="media-meta"><strong title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</strong><small>${isMissing ? "Missing · click to manage" : `${entry.type} · ${formatBytes(entry.size)}`}</small></div>
      <div class="media-item-actions">
        ${isMissing ? "" : `<button class="media-add" data-add-media="${entry.id}" title="Add as scene" aria-label="Add ${escapeHtml(entry.name)} as a scene">+</button>`}
        <button class="media-remove" data-remove-media="${entry.id}" title="Remove from project" aria-label="Remove ${escapeHtml(entry.name)} from project">×</button>
      </div>
    </div>`;
  }).join("");
  elements.mediaList.querySelectorAll("[data-media-id]").forEach((el) => {
    el.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("application/x-branchroom-media-order", el.dataset.mediaId);
      if (!el.classList.contains("missing")) event.dataTransfer.setData("text/media-id", el.dataset.mediaId);
      requestAnimationFrame(() => el.classList.add("dragging"));
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      clearMediaDropIndicators();
    });
  });
}

function clearMediaDropIndicators() {
  elements.mediaList.querySelectorAll(".drop-before, .drop-after").forEach((item) => {
    item.classList.remove("drop-before", "drop-after");
  });
}

function mediaDropPosition(event, target) {
  if (!target) return "after";
  const rect = target.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function reorderMedia(sourceId, targetId, position) {
  const sourceIndex = project.mediaManifest.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0) return;
  const [source] = project.mediaManifest.splice(sourceIndex, 1);
  let targetIndex = targetId
    ? project.mediaManifest.findIndex((item) => item.id === targetId)
    : project.mediaManifest.length - 1;
  if (targetIndex < 0) targetIndex = project.mediaManifest.length;
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  project.mediaManifest.splice(Math.min(insertIndex, project.mediaManifest.length), 0, source);
  renderMedia();
}

function hideMediaContextMenu() {
  contextMediaId = null;
  elements.mediaContextMenu.classList.add("hidden");
}

function hideSceneContextMenu() {
  contextSceneId = null;
  elements.sceneContextMenu.classList.add("hidden");
}

function positionContextMenu(menu, event) {
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const left = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
  const top = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function showMediaContextMenu(event, mediaId) {
  event.preventDefault();
  hideSceneContextMenu();
  contextMediaId = mediaId;
  elements.mediaContextMenu.classList.remove("hidden");
  positionContextMenu(elements.mediaContextMenu, event);
  $("#contextDeleteMediaButton").focus();
}

function showSceneContextMenu(event, sceneId) {
  event.preventDefault();
  hideMediaContextMenu();
  selectScene(sceneId);
  contextSceneId = sceneId;
  const canTrim = mediaById(sceneById(sceneId)?.mediaId)?.type === "video";
  $("#contextTrimSceneButton").classList.toggle("hidden", !canTrim);
  elements.sceneContextMenu.classList.remove("hidden");
  positionContextMenu(elements.sceneContextMenu, event);
  (canTrim ? $("#contextTrimSceneButton") : $("#contextDeleteSceneButton")).focus();
}

function updateTrimLabels() {
  elements.trimStartLabel.textContent = formatTime(elements.trimStartRange.value);
  elements.trimEndLabel.textContent = formatTime(elements.trimEndRange.value);
}

function setTrimControls(start, end, duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safeStart = Math.max(0, Math.min(Number(start) || 0, Math.max(0, safeDuration - 0.1)));
  const safeEnd = Math.max(safeStart + 0.1, Math.min(Number(end) || safeDuration, safeDuration));
  for (const range of [elements.trimStartRange, elements.trimEndRange]) {
    range.min = "0";
    range.max = String(safeDuration);
    range.step = "0.01";
  }
  elements.trimStartRange.value = String(safeStart);
  elements.trimEndRange.value = String(safeEnd);
  updateTrimLabels();
}

function seekTrimPreview(time) {
  const next = Math.max(0, Number(time) || 0);
  elements.trimVideo.pause();
  if (Number.isFinite(next)) elements.trimVideo.currentTime = next;
}

function updateTrimFromSlider(changed) {
  const duration = Number(elements.trimVideo.duration) || 0;
  let start = Number(elements.trimStartRange.value) || 0;
  let end = Number(elements.trimEndRange.value) || duration;
  if (start >= end) {
    if (changed === "start") start = Math.max(0, end - 0.1);
    else end = Math.min(duration, start + 0.1);
  }
  setTrimControls(start, end, duration);
  seekTrimPreview(changed === "end" ? end : start);
}

function openTrimDialog(sceneId) {
  const scene = sceneById(sceneId);
  const item = mediaById(scene?.mediaId);
  if (!scene || item?.type !== "video") {
    showToast("Link a video file before setting a playback range");
    return;
  }
  trimmingSceneId = scene.id;
  $("#trimDialogTitle").textContent = `Set range: ${scene.title}`;
  setTrimControls(0, 0, 0);
  elements.trimVideo.onloadedmetadata = () => {
    const duration = elements.trimVideo.duration || 0;
    const trim = normalizedTrim(scene, duration);
    setTrimControls(trim.start, trim.end === Infinity ? duration : trim.end, duration);
    seekTrimPreview(trim.start);
  };
  elements.trimVideo.src = item.url;
  elements.trimVideo.currentTime = 0;
  openDialog(elements.trimDialog);
}

function resetTrimDialog() {
  const duration = Number(elements.trimVideo.duration) || 0;
  setTrimControls(0, duration, duration);
  seekTrimPreview(0);
}

function applyTrimDialog() {
  const scene = sceneById(trimmingSceneId);
  if (!scene) return;
  const duration = Number(elements.trimVideo.duration) || 0;
  const start = Math.max(0, Number(elements.trimStartRange.value) || 0);
  const end = Math.min(duration, Number(elements.trimEndRange.value) || duration);
  scene.trimStart = start;
  scene.trimEnd = end >= duration - 0.05 ? null : end;
  closeDialog(elements.trimDialog);
  renderScenes();
  showToast(scene.trimEnd == null && start === 0 ? "Playback range reset" : "Playback range applied");
}

function closeTrimDialog() {
  closeDialog(elements.trimDialog);
}

function openMediaRemovalDialog(mediaId) {
  const entry = project.mediaManifest.find((item) => item.id === mediaId);
  if (!entry) return;
  pendingMediaRemovalId = mediaId;
  const isMissing = !mediaById(mediaId)?.url;
  const usedScenes = project.scenes.filter((scene) => scene.mediaId === mediaId);

  $("#mediaRemovalEyebrow").textContent = isMissing ? "Missing media" : "Media library";
  $("#mediaRemovalTitle").textContent = isMissing ? "This file is missing" : "Remove this file?";
  $("#mediaRemovalName").textContent = entry.name;
  $("#mediaRemovalStatus").textContent = isMissing
    ? "It was saved with the project but is not currently linked."
    : `${entry.type} · ${formatBytes(entry.size)}`;
  $("#mediaRemovalMessage").textContent = usedScenes.length
    ? `Removing it will unlink ${usedScenes.length} ${usedScenes.length === 1 ? "scene" : "scenes"}. The scenes themselves will remain in your story.`
    : "Removing it will take this item out of the project. The original file on your computer will not be deleted.";
  elements.mediaRemovalDialog.classList.toggle("is-missing", isMissing);
  openDialog(elements.mediaRemovalDialog);
}

function removeMediaFromProject() {
  const mediaId = pendingMediaRemovalId;
  const entry = project.mediaManifest.find((item) => item.id === mediaId);
  if (!mediaId || !entry) return;

  const linkedItem = mediaById(mediaId);
  if (linkedItem?.url) URL.revokeObjectURL(linkedItem.url);
  media.delete(mediaId);
  project.mediaManifest = project.mediaManifest.filter((item) => item.id !== mediaId);
  project.scenes.forEach((scene) => {
    if (scene.mediaId === mediaId) scene.mediaId = null;
  });
  pendingMediaRemovalId = null;
  closeDialog(elements.mediaRemovalDialog);
  render();
  showToast(`${entry.name} removed from the project`);
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function sceneRole(scene) {
  if (scene.id === project.startSceneId) return "start";
  if (scene.overlays.some((overlay) => overlay.type === "choice")) return "choice";
  return "ending";
}

function renderScenes() {
  hideSceneContextMenu();
  elements.canvasHint.classList.toggle("hidden", project.scenes.length > 0);
  elements.sceneLayer.innerHTML = project.scenes.map((scene) => {
    const item = mediaById(scene.mediaId);
    const customProperties = isTitleScene(scene)
      ? `--title-color:${titleColor(scene)};--title-text-color:${titleTextColor(scene)};`
      : "";
    let thumb = isTitleScene(scene)
      ? `<div class="scene-thumb title-thumb"><span>${escapeHtml(scene.title)}</span></div>`
      : `<div class="scene-thumb placeholder"><span>${sceneRole(scene) === "ending" ? "FIN" : "BR"}</span></div>`;
    if (item?.url) {
      thumb = item.type === "image"
        ? `<div class="scene-thumb"><img src="${item.url}" alt="" /></div>`
        : `<div class="scene-thumb"><video src="${item.url}" muted preload="metadata"></video></div>`;
    }
    const choices = scene.overlays.filter((overlay) => overlay.type === "choice").length;
    const cardType = isTitleScene(scene) ? "title-card" : "";
    const sceneTypeLabel = isTitleScene(scene) ? "title" : item ? item.type : "Unlinked media";
    return `<article class="scene-card ${cardType} ${selectedSceneId === scene.id ? "selected" : ""} ${scene.id === project.startSceneId ? "start-card" : ""}"
      data-scene-id="${scene.id}" style="left:${scene.x}px;top:${scene.y}px;${customProperties}">
      ${thumb}
      <div class="scene-body">
        <strong>${escapeHtml(scene.title)}</strong>
        <small><span>${sceneTypeLabel}</span><span>${choices} ${choices === 1 ? "choice" : "choices"}</span></small>
      </div>
      <i class="scene-output"></i>
    </article>`;
  }).join("");
  elements.sceneLayer.querySelectorAll(".scene-card").forEach(enableSceneDrag);
  applyCanvasTransform();
  requestAnimationFrame(renderConnections);
}

function updateSceneSelection(id) {
  selectedSceneId = id;
  elements.sceneLayer.querySelectorAll(".scene-card").forEach((item) => {
    item.classList.toggle("selected", item.dataset.sceneId === id);
  });
  renderInspector();
  renderConnections();
}

function enableSceneDrag(card) {
  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    updateSceneSelection(card.dataset.sceneId);
    const scene = sceneById(card.dataset.sceneId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = scene.x;
    const originalY = scene.y;
    card.classList.add("dragging");
    try {
      card.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers reject pointer capture for synthetic or interrupted clicks.
    }
    const move = (moveEvent) => {
      scene.x = originalX + (moveEvent.clientX - startX) / view.zoom;
      scene.y = originalY + (moveEvent.clientY - startY) / view.zoom;
      card.style.left = `${scene.x}px`;
      card.style.top = `${scene.y}px`;
      renderConnections();
    };
    const up = () => {
      card.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

function applyCanvasTransform() {
  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  elements.sceneLayer.style.transform = transform;
  elements.connections.style.transform = transform;
  elements.canvasGrid.style.backgroundSize = `${22 * view.zoom}px ${22 * view.zoom}px`;
  elements.canvasGrid.style.backgroundPosition = `${view.x}px ${view.y}px`;
  elements.zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`;
}

function setZoom(nextZoom, anchorX = null, anchorY = null) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  if (zoom === view.zoom) return;
  const rect = elements.canvasViewport.getBoundingClientRect();
  const x = anchorX ?? rect.width / 2;
  const y = anchorY ?? rect.height / 2;
  const worldX = (x - view.x) / view.zoom;
  const worldY = (y - view.y) / view.zoom;
  view.zoom = zoom;
  view.x = x - worldX * zoom;
  view.y = y - worldY * zoom;
  applyCanvasTransform();
}

function resetCanvasView() {
  view.x = 0;
  view.y = 0;
  view.zoom = 1;
  applyCanvasTransform();
}

function renderConnections() {
  const viewport = $("#canvasViewport").getBoundingClientRect();
  elements.connections.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
  const paths = [];
  for (const scene of project.scenes) {
    for (const overlay of scene.overlays.filter((item) => ["choice", "destination"].includes(item.type) && item.targetSceneId)) {
      const target = sceneById(overlay.targetSceneId);
      if (!target) continue;
      const x1 = scene.x + 168;
      const y1 = scene.y + 96;
      const x2 = target.x;
      const y2 = target.y + 54;
      const curve = Math.max(60, Math.abs(x2 - x1) * .45);
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 5;
      const isDestination = overlay.type === "destination";
      const lineClass = `connection-line ${isDestination ? "destination" : ""} ${selectedSceneId === scene.id ? "selected" : ""}`;
      const labelClass = `connection-label ${isDestination ? "destination" : ""}`;
      const label = isDestination ? "After playback" : overlay.text.slice(0, 24);
      paths.push(`<path class="${lineClass}" d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}" />`);
      paths.push(`<text class="${labelClass}" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(label)}</text>`);
    }
    const sceneMedia = mediaById(scene.mediaId) || project.mediaManifest.find((item) => item.id === scene.mediaId);
    if (sceneMedia?.type === "image" && scene.imagePlayback === "timed" && scene.timedTargetSceneId) {
      const target = sceneById(scene.timedTargetSceneId);
      if (!target) continue;
      const x1 = scene.x + 168;
      const y1 = scene.y + 35;
      const x2 = target.x;
      const y2 = target.y + 35;
      const curve = Math.max(60, Math.abs(x2 - x1) * .45);
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 7;
      paths.push(`<path class="connection-line timed ${selectedSceneId === scene.id ? "selected" : ""}" d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}" />`);
      paths.push(`<text class="connection-label timed" x="${labelX}" y="${labelY}" text-anchor="middle">After ${Math.max(1, Number(scene.stillDuration) || 5)}s</text>`);
    }
  }
  elements.connections.innerHTML = paths.join("");
}

function renderInspector() {
  const scene = selectedScene();
  elements.emptyInspector.classList.toggle("hidden", Boolean(scene));
  elements.sceneInspector.classList.toggle("hidden", !scene);
  if (!scene) return;
  elements.sceneTitle.value = scene.title;
  elements.sceneMedia.innerHTML = `<option value="">— No media linked —</option>${project.mediaManifest.map((item) =>
    `<option value="${item.id}" ${item.id === scene.mediaId ? "selected" : ""} ${mediaById(item.id)?.url ? "" : "disabled"}>${escapeHtml(item.name)}${mediaById(item.id)?.url ? "" : " (missing)"}</option>`
  ).join("")}`;
  const item = mediaById(scene.mediaId) || project.mediaManifest.find((entry) => entry.id === scene.mediaId);
  const isVideo = item?.type === "video";
  const isImage = item?.type === "image";
  if (!["hold", "loop"].includes(scene.playback)) scene.playback = "hold";
  if (!["still", "timed"].includes(scene.imagePlayback)) scene.imagePlayback = "still";
  document.querySelectorAll('input[name="playback"]').forEach((radio) => { radio.checked = radio.value === scene.playback; });
  document.querySelectorAll('input[name="imagePlayback"]').forEach((radio) => { radio.checked = radio.value === scene.imagePlayback; });
  elements.videoPlaybackOptions.classList.toggle("hidden", !isVideo);
  elements.imagePlaybackOptions.classList.toggle("hidden", !isImage);
  elements.playbackUnavailable.classList.toggle("hidden", isVideo || isImage);
  elements.timedImageOptions.classList.toggle("hidden", !isImage || scene.imagePlayback !== "timed");
  elements.stillDuration.value = scene.stillDuration || 5;
  elements.timedTargetScene.innerHTML = `<option value="">— Choose a scene —</option>${project.scenes.map((item) =>
    `<option value="${item.id}" ${item.id === scene.timedTargetSceneId ? "selected" : ""}>${escapeHtml(item.title)}</option>`
  ).join("")}`;
  elements.startSceneToggle.checked = project.startSceneId === scene.id;
  renderOverlayList(scene);
}

function renderOverlayList(scene) {
  if (!scene.overlays.length) {
    elements.overlayList.innerHTML = `<div class="media-empty" style="padding:14px">No overlays yet.</div>`;
    return;
  }
  elements.overlayList.innerHTML = scene.overlays.map((overlay) => {
    const target = sceneById(overlay.targetSceneId);
    const isDestination = overlay.type === "destination";
    const icon = overlay.type === "choice" ? "↗" : isDestination ? "⏭" : "T";
    const title = isDestination ? "After playback destination" : overlay.text;
    const detail = overlay.type === "choice"
      ? `Goes to: ${escapeHtml(target?.title || "Nowhere")}`
      : isDestination
        ? `After playback → ${escapeHtml(target?.title || "Nowhere")}`
        : "Text overlay";
    return `<div class="overlay-item" data-edit-overlay="${overlay.id}">
      <span class="overlay-kind ${isDestination ? "destination" : ""}">${icon}</span>
      <div><strong>${escapeHtml(title)}</strong><small>${detail}</small></div>
      <button type="button" class="overlay-delete" data-delete-overlay="${overlay.id}" title="Delete overlay">×</button>
    </div>`;
  }).join("");
}

function render() {
  elements.projectTitle.value = project.title;
  renderMedia();
  renderScenes();
  renderInspector();
}

function selectScene(id) {
  selectedSceneId = id;
  renderScenes();
  renderInspector();
}

function addScene(mediaId = null, position = {}, options = {}) {
  const item = project.mediaManifest.find((entry) => entry.id === mediaId);
  const count = project.scenes.length;
  const scene = {
    id: uid("scene"),
    kind: item ? "media" : "title",
    title: item ? item.name.replace(/\.[^.]+$/, "") : options.title || `Title ${count + 1}`,
    titleColor: item ? undefined : titleColor({ titleColor: options.titleColor }),
    titleTextColor: item ? undefined : titleTextColor({ titleTextColor: options.titleTextColor }),
    mediaId,
    playback: "hold",
    imagePlayback: "still",
    stillDuration: 5,
    timedTargetSceneId: null,
    trimStart: 0,
    trimEnd: null,
    x: position.x ?? 65 + (count % 3) * 225,
    y: position.y ?? 65 + Math.floor(count / 3) * 170,
    overlays: [],
  };
  project.scenes.push(scene);
  if (!project.startSceneId) project.startSceneId = scene.id;
  selectedSceneId = scene.id;
  render();
  return scene;
}

function openTitleDialog() {
  $("#titleCardText").value = "";
  $("#titleCardColor").value = DEFAULT_TITLE_COLOR;
  $("#titleCardTextColor").value = DEFAULT_TITLE_TEXT_COLOR;
  openDialog(elements.titleDialog);
  $("#titleCardText").focus();
}

function saveTitleCard(event) {
  event.preventDefault();
  const title = $("#titleCardText").value.trim() || `Title ${project.scenes.length + 1}`;
  const titleColorValue = $("#titleCardColor").value || DEFAULT_TITLE_COLOR;
  const titleTextColorValue = $("#titleCardTextColor").value || DEFAULT_TITLE_TEXT_COLOR;
  addScene(null, {}, { title, titleColor: titleColorValue, titleTextColor: titleTextColorValue });
  closeDialog(elements.titleDialog);
}

function removeScene() {
  const scene = selectedScene();
  if (!scene || !confirm(`Delete “${scene.title}”?`)) return;
  project.scenes = project.scenes.filter((item) => item.id !== scene.id);
  for (const item of project.scenes) {
    item.overlays.forEach((overlay) => {
      if (overlay.targetSceneId === scene.id) overlay.targetSceneId = null;
    });
    if (item.timedTargetSceneId === scene.id) item.timedTargetSceneId = null;
  }
  if (project.startSceneId === scene.id) project.startSceneId = project.scenes[0]?.id || null;
  selectedSceneId = project.scenes[0]?.id || null;
  render();
}

function openOverlayDialog(overlayId = null) {
  const scene = selectedScene();
  if (!scene) return;
  editingOverlayId = overlayId;
  const overlay = scene.overlays.find((item) => item.id === overlayId);
  $("#overlayDialogTitle").textContent = overlay ? "Edit overlay / destination" : "Add an overlay / destination";
  $("#confirmOverlayButton").textContent = overlay ? "Save changes" : "Add overlay / destination";
  $("#overlayType").value = overlay?.type || "choice";
  $("#overlayText").value = overlay?.text || "";
  $("#overlayX").value = overlay?.x || "center";
  $("#overlayY").value = overlay?.y || "bottom";
  $("#overlayTarget").innerHTML = `<option value="">— Choose a scene —</option>${project.scenes
    .filter((item) => item.id !== scene.id)
    .map((item) => `<option value="${item.id}" ${overlay?.targetSceneId === item.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}`;
  toggleOverlayTarget();
  openDialog(elements.overlayDialog);
}

function toggleOverlayTarget() {
  const type = $("#overlayType").value;
  const isText = type === "text";
  const isDestination = type === "destination";
  $("#overlayTargetRow").classList.toggle("hidden", isText);
  $("#overlayText").disabled = isDestination;
  $("#overlayText").required = !isDestination;
  $("#overlayText").placeholder = isDestination ? "No text appears on screen" : "e.g. Open the mysterious door";
  $("#overlayText").classList.toggle("muted-input", isDestination);
  $("#overlayX").disabled = isDestination;
  $("#overlayY").disabled = isDestination;
}

function saveOverlay(event) {
  event.preventDefault();
  const scene = selectedScene();
  const type = $("#overlayType").value;
  const text = type === "destination" ? "After playback destination" : $("#overlayText").value.trim();
  if (!scene || !text) return;
  const values = {
    type,
    text,
    targetSceneId: ["choice", "destination"].includes(type) ? $("#overlayTarget").value || null : null,
    x: $("#overlayX").value,
    y: $("#overlayY").value,
  };
  const existing = scene.overlays.find((item) => item.id === editingOverlayId);
  if (existing) Object.assign(existing, values);
  else scene.overlays.push({ id: uid("overlay"), ...values });
  closeDialog(elements.overlayDialog);
  render();
}

function serializeProject() {
  project.title = elements.projectTitle.value.trim() || "Untitled branching story";
  return {
    ...project,
    savedAt: new Date().toISOString(),
    mediaManifest: project.mediaManifest.map((item) => ({
      ...item,
      linkedAtSave: Boolean(mediaById(item.id)?.url),
    })),
  };
}

function projectFilename(title) {
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeTitle || "branchroom-project"}.branchroom.json`;
}

function downloadProjectFallback(payload, filename) {
  try {
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Project downloaded");
    return true;
  } catch (error) {
    console.warn("Project download failed.", error);
    return false;
  }
}

function currentProjectJson() {
  latestProjectJson = JSON.stringify(serializeProject(), null, 2);
  return latestProjectJson;
}

function openProjectJsonDialog({
  title = "Project data",
  eyebrow = "Project JSON",
  message = "This text records how the media files are assembled into the branching video. Copy it and save it as plain text if downloading is blocked.",
} = {}) {
  $("#projectJsonEyebrow").textContent = eyebrow;
  $("#projectJsonTitle").textContent = title;
  $("#projectJsonMessage").textContent = message;
  $("#projectJsonText").value = latestProjectJson || currentProjectJson();
  openDialog(elements.projectJsonDialog);
}

async function copyTextToClipboard(text, successMessage = "Copied") {
  if (!text) {
    showToast("Nothing to copy yet");
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.left = "-9999px";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    showToast(successMessage);
    return true;
  } catch (error) {
    console.warn("Copy failed.", error);
    showToast("Copy failed — select the JSON text and copy it manually");
    return false;
  }
}

function openSaveFailedDialog(payload) {
  latestProjectJson = payload || latestProjectJson || currentProjectJson();
  openDialog(elements.saveFailedDialog);
}

async function saveProject() {
  const payload = currentProjectJson();
  const filename = projectFilename(project.title);

  if ("showSaveFilePicker" in window) {
    try {
      const isExistingProject = projectFileHandle && savedProjectTitle === project.title;
      if (!isExistingProject) {
        projectFileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: "Branchroom project",
            accept: { "application/json": [".json"] },
          }],
        });
      }
      const writable = await projectFileHandle.createWritable();
      await writable.write(payload);
      await writable.close();
      savedProjectTitle = project.title;
      showToast(isExistingProject ? "Project updated" : "Project saved");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("Direct project saving is unavailable; using a download instead.", error);
    }
  }

  const didStartDownload = downloadProjectFallback(payload, filename);
  if (!didStartDownload) openSaveFailedDialog(payload);
}

function loadProjectData(parsed) {
  if (!Array.isArray(parsed.scenes)) throw new Error("Missing scenes");
  for (const item of media.values()) if (item.url) URL.revokeObjectURL(item.url);
  media = new Map();
  project = {
    version: parsed.version || 1,
    title: parsed.title || "Untitled branching story",
    startSceneId: parsed.startSceneId || parsed.scenes[0]?.id || null,
    scenes: parsed.scenes.map((scene) => ({
      ...scene,
      kind: scene.kind || (scene.mediaId ? "media" : "title"),
      titleColor: titleColor(scene),
      titleTextColor: titleTextColor(scene),
      playback: ["hold", "loop"].includes(scene.playback) ? scene.playback : "hold",
      imagePlayback: ["still", "timed"].includes(scene.imagePlayback) ? scene.imagePlayback : "still",
      stillDuration: Math.max(1, Number(scene.stillDuration) || 5),
      trimStart: Math.max(0, Number(scene.trimStart) || 0),
      trimEnd: Number.isFinite(Number(scene.trimEnd)) && Number(scene.trimEnd) > 0 ? Number(scene.trimEnd) : null,
      timedTargetSceneId: scene.timedTargetSceneId || null,
      overlays: scene.overlays || [],
    })),
    mediaManifest: parsed.mediaManifest || [],
  };
  selectedSceneId = project.startSceneId;
  projectFileHandle = null;
  savedProjectTitle = null;
  resetCanvasView();
  render();
}

async function loadProjectFile(file) {
  try {
    const parsed = JSON.parse(await file.text());
    loadProjectData(parsed);
    showToast("Project opened — relink its media folder");
  } catch {
    showToast("That does not look like a Branchroom project");
  }
}

function loadProjectJsonText(text) {
  try {
    loadProjectData(JSON.parse(text));
    closeDialog(elements.pasteProjectDialog);
    closeDialog(elements.openProjectDialog);
    showToast("Project opened — relink its media folder");
  } catch {
    showToast("That does not look like a Branchroom project");
  }
}

function openShareProjectDialog() {
  $("#shareProjectJsonText").value = currentProjectJson();
  openDialog(elements.shareProjectDialog);
}

function positionPercent(axis, value) {
  const table = axis === "x"
    ? { left: 20, center: 50, right: 80 }
    : { top: 18, center: 50, bottom: 82 };
  return table[value] ?? 50;
}

function startPreview() {
  if (!project.scenes.length) {
    showToast("Add at least one scene before previewing");
    return;
  }
  project.title = elements.projectTitle.value.trim() || project.title;
  $("#previewProjectTitle").textContent = project.title;
  openDialog(elements.previewDialog);
  playScene(project.startSceneId || project.scenes[0].id);
}

function playScene(id) {
  clearTimeout(stillTimer);
  elements.playerVideo.pause();
  elements.playerVideo.onloadedmetadata = null;
  elements.playerVideo.ontimeupdate = null;
  elements.playerVideo.removeAttribute("src");
  elements.playerVideo.load();
  elements.playerImage.removeAttribute("src");
  elements.playerVideo.style.display = "none";
  elements.playerImage.style.display = "none";
  elements.playerPlaceholder.style.display = "flex";
  elements.playerPlaceholder.style.backgroundColor = "";
  elements.playerPlaceholder.style.color = "";
  elements.playerPlaceholder.classList.remove("title-card-stage");
  elements.playerPlaceholder.innerHTML = `<span>BR</span><strong>Media not linked</strong><small>Return to the editor and choose the matching files.</small>`;
  const scene = sceneById(id);
  if (!scene) return;
  previewSceneId = scene.id;
  $("#previewSceneName").textContent = scene.title;
  $("#previewProgress").textContent = `${project.scenes.findIndex((item) => item.id === scene.id) + 1} / ${project.scenes.length}`;
  const item = mediaById(scene.mediaId);
  if (isTitleScene(scene)) {
    elements.playerPlaceholder.classList.add("title-card-stage");
    elements.playerPlaceholder.style.backgroundColor = titleColor(scene);
    elements.playerPlaceholder.style.color = titleTextColor(scene);
    elements.playerPlaceholder.innerHTML = `<strong>${escapeHtml(scene.title)}</strong>`;
  } else if (item?.type === "video") {
    elements.playerPlaceholder.style.display = "none";
    elements.playerVideo.style.display = "block";
    elements.playerVideo.loop = false;
    const startAt = Math.max(0, Number(scene.trimStart) || 0);
    const endAt = Number(scene.trimEnd);
    elements.playerVideo.onloadedmetadata = () => {
      elements.playerVideo.currentTime = Math.min(startAt, Math.max(0, (elements.playerVideo.duration || 0) - 0.1));
      elements.playerVideo.play().catch(() => {});
    };
    elements.playerVideo.ontimeupdate = () => {
      const effectiveEnd = Number.isFinite(endAt) && endAt > 0 ? endAt : elements.playerVideo.duration;
      if (!Number.isFinite(effectiveEnd) || elements.playerVideo.currentTime < effectiveEnd) return;
      if (scene.playback === "loop") {
        elements.playerVideo.currentTime = startAt;
        elements.playerVideo.play().catch(() => {});
      } else {
        elements.playerVideo.pause();
        elements.playerVideo.currentTime = effectiveEnd;
        const destination = afterPlaybackDestination(scene);
        const nextScene = destination ? sceneById(destination.targetSceneId) : nextSceneAfter(scene.id);
        if (!hasChoiceButton(scene) && nextScene) playScene(nextScene.id);
      }
    };
    elements.playerVideo.src = item.url;
  } else if (item?.type === "image") {
    elements.playerPlaceholder.style.display = "none";
    elements.playerImage.style.display = "block";
    elements.playerImage.src = item.url;
    if (scene.imagePlayback === "timed" && scene.timedTargetSceneId && sceneById(scene.timedTargetSceneId)) {
      stillTimer = setTimeout(() => playScene(scene.timedTargetSceneId), (scene.stillDuration || 5) * 1000);
    }
  }
  renderPlayerOverlays(scene);
}

function renderPlayerOverlays(scene) {
  elements.playerOverlays.innerHTML = scene.overlays
    .filter((overlay) => overlay.type !== "destination")
    .map((overlay) =>
    `<${overlay.type === "choice" ? "button" : "div"}
      class="player-overlay ${overlay.type}"
      style="left:${positionPercent("x", overlay.x)}%;top:${positionPercent("y", overlay.y)}%"
      ${overlay.type === "choice" ? `data-target-scene="${overlay.targetSceneId || ""}"` : ""}>
      ${escapeHtml(overlay.text)}
    </${overlay.type === "choice" ? "button" : "div"}>`
  ).join("");
}

function fitMap() {
  if (!project.scenes.length) return;
  const minX = Math.min(...project.scenes.map((scene) => scene.x));
  const minY = Math.min(...project.scenes.map((scene) => scene.y));
  const maxX = Math.max(...project.scenes.map((scene) => scene.x + 168));
  const maxY = Math.max(...project.scenes.map((scene) => scene.y + 120));
  const rect = elements.canvasViewport.getBoundingClientRect();
  const padding = 45;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  view.zoom = Math.min(1.35, Math.max(MIN_ZOOM, Math.min(
    (rect.width - padding * 2) / width,
    (rect.height - padding * 2) / height,
  )));
  view.x = (rect.width - width * view.zoom) / 2 - minX * view.zoom;
  view.y = (rect.height - height * view.zoom) / 2 - minY * view.zoom;
  applyCanvasTransform();
}

function newBlankProject() {
  for (const item of media.values()) if (item.url) URL.revokeObjectURL(item.url);
  project = blankProject();
  media = new Map();
  selectedSceneId = null;
  projectFileHandle = null;
  savedProjectTitle = null;
  resetCanvasView();
  closeDialog(elements.welcomeDialog);
  render();
}

// File and project controls
$("#addFilesButton").addEventListener("click", () => $("#fileInput").click());
$("#folderButton").addEventListener("click", () => $("#fileInput").click());
$("#relinkButton").addEventListener("click", () => $("#fileInput").click());
async function handleMediaSelection(event) {
  try {
    await addFiles(event.target.files);
  } catch (error) {
    console.error("Media import failed", error);
    showToast("Those files could not be opened. Try selecting fewer media files.");
  } finally {
    // Allow the same folder to be selected again after an error.
    event.target.value = "";
  }
}

$("#fileInput").addEventListener("change", (event) => handleMediaSelection(event));
$("#loadProjectButton").addEventListener("click", () => openDialog(elements.openProjectDialog));
$("#projectInput").addEventListener("change", async (event) => {
  if (event.target.files[0]) await loadProjectFile(event.target.files[0]);
  event.target.value = "";
});
$("#saveProjectButton").addEventListener("click", saveProject);
$("#shareProjectButton").addEventListener("click", openShareProjectDialog);
$("#openLocalProjectButton").addEventListener("click", () => {
  closeDialog(elements.openProjectDialog);
  $("#projectInput").click();
});
$("#openPasteProjectButton").addEventListener("click", () => {
  $("#pasteProjectJsonText").value = "";
  closeDialog(elements.openProjectDialog);
  openDialog(elements.pasteProjectDialog);
  $("#pasteProjectJsonText").focus();
});
$("#confirmPasteProjectButton").addEventListener("click", () => loadProjectJsonText($("#pasteProjectJsonText").value.trim()));
$("#viewFailedJsonButton").addEventListener("click", () => {
  closeDialog(elements.saveFailedDialog);
  openProjectJsonDialog({
    title: "Save this JSON",
    message: "This JSON records how the media files are assembled into your branching video. Copy it, then save it as a plain text file if the computer will not download the project file.",
  });
});
$("#copyProjectJsonButton").addEventListener("click", () => copyTextToClipboard($("#projectJsonText").value, "Project JSON copied"));
$("#copyShareJsonButton").addEventListener("click", () => copyTextToClipboard($("#shareProjectJsonText").value, "Project JSON copied"));
elements.projectTitle.addEventListener("input", () => { project.title = elements.projectTitle.value; });

// Canvas controls
$("#addSceneButton").addEventListener("click", openTitleDialog);
$("#deleteSceneButton").addEventListener("click", removeScene);
$("#fitButton").addEventListener("click", fitMap);
$("#zoomOutButton").addEventListener("click", () => setZoom(view.zoom / 1.2));
$("#zoomInButton").addEventListener("click", () => setZoom(view.zoom * 1.2));
elements.zoomLabel.addEventListener("click", resetCanvasView);
elements.mediaList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-media]");
  if (removeButton) {
    event.stopPropagation();
    openMediaRemovalDialog(removeButton.dataset.removeMedia);
    return;
  }
  const addButton = event.target.closest("[data-add-media]");
  if (addButton) {
    addScene(addButton.dataset.addMedia);
    return;
  }
  const missingItem = event.target.closest("[data-missing-media]");
  if (missingItem) openMediaRemovalDialog(missingItem.dataset.missingMedia);
});
elements.mediaList.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const missingItem = event.target.closest("[data-missing-media]");
  if (!missingItem) return;
  event.preventDefault();
  openMediaRemovalDialog(missingItem.dataset.missingMedia);
});
elements.mediaList.addEventListener("contextmenu", (event) => {
  const mediaItem = event.target.closest("[data-media-id]");
  if (!mediaItem) return;
  showMediaContextMenu(event, mediaItem.dataset.mediaId);
});
elements.mediaList.addEventListener("dragover", (event) => {
  if (!event.dataTransfer.types.includes("application/x-branchroom-media-order")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const target = event.target.closest("[data-media-id]");
  clearMediaDropIndicators();
  if (target) target.classList.add(mediaDropPosition(event, target) === "before" ? "drop-before" : "drop-after");
});
elements.mediaList.addEventListener("dragleave", (event) => {
  if (!elements.mediaList.contains(event.relatedTarget)) clearMediaDropIndicators();
});
elements.mediaList.addEventListener("drop", (event) => {
  const sourceId = event.dataTransfer.getData("application/x-branchroom-media-order");
  if (!sourceId) return;
  event.preventDefault();
  const target = event.target.closest("[data-media-id]");
  const targetId = target?.dataset.mediaId || null;
  const position = mediaDropPosition(event, target);
  clearMediaDropIndicators();
  if (sourceId !== targetId) reorderMedia(sourceId, targetId, position);
});
elements.canvasViewport.addEventListener("dragover", (event) => event.preventDefault());
elements.canvasViewport.addEventListener("drop", (event) => {
  event.preventDefault();
  const mediaId = event.dataTransfer.getData("text/media-id");
  if (!mediaId) return;
  const rect = event.currentTarget.getBoundingClientRect();
  addScene(mediaId, {
    x: (event.clientX - rect.left - view.x) / view.zoom - 84,
    y: (event.clientY - rect.top - view.y) / view.zoom - 50,
  });
});
elements.canvasViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".scene-card")) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const originalX = view.x;
  const originalY = view.y;
  elements.canvasViewport.classList.add("panning");
  const move = (moveEvent) => {
    view.x = originalX + moveEvent.clientX - startX;
    view.y = originalY + moveEvent.clientY - startY;
    applyCanvasTransform();
  };
  const up = () => {
    elements.canvasViewport.classList.remove("panning");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
});
elements.canvasViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = elements.canvasViewport.getBoundingClientRect();
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  setZoom(view.zoom * Math.exp(-delta * 0.002), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });
elements.sceneLayer.addEventListener("contextmenu", (event) => {
  const sceneCard = event.target.closest("[data-scene-id]");
  if (!sceneCard) return;
  showSceneContextMenu(event, sceneCard.dataset.sceneId);
});

// Inspector controls
elements.sceneTitle.addEventListener("input", () => {
  const scene = selectedScene();
  if (scene) { scene.title = elements.sceneTitle.value; renderScenes(); }
});
elements.sceneMedia.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) {
    scene.mediaId = elements.sceneMedia.value || null;
    scene.kind = scene.mediaId ? "media" : scene.kind;
    if (!isVideoScene(scene)) {
      scene.trimStart = 0;
      scene.trimEnd = null;
    }
    renderScenes();
    renderInspector();
  }
});
document.querySelectorAll('input[name="playback"]').forEach((radio) => radio.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) scene.playback = radio.value;
}));
document.querySelectorAll('input[name="imagePlayback"]').forEach((radio) => radio.addEventListener("change", () => {
  const scene = selectedScene();
  if (!scene) return;
  scene.imagePlayback = radio.value;
  renderInspector();
  renderConnections();
}));
elements.stillDuration.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) {
    scene.stillDuration = Math.max(1, Number(elements.stillDuration.value) || 5);
    renderConnections();
  }
});
elements.timedTargetScene.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) {
    scene.timedTargetSceneId = elements.timedTargetScene.value || null;
    renderConnections();
  }
});
elements.startSceneToggle.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene && elements.startSceneToggle.checked) project.startSceneId = scene.id;
  elements.startSceneToggle.checked = true;
  renderScenes();
});
$("#addOverlayButton").addEventListener("click", () => openOverlayDialog());
elements.overlayList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-overlay]");
  if (deleteButton) {
    event.stopPropagation();
    const scene = selectedScene();
    scene.overlays = scene.overlays.filter((item) => item.id !== deleteButton.dataset.deleteOverlay);
    render();
    return;
  }
  const item = event.target.closest("[data-edit-overlay]");
  if (item) openOverlayDialog(item.dataset.editOverlay);
});

// Dialogs and preview
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
$("#helpButton").addEventListener("click", () => openDialog(elements.welcomeDialog));
$("#startBlankButton").addEventListener("click", newBlankProject);
$("#sampleButton").addEventListener("click", () => {
  project = makeSample();
  selectedSceneId = project.startSceneId;
  projectFileHandle = null;
  savedProjectTitle = null;
  resetCanvasView();
  closeDialog(elements.welcomeDialog);
  render();
  fitMap();
  showToast("Sample loaded — press Preview to try it");
});
$("#previewButton").addEventListener("click", startPreview);
$("#restartPreviewButton").addEventListener("click", () => playScene(project.startSceneId || project.scenes[0]?.id));
elements.playerOverlays.addEventListener("click", (event) => {
  const button = event.target.closest("[data-target-scene]");
  if (!button) return;
  if (button.dataset.targetScene) playScene(button.dataset.targetScene);
  else showToast("Choose a destination for this button in the Inspector");
});
elements.previewDialog.addEventListener("close", () => {
  clearTimeout(stillTimer);
  elements.playerVideo.pause();
  elements.playerVideo.onloadedmetadata = null;
  elements.playerVideo.ontimeupdate = null;
});
$("#overlayType").addEventListener("change", toggleOverlayTarget);
$("#overlayForm").addEventListener("submit", saveOverlay);
$("#titleForm").addEventListener("submit", saveTitleCard);
elements.trimStartRange.addEventListener("input", () => updateTrimFromSlider("start"));
elements.trimEndRange.addEventListener("input", () => updateTrimFromSlider("end"));
$("#cancelTrimButton").addEventListener("click", closeTrimDialog);
$("#resetTrimButton").addEventListener("click", resetTrimDialog);
$("#applyTrimButton").addEventListener("click", applyTrimDialog);
elements.trimDialog.addEventListener("close", () => {
  trimmingSceneId = null;
  elements.trimVideo.pause();
  elements.trimVideo.removeAttribute("src");
  elements.trimVideo.load();
  elements.trimVideo.onloadedmetadata = null;
});
$("#confirmRemoveMediaButton").addEventListener("click", removeMediaFromProject);
elements.mediaRemovalDialog.addEventListener("close", () => { pendingMediaRemovalId = null; });
$("#contextDeleteMediaButton").addEventListener("click", () => {
  const mediaId = contextMediaId;
  hideMediaContextMenu();
  if (mediaId) openMediaRemovalDialog(mediaId);
});
$("#contextTrimSceneButton").addEventListener("click", () => {
  const sceneId = contextSceneId;
  hideSceneContextMenu();
  if (sceneId) openTrimDialog(sceneId);
});
$("#contextDeleteSceneButton").addEventListener("click", () => {
  const sceneId = contextSceneId;
  hideSceneContextMenu();
  if (!sceneId) return;
  selectScene(sceneId);
  removeScene();
});
document.addEventListener("pointerdown", (event) => {
  if (!elements.mediaContextMenu.contains(event.target)) hideMediaContextMenu();
  if (!elements.sceneContextMenu.contains(event.target)) hideSceneContextMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideMediaContextMenu();
    hideSceneContextMenu();
  }
});
window.addEventListener("blur", () => {
  hideMediaContextMenu();
  hideSceneContextMenu();
});
window.addEventListener("resize", () => {
  hideMediaContextMenu();
  hideSceneContextMenu();
});

window.addEventListener("resize", renderConnections);
window.addEventListener("beforeunload", () => {
  for (const item of media.values()) if (item.url) URL.revokeObjectURL(item.url);
});

render();
if (!localStorage.getItem("branchroom-welcomed")) {
  openDialog(elements.welcomeDialog);
  localStorage.setItem("branchroom-welcomed", "true");
}
