import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js';

const canvas = document.querySelector('#sceneCanvas');
const stage = document.querySelector('#viewerStage');
const toast = document.querySelector('#toast');
const overlay = document.querySelector('#processingOverlay');
const mediaInput = document.querySelector('#mediaInput');
const dropzone = document.querySelector('#dropzone');
const files = [];
let colorMode = 'confidence';
let pointObject;
let drag = null;
let toastTimer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 0.15, 6.3);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
const cloud = new THREE.Group();
scene.add(cloud);

function resize() {
  const w = Math.max(stage.clientWidth, 1), h = Math.max(stage.clientHeight, 1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function confidenceColor(value) {
  const v = clamp(value);
  const stops = [[0.91, 0.39, 0.30], [0.94, 0.72, 0.35], [0.42, 0.78, 0.55]];
  const p = v < 0.5 ? v * 2 : (v - 0.5) * 2;
  const left = v < 0.5 ? stops[0] : stops[1];
  const right = v < 0.5 ? stops[1] : stops[2];
  return new THREE.Color(left[0] + (right[0] - left[0]) * p, left[1] + (right[1] - left[1]) * p, left[2] + (right[2] - left[2]) * p);
}

function renderCloud(samples, name, simulated = true) {
  if (pointObject) cloud.remove(pointObject);
  const positions = [], confidence = [], sourceColors = [];
  const width = samples.width, height = samples.height, data = samples.data;
  const step = Math.max(1, Math.ceil(Math.sqrt((width * height) / 6500)));
  const aspect = width / height;
  const spanX = 3.6, spanY = spanX / Math.max(aspect, 0.45);
  let confSum = 0;
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const dx = Math.abs(data[i + 4] - data[i - 4]) / 255;
      const dy = Math.abs(data[i + width * 4] - data[i - width * 4]) / 255;
      const edge = clamp((dx + dy) * 1.9);
      const noise = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
      const conf = clamp(0.83 - edge * 0.38 - (1 - lum) * 0.12 + noise * 0.09, 0.12, 0.98);
      const px = (x / width - 0.5) * spanX;
      const py = (0.5 - y / height) * spanY;
      const pz = (lum - 0.5) * 0.75 + (noise - 0.5) * 0.13;
      positions.push(px, py, pz);
      confidence.push(conf);
      sourceColors.push(r, g, b);
      confSum += conf;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('confidence', new THREE.Float32BufferAttribute(confidence, 1));
  geometry.setAttribute('sourceColor', new THREE.Float32BufferAttribute(sourceColors, 3));
  const colorArray = new Float32Array(confidence.length * 3);
  confidence.forEach((c, i) => {
    const col = colorMode === 'confidence' ? confidenceColor(c) : new THREE.Color(sourceColors[i * 3], sourceColors[i * 3 + 1], sourceColors[i * 3 + 2]).lerp(new THREE.Color(0.65, 0.8, 0.7), 0.38);
    colorArray[i * 3] = col.r; colorArray[i * 3 + 1] = col.g; colorArray[i * 3 + 2] = col.b;
  });
  geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
  const material = new THREE.PointsMaterial({ size: 0.023, vertexColors: true, transparent: true, opacity: 0.94, sizeAttenuation: true });
  pointObject = new THREE.Points(geometry, material);
  cloud.add(pointObject);
  cloud.rotation.set(-0.09, -0.22, 0);
  camera.position.set(0, 0.12, Math.max(5, spanY * 2.15));
  camera.lookAt(0, 0, 0);
  const count = confidence.length;
  const mean = Math.round(confSum / Math.max(count, 1) * 100);
  document.querySelector('#pointCount').textContent = count.toLocaleString();
  document.querySelector('#mappedPoints').textContent = count.toLocaleString();
  document.querySelector('#confidenceValue').innerHTML = `${mean}<small>%</small>`;
  document.querySelector('#sceneTitle').innerHTML = `${escapeHtml(name)} <span class="demo-tag">${simulated ? 'DEMO' : 'SIMULATED'}</span>`;
  resize();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function makeSampleScene() {
  const w = 120, h = 80, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const nx = x / w, ny = y / h;
    const wall = ny < 0.69;
    let lum = wall ? 0.56 + 0.14 * Math.sin(nx * 6) + 0.05 * Math.cos(ny * 18) : 0.32 + (ny - 0.69) * 1.5;
    const box = nx > 0.36 && nx < 0.7 && ny > 0.42 && ny < 0.73;
    if (box) lum += (nx < 0.53 ? 0.2 : -0.08) + Math.max(0, 0.7 - ny) * 0.12;
    const orb = ((nx - 0.79) ** 2 / 0.007 + (ny - 0.57) ** 2 / 0.018) < 1;
    if (orb) lum = 0.76 - (nx - 0.79) * 2;
    lum = clamp(lum + (Math.sin(x * 4.2 + y * 1.8) * 0.018), 0, 1);
    data[i] = Math.round(lum * (wall ? 154 : 112)); data[i + 1] = Math.round(lum * (wall ? 191 : 156)); data[i + 2] = Math.round(lum * (wall ? 164 : 119)); data[i + 3] = 255;
  }
  renderCloud({ width: w, height: h, data }, 'Sample scene', true);
}

async function getFrame(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = file.type.startsWith('video/');
    const source = video ? document.createElement('video') : new Image();
    source.muted = true; source.playsInline = true; source.src = url;
    await new Promise((resolve, reject) => {
      source.onload = resolve;
      source.onerror = reject;
      source.onloadeddata = resolve;
    });
    if (video && source.currentTime < 0.05) {
      await new Promise(resolve => { source.currentTime = Math.min(0.3, source.duration || 0.3); source.onseeked = resolve; setTimeout(resolve, 700); });
    }
    const w = video ? source.videoWidth : source.naturalWidth, h = video ? source.videoHeight : source.naturalHeight;
    const scale = Math.min(1, 120 / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(3, Math.round(w * scale)); c.height = Math.max(3, Math.round(h * scale));
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, c.width, c.height);
    return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
  } finally { URL.revokeObjectURL(url); }
}

function formatSize(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function updateFileList() {
  const list = document.querySelector('#fileList');
  document.querySelector('#fileCount').textContent = files.length;
  document.querySelector('#sceneCount').textContent = String(files.length || 1).padStart(2, '0');
  if (!files.length) { list.className = 'file-list empty-files'; list.innerHTML = '<span class="empty-icon">▧</span><span>Your photos and videos will appear here.</span>'; return; }
  list.className = 'file-list';
  list.innerHTML = files.map((f, i) => `<div class="file-row"><span class="file-thumb">${f.type.startsWith('image/') ? `<img src="${f.url}" alt="" />` : '▶'}</span><span class="file-meta"><b>${escapeHtml(f.name)}</b><small>${formatSize(f.size)} · ${f.type.startsWith('video/') ? 'Video' : 'Image'}</small></span><span class="file-ready">Added</span><button class="file-remove" aria-label="Remove ${escapeHtml(f.name)}" data-remove="${i}">×</button></div>`).join('');
  list.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { const [gone] = files.splice(Number(button.dataset.remove), 1); URL.revokeObjectURL(gone.url); updateFileList(); if (!files.length) makeSampleScene(); }));
}

