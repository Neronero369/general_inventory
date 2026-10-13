/**
 * =========================================================================
 * scanner.js - Mobile Live Camera Barcode & UPC Scanner Engine
 * =========================================================================
 * Powered by html5-qrcode:
 *  - Requests rear-facing camera access (facingMode: "environment")
 *  - Viewfinder modal with real-time barcode decoding
 *  - Clean error & permission handling (HTTPS/localhost & denial guards)
 *  - Subtle Web Audio API confirmation beep on barcode detection
 *  - Dispatches 'input' event to trigger debounced filter & KPI recalculation
 * =========================================================================
 */

(function (window) {
  'use strict';

  let html5QrCode = null;
  let isScanning = false;

  /**
   * Generates a subtle, pleasant confirmation beep sound via Web Audio API.
   * Completely self-contained without needing external sound asset files.
   */
  function playScanBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz (A5 tone)

      gainNode.gain.setValueAtTime(0.18, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // Audio autoplay policy or unavailable audio context - silently ignore
    }
  }

  /**
   * Displays an alert or error banner inside the scanner modal
   * @param {string} message
   */
  function showScannerError(message) {
    const errorBox = document.getElementById('scannerStatusMsg');
    const errorText = document.getElementById('scannerStatusText');
    if (errorBox && errorText) {
      errorText.textContent = message;
      errorBox.classList.remove('hidden');
    } else {
      alert(message);
    }
  }

  /**
   * Hides the error banner
   */
  function clearScannerError() {
    const errorBox = document.getElementById('scannerStatusMsg');
    if (errorBox) {
      errorBox.classList.add('hidden');
    }
  }

  /**
   * Opens the scanner modal and starts the rear camera feed
   */
  async function openScanner() {
    const modal = document.getElementById('scannerModal');
    clearScannerError();

    if (modal) {
      modal.classList.remove('hidden');
    }

    // Check if html5-qrcode library is loaded
    if (typeof Html5Qrcode === 'undefined') {
      showScannerError("La bibliothèque html5-qrcode n'est pas chargée. Veuillez vérifier votre connexion Internet.");
      return;
    }

    // Security check: Browsers restrict getUserMedia to secure contexts (HTTPS or localhost)
    const isSecureContext = window.isSecureContext || 
      window.location.protocol === 'https:' || 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'file:';

    if (!isSecureContext) {
      showScannerError("L'accès à la caméra requiert une connexion sécurisée (HTTPS ou localhost).");
      return;
    }

    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
      }

      // Configuration optimized for both 1D Barcodes (UPC/EAN/Code128) and 2D QR Codes
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Responsive rectangular scanning box tailored for elongated 1D barcodes
          const width = Math.min(viewfinderWidth * 0.85, 300);
          const height = Math.min(viewfinderHeight * 0.45, 140);
          return { width: Math.floor(width), height: Math.floor(height) };
        },
        aspectRatio: 1.333333,
        showTorchButtonIfSupported: true
      };

      isScanning = true;

      // Request rear camera first, fallback to default camera
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
      );

    } catch (err) {
      console.warn('[Scanner] Camera activation error:', err);
      isScanning = false;

      let userMsg = "Impossible d'accéder à la caméra.";
      if (err) {
        const errStr = String(err.name || err.message || err).toLowerCase();
        if (errStr.includes('notallowederror') || errStr.includes('permission')) {
          userMsg = "Accès caméra refusé. Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur.";
        } else if (errStr.includes('notfounderror') || errStr.includes('devicesnotfound')) {
          userMsg = "Aucune caméra détectée sur cet appareil.";
        } else if (errStr.includes('notreadableerror') || errStr.includes('trackstarterror')) {
          userMsg = "La caméra est déjà utilisée par une autre application.";
        } else if (errStr.includes('insecure') || !isSecureContext) {
          userMsg = "L'accès à la caméra requiert HTTPS ou localhost.";
        }
      }

      showScannerError(userMsg);
    }
  }

  /**
   * Callback on successful barcode / QR detection
   * @param {string} decodedText
   * @param {Object} decodedResult
   */
  function onScanSuccess(decodedText, decodedResult) {
    if (!decodedText) return;

    console.log('[Scanner] Barcode successfully read:', decodedText);

    // 1. Play auditory confirmation feedback
    playScanBeep();

    // 2. Stop camera feed and close viewfinder modal
    closeScanner();

    // 3. Inject scanned code into search input
    const searchInput = document.getElementById('skuSearchInput');
    const clearBtn = document.getElementById('clearSkuBtn');

    if (searchInput) {
      searchInput.value = decodedText.trim();

      if (clearBtn) {
        clearBtn.classList.remove('hidden');
      }

      // 4. Manually dispatch 'input' event to trigger existing debounce and applyFilters()
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.focus();
    }
  }

  /**
   * Frame-by-frame error callback (silent, normal while seeking barcode)
   */
  function onScanFailure(error) {
    // Intentionally no-op: fired on every video frame without a recognizable barcode
  }

  /**
   * Safely stops the camera stream and hides the modal
   */
  async function closeScanner() {
    const modal = document.getElementById('scannerModal');
    if (modal) {
      modal.classList.add('hidden');
    }

    if (html5QrCode && isScanning) {
      try {
        await html5QrCode.stop();
      } catch (err) {
        console.warn('[Scanner] Camera stop error:', err);
      } finally {
        isScanning = false;
      }
    }
    clearScannerError();
  }

  /**
   * Sets up DOM event listeners once document is ready
   */
  function initScannerUI() {
    const scanBtn = document.getElementById('scanBarcodeBtn');
    const closeBtn = document.getElementById('closeScannerBtn');
    const cancelBtn = document.getElementById('cancelScannerBtn');
    const modal = document.getElementById('scannerModal');

    if (scanBtn) {
      scanBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openScanner();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeScanner();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeScanner();
      });
    }

    // Dismiss modal on backdrop click
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeScanner();
        }
      });
    }

    // Dismiss on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isScanning) {
        closeScanner();
      }
    });
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScannerUI);
  } else {
    initScannerUI();
  }

  // Expose global interface
  window.ScannerEngine = {
    openScanner,
    closeScanner,
    isScanning: () => isScanning
  };

})(window);
