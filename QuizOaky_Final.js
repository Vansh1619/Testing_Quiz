(function() {
  'use strict';

  // App state
  let questions = [];
  let currentQuestionIndex = 0;
  let studentAnswers = {};
  let currentRole = null;
  let currentStudentName = null;
  let quizId = null;
  let collectedResults = [];
  let questionTimerInterval = null;
  let violationCount = 0;
  let isLocked = false;
  let shuffleQuestions = false;
  let showHints = true;
  let quizStartTime = null;
  let totalQuizTime = null;
  let isPaused = false;
  let pausedTimeLeft = null;
  let originalQuestionOrder = [];

  const QUESTION_TIME = 60;
  const TEACHER_KEY_HASH_KEY = 'teacher_key_hash';

  const $ = id => document.getElementById(id);
  const safe = v => typeof v === 'string' ? v : (v == null ? '' : String(v));

  // Dark Mode
  function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButton();
  }

  function updateThemeButton() {
    const btn = $('themeToggle');
    if (btn) {
      const theme = document.body.getAttribute('data-theme');
      const icon = btn.querySelector('.theme-icon');
      if (icon) {
        icon.textContent = theme === 'dark' ? 'Light' : 'Dark';
      }
      btn.className = theme === 'dark' ? 'btn btn-dark btn-sm theme-btn' : 'btn btn-light btn-sm theme-btn';
    }
  }

  function loadTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', saved);
    updateThemeButton();
  }

  // Alert
  function showAlert(message, type) {
    try {
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert alert-${type || 'success'}`;
      alertDiv.textContent = message;
      const content = document.querySelector('.content') || document.body;
      content.insertBefore(alertDiv, content.firstChild);
      setTimeout(() => { try { alertDiv.remove(); } catch (e) {} }, 4000);
    } catch (e) {
      try { alert(message); } catch (err) { console.log(message); }
    }
  }

  // Storage
  function saveQuizData() {
    if (!quizId) quizId = 'QUIZ_' + Date.now();
    try {
      localStorage.setItem('quiz_questions', JSON.stringify(questions));
      localStorage.setItem('quiz_id', quizId);
    } catch (e) {}
  }

  function loadTeacherData() {
    try {
      const savedQuestions = localStorage.getItem('quiz_questions');
      const savedQuizId = localStorage.getItem('quiz_id');
      const savedResults = localStorage.getItem('collected_results');
      if (savedQuestions) questions = JSON.parse(savedQuestions);
      if (savedQuizId) quizId = savedQuizId;
      if (savedResults) collectedResults = JSON.parse(savedResults);
      loadQuestions();
      updateShareLink();
      displayCollectedResults();
      updateCategoryFilter();
      // reduce overly-sensitive scroll on long internal lists
      const slowScrollTargets = ['questionsList', 'collectedResultsList'];
      slowScrollTargets.forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('wheel', function(e) {
          e.preventDefault();
          // apply gentler scroll multiplier
          const factor = 0.35;
          this.scrollBy({ top: e.deltaY * factor, behavior: 'auto' });
        }, { passive: false });
      });
    } catch (e) {
      console.error('loadTeacherData error', e);
    }
  }

  // Question Management
  function updateQuestionForm() {
    const type = $('questionType').value;
    const mcOpts = $('mcOptions');
    const tfOpts = $('tfOptions');
    if (type === 'tf') {
      mcOpts.style.display = 'none';
      tfOpts.style.display = 'block';
      // make TF radios required and remove required from MC radios (browser validation)
      document.querySelectorAll('input[name="correctOption"]').forEach(r => r.removeAttribute('required'));
      document.querySelectorAll('input[name="tfCorrectOption"]').forEach(r => r.setAttribute('required','required'));
      // remove required from MC option text inputs as they are hidden
      ['optionText0','optionText1','optionText2','optionText3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.removeAttribute('required');
      });
    } else {
      mcOpts.style.display = 'block';
      tfOpts.style.display = 'none';
      // ensure MC radios are required and TF radios are not
      document.querySelectorAll('input[name="correctOption"]').forEach(r => r.setAttribute('required','required'));
      document.querySelectorAll('input[name="tfCorrectOption"]').forEach(r => r.removeAttribute('required'));
      // ensure MC option text inputs are required when MC selected
      ['optionText0','optionText1','optionText2','optionText3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('required','required');
      });
    }
  }

  function loadQuestions() {
    const questionsList = $('questionsList');
    const questionCount = $('questionCount');
    if (questionCount) questionCount.textContent = questions.length;
    if (!questionsList) return;
    questionsList.innerHTML = '';
    if (questions.length === 0) {
      questionsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No questions created yet. Add your first question above!</p>';
      return;
    }
    questions.forEach((q, index) => {
      const questionDiv = document.createElement('div');
      questionDiv.className = 'question-item';
      const cat = q.category ? ` [${escapeHtml(q.category)}]` : '';
      const hint = q.hint ? ` - Hint: ${escapeHtml(q.hint)}` : '';
      questionDiv.innerHTML = `
        <div class="question-text">${index + 1}. ${escapeHtml(q.question)}${cat}${hint}</div>
        <div class="options-list">
          ${(q.type === 'tf' ? ['True', 'False'] : q.options).map((option, optIndex) =>
            `<div class="option-display ${optIndex === q.correctAnswer ? 'correct-option' : ''}">${q.type === 'tf' ? (optIndex === 0 ? 'True' : 'False') : String.fromCharCode(65 + optIndex)}. ${escapeHtml(option)}</div>`
          ).join('')}
        </div>
        <button class="btn btn-info" onclick="editQuestion(${q.id})" style="margin-right: 5px;">Edit</button>
        <button class="btn btn-danger" data-id="${q.id}">Delete</button>
      `;
      questionsList.appendChild(questionDiv);
      const delBtn = questionDiv.querySelector('button[data-id]');
      if (delBtn) delBtn.addEventListener('click', () => {
        if (confirm('Delete this question?')) {
          questions = questions.filter(x => x.id !== q.id);
          saveQuizData();
          loadQuestions();
          updateShareLink();
          updateCategoryFilter();
          showAlert('Question deleted!', 'success');
        }
      });
    });
  }

  function editQuestion(id) {
    const q = questions.find(x => x.id === id);
    if (!q) return;
    $('questionType').value = q.type || 'mc';
    updateQuestionForm();
    $('questionText').value = q.question;
    $('questionCategory').value = q.category || '';
    $('questionHint').value = q.hint || '';
    $('questionExplanation').value = q.explanation || '';
    if (q.type === 'tf') {
      document.querySelector(`input[name="tfCorrectOption"][value="${q.correctAnswer}"]`).checked = true;
    } else {
      q.options.forEach((opt, i) => {
        $(`optionText${i}`).value = opt;
        $(`optionImage${i}`).value = q.optionImages?.[i] || '';
      });
      document.querySelector(`input[name="correctOption"][value="${q.correctAnswer}"]`).checked = true;
    }
    questions = questions.filter(x => x.id !== id);
    saveQuizData();
    loadQuestions();
    updateCategoryFilter();
    showAlert('Question loaded for editing', 'success');
  }

  function clearAllQuestions() {
    if (!confirm('Delete ALL questions?')) return;
    questions = [];
    saveQuizData();
    loadQuestions();
    updateShareLink();
    updateCategoryFilter();
    showAlert('All questions cleared!', 'success');
  }

  // Category Filter
  function updateCategoryFilter() {
    const filter = $('categoryFilter');
    if (!filter) return;
    const cats = new Set(questions.map(q => q.category).filter(Boolean));
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">All Categories</option>';
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      filter.appendChild(opt);
    });
    filter.value = currentVal;
  }

  // Question Shuffle
  function toggleQuestionShuffle() {
    shuffleQuestions = !shuffleQuestions;
    const btn = $('shuffleBtn');
    if (btn) btn.textContent = `Shuffle: ${shuffleQuestions ? 'ON' : 'OFF'}`;
    showAlert(`Shuffle ${shuffleQuestions ? 'enabled' : 'disabled'}`, 'info');
  }

  // Preview
  function previewQuiz() {
    const section = $('previewSection');
    if (!section) return;
    if (section.style.display === 'block') {
      section.style.display = 'none';
      return;
    }
    if (questions.length === 0) {
      showAlert('No questions to preview!', 'warning');
      return;
    }
    section.style.display = 'block';
    const preview = questions.slice(0, 3);
    section.querySelector('#previewContent').innerHTML = preview.map((q, i) => `
      <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 5px;">
        <strong>Q${i+1}: ${escapeHtml(q.question)}</strong>
        <div style="margin-top: 10px; margin-left: 10px;">
          ${(q.type === 'tf' ? ['True', 'False'] : q.options).map((opt, j) => `
            <div>${q.type === 'tf' ? (j === 0 ? 'True' : 'False') : String.fromCharCode(65 + j)}. ${escapeHtml(opt)}</div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // CSV Import
  function importCSV() {
    const file = $('csvFile');
    if (!file || !file.files[0]) {
      showAlert('Select a CSV file first!', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target.result;
      const lines = csv.split('\n').slice(1);
      let count = 0;
      lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(',');
        if (parts.length < 6) return;
        const q = parts[0].trim();
        const opts = [parts[1].trim(), parts[2].trim(), parts[3].trim(), parts[4].trim()];
        const correct = parseInt(parts[5]) || 0;
        const cat = parts[6]?.trim() || '';
        const hint = parts[7]?.trim() || '';
        const expl = parts[8]?.trim() || '';
        if (q && opts.every(o => o)) {
          questions.push({
            id: Date.now() + count++,
            type: 'mc',
            question: q,
            options: opts,
            correctAnswer: correct,
            category: cat,
            hint: hint,
            explanation: expl,
            optionImages: []
          });
        }
      });
      saveQuizData();
      loadQuestions();
      updateShareLink();
      updateCategoryFilter();
      showAlert(`Imported ${count} questions!`, 'success');
      $('csvFile').value = '';
    };
    reader.readAsText(file.files[0]);
  }

  // QR Code
  let qrGenerated = false;
  let html5QrScanner = null;
  let qrScannerActive = false;
  let codeReader = null;
  let videoInputDevices = [];
  let currentVideoDeviceIndex = 0;
  let qrDetectionTimer = null;
  let torchOn = false;
  
  function toggleQRCode() {
    const container = $('qrContainer');
    if (!container) return;
    if (qrGenerated) {
      container.innerHTML = '';
      qrGenerated = false;
      $('qrToggleBtn').textContent = 'Show QR Code';
      return;
    }
    const link = $('quizLink').textContent;
    if (!link || link.includes('Generating')) {
      showAlert('Generate quiz link first!', 'warning');
      return;
    }
    container.innerHTML = '';
    new QRCode(container, { text: link, width: 250, height: 250 });
    qrGenerated = true;
    $('qrToggleBtn').textContent = 'Hide QR Code';
  }

  // QR Scanner for students (uses ZXing or Html5Qrcode)

  function startQrScanner() {
    const reader = $('qrReader');
    const statusBox = $('qrScannerStatus');
    const resultBox = $('qrScanResult');
    
    if (!reader) return showAlert('QR reader element not found.', 'warning');
    if (qrScannerActive) return showAlert('Scanner already running', 'info');
    
    console.log('Starting QR scanner...');
    console.log('ZXing available:', typeof ZXing !== 'undefined');
    console.log('Html5Qrcode available:', typeof Html5Qrcode !== 'undefined');
    
    // Try ZXing first (more reliable)
    if (typeof ZXing !== 'undefined' && ZXing.BrowserCodeReader) {
      tryZXingScan(reader, statusBox, resultBox);
    }
    // Fall back to Html5Qrcode
    else if (typeof Html5Qrcode !== 'undefined') {
      tryHtml5QrcodeScan(reader, statusBox, resultBox);
    }
    // Both failed
    else {
      showAlert('QR scanner libraries not loaded. Please try refreshing the page or use another join method.', 'warning');
      console.error('Neither ZXing nor Html5Qrcode available');
    }
  }

  function tryZXingScan(reader, statusBox, resultBox) {
    try {
      reader.style.display = 'block';
      reader.innerHTML = '';
      if (statusBox) statusBox.style.display = 'block';
      const video = document.createElement('video');
      video.style.width = '100%';
      video.style.height = '100%';
      video.setAttribute('playsinline', '');
      reader.appendChild(video);

      codeReader = new ZXing.BrowserCodeReader();
      // Prefer rear camera: try to find a device labeled back/rear or use the last device
      codeReader.listVideoInputDevices().then(devices => {
        videoInputDevices = devices || [];
        // choose rear if available
        let chosenDeviceId = undefined;
        currentVideoDeviceIndex = 0;
        if (videoInputDevices.length) {
          for (let i = 0; i < videoInputDevices.length; i++) {
            const d = videoInputDevices[i];
            const label = (d && d.label) ? d.label.toLowerCase() : '';
            if (/back|rear|environment|camera 1/.test(label)) { currentVideoDeviceIndex = i; chosenDeviceId = d.deviceId || d.deviceId; break; }
          }
          if (!chosenDeviceId) {
            currentVideoDeviceIndex = videoInputDevices.length - 1;
            chosenDeviceId = videoInputDevices[currentVideoDeviceIndex].deviceId;
          }
        }

        // show flip button if multiple devices
        try { if (videoInputDevices.length > 1) { const fbtn = $('flipCameraBtn'); if (fbtn) fbtn.style.display = 'inline-block'; } } catch(e){}

        // Try to get a stream first (so we can control torch), then decode
        navigator.mediaDevices.getUserMedia({ video: { deviceId: chosenDeviceId ? { exact: chosenDeviceId } : undefined, facingMode: { ideal: 'environment' } } }).then(stream => {
            codeReader.decodeFromVideoDevice(chosenDeviceId, video, (result, err) => {
          video.srcObject = stream; video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute('playsinline','');

          // show active camera label
          try { const lbl = (videoInputDevices[currentVideoDeviceIndex] && videoInputDevices[currentVideoDeviceIndex].label) || ''; if (statusBox) statusBox.innerText = 'Using: ' + (lbl || 'camera'); } catch(e){}

          codeReader.decodeFromVideoDevice(chosenDeviceId, video, (result, err) => {
            if (result) {
              try { if (qrDetectionTimer) { clearTimeout(qrDetectionTimer); qrDetectionTimer = null; } } catch(e){}
              console.log('QR code detected:', result.text);
              const text = result.text.trim();
              if (resultBox) resultBox.value = text;
              const joinCodeEl = $('joinCode');
              if (joinCodeEl) joinCodeEl.value = text;
              if (statusBox) statusBox.innerText = 'QR code detected.';
              showAlert('QR code scanned successfully!', 'success');
              stopQrScanner();
              return;
            }
            if (err && err.name !== 'NotFoundException') {
              console.warn('ZXing error:', err);
            }
          }).then(() => {
            qrScannerActive = true;
            if (statusBox) statusBox.innerText = 'Camera started. Point at a QR code.';
            showAlert('Camera started! Point at QR code to scan.', 'info');
            // detection timer
            try {
              if (qrDetectionTimer) clearTimeout(qrDetectionTimer);
              qrDetectionTimer = setTimeout(() => {
                console.warn('ZXing did not detect QR within timeout, switching to Html5Qrcode fallback');
                try { stopQrScanner(); } catch(e){}
                tryHtml5QrcodeScan(reader, statusBox, resultBox);
              }, 10000);
            } catch(e) { console.warn('Could not set detection timer', e); }
          }).catch(err => {
            console.error('ZXing scan error after getUserMedia:', err);
            reader.style.display = 'none'; if (statusBox) statusBox.style.display = 'none';
            if (err && err.name === 'NotAllowedError') {
              showAlert('Camera permission denied. Please enable camera access in your browser settings.', 'warning');
            } else {
              showAlert('Camera error: ' + (err && err.message ? err.message : String(err)), 'warning');
            }
          });
        }).catch(err => {
          console.warn('getUserMedia failed, trying decodeFromVideoDevice directly', err);
          // fallback to original behavior
          codeReader.decodeFromVideoDevice(chosenDeviceId, video, (result, err2) => {
            if (result) {
              try { if (qrDetectionTimer) { clearTimeout(qrDetectionTimer); qrDetectionTimer = null; } } catch(e){}
              console.log('QR code detected:', result.text);
              const text = result.text.trim(); if (resultBox) resultBox.value = text; const joinCodeEl = $('joinCode'); if (joinCodeEl) joinCodeEl.value = text; showAlert('QR code scanned successfully!', 'success'); stopQrScanner(); return;
            }
            if (err2 && err2.name !== 'NotFoundException') console.warn('ZXing error fallback:', err2);
          }).then(() => { qrScannerActive = true; if (statusBox) statusBox.innerText = 'Camera started. Point at a QR code.'; showAlert('Camera started! Point at QR code to scan.', 'info'); }).catch(err3 => { console.error('ZXing start fallback error', err3); tryHtml5QrcodeScan(reader, statusBox, resultBox); });
        });
          if (result) {
            // clear detection timer
            try { if (qrDetectionTimer) { clearTimeout(qrDetectionTimer); qrDetectionTimer = null; } } catch(e){}
            console.log('QR code detected:', result.text);
            const text = result.text.trim();
            if (resultBox) resultBox.value = text;
            const joinCodeEl = $('joinCode');
            if (joinCodeEl) joinCodeEl.value = text;
            if (statusBox) statusBox.innerText = 'QR code detected.';
            showAlert('QR code scanned successfully!', 'success');
            stopQrScanner();
            return;
          }
          if (err && err.name !== 'NotFoundException') {
            console.warn('ZXing error:', err);
          }
        }).then(() => {
          qrScannerActive = true;
          if (statusBox) statusBox.innerText = 'Camera started. Point at a QR code.';
          showAlert('Camera started! Point at QR code to scan.', 'info');
          // If no QR detected within 10s, fallback to Html5Qrcode which may be more tolerant
          try {
            if (qrDetectionTimer) clearTimeout(qrDetectionTimer);
            qrDetectionTimer = setTimeout(() => {
              console.warn('ZXing did not detect QR within timeout, switching to Html5Qrcode fallback');
              try {
                stopQrScanner();
              } catch(e){}
              tryHtml5QrcodeScan(reader, statusBox, resultBox);
            }, 10000);
          } catch(e) { console.warn('Could not set detection timer', e); }
        }).catch(err => {
          console.error('ZXing scan error:', err);
          reader.style.display = 'none';
          if (statusBox) statusBox.style.display = 'none';

          if (err && err.name === 'NotAllowedError') {
            showAlert('Camera permission denied. Please enable camera access in your browser settings.', 'warning');
          } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
            showAlert('No camera found on device. Trying alternative scanner...', 'warning');
            setTimeout(() => tryHtml5QrcodeScan(reader, statusBox, resultBox), 500);
          } else {
            showAlert('Camera error: ' + (err && err.message ? err.message : String(err)), 'warning');
          }
        });
      }).catch(err => {
        console.warn('ZXing listVideoInputDevices error:', err);
        // fallback to Html5Qrcode
        tryHtml5QrcodeScan(reader, statusBox, resultBox);
      });
    } catch (e) {
      console.error('ZXing exception:', e);
      reader.style.display = 'none';
      if (statusBox) statusBox.style.display = 'none';
      showAlert('Scanner initialization failed. Trying alternative...', 'warning');
      setTimeout(() => tryHtml5QrcodeScan(reader, statusBox, resultBox), 500);
    }
  }

  function tryHtml5QrcodeScan(reader, statusBox, resultBox) {
    if (typeof Html5Qrcode === 'undefined') {
      showAlert('QR scanner not available. Please use another join method (paste link or enter code).', 'warning');
      return;
    }
    
    try {
      reader.style.display = 'block';
      reader.innerHTML = '';
      if (statusBox) statusBox.style.display = 'block';
      
      html5QrScanner = new Html5Qrcode('qrReader');
      
      Html5Qrcode.getCameras().then(cameras => {
        if (!cameras || cameras.length === 0) {
          showAlert('No camera detected. Please check device and try again.', 'warning');
          reader.style.display = 'none';
          if (statusBox) statusBox.style.display = 'none';
          return;
        }
        
        // store devices and prefer rear camera
        videoInputDevices = cameras || [];
        currentVideoDeviceIndex = 0;
        let cameraId = null;
        for (let i = 0; i < videoInputDevices.length; i++) {
          const label = (videoInputDevices[i].label || '').toLowerCase();
          if (/back|rear|environment|camera 1/.test(label)) { currentVideoDeviceIndex = i; cameraId = videoInputDevices[i].id; break; }
        }
        if (!cameraId && videoInputDevices.length) { currentVideoDeviceIndex = videoInputDevices.length - 1; cameraId = videoInputDevices[currentVideoDeviceIndex].id; }
        try { if (videoInputDevices.length > 1) { const fbtn = $('flipCameraBtn'); if (fbtn) fbtn.style.display = 'inline-block'; } } catch(e){}

        const config = {
          fps: 10,
          qrbox: { width: Math.min(300, Math.floor(window.innerWidth * 0.8)), height: Math.min(300, Math.floor(window.innerWidth * 0.8)) },
          aspectRatio: 1.0,
          disableFlip: false
        };

        html5QrScanner.start(
          cameraId,
          config,
          (decodedText) => {
            console.log('QR code decoded:', decodedText);
            const text = decodedText.trim();
            if (resultBox) resultBox.value = text;
            const joinCodeEl = $('joinCode');
            if (joinCodeEl) joinCodeEl.value = text;
            if (statusBox) statusBox.innerText = 'QR code detected.';
            showAlert('QR code scanned successfully!', 'success');
            stopQrScanner();
          },
          (error) => {
            // ignore intermittent scan failures silently
          }
        ).then(() => {
          qrScannerActive = true;
          if (statusBox) statusBox.innerText = 'Camera started. Point at a QR code.';
          showAlert('Camera started! Point at QR code to scan.', 'info');
        }).catch(err => {
          console.error('Html5Qrcode start error:', err);
          reader.style.display = 'none';
          if (statusBox) statusBox.style.display = 'none';
          showAlert('Camera access failed. Please try another join method.', 'warning');
        });
      }).catch(err => {
        console.error('Camera access error:', err);
        reader.style.display = 'none';
        if (statusBox) statusBox.style.display = 'none';
        showAlert('Could not access camera. Please check permissions and try again.', 'warning');
      });
    } catch (e) {
      console.error('Html5Qrcode exception:', e);
      reader.style.display = 'none';
      if (statusBox) statusBox.style.display = 'none';
      showAlert('Scanner failed. Please use another join method.', 'warning');
    }
  }

  function stopQrScanner() {
    const reader = $('qrReader');
    const statusBox = $('qrScannerStatus');
    
    // Stop ZXing scanner
    if (codeReader) {
      try {
        codeReader.reset();
        codeReader = null;
      } catch (e) {
        console.warn('Error stopping ZXing:', e);
      }
    }
    
    // Stop Html5Qrcode scanner
    if (html5QrScanner && qrScannerActive) {
      html5QrScanner.stop().then(() => {
        try { html5QrScanner.clear(); } catch (e) {}
        html5QrScanner = null;
      }).catch(err => {
        console.warn('Error stopping Html5Qrcode:', err);
        html5QrScanner = null;
      });
    }
    
    qrScannerActive = false;
    if (reader) { reader.innerHTML = ''; reader.style.display = 'none'; }
    if (statusBox) statusBox.style.display = 'none';
    try { const fbtn = $('flipCameraBtn'); if (fbtn) fbtn.style.display = 'none'; } catch(e){}
    try { if (qrDetectionTimer) { clearTimeout(qrDetectionTimer); qrDetectionTimer = null; } } catch(e){}
    try { const tbtn = $('torchBtn'); if (tbtn) tbtn.style.display = 'none'; } catch(e){}
    try {
      if (scanningStream && scanningStream.getTracks) {
        scanningStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
      }
      scanningStream = null;
      torchOn = false;
    } catch(e){}
  }

  function toggleTorch() {
    if (!scanningStream) return showAlert('Torch not available: camera inactive', 'warning');
    const track = scanningStream.getVideoTracks()[0];
    if (!track) return showAlert('Torch not available: no video track', 'warning');
    const cap = track.getCapabilities ? track.getCapabilities() : {};
    if (!cap.torch) return showAlert('Torch not supported on this device/browser', 'warning');
    try {
      torchOn = !torchOn;
      track.applyConstraints({ advanced: [{ torch: torchOn }] }).then(() => {
        const tbtn = $('torchBtn'); if (tbtn) tbtn.textContent = torchOn ? 'Turn Flash Off' : 'Turn Flash On';
        showAlert('Flash ' + (torchOn ? 'enabled' : 'disabled'), 'info');
      }).catch(err => {
        console.warn('Torch applyConstraints failed', err);
        showAlert('Could not toggle flash: ' + (err && err.message ? err.message : String(err)), 'warning');
      });
    } catch(e) { console.error('toggleTorch error', e); showAlert('Torch failed', 'warning'); }
  }

  function flipCamera() {
    if (!videoInputDevices || videoInputDevices.length <= 1) return showAlert('No alternate camera found', 'info');
    // stop current
    stopQrScanner();
    // choose next
    currentVideoDeviceIndex = (currentVideoDeviceIndex + 1) % videoInputDevices.length;
    const nextDevice = videoInputDevices[currentVideoDeviceIndex];
    // small delay before restarting
    setTimeout(() => {
      const reader = $('qrReader');
      const statusBox = $('qrScannerStatus');
      const resultBox = $('qrScanResult');
      // If ZXing available, try it with chosen device
      if (typeof ZXing !== 'undefined' && ZXing.BrowserCodeReader) {
        try {
          reader.style.display = 'block';
          reader.innerHTML = '';
          const video = document.createElement('video'); video.style.width='100%'; video.style.height='100%'; video.setAttribute('playsinline',''); reader.appendChild(video);
          codeReader = new ZXing.BrowserCodeReader();
          codeReader.decodeFromVideoDevice(nextDevice.deviceId || nextDevice.deviceId, video, (result, err) => {
            if (result) {
              const text = result.text.trim(); if (resultBox) resultBox.value = text; const joinCodeEl = $('joinCode'); if (joinCodeEl) joinCodeEl.value = text; showAlert('QR code scanned successfully!', 'success'); stopQrScanner();
            }
          }).then(() => { qrScannerActive = true; if (statusBox) statusBox.innerText = (nextDevice.label||'Camera') + ' active'; showAlert('Camera switched', 'info'); }).catch(err => { console.warn('flip ZXing error', err); tryHtml5QrcodeScan(reader, statusBox, resultBox); });
        } catch(e) { console.warn('flip exception', e); tryHtml5QrcodeScan(reader, statusBox, resultBox); }
      } else if (typeof Html5Qrcode !== 'undefined') {
        tryHtml5QrcodeScan(reader, statusBox, resultBox);
      } else {
        showAlert('No scanner available to flip to', 'warning');
      }
    }, 300);
  }

  // Teacher Passphrase
  async function computeHashHex(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function verifyTeacherPassphrase(secret) {
    try {
      const stored = localStorage.getItem(TEACHER_KEY_HASH_KEY);
      if (!stored) return true;
      const computed = await computeHashHex(secret || '');
      return computed === stored;
    } catch (e) { return false; }
  }

  async function requireTeacherVerification(msg) {
    const stored = localStorage.getItem(TEACHER_KEY_HASH_KEY);
    if (!stored) return true;
    const attempt = prompt(msg || 'Enter teacher passphrase:');
    if (attempt === null) return false;
    return await verifyTeacherPassphrase(attempt);
  }

  // Share Link & Export
  function updateShareLink() {
    const shareSection = $('shareSection');
    const quizLinkElement = $('quizLink');
    const displayQuizIdElement = $('displayQuizId');
    if (!quizLinkElement) return;
    if (questions.length > 0) {
      if (shareSection) shareSection.style.display = 'block';
      if (!quizId) {
        quizId = 'QUIZ_' + Date.now();
        try { localStorage.setItem('quiz_id', quizId); } catch (e) {}
      }
      if (displayQuizIdElement) displayQuizIdElement.textContent = quizId;
      const quizData = { id: quizId, questions: questions, version: '8.0' };
      try {
        const encoded = btoa(JSON.stringify(quizData));
        const safe = encodeURIComponent(encoded);
        const currentUrl = window.location.href.split('#')[0];
        const quizLink = `${currentUrl}#quiz=${safe}`;
        quizLinkElement.textContent = quizLink;
      } catch (e) {
        quizLinkElement.textContent = 'Generating quiz link...';
      }
    } else {
      if (shareSection) shareSection.style.display = 'none';
      quizLinkElement.textContent = 'Generating quiz link...';
    }
  }

  function exportQuestions() {
    if (questions.length === 0) {
      showAlert('No questions to export!', 'warning');
      return;
    }
    try {
      const data = [
        ['Quiz ID', quizId || 'Not generated', '', '', '', ''],
        ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer']
      ];
      questions.forEach(q => {
        if (q.type === 'tf') {
          data.push([q.question, 'True', 'False', '', '', q.correctAnswer === 0 ? 'True' : 'False']);
        } else {
          data.push([q.question, ...q.options, q.options[q.correctAnswer]]);
        }
      });
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
      XLSX.writeFile(workbook, `Quiz_Questions_${quizId || 'EXPORT'}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error('exportQuestions failed', e);
      showAlert('Export failed!', 'warning');
    }
  }

  // Results Decoding
  function extractResultPayloadFromText(text) {
    if (!text) return null;
    text = text.trim();
    if (text.startsWith('<') && text.endsWith('>')) text = text.slice(1, -1).trim();
    const m = text.match(/#result=([^"'<>\s]+)/);
    if (m && m[1]) return m[1];
    const hrefMatch = text.match(/href=["']([^"']+)["']/);
    if (hrefMatch && hrefMatch[1]) {
      const mm = hrefMatch[1].match(/#result=([^"&\s]+)/);
      if (mm && mm[1]) return mm[1];
    }
    const base64like = text.match(/([A-Za-z0-9\-_=%]{8,})/);
    if (base64like) return base64like[1];
    return null;
  }

  function fixUrlSafeBase64(s) {
    let str = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = str.length % 4;
    if (pad === 2) str += '==';
    else if (pad === 3) str += '=';
    else if (pad === 1) str += '===';
    return str;
  }

  function tryDecodeBase64ToJson(payload) {
    if (!payload) return null;
    const attempts = [
      p => { try { return JSON.parse(atob(p)); } catch (e) { return null; } },
      p => { try { return JSON.parse(atob(decodeURIComponent(p))); } catch (e) { return null; } },
      p => { try { return JSON.parse(atob(p.replace(/\s+/g, ''))); } catch (e) { return null; } },
      p => { try { return JSON.parse(atob(fixUrlSafeBase64(p))); } catch (e) { return null; } },
      p => { try { return JSON.parse(atob(fixUrlSafeBase64(decodeURIComponent(p)))); } catch (e) { return null; } }
    ];
    for (let fn of attempts) {
      try {
        const res = fn(payload);
        if (res) return res;
      } catch (e) {}
    }
    return null;
  }

  function decodeResultFromUrl(text) {
    try {
      const encoded = extractResultPayloadFromText(text);
      if (!encoded) return null;
      const parsed = tryDecodeBase64ToJson(encoded);
      return parsed;
    } catch (e) {
      return null;
    }
  }

  // Collect Results
  async function collectResults() {
    let raw = '';
    const ta = $('resultUrls');
    if (ta) raw = safe(ta.value).trim();
    if ((!raw || raw.length === 0) && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip && clip.trim().length > 0) {
          raw = clip.trim();
          if (ta) ta.value = raw;
        }
      } catch (err) {}
    }
    raw = raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!raw) {
      showAlert('Please paste student result links!', 'warning');
      return;
    }
    const urls = raw.split(/\r?\n|,|;/).map(s => s.trim()).filter(Boolean);
    let successCount = 0;
    let errorCount = 0;
    urls.forEach(url => {
      try {
        const result = decodeResultFromUrl(url);
        if (result && result.studentName && result.quizId) {
          const existingIndex = collectedResults.findIndex(r =>
            r.studentName === result.studentName && r.quizId === result.quizId
          );
          if (existingIndex >= 0) {
            collectedResults[existingIndex] = result;
          } else {
            collectedResults.push(result);
          }
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }
    });
    try { localStorage.setItem('collected_results', JSON.stringify(collectedResults)); } catch (e) {}
    displayCollectedResults();
    if (successCount > 0) {
      showAlert(` Successfully collected ${successCount} student results!`, 'success');
    }
    if (errorCount > 0) {
      showAlert(` ${errorCount} links were invalid or couldn't be processed.`, 'warning');
    }
    if (ta) ta.value = '';
  }

  function displayCollectedResults() {
    const resultsList = $('collectedResultsList');
    if (!resultsList) return;
    resultsList.innerHTML = '';
    if (!collectedResults || collectedResults.length === 0) {
      resultsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No results collected yet. Results will appear here when you paste student result links above.</p>';
      return;
    }
    collectedResults.forEach((result, index) => {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'result-item';
      const percentage = Math.round((result.score / result.totalQuestions) * 100);
      resultDiv.innerHTML = `
        <div class="student-result">
            <div class="name">${index + 1}. ${escapeHtml(result.studentName)}</div>
            <div class="score">Score: ${result.score}/${result.totalQuestions} (${percentage}%)</div>
            <div class="date">Completed: ${new Date(result.completedAt).toLocaleString()}</div>
        </div>
      `;
      resultsList.appendChild(resultDiv);
    });
  }

  function downloadAllResults() {
    if (!collectedResults || collectedResults.length === 0) {
      showAlert('No student results collected yet!', 'warning');
      return;
    }
    (async ()=>{
      const ok = await requireTeacherVerification('Enter teacher passphrase to download all results:');
      if (!ok) { showAlert('Passphrase incorrect. Download cancelled.', 'danger'); return; }
      try {
        const data = [
          ['Quiz ID', quizId || 'Unknown', '', '', ''],
          ['Export Date', new Date().toLocaleString(), '', '', ''],
          ['Student Name', 'Score', 'Total Questions', 'Percentage', 'Completed At']
        ];
        collectedResults.forEach(result => {
          const percentage = Math.round((result.score / result.totalQuestions) * 100);
          data.push([
            result.studentName,
            result.score,
            result.totalQuestions,
            `${percentage}%`,
            new Date(result.completedAt).toLocaleString()
          ]);
        });
        const totalStudents = collectedResults.length;
        const averageScore = collectedResults.reduce((sum, r) => sum + r.score, 0) / totalStudents;
        const averagePercentage = Math.round((averageScore / (questions.length || 1)) * 100);
        data.push([]);
        data.push(['Summary Statistics', '', '', '', '']);
        data.push(['Total Students', totalStudents, '', '', '']);
        data.push(['Average Score', averageScore.toFixed(1), questions.length, `${averagePercentage}%`, '']);
        data.push(['Highest Score', Math.max(...collectedResults.map(r => r.score)), questions.length, '', '']);
        data.push(['Lowest Score', Math.min(...collectedResults.map(r => r.score)), questions.length, '', '']);
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        worksheet['!cols'] = [{wch: 25}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 20}];
        XLSX.utils.book_append_sheet(workbook, worksheet, "Student Results");
        XLSX.writeFile(workbook, `ALL_STUDENT_RESULTS_${quizId || 'QUIZ'}_${new Date().toISOString().split('T')[0]}.xlsx`);
        showAlert('Excel file downloaded successfully!', 'success');
      } catch (e) {
        console.error('downloadAllResults error', e);
        showAlert('Failed to download Excel', 'warning');
      }
    })();
  }

  // Analytics
  function showAnalytics() {
    const section = $('analyticsSection');
    if (!section) return;
    if (section.style.display === 'block') {
      section.style.display = 'none';
      return;
    }
    if (collectedResults.length === 0) {
      showAlert('No results to analyze!', 'warning');
      return;
    }
    section.style.display = 'block';
    const total = collectedResults.length;
    const avg = (collectedResults.reduce((s, r) => s + r.score, 0) / total).toFixed(1);
    const max = Math.max(...collectedResults.map(r => r.score));
    const min = Math.min(...collectedResults.map(r => r.score));
    const avgPct = Math.round((avg / (questions.length || 1)) * 100);
    const passed = collectedResults.filter(r => (r.score / r.totalQuestions) >= 0.6).length;
    const content = $('analyticsContent');
    content.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="padding: 15px; background: #e3f2fd; border-radius: 5px; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #2196f3;">${total}</div>
          <div style="color: #1976d2;">Total Students</div>
        </div>
        <div style="padding: 15px; background: #f3e5f5; border-radius: 5px; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #9c27b0;">${avg}</div>
          <div style="color: #7b1fa2;">Average Score</div>
        </div>
        <div style="padding: 15px; background: #e8f5e9; border-radius: 5px; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #4caf50;">${avgPct}%</div>
          <div style="color: #2e7d32;">Average %</div>
        </div>
        <div style="padding: 15px; background: #fff3e0; border-radius: 5px; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #ff9800;">${passed}/${total}</div>
          <div style="color: #e65100;">Passed (60%+)</div>
        </div>
      </div>
      <div style="background: white; padding: 15px; border-radius: 5px; text-align: center;">
        <p><strong>Score Distribution:</strong> Min: ${min}, Max: ${max}, Range: ${max - min}</p>
      </div>
    `;
  }

  function clearCollectedResults() {
    if (!confirm('Clear all collected results?')) return;
    collectedResults = [];
    try { localStorage.removeItem('collected_results'); } catch (e) {}
    displayCollectedResults();
    showAlert('All collected results cleared!', 'success');
  }

  // Student Join
  function joinQuiz() {
    const studentName = $('studentName') ? $('studentName').value.trim() : '';
    let joinInput = $('joinCode') ? $('joinCode').value.trim() : '';
    const qrResult = $('qrScanResult') ? $('qrScanResult').value.trim() : '';
    const quizCode = $('quizCodeInput') ? $('quizCodeInput').value.trim() : '';
    
    if (!studentName) { showAlert('Please enter your name!', 'warning'); return; }
    
    // Try QR scan result first, then paste link, then quiz code
    if (qrResult) joinInput = qrResult;
    if (!joinInput && !quizCode) { showAlert('Please use one method: paste link, scan QR, or enter code!', 'warning'); return; }
    
    // If only quiz code is provided, try to use it
    if (!joinInput && quizCode) {
      if (quizCode.includes('#quiz=')) {
        joinInput = 'http://quiz/' + quizCode;
      } else {
        joinInput = 'http://quiz/#quiz=' + encodeURIComponent(quizCode);
      }
    }
    
    // Try to parse the quiz link
    try {
      let quizData = null;
      
      // Method 1: Full URL with hash
      if (joinInput.includes('#quiz=')) {
        const hashIndex = joinInput.indexOf('#quiz=');
        const encodedData = joinInput.substring(hashIndex + 6);
        quizData = JSON.parse(atob(decodeURIComponent(encodedData)));
      }
      // Method 2: Direct base64 encoded data
      else if (joinInput.length > 20) {
        try {
          quizData = JSON.parse(atob(joinInput));
        } catch (e) {
          throw new Error('Invalid quiz format');
        }
      }
      
      if (quizData && quizData.questions && quizData.questions.length > 0) {
        questions = quizData.questions;
        quizId = quizData.id || 'quiz_' + Date.now();
        currentStudentName = studentName;
        if ($('roleSelection')) $('roleSelection').style.display = 'none';
        if ($('studentJoin')) $('studentJoin').style.display = 'none';
        if ($('studentPanel')) $('studentPanel').style.display = 'block';
        if ($('currentStudentName')) $('currentStudentName').textContent = studentName;
        if ($('studentQuizId')) $('studentQuizId').textContent = quizId;
        initializeStudentPanel();
        showAlert(`Welcome ${studentName}! Quiz loaded successfully!`, 'success');
        return;
      }
    } catch (error) {
      console.error('Join error:', error);
    }
    
    showAlert('Invalid quiz link or code. Please check with your teacher.', 'danger');
  }

  function pasteQuizCodeFromClipboard() {
    navigator.clipboard.read().then(items => {
      items.forEach(item => {
        item.getType('text/plain').then(blob => {
          blob.text().then(text => {
            const quizCodeInput = $('quizCodeInput');
            if (quizCodeInput) {
              quizCodeInput.value = text.trim();
              showAlert('Quiz code pasted successfully!', 'success');
            }
          });
        }).catch(() => {
          // Try alternative method
          navigator.clipboard.readText().then(text => {
            const quizCodeInput = $('quizCodeInput');
            if (quizCodeInput) {
              quizCodeInput.value = text.trim();
              showAlert('Quiz code pasted successfully!', 'success');
            }
          }).catch(err => {
            showAlert('Could not read clipboard. Please manually paste the quiz code.', 'warning');
          });
        });
      });
    }).catch(() => {
      // Fallback for browsers that don't support clipboard.read()
      navigator.clipboard.readText().then(text => {
        const quizCodeInput = $('quizCodeInput');
        if (quizCodeInput) {
          quizCodeInput.value = text.trim();
          showAlert('Quiz code pasted successfully!', 'success');
        }
      }).catch(err => {
        showAlert('Could not read clipboard. Please manually paste the quiz code.', 'warning');
      });
    });
  }

  function initializeStudentPanel() {
    const quizInfo = $('quizInfo');
    const startQuizBtn = $('startQuizBtn');
    if (!questions || questions.length === 0) {
      if (quizInfo) quizInfo.innerHTML = `<div class="alert alert-warning">No questions available. Please check the quiz link.</div>`;
      if (startQuizBtn) startQuizBtn.disabled = true;
    } else {
      if (quizInfo) quizInfo.innerHTML = `
          <div class="alert alert-success"> Quiz loaded! There are <strong>${questions.length}</strong> questions waiting for you.</div>
          <p><strong>Instructions:</strong></p>
          <ul style="text-align: left; margin: 15px 0; padding-left: 20px;">
              <li>Each question has a <strong>1 minute timer</strong>.</li>
              <li>The quiz will automatically move to the next question if time runs out.</li>
              <li><strong>Do not switch tabs or windows</strong>, or the quiz will be blurred.</li>
              <li>After completing, share the result link with your teacher!</li>
          </ul>
      `;
      if (startQuizBtn) startQuizBtn.disabled = false;
    }
  }

  // Privacy Functions
  function handleScreenshotAttempt(e) {
    if (isLocked) return;
    if (e.key === 'PrintScreen' || (e.ctrlKey && e.shiftKey) || (e.metaKey && e.shiftKey)) {
      violationCount++;
      showAlert('Screenshots are disabled during the quiz.', 'danger');
      escalateViolation();
    }
  }

  function disableContextMenu(e) {
    e.preventDefault();
    showAlert('Right-clicking is disabled during the quiz.', 'danger');
  }

  function handleVisibilityChange() {
    const quizInterface = $('quizInterface');
    if (document.hidden || !document.hasFocus()) {
      violationCount++;
      if (quizInterface) quizInterface.classList.add('blurred');
      showAlert('Please stay on the quiz page.', 'warning');
      escalateViolation();
    } else {
      if (quizInterface) quizInterface.classList.remove('blurred');
    }
  }

  function escalateViolation() {
    if (violationCount >= 3) {
      lockQuizAndSubmit();
    } else if (violationCount === 2) {
      const quizInterface = $('quizInterface');
      if (quizInterface) quizInterface.classList.add('blurred');
      showAlert('Second violation: quiz temporarily disabled', 'danger');
      setTimeout(() => { if (quizInterface) quizInterface.classList.remove('blurred'); }, 2000);
    }
  }

  function lockQuizAndSubmit() {
    isLocked = true;
    try {
      window.removeEventListener('contextmenu', disableContextMenu);
      window.removeEventListener('keyup', handleScreenshotAttempt);
      window.removeEventListener('blur', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    } catch (e) {}
    showAlert('Too many violations: quiz locked and auto-submitted', 'danger');
    finishQuiz();
  }

  // Quiz Timer
  function startQuestionTimer() {
    let timeLeft = QUESTION_TIME;
    const timerElement = $('questionTimer');
    if (!timerElement) return;
    timerElement.textContent = timeLeft;
    questionTimerInterval = setInterval(() => {
      if (isPaused) return;
      timeLeft--;
      timerElement.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(questionTimerInterval);
        nextQuestion();
      }
    }, 1000);
  }

  // Quiz Start
  function startQuiz() {
    $('quizStart').style.display = 'none';
    $('pauseScreen').style.display = 'none';
    $('quizInterface').style.display = 'block';
    currentQuestionIndex = 0;
    studentAnswers = {};
    shuffleQuestions = $('shuffleQuestionsCheck')?.checked || false;
    showHints = $('showHintsCheck')?.checked !== false;
    if (shuffleQuestions) {
      originalQuestionOrder = [...Array(questions.length).keys()];
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [originalQuestionOrder[i], originalQuestionOrder[j]] = [originalQuestionOrder[j], originalQuestionOrder[i]];
      }
    }
    quizStartTime = Date.now();
    totalQuizTime = questions.length * QUESTION_TIME;
    window.addEventListener('contextmenu', disableContextMenu);
    window.addEventListener('keyup', handleScreenshotAttempt);
    window.addEventListener('blur', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const quizInterfaceEl = $('quizInterface');
    if (quizInterfaceEl) quizInterfaceEl.classList.add('secure-content');
    showCurrentQuestion();
  }

  function showCurrentQuestion() {
    if (questions.length === 0) return;
    clearInterval(questionTimerInterval);
    const qIdx = shuffleQuestions ? originalQuestionOrder[currentQuestionIndex] : currentQuestionIndex;
    const question = questions[qIdx];
    const currentQuestionDiv = $('currentQuestion');
    const optionsHtml = question.type === 'tf' 
      ? `<div class="quiz-options">
          <div class="quiz-option" data-index="0">True</div>
          <div class="quiz-option" data-index="1">False</div>
        </div>`
      : `<div class="quiz-options">
          ${question.options.map((option, index) => `
              <div class="quiz-option" data-index="${index}">
                  ${String.fromCharCode(65 + index)}. ${escapeHtml(option)}
                  ${question.optionImages?.[index] ? `<br><img src="${escapeHtml(question.optionImages[index])}" style="max-width: 100%; max-height: 150px; margin-top: 10px; border-radius: 5px;">` : ''}
              </div>
          `).join('')}
        </div>`;
    const hintHtml = showHints && question.hint ? `<div class="hint-display"><strong>💡 Hint:</strong> ${escapeHtml(question.hint)}</div>` : '';
    currentQuestionDiv.innerHTML = `
      <div class="timer-container">Time Left: <span id="questionTimer">60</span>s</div>
      <div class="question-number">Question ${currentQuestionIndex + 1} of ${questions.length}</div>
      <div class="question">${escapeHtml(question.question)}</div>
      ${hintHtml}
      ${optionsHtml}
    `;
    const optionElements = currentQuestionDiv.querySelectorAll('.quiz-option');
    optionElements.forEach((optionEl) => {
      optionEl.addEventListener('click', function() {
        if (isLocked) return;
        const idx = parseInt(this.getAttribute('data-index'), 10);
        studentAnswers[currentQuestionIndex] = idx;
        optionElements.forEach((op, i) => op.classList.toggle('selected', i === idx));
      });
    });
    startQuestionTimer();
    $('progressText').textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    updateProgress();
    updateNavigationButtons();
    if ($('nextBtn')) $('nextBtn').disabled = false;
  }

  function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / (questions.length || 1)) * 100;
    const bar = $('progressBar');
    if (bar) bar.style.width = progress + '%';
  }

  function updateNavigationButtons() {
    const nextBtn = $('nextBtn');
    if (nextBtn) nextBtn.textContent = currentQuestionIndex === questions.length - 1 ? 'Finish Quiz' : 'Next';
  }

  // Pause/Resume
  function pauseQuiz() {
    isPaused = true;
    clearInterval(questionTimerInterval);
    const timerEl = $('questionTimer');
    if (timerEl) {
      pausedTimeLeft = parseInt(timerEl.textContent);
    }
    $('quizInterface').style.display = 'none';
    $('pauseScreen').style.display = 'block';
    $('pausedTimeDisplay').textContent = formatTime(pausedTimeLeft || QUESTION_TIME);
  }

  function resumeQuiz() {
    isPaused = false;
    $('quizInterface').style.display = 'block';
    $('pauseScreen').style.display = 'none';
    if (pausedTimeLeft !== null) {
      const timerEl = $('questionTimer');
      if (timerEl) timerEl.textContent = pausedTimeLeft;
    }
    startQuestionTimer();
  }

  function endQuizEarly() {
    if (confirm('End quiz and submit answers?')) {
      clearInterval(questionTimerInterval);
      finishQuiz();
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Next Question
  function nextQuestion() {
    clearInterval(questionTimerInterval);
    const userAnswerIndex = studentAnswers[currentQuestionIndex];
    const qIdx = shuffleQuestions ? originalQuestionOrder[currentQuestionIndex] : currentQuestionIndex;
    const correctIndex = questions[qIdx].correctAnswer;
    const optionElements = document.querySelectorAll('.quiz-option');
    const optionsContainer = document.querySelector('.quiz-options');
    if (optionsContainer) optionsContainer.classList.add('answered');
    if (userAnswerIndex === undefined) {
      showAlert('Time is up! Here is the correct answer.', 'warning');
      if (optionElements[correctIndex]) optionElements[correctIndex].classList.add('correct');
    } else {
      if (optionElements[correctIndex]) optionElements[correctIndex].classList.add('correct');
      if (userAnswerIndex !== correctIndex && optionElements[userAnswerIndex]) {
        optionElements[userAnswerIndex].classList.add('wrong');
      }
    }
    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        showCurrentQuestion();
      } else {
        finishQuiz();
      }
    }, 2500);
  }

  // Finish Quiz
  function finishQuiz() {
    clearInterval(questionTimerInterval);
    try {
      window.removeEventListener('contextmenu', disableContextMenu);
      window.removeEventListener('keyup', handleScreenshotAttempt);
      window.removeEventListener('blur', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    } catch (e) {}
    const quizInterface = $('quizInterface');
    if (quizInterface) { quizInterface.classList.remove('secure-content', 'blurred'); quizInterface.style.display = 'none'; }
    if ($('pauseScreen')) $('pauseScreen').style.display = 'none';
    if ($('results')) $('results').style.display = 'block';
    calculateResults();
    generateResultUrl();
  }

  function calculateResults() {
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
      const displayIndex = i;
      const qIdx = shuffleQuestions ? originalQuestionOrder[displayIndex] : displayIndex;
      const correct = questions[qIdx] && questions[qIdx].correctAnswer;
      const userAns = studentAnswers[displayIndex];
      if (userAns !== undefined && correct !== undefined && userAns === correct) score++;
    }
    if ($('scoreCircle')) $('scoreCircle').textContent = `${score}/${questions.length}`;
    const percentage = Math.round((score / (questions.length || 1)) * 100);
    let title, message;
    if (percentage === 100) {
      title = "Perfect Score! ";
      message = "Excellent! You got all questions right!";
    } else if (percentage >= 80) {
      title = "Great Job! ";
      message = `Very good! You scored ${percentage}%!`;
    } else if (percentage >= 60) {
      title = "Good Work! ";
      message = `Not bad! You scored ${percentage}%. Keep learning!`;
    } else {
      title = "Keep Learning! ";
      message = `You scored ${percentage}%. Don't worry, practice makes perfect!`;
    }
    if ($('resultTitle')) $('resultTitle').textContent = title;
    if ($('resultMessage')) $('resultMessage').textContent = message;
  }

  // Review Mode
  function toggleReview() {
    const section = $('reviewSection');
    if (!section) return;
    if (section.style.display === 'block') {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    const content = $('reviewContent');
    const reviewHTML = questions.map((q, i) => {
      // map display index i to actual question index when shuffle is enabled
      const displayIndex = i;
      const qIdx = shuffleQuestions ? originalQuestionOrder[displayIndex] : displayIndex;
      const actualQ = questions[qIdx];
      const userAnswer = studentAnswers[displayIndex];
      const isCorrect = userAnswer === actualQ.correctAnswer;
      const userAnswerText = userAnswer !== undefined ? (actualQ.type === 'tf' ? (userAnswer === 0 ? 'True' : 'False') : actualQ.options[userAnswer]) : 'Not answered';
      const correctAnswerText = actualQ.type === 'tf' ? (actualQ.correctAnswer === 0 ? 'True' : 'False') : actualQ.options[actualQ.correctAnswer];
      const bgColor = isCorrect ? '#d4edda' : '#f8d7da';
      const borderColor = isCorrect ? '#28a745' : '#dc3545';
      const textColor = isCorrect ? '#155724' : '#721c24';
      const explanation = actualQ.explanation ? `<div class="explanation-display"><strong>Explanation:</strong> ${escapeHtml(actualQ.explanation)}</div>` : '';
      return `<div style="margin-bottom: 20px; padding: 15px; background: ${bgColor}; border-radius: 5px; border-left: 4px solid ${borderColor};"><strong style="color: ${textColor};">Q${i + 1}: ${escapeHtml(actualQ.question)}</strong><div style="margin-top: 10px; font-size: 0.95rem;"><div><strong>Your answer:</strong> ${escapeHtml(userAnswerText)}</div><div><strong>Correct answer:</strong> ${escapeHtml(correctAnswerText)}</div>${explanation}</div></div>`;
    }).join('');
    content.innerHTML = reviewHTML;
  }

  // Generate Result URL
  function generateResultUrl() {
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
      if (studentAnswers[i] === questions[i].correctAnswer) score++;
    }
    const result = {
      studentName: currentStudentName,
      quizId: quizId,
      score: score,
      totalQuestions: questions.length,
      answers: studentAnswers,
      completedAt: new Date().toISOString()
    };
    try {
      const encodedResult = btoa(JSON.stringify(result));
      const currentUrl = window.location.href.split('#')[0];
      const resultUrl = currentUrl + '#result=' + encodeURIComponent(encodedResult);
      const resultEl = $('resultUrl');
      if (resultEl) {
        resultEl.textContent = resultUrl;
        resultEl.setAttribute('data-result', resultUrl);
      }
    } catch (e) {
      console.error('generateResultUrl error', e);
    }
  }

  // Copy Functions
  function copyQuizLink() {
    const quizLink = $('quizLink') ? $('quizLink').textContent : '';
    if (!quizLink) {
      showAlert('No quiz link available to copy!', 'warning');
      return;
    }
    const teacherMessage = ' Quiz link copied! Share this with your students. They will send you result links after completing the quiz.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(quizLink).then(() => {
        showAlert(teacherMessage, 'success');
      }).catch(() => {
        fallbackCopy(quizLink);
        showAlert(teacherMessage, 'success');
      });
    } else {
      fallbackCopy(quizLink);
      showAlert(teacherMessage, 'success');
    }
  }

  function copyResultUrl() {
    const resultEl = $('resultUrl');
    if (!resultEl) {
      showAlert('No result link found to copy', 'warning');
      return;
    }
    let link = resultEl.getAttribute('data-result') || resultEl.textContent || '';
    link = link.trim();
    if (!link) { showAlert('No result link found to copy', 'warning'); return; }
    const studentMessage = ' Result link copied! Share this with your teacher so they can include your score in the Excel file.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        showAlert(studentMessage, 'success');
      }).catch(() => {
        fallbackCopy(link);
        showAlert(studentMessage, 'success');
      });
    } else {
      fallbackCopy(link);
      showAlert(studentMessage, 'success');
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {
      console.error('fallbackCopy failed', e);
    }
  }

  // Download Results
  function downloadResults() {
    try {
      const data = [
        ['Student Name', currentStudentName, '', ''],
        ['Quiz ID', quizId || 'Unknown', '', ''],
        ['Question', 'Your Answer', 'Correct Answer', 'Result']
      ];
      questions.forEach((question, index) => {
        const userAnswer = studentAnswers[index] !== undefined ? (question.type === 'tf' ? (studentAnswers[index] === 0 ? 'True' : 'False') : question.options[studentAnswers[index]]) : 'Not answered';
        const correctAnswer = question.type === 'tf' ? (question.correctAnswer === 0 ? 'True' : 'False') : question.options[question.correctAnswer];
        const isCorrect = studentAnswers[index] === question.correctAnswer ? 'CORRECT' : 'WRONG';
        data.push([question.question, userAnswer, correctAnswer, isCorrect]);
      });
      const score = Object.keys(studentAnswers).reduce((acc, key) => {
        return studentAnswers[key] === questions[key].correctAnswer ? acc + 1 : acc;
      }, 0);
      data.push([]);
      const percentage = Math.round((score/questions.length)*100);
      data.push(['Total Score', score + '/' + questions.length, '', percentage + '%']);
      data.push(['Date Taken', new Date().toLocaleString(), '', '']);
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      worksheet['!cols'] = [{wch: 50}, {wch: 20}, {wch: 20}, {wch: 15}];
      XLSX.utils.book_append_sheet(workbook, worksheet, "My Results");
      const fileName = (currentStudentName || 'student') + '_Quiz_Results_' + new Date().toISOString().split('T')[0] + '.xlsx';
      XLSX.writeFile(workbook, fileName);
    } catch (e) {
      console.error('downloadResults error', e);
      showAlert('Failed to download results', 'warning');
    }
  }

  function retakeQuiz() {
    if ($('results')) $('results').style.display = 'none';
    if ($('reviewSection')) $('reviewSection').style.display = 'none';
    if ($('quizStart')) $('quizStart').style.display = 'block';
    studentAnswers = {};
    currentQuestionIndex = 0;
    initializeStudentPanel();
  }

  // Utility
  function escapeHtml(unsafe) {
    return safe(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Init
  window.addEventListener('load', function() {
    try {
      loadTheme();
      const savedQuestions = localStorage.getItem('quiz_questions');
      const savedQuizId = localStorage.getItem('quiz_id');
      const savedResults = localStorage.getItem('collected_results');
      if (savedQuestions) questions = JSON.parse(savedQuestions);
      if (savedQuizId) quizId = savedQuizId;
      if (savedResults) collectedResults = JSON.parse(savedResults);
      loadQuestions();
      updateShareLink();
      displayCollectedResults();
      updateCategoryFilter();
      const qform = $('questionForm');
      if (qform) {
        qform.addEventListener('submit', function(e) {
          e.preventDefault();
          const type = $('questionType').value;
          const questionText = $('questionText').value.trim();
          const category = $('questionCategory').value.trim();
          const hint = $('questionHint').value.trim();
          const explanation = $('questionExplanation').value.trim();
          let correctOptionIndex, options;
          if (type === 'tf') {
            const chosen = document.querySelector('input[name="tfCorrectOption"]:checked');
            if (!chosen) { showAlert('Please select correct option', 'warning'); return; }
            correctOptionIndex = parseInt(chosen.value);
            options = ['True', 'False'];
          } else {
            const option1 = $('optionText0').value.trim();
            const option2 = $('optionText1').value.trim();
            const option3 = $('optionText2').value.trim();
            const option4 = $('optionText3').value.trim();
            const chosen = document.querySelector('input[name="correctOption"]:checked');
            if (!chosen) { showAlert('Please select correct option', 'warning'); return; }
            correctOptionIndex = parseInt(chosen.value);
            options = [option1, option2, option3, option4];
            if (!options.every(o => o)) { showAlert('Please fill all options!', 'warning'); return; }
          }
          if (!questionText) { showAlert('Please fill question!', 'warning'); return; }
          const optImages = type === 'mc' ? [
            $('optionImage0').value.trim(),
            $('optionImage1').value.trim(),
            $('optionImage2').value.trim(),
            $('optionImage3').value.trim()
          ] : [];
          const newQuestion = {
            id: Date.now(),
            type: type,
            question: questionText,
            options: options,
            correctAnswer: correctOptionIndex,
            category: category,
            hint: hint,
            explanation: explanation,
            optionImages: optImages
          };
          questions.push(newQuestion);
          saveQuizData();
          loadQuestions();
          updateShareLink();
          updateCategoryFilter();
          qform.reset();
          updateQuestionForm();
          showAlert('Question added successfully!', 'success');
        });
      }
      const hash = window.location.hash;
      if (hash && hash.includes('#quiz=')) {
        if ($('roleSelection')) $('roleSelection').style.display = 'none';
        if ($('studentJoin')) $('studentJoin').style.display = 'block';
        if ($('joinCode')) $('joinCode').value = window.location.href;
      }
    } catch (e) {
      console.error('init error', e);
    }
  });

  // Expose functions
  window.toggleTheme = toggleTheme;
  window.updateQuestionForm = updateQuestionForm;
  window.editQuestion = editQuestion;
  window.toggleQuestionShuffle = toggleQuestionShuffle;
  window.previewQuiz = previewQuiz;
  window.importCSV = importCSV;
  window.toggleQRCode = toggleQRCode;
  window.updateCategoryFilter = updateCategoryFilter;
  window.showAnalytics = showAnalytics;
  window.selectRole = function(role) {
    currentRole = role;
    if ($('roleSelection')) $('roleSelection').style.display = 'none';
    if (role === 'teacher') {
      if ($('teacherPanel')) $('teacherPanel').style.display = 'block';
      loadTeacherData();
    } else {
      if ($('studentJoin')) $('studentJoin').style.display = 'block';
    }
  };
  window.goHome = function() {
    if ($('roleSelection')) $('roleSelection').style.display = 'block';
    if ($('teacherPanel')) $('teacherPanel').style.display = 'none';
    if ($('studentJoin')) $('studentJoin').style.display = 'none';
    if ($('studentPanel')) $('studentPanel').style.display = 'none';
    if ($('quizInterface')) $('quizInterface').style.display = 'none';
    if ($('pauseScreen')) $('pauseScreen').style.display = 'none';
    if ($('results')) $('results').style.display = 'none';
    currentRole = null;
    questions = [];
    currentStudentName = null;
    quizId = null;
  };
  window.goBackToJoin = function() {
    if ($('studentPanel')) $('studentPanel').style.display = 'none';
    if ($('studentJoin')) $('studentJoin').style.display = 'block';
    if ($('quizInterface')) $('quizInterface').style.display = 'none';
    if ($('pauseScreen')) $('pauseScreen').style.display = 'none';
    if ($('results')) $('results').style.display = 'none';
    if ($('quizStart')) $('quizStart').style.display = 'block';
  };
  window.startQrScanner = startQrScanner;
  window.stopQrScanner = stopQrScanner;
  window.generateNewQuiz = function() {
    if (!confirm('This will create a new quiz and clear existing questions and results. Continue?')) return;
    questions = [];
    quizId = 'QUIZ_' + Date.now();
    collectedResults = [];
    try {
      localStorage.removeItem('quiz_questions');
      localStorage.removeItem('quiz_id');
      localStorage.removeItem('collected_results');
    } catch (e) {}
    try { localStorage.setItem('quiz_id', quizId); } catch (e) {}
    try {
      const setPass = confirm('Would you like to set a teacher passphrase to protect result exports?');
      if (setPass) {
        const pass = prompt('Enter passphrase (will be stored as a hash):');
        if (pass !== null && pass.length > 0) {
          computeHashHex(pass).then(hash => {
            try { localStorage.setItem(TEACHER_KEY_HASH_KEY, hash); } catch (e) {}
            showAlert('Teacher passphrase saved.', 'success');
          });
        }
      }
    } catch (e) { }
    loadQuestions();
    updateShareLink();
    displayCollectedResults();
    updateCategoryFilter();
    showAlert('New quiz created! Add questions to generate shareable link.', 'success');
  };
  window.copyQuizLink = copyQuizLink;
  window.exportQuestions = exportQuestions;
  window.collectResults = collectResults;
  window.downloadAllResults = downloadAllResults;
  window.clearCollectedResults = clearCollectedResults;
  window.joinQuiz = joinQuiz;
  window.startQuiz = startQuiz;
  window.pauseQuiz = pauseQuiz;
  window.resumeQuiz = resumeQuiz;
  window.endQuizEarly = endQuizEarly;
  window.nextQuestion = nextQuestion;
  window.copyResultUrl = copyResultUrl;
  window.downloadResults = downloadResults;
  window.retakeQuiz = retakeQuiz;
  window.toggleReview = toggleReview;

})();
