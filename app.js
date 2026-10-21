/**
 * Spatial WebAR Studio - Main AR Engine
 * Mendukung:
 * 1. Scanning Bidang Lantai (Horizontal) & Tembok (Vertikal)
 * 2. 3D Holographic Reticle & Tap-to-Place World Anchoring
 * 3. 6DOF / Sensor Giroskop Spasial ("Stick to the place & rotate away from camera")
 * 4. Contact Shadows & Skala Figur Nyata (1:1 Human Scale)
 * 5. Integrasi Google <model-viewer> Scene Viewer & In-Browser Camera AR
 */

document.addEventListener('DOMContentLoaded', () => {
  // === DOM Elemen ===
  const videoFeed = document.getElementById('camera-feed');
  const spatialCanvas = document.getElementById('spatial-canvas');
  const modelViewer = document.getElementById('ar-viewer');
  const snapshotCanvas = document.getElementById('snapshot-canvas');

  // Scanning & Anchor UI
  const btnModeFloor = document.getElementById('btn-mode-floor');
  const btnModeWall = document.getElementById('btn-mode-wall');
  const scanningGuide = document.getElementById('scanning-guide');
  const scanStatusTitle = document.getElementById('scan-status-title');
  const scanStatusSubtitle = document.getElementById('scan-status-subtitle');
  const btnTapAnchor = document.getElementById('btn-tap-anchor');
  const anchoredToolbar = document.getElementById('anchored-toolbar');
  const btnReanchor = document.getElementById('btn-reanchor');
  const btnRotateAnchor = document.getElementById('btn-rotate-anchor');
  const btnScaleReal = document.getElementById('btn-scale-real');

  // Kontrol Kamera & Snapshot
  const btnToggleCamera = document.getElementById('btn-toggle-camera');
  const btnCameraText = document.getElementById('btn-camera-text');
  const btnFlipCamera = document.getElementById('btn-flip-camera');
  const btnSnapshot = document.getElementById('btn-snapshot');
  const btnRequestGyro = document.getElementById('btn-request-gyro');
  const btnTriggerGoogleAr = document.getElementById('btn-trigger-google-ar');

  // Input File & Sampel
  const glbFileInput = document.getElementById('glb-file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const dropZone = document.getElementById('drop-zone');
  const sampleSelect = document.getElementById('sample-select');
  const modelNameLabel = document.getElementById('model-name-label');
  const modelStatusLabel = document.getElementById('model-status-label');

  // Animasi
  const animationGroup = document.getElementById('animation-control-group');
  const animationSelect = document.getElementById('animation-select');
  const btnToggleAnim = document.getElementById('btn-toggle-anim');
  const iconAnimPlay = document.getElementById('icon-anim-play');
  const iconAnimPause = document.getElementById('icon-anim-pause');

  // Tampilan & Slider
  const sliderShadow = document.getElementById('slider-shadow');
  const sliderExposure = document.getElementById('slider-exposure');
  const sliderModelScale = document.getElementById('slider-model-scale');
  const valScale = document.getElementById('val-scale');
  const checkAutoRotate = document.getElementById('check-auto-rotate');

  // Modals & Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const btnToggleInfo = document.getElementById('btn-toggle-info');
  const infoModal = document.getElementById('info-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnModalOk = document.getElementById('btn-modal-ok');
  const snapshotModal = document.getElementById('snapshot-modal');
  const snapshotPreviewImg = document.getElementById('snapshot-preview-img');
  const btnDownloadPhoto = document.getElementById('btn-download-photo');
  const btnCloseSnapshot = document.getElementById('btn-close-snapshot');

  // === State Aplikasi ===
  let currentPlaneMode = 'floor'; // 'floor' | 'wall'
  let isAnchored = false;
  let isCameraActive = false;
  let currentFacingMode = 'environment';
  let cameraStream = null;
  let currentObjectUrl = null;
  let currentModel = null;
  let mixer = null;
  let activeAction = null;
  let isRealScale = true;
  let baseModelHeight = 1.8; // Standar tinggi manusia 1.8 meter
  let modelNormalizedScale = 1.0;
  let userScaleMultiplier = 1.0;
  let isGyroActive = false;

  // Sensor Giroskop / Device Orientation
  const deviceOrientation = { alpha: 0, beta: 0, gamma: 0, hasData: false };

  // ==========================================================================
  // 1. Inisialisasi Three.js WebGL & AR Scene
  // ==========================================================================
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 100);
  
  // Posisi awal kamera di level mata (1.6m dari lantai)
  camera.position.set(0, 1.6, 2.5);
  camera.lookAt(0, 0.8, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas: spatialCanvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Orbit Controls untuk navigasi desktop/touch
  const controls = new THREE.OrbitControls(camera, spatialCanvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0.9, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.1; // Jangan lewat bawah lantai
  controls.minDistance = 0.4;
  controls.maxDistance = 10;

  // Pencahayaan Realistis
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.9);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(3, 8, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 15;
  dirLight.shadow.camera.left = -3;
  dirLight.shadow.camera.right = 3;
  dirLight.shadow.camera.top = 3;
  dirLight.shadow.camera.bottom = -3;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);

  // Bidang Bayangan Kontak Tanah / Tembok (Shadow Catcher)
  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.55 });
  const shadowPlaneGeo = new THREE.PlaneGeometry(12, 12);
  const contactShadowMesh = new THREE.Mesh(shadowPlaneGeo, shadowMaterial);
  contactShadowMesh.rotation.x = -Math.PI / 2;
  contactShadowMesh.position.y = 0.001;
  contactShadowMesh.receiveShadow = true;
  scene.add(contactShadowMesh);

  // Soft Contact Blob Shadow di bawah kaki figur
  const blobShadowCanvas = document.createElement('canvas');
  blobShadowCanvas.width = 128;
  blobShadowCanvas.height = 128;
  const blobCtx = blobShadowCanvas.getContext('2d');
  const gradient = blobCtx.createRadialGradient(64, 64, 0, 64, 64, 60);
  gradient.addColorStop(0, 'rgba(0,0,0,0.7)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  blobCtx.fillStyle = gradient;
  blobCtx.fillRect(0, 0, 128, 128);
  const blobTexture = new THREE.CanvasTexture(blobShadowCanvas);
  const blobGeo = new THREE.PlaneGeometry(1.2, 1.2);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
  const blobShadowMesh = new THREE.Mesh(blobGeo, blobMat);
  blobShadowMesh.rotation.x = -Math.PI / 2;
  blobShadowMesh.position.y = 0.002;
  scene.add(blobShadowMesh);

  // ==========================================================================
  // 2. Pembuatan 3D Holographic Reticle (Pemindai Bidang & Tembok)
  // ==========================================================================
  const reticleGroup = new THREE.Group();

  // Cincin Luar
  const outerRingGeo = new THREE.RingGeometry(0.28, 0.32, 32);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });
  const outerRing = new THREE.Mesh(outerRingGeo, reticleMaterial);
  reticleGroup.add(outerRing);

  // Cincin Dalam Berputar
  const innerRingGeo = new THREE.RingGeometry(0.12, 0.15, 32);
  const innerRingMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95
  });
  const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
  reticleGroup.add(innerRing);

  // Titik Tengah
  const dotGeo = new THREE.CircleGeometry(0.04, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const centerDot = new THREE.Mesh(dotGeo, dotMat);
  reticleGroup.add(centerDot);

  // Awal: Posisi mendatar di lantai
  reticleGroup.rotation.x = -Math.PI / 2;
  reticleGroup.position.set(0, 0.005, 0);
  scene.add(reticleGroup);

  // Container Anchor untuk Model
  const anchorContainer = new THREE.Group();
  scene.add(anchorContainer);

  // ==========================================================================
  // 3. Audio Sintesis Feedback Anchor (Web Audio API)
  // ==========================================================================
  function playAnchorSound(frequency = 750) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      // Audio fallback jika autoplay diblokir
    }
  }

  // ==========================================================================
  // 4. Mode Scanning Bidang (Lantai vs Dinding/Tembok)
  // ==========================================================================
  function setPlaneMode(mode) {
    currentPlaneMode = mode;
    if (mode === 'floor') {
      btnModeFloor.classList.add('active');
      btnModeWall.classList.remove('active');
      scanStatusTitle.textContent = 'Memindai Bidang Lantai / Meja...';
      scanStatusSubtitle.textContent = 'Arahkan kamera ke permukaan lantai atau meja datar';

      // Orientasikan reticle datar di lantai
      reticleGroup.rotation.set(-Math.PI / 2, 0, 0);
      contactShadowMesh.rotation.set(-Math.PI / 2, 0, 0);
      contactShadowMesh.position.set(0, 0.001, 0);
      blobShadowMesh.rotation.set(-Math.PI / 2, 0, 0);

      // Sinkronkan ke Google <model-viewer>
      modelViewer.setAttribute('ar-placement', 'floor');
    } else {
      btnModeWall.classList.add('active');
      btnModeFloor.classList.remove('active');
      scanStatusTitle.textContent = 'Memindai Bidang Dinding / Tembok...';
      scanStatusSubtitle.textContent = 'Arahkan kamera tegak lurus ke dinding ruangan';

      // Orientasikan reticle tegak vertikal di dinding
      reticleGroup.rotation.set(0, 0, 0);
      contactShadowMesh.rotation.set(0, 0, 0);
      contactShadowMesh.position.set(0, 1.2, -1.99);
      blobShadowMesh.rotation.set(0, 0, 0);

      // Sinkronkan ke Google <model-viewer>
      modelViewer.setAttribute('ar-placement', 'wall');
    }

    if (!isAnchored) {
      updateReticlePosition();
    }
  }

  btnModeFloor.addEventListener('click', () => setPlaneMode('floor'));
  btnModeWall.addEventListener('click', () => setPlaneMode('wall'));

  // ==========================================================================
  // 5. Perhitungan Raycast & Penempatan Reticle
  // ==========================================================================
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0); // Titik tengah layar

  function updateReticlePosition() {
    if (isAnchored) {
      reticleGroup.visible = false;
      return;
    }

    reticleGroup.visible = true;

    // Raycast dari tengah layar
    raycaster.setFromCamera(screenCenter, camera);

    if (currentPlaneMode === 'floor') {
      // Raycast ke bidang horizontal Y = 0 (Lantai)
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      const intersects = raycaster.ray.intersectPlane(floorPlane, hitPoint);

      if (intersects && hitPoint.distanceTo(camera.position) < 8.0) {
        reticleGroup.position.copy(hitPoint);
        reticleGroup.position.y += 0.003;
        reticleMaterial.color.setHex(0x10b981); // Hijau = Terdeteksi
        btnTapAnchor.classList.remove('hidden');
        scanStatusTitle.textContent = 'Bidang Lantai Terdeteksi!';
        scanStatusSubtitle.textContent = 'Tap layar atau tombol di bawah untuk menaruh figur';
      }
    } else {
      // Raycast ke bidang vertikal Z = -2.0m (Tembok Virtual)
      const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.0);
      const hitPoint = new THREE.Vector3();
      const intersects = raycaster.ray.intersectPlane(wallPlane, hitPoint);

      if (intersects && hitPoint.distanceTo(camera.position) < 8.0) {
        reticleGroup.position.copy(hitPoint);
        reticleMaterial.color.setHex(0x38bdf8); // Biru cyan = Tembok Terdeteksi
        btnTapAnchor.classList.remove('hidden');
        scanStatusTitle.textContent = 'Bidang Dinding Terdeteksi!';
        scanStatusSubtitle.textContent = 'Tap layar untuk menempelkan figur pada tembok';
      }
    }
  }

  // ==========================================================================
  // 6. Tap / Click to Anchor Model ("Stick to the place")
  // ==========================================================================
  function anchorModelAtReticle() {
    if (!currentModel) return;

    // Kunci posisi model ke koordinat reticle saat ini
    const targetPos = reticleGroup.position.clone();
    anchorContainer.position.copy(targetPos);

    if (currentPlaneMode === 'floor') {
      // Menghadap ke arah kamera di lantai
      anchorContainer.rotation.set(0, 0, 0);
      anchorContainer.lookAt(camera.position.x, targetPos.y, camera.position.z);

      // Posisikan bayangan kontak tepat di bawah model
      contactShadowMesh.position.set(targetPos.x, 0.001, targetPos.z);
      blobShadowMesh.position.set(targetPos.x, 0.002, targetPos.z);
    } else {
      // Menempel di dinding
      anchorContainer.rotation.set(0, 0, 0);
      contactShadowMesh.position.set(targetPos.x, targetPos.y, targetPos.z - 0.01);
      blobShadowMesh.position.set(targetPos.x, targetPos.y - 0.8, targetPos.z + 0.05);
    }

    isAnchored = true;
    reticleGroup.visible = false;
    scanningGuide.classList.add('hidden');
    anchoredToolbar.classList.remove('hidden');

    // Bunyikan audio ping dan haptic feedback jika didukung HP
    playAnchorSound(850);
    if (navigator.vibrate) navigator.vibrate([40, 60, 80]);

    modelStatusLabel.textContent = 'Ter-Anchor di Ruang Nyata';
    modelStatusLabel.className = 'badge-success';
  }

  // Klik tombol tap anchor
  btnTapAnchor.addEventListener('click', (e) => {
    e.stopPropagation();
    anchorModelAtReticle();
  });

  // Tap langsung pada canvas 3D
  spatialCanvas.addEventListener('pointerdown', (e) => {
    // Hanya jika belum ter-anchor dan klik bukan dari tombol UI
    if (!isAnchored && e.target === spatialCanvas) {
      anchorModelAtReticle();
    }
  });

  // Pindahkan / Re-Anchor
  btnReanchor.addEventListener('click', () => {
    isAnchored = false;
    scanningGuide.classList.remove('hidden');
    anchoredToolbar.classList.add('hidden');
    btnTapAnchor.classList.add('hidden');
    setPlaneMode(currentPlaneMode);
    playAnchorSound(550);
  });

  // Putar Orientasi Model Ter-Anchor
  btnRotateAnchor.addEventListener('click', () => {
    if (anchorContainer) {
      anchorContainer.rotation.y += Math.PI / 4; // Putar 45 derajat
      playAnchorSound(680);
    }
  });

  // Kunci / Lepas Skala Figur Nyata 1:1
  btnScaleReal.addEventListener('click', () => {
    isRealScale = !isRealScale;
    if (isRealScale) {
      btnScaleReal.classList.add('active-pill');
      btnScaleReal.innerHTML = '<span>📏 Skala 1:1 Nyata</span>';
      userScaleMultiplier = 1.0;
      sliderModelScale.value = 1.0;
      valScale.textContent = '1.0x (Skala Nyata)';
    } else {
      btnScaleReal.classList.remove('active-pill');
      btnScaleReal.innerHTML = '<span>📐 Skala Bebas</span>';
    }
    applyModelScale();
  });

  // ==========================================================================
  // 7. Sensor Giroskop Spasial ("Stick to the place & rotate away from camera")
  // ==========================================================================
  function handleDeviceOrientation(event) {
    if (event.alpha === null || event.beta === null || event.gamma === null) return;

    deviceOrientation.alpha = event.alpha; // Rotasi Z kompas (0 - 360)
    deviceOrientation.beta = event.beta;   // Kemiringan X depan/belakang (-180 - 180)
    deviceOrientation.gamma = event.gamma; // Kemiringan Y kiri/kanan (-90 - 90)
    deviceOrientation.hasData = true;

    if (isCameraActive && isGyroActive) {
      // Konversi orientasi fisik ponsel ke kamera 3D Three.js
      const degToRad = Math.PI / 180;
      const alpha = deviceOrientation.alpha * degToRad;
      const beta = (deviceOrientation.beta - 90) * degToRad;
      const gamma = -deviceOrientation.gamma * degToRad;

      const euler = new THREE.Euler(beta, alpha, gamma, 'YXZ');
      camera.quaternion.setFromEuler(euler);

      // Posisi kamera dijaga konstan di level mata
      camera.position.set(0, 1.6, 0);

      // Nonaktifkan OrbitControls saat giroskop aktif agar tidak konflik
      controls.enabled = false;
    }
  }

  // Meminta izin sensor gerak pada iOS 13+ & Android
  async function requestGyroPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleDeviceOrientation, true);
          isGyroActive = true;
          btnRequestGyro.classList.add('btn-primary');
          btnRequestGyro.textContent = '🧭 Sensor Aktif';
          alert('Sensor giroskop aktif! Saat Anda memutar HP, model akan tetap diam di titik ruangan.');
        } else {
          alert('Izin sensor gerak tidak diberikan.');
        }
      } catch (err) {
        console.warn('Gagal meminta izin DeviceOrientation:', err);
      }
    } else {
      // Standar browser / Android Chrome
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
      isGyroActive = true;
      btnRequestGyro.classList.add('btn-primary');
      btnRequestGyro.textContent = '🧭 Sensor Aktif';
    }
  }

  btnRequestGyro.addEventListener('click', requestGyroPermission);

  // ==========================================================================
  // 8. Loader GLB / GLTF dengan Normalisasi Skala Figur Nyata
  // ==========================================================================
  const gltfLoader = new THREE.GLTFLoader();

  function applyModelScale() {
    if (!currentModel) return;
    const finalScale = modelNormalizedScale * userScaleMultiplier;
    currentModel.scale.set(finalScale, finalScale, finalScale);
  }

  function loadGlbToScene(url, displayName) {
    modelStatusLabel.textContent = 'Memuat 3D...';
    modelStatusLabel.className = 'badge-success';

    gltfLoader.load(
      url,
      (gltf) => {
        // Hapus model sebelumnya
        if (currentModel) {
          anchorContainer.remove(currentModel);
          if (mixer) mixer.stopAllAction();
        }

        currentModel = gltf.scene;

        // Aktifkan bayangan untuk seluruh mesh
        currentModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material.envMapIntensity = 1.0;
            }
          }
        });

        // Hitung Bounding Box asli untuk normalisasi ke ukuran figur manusia nyata (~1.8m)
        const bbox = new THREE.Box3().setFromObject(currentModel);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const height = size.y || 1.0;

        // Normalisasi skala agar tinggi model setara baseModelHeight (1.8m)
        modelNormalizedScale = baseModelHeight / height;
        applyModelScale();

        // Letakkan pivot tepat di telapak kaki (Y = 0)
        bbox.setFromObject(currentModel);
        currentModel.position.y = -bbox.min.y * (baseModelHeight / height);

        anchorContainer.add(currentModel);

        // Pengaturan Animasi
        const animations = gltf.animations || [];
        if (animations.length > 0) {
          animationGroup.classList.remove('hidden');
          animationSelect.innerHTML = '';
          animations.forEach((clip) => {
            const opt = document.createElement('option');
            opt.value = clip.name;
            opt.textContent = clip.name;
            animationSelect.appendChild(opt);
          });

          mixer = new THREE.AnimationMixer(currentModel);
          activeAction = mixer.clipAction(animations[0]);
          activeAction.play();
          showPauseIcon(true);
        } else {
          animationGroup.classList.add('hidden');
        }

        modelNameLabel.textContent = displayName || 'Model 3D';
        modelStatusLabel.textContent = isAnchored ? 'Ter-Anchor di Ruang' : 'Siap Ditempatkan';
      },
      undefined,
      (error) => {
        console.error('Gagal memuat GLB via Three.js:', error);
        alert('Gagal memuat file GLB. Pastikan file tidak rusak.');
      }
    );

    // Sinkronkan juga ke Google <model-viewer>
    modelViewer.src = url;
  }

  // Load Model Awal (Astronaut)
  loadGlbToScene('assets/astronaut.glb', '🧑‍🚀 Astronaut (1.8m)');

  // File Picker Custom GLB
  btnBrowseFile.addEventListener('click', () => glbFileInput.click());

  glbFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(file);
      loadGlbToScene(currentObjectUrl, `${file.name}`);
    }
  });

  // Drag and drop GLB
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      const file = dt.files[0];
      if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) {
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = URL.createObjectURL(file);
        loadGlbToScene(currentObjectUrl, file.name);
      }
    }
  });

  // Pilih Sampel Bawaan
  sampleSelect.addEventListener('change', () => {
    const path = sampleSelect.value;
    const name = sampleSelect.options[sampleSelect.selectedIndex].text;
    loadGlbToScene(path, name);
  });

  // Kontrol Animasi
  animationSelect.addEventListener('change', () => {
    if (!mixer || !currentModel) return;
    const clipName = animationSelect.value;
    mixer.stopAllAction();
    const clip = THREE.AnimationClip.findByName(currentModel.animations || [], clipName);
    if (clip) {
      activeAction = mixer.clipAction(clip);
      activeAction.play();
      showPauseIcon(true);
    }
  });

  btnToggleAnim.addEventListener('click', () => {
    if (!activeAction) return;
    if (activeAction.isRunning()) {
      activeAction.paused = true;
      showPauseIcon(false);
    } else {
      activeAction.paused = false;
      showPauseIcon(true);
    }
  });

  function showPauseIcon(isPlaying) {
    if (isPlaying) {
      iconAnimPause.classList.remove('hidden');
      iconAnimPlay.classList.add('hidden');
    } else {
      iconAnimPause.classList.add('hidden');
      iconAnimPlay.classList.remove('hidden');
    }
  }

  // ==========================================================================
  // 9. Akses Kamera Langsung (Webcam / HP Camera Feed)
  // ==========================================================================
  async function startCamera() {
    try {
      if (cameraStream) stopCamera();

      const constraints = {
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoFeed.srcObject = cameraStream;
      await videoFeed.play();

      videoFeed.classList.add('active');
      if (currentFacingMode === 'user') {
        videoFeed.classList.add('mirrored');
      } else {
        videoFeed.classList.remove('mirrored');
      }

      isCameraActive = true;
      btnCameraText.textContent = 'Matikan Kamera AR';
      requestGyroPermission();

    } catch (err) {
      console.error('Kamera error:', err);
      alert('Tidak dapat menyalakan kamera. Berikan izin kamera di browser.');
      isCameraActive = false;
      btnCameraText.textContent = 'Nyalakan Kamera AR';
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    videoFeed.srcObject = null;
    videoFeed.classList.remove('active');
    isCameraActive = false;
    btnCameraText.textContent = 'Nyalakan Kamera AR';
    controls.enabled = true;
  }

  btnToggleCamera.addEventListener('click', () => {
    if (isCameraActive) stopCamera();
    else startCamera();
  });

  btnFlipCamera.addEventListener('click', async () => {
    currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
    if (isCameraActive) await startCamera();
  });

  // Google Scene Viewer Native
  btnTriggerGoogleAr.addEventListener('click', () => {
    modelViewer.activateAR();
  });

  // ==========================================================================
  // 10. Ambil Foto AR (Snapshot)
  // ==========================================================================
  btnSnapshot.addEventListener('click', () => {
    try {
      const width = spatialCanvas.width;
      const height = spatialCanvas.height;
      snapshotCanvas.width = width;
      snapshotCanvas.height = height;
      const ctx = snapshotCanvas.getContext('2d');

      // 1. Gambar Feed Video Kamera jika aktif
      if (isCameraActive && videoFeed.readyState >= 2) {
        ctx.save();
        if (currentFacingMode === 'user') {
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        }
        const vWidth = videoFeed.videoWidth;
        const vHeight = videoFeed.videoHeight;
        const scale = Math.max(width / vWidth, height / vHeight);
        const x = (width - vWidth * scale) / 2;
        const y = (height - vHeight * scale) / 2;
        ctx.drawImage(videoFeed, x, y, vWidth * scale, vHeight * scale);
        ctx.restore();
      } else {
        // Latar Gelap Halus jika kamera off
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0a0d14');
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Gambar Render 3D Canvas
      ctx.drawImage(spatialCanvas, 0, 0, width, height);

      // Watermark
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '14px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Spatial WebAR Studio • Figur Nyata', 24, height - 24);

      const snapshotUrl = snapshotCanvas.toDataURL('image/png');
      snapshotPreviewImg.src = snapshotUrl;
      btnDownloadPhoto.href = snapshotUrl;
      btnDownloadPhoto.download = `figur-ar-${Date.now()}.png`;
      snapshotModal.classList.remove('hidden');
      playAnchorSound(920);

    } catch (e) {
      console.error('Error snapshot:', e);
      alert('Gagal mengambil foto AR.');
    }
  });

  btnCloseSnapshot.addEventListener('click', () => snapshotModal.classList.add('hidden'));

  // ==========================================================================
  // 11. Pengaturan Pencahayaan & Slider Realisme
  // ==========================================================================
  sliderShadow.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    shadowMaterial.opacity = val * 0.35;
    dirLight.intensity = 1.0 + (val * 0.3);
  });

  sliderExposure.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    renderer.toneMappingExposure = val;
  });

  sliderModelScale.addEventListener('input', (e) => {
    userScaleMultiplier = parseFloat(e.target.value);
    valScale.textContent = `${userScaleMultiplier.toFixed(1)}x`;
    applyModelScale();
  });

  // ==========================================================================
  // 12. Tab Navigasi & Modal
  // ==========================================================================
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  btnToggleInfo.addEventListener('click', () => infoModal.classList.remove('hidden'));
  btnCloseModal.addEventListener('click', () => infoModal.classList.add('hidden'));
  btnModalOk.addEventListener('click', () => infoModal.classList.add('hidden'));

  [infoModal, snapshotModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Resize Window Handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ==========================================================================
  // 13. Render Loop Animasi Utama
  // ==========================================================================
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Update Animasi Model
    if (mixer) mixer.update(delta);

    // Animasi Rotasi Cincin Reticle saat Scanning
    if (!isAnchored && reticleGroup.visible) {
      innerRing.rotation.z += delta * 2.5;
      outerRing.rotation.z -= delta * 1.2;
      updateReticlePosition();
    }

    // Auto rotate jika aktif
    if (checkAutoRotate.checked && isAnchored && anchorContainer) {
      anchorContainer.rotation.y += delta * 0.8;
    }

    // Update kontrol kamera jika giroskop tidak sedang aktif
    if (!isGyroActive || !isCameraActive) {
      controls.update();
    }

    renderer.render(scene, camera);
  }

  animate();
});
