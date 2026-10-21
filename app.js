/**
 * Google WebAR Studio - Main Application Logic
 * Framework: Google <model-viewer> (WebXR / Scene Viewer / Quick Look)
 * Kemampuan: Custom GLB Loader + Live Camera AR (Browser & WebXR)
 */

document.addEventListener('DOMContentLoaded', () => {
  // === Elemen DOM Utama ===
  const modelViewer = document.getElementById('ar-viewer');
  const videoFeed = document.getElementById('camera-feed');
  const snapshotCanvas = document.getElementById('snapshot-canvas');
  const loadingBar = document.getElementById('loading-bar');
  const progressFill = loadingBar.querySelector('.progress-fill');

  // Input & Upload
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

  // Kontrol AR
  const btnTriggerGoogleAr = document.getElementById('btn-trigger-google-ar');
  const btnToggleCamera = document.getElementById('btn-toggle-camera');
  const btnCameraText = document.getElementById('btn-camera-text');
  const cameraStatusBanner = document.getElementById('camera-status-banner');
  const cameraStatusText = document.getElementById('camera-status-text');
  const btnFlipCamera = document.getElementById('btn-flip-camera');
  const btnSnapshot = document.getElementById('btn-snapshot');

  // Tampilan & Lighting
  const sliderShadow = document.getElementById('slider-shadow');
  const valShadow = document.getElementById('val-shadow');
  const sliderExposure = document.getElementById('slider-exposure');
  const valExposure = document.getElementById('val-exposure');
  const selectEnv = document.getElementById('select-env');
  const checkAutoRotate = document.getElementById('check-auto-rotate');
  const btnResetView = document.getElementById('btn-reset-view');

  // Tab & Modal
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const btnToggleInfo = document.getElementById('btn-toggle-info');
  const infoModal = document.getElementById('info-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnModalOk = document.getElementById('btn-modal-ok');

  // Snapshot Modal
  const snapshotModal = document.getElementById('snapshot-modal');
  const snapshotPreviewImg = document.getElementById('snapshot-preview-img');
  const btnDownloadPhoto = document.getElementById('btn-download-photo');
  const btnCloseSnapshot = document.getElementById('btn-close-snapshot');

  // === State Aplikasi ===
  let currentObjectUrl = null;
  let cameraStream = null;
  let currentFacingMode = 'environment'; // 'environment' (belakang) atau 'user' (depan/selfie)
  let isCameraActive = false;

  // ==========================================================================
  // 1. Inisialisasi Google <model-viewer> Event Listeners
  // ==========================================================================

  // Progress saat loading model
  modelViewer.addEventListener('progress', (event) => {
    const progress = event.detail.totalProgress;
    progressFill.style.width = `${progress * 100}%`;
    if (progress >= 1) {
      setTimeout(() => {
        loadingBar.style.opacity = '0';
      }, 300);
    } else {
      loadingBar.style.opacity = '1';
    }
  });

  // Saat model selesai dimuat
  modelViewer.addEventListener('load', () => {
    modelStatusLabel.textContent = 'Siap Ditampilkan';
    modelStatusLabel.className = 'badge-success';

    // Periksa Animasi
    const animations = modelViewer.availableAnimations || [];
    if (animations.length > 0) {
      animationGroup.classList.remove('hidden');
      animationSelect.innerHTML = '';
      animations.forEach((animName) => {
        const option = document.createElement('option');
        option.value = animName;
        option.textContent = animName;
        animationSelect.appendChild(option);
      });
      modelViewer.animationName = animations[0];
      modelViewer.play();
      showPauseIcon(true);
    } else {
      animationGroup.classList.add('hidden');
    }
  });

  // Saat terjadi error pemuatan model
  modelViewer.addEventListener('error', (event) => {
    console.error('Error saat memuat model 3D:', event);
    modelStatusLabel.textContent = 'Gagal Memuat File';
    modelStatusLabel.className = 'badge-success';
    modelStatusLabel.style.background = 'rgba(239, 68, 68, 0.2)';
    modelStatusLabel.style.color = '#f87171';
    alert('Format file GLB/GLTF tidak valid atau file rusak. Silakan periksa kembali file 3D Anda.');
  });

  // Status WebXR AR dari model-viewer
  modelViewer.addEventListener('ar-status', (event) => {
    console.log('Status AR Google:', event.detail.status);
    if (event.detail.status === 'failed') {
      alert('Perangkat Anda belum mendukung Google WebXR / Scene Viewer native AR. Anda dapat menggunakan mode "Kamera Langsung (Browser AR)".');
    }
  });

  // ==========================================================================
  // 2. Custom GLB File Loader (File Picker & Drag-and-Drop)
  // ==========================================================================

  function loadGlbFile(file) {
    if (!file) return;

    // Validasi ekstensi
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.glb') && !fileName.endsWith('.gltf')) {
      alert('Mohon pilih file dengan format 3D .glb atau .gltf');
      return;
    }

    // Bersihkan URL objek sebelumnya agar tidak memory leak
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    // Buat Blob URL lokal
    currentObjectUrl = URL.createObjectURL(file);

    // Format ukuran file
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    modelNameLabel.textContent = `${file.name} (${sizeMb} MB)`;
    modelStatusLabel.textContent = 'Memuat...';

    // Pasang ke model-viewer
    modelViewer.src = currentObjectUrl;
  }

  // Klik tombol pilih file
  btnBrowseFile.addEventListener('click', () => {
    glbFileInput.click();
  });

  glbFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadGlbFile(e.target.files[0]);
    }
  });

  // Drag and drop event pada Dropzone
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      loadGlbFile(dt.files[0]);
    }
  });

  // Drop ke seluruh window juga didukung untuk kenyamanan user
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) {
        loadGlbFile(file);
      }
    }
  });

  // Pilih Model Sampel Bawaan
  sampleSelect.addEventListener('change', () => {
    const path = sampleSelect.value;
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    const displayName = sampleSelect.options[sampleSelect.selectedIndex].text;
    modelNameLabel.textContent = displayName;
    modelStatusLabel.textContent = 'Memuat...';
    modelViewer.src = path;
  });

  // Ganti Animasi
  animationSelect.addEventListener('change', () => {
    modelViewer.animationName = animationSelect.value;
    modelViewer.play();
    showPauseIcon(true);
  });

  // Play / Pause Animasi
  btnToggleAnim.addEventListener('click', () => {
    if (modelViewer.paused) {
      modelViewer.play();
      showPauseIcon(true);
    } else {
      modelViewer.pause();
      showPauseIcon(false);
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
  // 3. Kontrol AR (Google WebXR Native & Live In-Browser Webcam AR)
  // ==========================================================================

  // A. Trigger Google Native AR (WebXR / Scene Viewer / Quick Look)
  btnTriggerGoogleAr.addEventListener('click', () => {
    if (modelViewer.canActivateAR) {
      modelViewer.activateAR();
    } else {
      // Jika di desktop, model-viewer otomatis membuka modal QR code untuk discan lewat HP
      modelViewer.activateAR();
    }
  });

  // B. In-Browser Live Camera AR (Webcam PC / Kamera Smartphone)
  async function startCamera() {
    try {
      if (cameraStream) {
        stopCamera();
      }

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
      btnCameraText.textContent = 'Matikan Kamera Browser';
      cameraStatusBanner.classList.remove('hidden');
      cameraStatusText.textContent = currentFacingMode === 'user' ? 'Kamera Depan Aktif' : 'Kamera Belakang Aktif';

    } catch (err) {
      console.error('Gagal mengakses kamera:', err);
      alert('Tidak dapat mengakses kamera: ' + (err.message || 'Izin kamera ditolak. Pastikan memberikan izin akses kamera di browser.'));
      isCameraActive = false;
      btnCameraText.textContent = 'Nyalakan Kamera Browser';
      cameraStatusBanner.classList.add('hidden');
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
    btnCameraText.textContent = 'Nyalakan Kamera Browser';
    cameraStatusBanner.classList.add('hidden');
  }

  btnToggleCamera.addEventListener('click', () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  // Flip Kamera (Depan / Belakang)
  btnFlipCamera.addEventListener('click', async () => {
    currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
    if (isCameraActive) {
      await startCamera();
    }
  });

  // Snapshot Foto AR (Gabungan Background Kamera + Model 3D)
  btnSnapshot.addEventListener('click', async () => {
    try {
      const viewerWidth = modelViewer.clientWidth;
      const viewerHeight = modelViewer.clientHeight;

      snapshotCanvas.width = viewerWidth;
      snapshotCanvas.height = viewerHeight;
      const ctx = snapshotCanvas.getContext('2d');

      // 1. Gambar Feed Video Kamera jika aktif
      if (isCameraActive && videoFeed.readyState >= 2) {
        ctx.save();
        if (currentFacingMode === 'user') {
          // Mirror jika kamera depan
          ctx.translate(viewerWidth, 0);
          ctx.scale(-1, 1);
        }

        // Hitung aspek rasio agar video ter-cover dengan benar
        const vWidth = videoFeed.videoWidth;
        const vHeight = videoFeed.videoHeight;
        const scale = Math.max(viewerWidth / vWidth, viewerHeight / vHeight);
        const x = (viewerWidth - vWidth * scale) / 2;
        const y = (viewerHeight - vHeight * scale) / 2;

        ctx.drawImage(videoFeed, x, y, vWidth * scale, vHeight * scale);
        ctx.restore();
      } else {
        // Jika kamera tidak aktif, gunakan latar belakang gradien gelap elegan
        const grad = ctx.createLinearGradient(0, 0, 0, viewerHeight);
        grad.addColorStop(0, '#0a0d14');
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, viewerWidth, viewerHeight);
      }

      // 2. Ambil render canvas dari Google <model-viewer>
      const modelDataUrl = modelViewer.toDataURL('image/png');
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, viewerWidth, viewerHeight);

        // Tambahkan watermark halus
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '13px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Google WebAR Studio', 20, viewerHeight - 20);

        // Hasil foto
        const snapshotUrl = snapshotCanvas.toDataURL('image/png');
        snapshotPreviewImg.src = snapshotUrl;
        btnDownloadPhoto.href = snapshotUrl;
        btnDownloadPhoto.download = `ar-snapshot-${Date.now()}.png`;
        snapshotModal.classList.remove('hidden');
      };
      img.src = modelDataUrl;

    } catch (e) {
      console.error('Gagal mengambil snapshot:', e);
      alert('Terjadi kesalahan saat mengambil foto AR.');
    }
  });

  btnCloseSnapshot.addEventListener('click', () => {
    snapshotModal.classList.add('hidden');
  });

  // ==========================================================================
  // 4. Kontrol Tampilan & Lighting
  // ==========================================================================

  sliderShadow.addEventListener('input', (e) => {
    const val = e.target.value;
    valShadow.textContent = parseFloat(val).toFixed(1);
    modelViewer.shadowIntensity = val;
  });

  sliderExposure.addEventListener('input', (e) => {
    const val = e.target.value;
    valExposure.textContent = parseFloat(val).toFixed(1);
    modelViewer.exposure = val;
  });

  selectEnv.addEventListener('change', (e) => {
    modelViewer.environmentImage = e.target.value;
  });

  checkAutoRotate.addEventListener('change', (e) => {
    modelViewer.autoRotate = e.target.checked;
  });

  btnResetView.addEventListener('click', () => {
    modelViewer.cameraOrbit = '0deg 75deg 105%';
    modelViewer.cameraTarget = 'auto auto auto';
    modelViewer.fieldOfView = 'auto';
  });

  // ==========================================================================
  // 5. Tab Navigasi & Modal
  // ==========================================================================

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  btnToggleInfo.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  btnModalOk.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  // Tutup modal jika klik di luar kartu
  [infoModal, snapshotModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
});
