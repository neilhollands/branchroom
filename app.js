const $ = (selector) => document.querySelector(selector);
const uid = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const elements = {
  mediaList: $("#mediaList"),
  mediaCount: $("#mediaCount"),
  sceneLayer: $("#sceneLayer"),
  connections: $("#connections"),
  canvasHint: $("#canvasHint"),
  projectTitle: $("#projectTitle"),
  emptyInspector: $("#emptyInspector"),
  sceneInspector: $("#sceneInspector"),
  sceneTitle: $("#sceneTitle"),
  sceneMedia: $("#sceneMedia"),
  stillDurationRow: $("#stillDurationRow"),
  stillDuration: $("#stillDuration"),
  overlayList: $("#overlayList"),
  startSceneToggle: $("#startSceneToggle"),
  welcomeDialog: $("#welcomeDialog"),
  previewDialog: $("#previewDialog"),
  overlayDialog: $("#overlayDialog"),
  playerVideo: $("#playerVideo"),
  playerImage: $("#playerImage"),
  playerPlaceholder: $("#playerPlaceholder"),
  playerOverlays: $("#playerOverlays"),
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
        stillDuration: 5, x: 70, y: 175,
        overlays: [
          { id: uid("overlay"), type: "text", text: "At dusk, you see a light across the bay.", x: "center", y: "top", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Take the forest path", x: "left", y: "bottom", targetSceneId: forest },
          { id: uid("overlay"), type: "choice", text: "Walk toward the lighthouse", x: "right", y: "bottom", targetSceneId: lighthouse },
        ],
      },
      {
        id: forest, title: "The forest path", mediaId: null, playback: "loop",
        stillDuration: 5, x: 330, y: 70,
        overlays: [
          { id: uid("overlay"), type: "text", text: "The trees whisper your name.", x: "center", y: "top", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Follow the sound", x: "center", y: "bottom", targetSceneId: end },
        ],
      },
      {
        id: lighthouse, title: "The lighthouse door", mediaId: null, playback: "hold",
        stillDuration: 5, x: 330, y: 290,
        overlays: [
          { id: uid("overlay"), type: "text", text: "The door is already open.", x: "center", y: "top", targetSceneId: null },
          { id: uid("overlay"), type: "choice", text: "Step inside", x: "center", y: "bottom", targetSceneId: end },
        ],
      },
      {
        id: end, title: "The lantern keeper", mediaId: null, playback: "hold",
        stillDuration: 5, x: 555, y: 180,
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mediaType(file) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

function manifestEntry(item) {
  return { id: item.id, name: item.name, type: item.type, size: item.size };
}

function addFiles(files) {
  let added = 0;
  for (const file of files) {
    const type = mediaType(file);
    if (!type) continue;
    const existingManifest = project.mediaManifest.find((item) => item.name === file.name);
    const id = existingManifest?.id || uid("media");
    const old = media.get(id);
    if (old?.url) URL.revokeObjectURL(old.url);
    const item = { id, name: file.name, type, size: file.size, file, url: URL.createObjectURL(file) };
    media.set(id, item);
    if (!existingManifest) project.mediaManifest.push(manifestEntry(item));
    added += 1;
  }
  render();
  if (added) showToast(`${added} media ${added === 1 ? "file" : "files"} ready`);
}

function renderMedia() {
  elements.mediaCount.textContent = `${project.mediaManifest.length} ${project.mediaManifest.length === 1 ? "item" : "items"}`;
  if (!project.mediaManifest.length) {
    elements.mediaList.innerHTML = `<div class="media-empty">Your clips and stills will appear here.<br />Nothing leaves this browser.</div>`;
    return;
  }
  elements.mediaList.innerHTML = project.mediaManifest.map((entry) => {
    const item = media.get(entry.id);
    const preview = item?.url
      ? item.type === "image"
        ? `<img class="media-thumb" src="${item.url}" alt="" />`
        : `<video class="media-thumb" src="${item.url}" muted preload="metadata"></video>`
      : `<div class="media-thumb" style="display:grid;place-items:center;color:#777;font-size:18px">${entry.type === "video" ? "▶" : "▧"}</div>`;
    return `<div class="media-item" draggable="true" data-media-id="${entry.id}">
      ${preview}
      <div class="media-meta"><strong title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</strong><small>${entry.type} · ${formatBytes(entry.size)}</small></div>
      <button class="media-add" data-add-media="${entry.id}" title="Add as scene">+</button>
    </div>`;
  }).join("");
  elements.mediaList.querySelectorAll("[data-media-id]").forEach((el) => {
    el.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/media-id", el.dataset.mediaId));
  });
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
  elements.canvasHint.classList.toggle("hidden", project.scenes.length > 0);
  elements.sceneLayer.innerHTML = project.scenes.map((scene) => {
    const item = mediaById(scene.mediaId);
    let thumb = `<div class="scene-thumb placeholder"><span>${sceneRole(scene) === "ending" ? "FIN" : "BR"}</span></div>`;
    if (item?.url) {
      thumb = item.type === "image"
        ? `<div class="scene-thumb"><img src="${item.url}" alt="" /></div>`
        : `<div class="scene-thumb"><video src="${item.url}" muted preload="metadata"></video></div>`;
    }
    const choices = scene.overlays.filter((overlay) => overlay.type === "choice").length;
    return `<article class="scene-card ${selectedSceneId === scene.id ? "selected" : ""} ${scene.id === project.startSceneId ? "start-card" : ""}"
      data-scene-id="${scene.id}" style="left:${scene.x}px;top:${scene.y}px">
      ${thumb}
      <div class="scene-body">
        <strong>${escapeHtml(scene.title)}</strong>
        <small><span>${item ? item.type : "Unlinked media"}</span><span>${choices} ${choices === 1 ? "choice" : "choices"}</span></small>
      </div>
      <i class="scene-output"></i>
    </article>`;
  }).join("");
  elements.sceneLayer.querySelectorAll(".scene-card").forEach(enableSceneDrag);
  requestAnimationFrame(renderConnections);
}

function enableSceneDrag(card) {
  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    selectScene(card.dataset.sceneId);
    const scene = selectedScene();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = scene.x;
    const originalY = scene.y;
    card.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      scene.x = Math.max(5, originalX + moveEvent.clientX - startX);
      scene.y = Math.max(5, originalY + moveEvent.clientY - startY);
      card.style.left = `${scene.x}px`;
      card.style.top = `${scene.y}px`;
      renderConnections();
    };
    const up = () => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", up);
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
  });
}