function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2900); }
async function addFiles(fileList) {
  const accepted = [...fileList].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (!accepted.length) { showToast('Choose an image or video to preview.'); return; }
  const tooBig = accepted.filter(f => f.size > 150 * 1024 * 1024);
  if (tooBig.length) { showToast(`${tooBig[0].name} is over the 150 MB limit.`); return; }
  accepted.forEach(file => files.push({ ...file, name: file.name, type: file.type, size: file.size, url: URL.createObjectURL(file), raw: file }));
  updateFileList();
  overlay.classList.add('show');
  try {
    const frame = await getFrame(files[files.length - accepted.length].raw);
    await new Promise(r => setTimeout(r, 450));
    renderCloud(frame, files[files.length - accepted.length].name.replace(/\.[^.]+$/, ''), true);
    document.querySelector('#lastUpdated').textContent = 'Just now';
    showToast('Simulated 3D preview ready. Geometry and confidence are illustrative.');
  } catch (e) {
    showToast('Could not read that file. Try a different image or video.');
    console.error(e);
  } finally { overlay.classList.remove('show'); mediaInput.value = ''; }
}

mediaInput.addEventListener('change', e => addFiles(e.target.files));
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); addFiles(e.dataTransfer.files); });
document.querySelector('#clearFiles').addEventListener('click', () => { files.splice(0).forEach(f => URL.revokeObjectURL(f.url)); updateFileList(); makeSampleScene(); showToast('Scene inputs cleared.'); });
document.querySelector('#newScene').addEventListener('click', () => { document.querySelector('#mediaInput').click(); });
document.querySelector('#confidenceMode').addEventListener('click', () => { colorMode = 'confidence'; document.querySelector('#confidenceMode').classList.add('selected'); document.querySelector('#pointsMode').classList.remove('selected'); refreshCurrent(); });
document.querySelector('#pointsMode').addEventListener('click', () => { colorMode = 'points'; document.querySelector('#pointsMode').classList.add('selected'); document.querySelector('#confidenceMode').classList.remove('selected'); refreshCurrent(); });
document.querySelector('#resetView').addEventListener('click', () => { cloud.rotation.set(-0.09, -0.22, 0); camera.position.set(0, 0.12, 6.3); camera.lookAt(0, 0, 0); });
function refreshCurrent() { if (files.length) getFrame(files[files.length - 1].raw).then(frame => renderCloud(frame, files[files.length - 1].name.replace(/\.[^.]+$/, ''), true)); else makeSampleScene(); }
for (const id of ['projectsNav', 'measureNav', 'reportsNav']) document.querySelector(`#${id}`).addEventListener('click', () => showToast('More workspace tools are coming soon.'));

canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, rx: cloud.rotation.x, ry: cloud.rotation.y }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag) return; cloud.rotation.y = drag.ry + (e.clientX - drag.x) * 0.008; cloud.rotation.x = clamp(drag.rx + (e.clientY - drag.y) * 0.008, -1.2, 1.2); });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); camera.position.z = clamp(camera.position.z + e.deltaY * 0.004, 3.5, 12); camera.updateProjectionMatrix(); }, { passive: false });

makeSampleScene();