function renderConnections() {
  const viewport = $("#canvasViewport").getBoundingClientRect();
  elements.connections.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
  const paths = [];
  for (const scene of project.scenes) {
    for (const overlay of scene.overlays.filter((item) => item.type === "choice" && item.targetSceneId)) {
      const target = sceneById(overlay.targetSceneId);
      if (!target) continue;
      const x1 = scene.x + 168;
      const y1 = scene.y + 96;
      const x2 = target.x;
      const y2 = target.y + 54;
      const curve = Math.max(60, Math.abs(x2 - x1) * .45);
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 5;
      paths.push(`<path class="connection-line ${selectedSceneId === scene.id ? "selected" : ""}" d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}" />`);
      paths.push(`<text class="connection-label" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(overlay.text.slice(0, 24))}</text>`);
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
    `<option value="${item.id}" ${item.id === scene.mediaId ? "selected" : ""}>${escapeHtml(item.name)}</option>`
  ).join("")}`;
  document.querySelectorAll('input[name="playback"]').forEach((radio) => { radio.checked = radio.value === scene.playback; });
  const item = mediaById(scene.mediaId) || project.mediaManifest.find((entry) => entry.id === scene.mediaId);
  elements.stillDurationRow.classList.toggle("hidden", item?.type === "video");
  elements.stillDuration.value = scene.stillDuration || 5;
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
    return `<div class="overlay-item" data-edit-overlay="${overlay.id}">
      <span class="overlay-kind">${overlay.type === "choice" ? "↗" : "T"}</span>
      <div><strong>${escapeHtml(overlay.text)}</strong><small>${overlay.type === "choice" ? `Goes to: ${escapeHtml(target?.title || "Nowhere")}` : "Text overlay"}</small></div>
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

function addScene(mediaId = null, position = {}) {
  const item = project.mediaManifest.find((entry) => entry.id === mediaId);
  const count = project.scenes.length;
  const scene = {
    id: uid("scene"),
    title: item ? item.name.replace(/\.[^.]+$/, "") : `Scene ${count + 1}`,
    mediaId,
    playback: "hold",
    stillDuration: 5,
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

function removeScene() {
  const scene = selectedScene();
  if (!scene || !confirm(`Delete “${scene.title}”?`)) return;
  project.scenes = project.scenes.filter((item) => item.id !== scene.id);
  for (const item of project.scenes) {
    item.overlays.forEach((overlay) => {
      if (overlay.targetSceneId === scene.id) overlay.targetSceneId = null;
    });
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
  $("#overlayDialogTitle").textContent = overlay ? "Edit overlay" : "Add an overlay";
  $("#confirmOverlayButton").textContent = overlay ? "Save changes" : "Add overlay";
  $("#overlayType").value = overlay?.type || "choice";
  $("#overlayText").value = overlay?.text || "";
  $("#overlayX").value = overlay?.x || "center";
  $("#overlayY").value = overlay?.y || "bottom";
  $("#overlayTarget").innerHTML = `<option value="">— Choose a scene —</option>${project.scenes
    .filter((item) => item.id !== scene.id)
    .map((item) => `<option value="${item.id}" ${overlay?.targetSceneId === item.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}`;
  toggleOverlayTarget();
  elements.overlayDialog.showModal();
}

function toggleOverlayTarget() {
  $("#overlayTargetRow").classList.toggle("hidden", $("#overlayType").value === "text");
}

function saveOverlay(event) {
  event.preventDefault();
  const scene = selectedScene();
  const text = $("#overlayText").value.trim();
  if (!scene || !text) return;
  const values = {
    type: $("#overlayType").value,
    text,
    targetSceneId: $("#overlayType").value === "choice" ? $("#overlayTarget").value || null : null,
    x: $("#overlayX").value,
    y: $("#overlayY").value,
  };
  const existing = scene.overlays.find((item) => item.id === editingOverlayId);
  if (existing) Object.assign(existing, values);
  else scene.overlays.push({ id: uid("overlay"), ...values });
  elements.overlayDialog.close();
  render();
}

function serializeProject() {
  project.title = elements.projectTitle.value.trim() || "Untitled branching story";
  return {
    ...project,
    savedAt: new Date().toISOString(),
    mediaManifest: project.mediaManifest.map((item) => ({ ...item })),
  };
}

function downloadProject() {
  const payload = JSON.stringify(serializeProject(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "branchroom-project"}.branchroom.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Project file saved");
}

async function loadProjectFile(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.scenes)) throw new Error("Missing scenes");
    for (const item of media.values()) if (item.url) URL.revokeObjectURL(item.url);
    media = new Map();
    project = {
      version: parsed.version || 1,
      title: parsed.title || "Untitled branching story",
      startSceneId: parsed.startSceneId || parsed.scenes[0]?.id || null,
      scenes: parsed.scenes.map((scene) => ({ ...scene, overlays: scene.overlays || [] })),
      mediaManifest: parsed.mediaManifest || [],
    };
    selectedSceneId = project.startSceneId;
    render();
    showToast("Project opened — relink its media folder");
  } catch {
    showToast("That does not look like a Branchroom project");
  }
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
  elements.previewDialog.showModal();
  playScene(project.startSceneId || project.scenes[0].id);
}

function playScene(id) {
  clearTimeout(stillTimer);
  elements.playerVideo.pause();
  elements.playerVideo.removeAttribute("src");
  elements.playerVideo.load();
  elements.playerImage.removeAttribute("src");
  elements.playerVideo.style.display = "none";
  elements.playerImage.style.display = "none";
  elements.playerPlaceholder.style.display = "flex";
  const scene = sceneById(id);
  if (!scene) return;
  previewSceneId = scene.id;
  $("#previewSceneName").textContent = scene.title;
  $("#previewProgress").textContent = `${project.scenes.findIndex((item) => item.id === scene.id) + 1} / ${project.scenes.length}`;
  const item = mediaById(scene.mediaId);
  if (item?.type === "video") {
    elements.playerPlaceholder.style.display = "none";
    elements.playerVideo.style.display = "block";
    elements.playerVideo.src = item.url;
    elements.playerVideo.loop = scene.playback === "loop";
    elements.playerVideo.play().catch(() => {});
  } else if (item?.type === "image") {
    elements.playerPlaceholder.style.display = "none";
    elements.playerImage.style.display = "block";
    elements.playerImage.src = item.url;
    if (!scene.overlays.some((overlay) => overlay.type === "choice")) {
      stillTimer = setTimeout(() => {}, (scene.stillDuration || 5) * 1000);
    }
  }
  renderPlayerOverlays(scene);
}

function renderPlayerOverlays(scene) {
  elements.playerOverlays.innerHTML = scene.overlays.map((overlay) =>
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
  project.scenes.forEach((scene) => {
    scene.x = scene.x - minX + 40;
    scene.y = scene.y - minY + 40;
  });
  renderScenes();
}

function newBlankProject() {
  project = blankProject();
  media = new Map();
  selectedSceneId = null;
  elements.welcomeDialog.close();
  render();
}

// File and project controls
$("#addFilesButton").addEventListener("click", () => $("#fileInput").click());
$("#folderButton").addEventListener("click", () => $("#folderInput").click());
$("#relinkButton").addEventListener("click", () => $("#folderInput").click());
$("#fileInput").addEventListener("change", (event) => addFiles(event.target.files));
$("#folderInput").addEventListener("change", (event) => addFiles(event.target.files));
$("#loadProjectButton").addEventListener("click", () => $("#projectInput").click());
$("#projectInput").addEventListener("change", (event) => event.target.files[0] && loadProjectFile(event.target.files[0]));
$("#saveProjectButton").addEventListener("click", downloadProject);
elements.projectTitle.addEventListener("input", () => { project.title = elements.projectTitle.value; });

// Canvas controls
$("#addSceneButton").addEventListener("click", () => addScene());
$("#deleteSceneButton").addEventListener("click", removeScene);
$("#fitButton").addEventListener("click", fitMap);
elements.mediaList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-media]");
  if (button) addScene(button.dataset.addMedia);
});
$("#canvasViewport").addEventListener("dragover", (event) => event.preventDefault());
$("#canvasViewport").addEventListener("drop", (event) => {
  event.preventDefault();
  const mediaId = event.dataTransfer.getData("text/media-id");
  if (!mediaId) return;
  const rect = event.currentTarget.getBoundingClientRect();
  addScene(mediaId, { x: event.clientX - rect.left - 84, y: event.clientY - rect.top - 50 });
});

// Inspector controls
elements.sceneTitle.addEventListener("input", () => {
  const scene = selectedScene();
  if (scene) { scene.title = elements.sceneTitle.value; renderScenes(); }
});
elements.sceneMedia.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) { scene.mediaId = elements.sceneMedia.value || null; renderScenes(); renderInspector(); }
});
document.querySelectorAll('input[name="playback"]').forEach((radio) => radio.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) scene.playback = radio.value;
}));
elements.stillDuration.addEventListener("change", () => {
  const scene = selectedScene();
  if (scene) scene.stillDuration = Math.max(1, Number(elements.stillDuration.value) || 5);
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
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
$("#helpButton").addEventListener("click", () => elements.welcomeDialog.showModal());
$("#startBlankButton").addEventListener("click", newBlankProject);
$("#sampleButton").addEventListener("click", () => {
  project = makeSample();
  selectedSceneId = project.startSceneId;
  elements.welcomeDialog.close();
  render();
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
});
$("#overlayType").addEventListener("change", toggleOverlayTarget);
$("#overlayForm").addEventListener("submit", saveOverlay);
$("#confirmOverlayButton").addEventListener("click", saveOverlay);

window.addEventListener("resize", renderConnections);
window.addEventListener("beforeunload", () => {
  for (const item of media.values()) if (item.url) URL.revokeObjectURL(item.url);
});

render();
if (!localStorage.getItem("branchroom-welcomed")) {
  elements.welcomeDialog.showModal();
  localStorage.setItem("branchroom-welcomed", "true");
}
