window.QuipuVisor = (() => {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const state = {
    pdfDoc: null,
    pdfBytes: null,
    fileName: 'Documento.pdf',
    currentPage: 1,
    totalPages: 1,
    zoom: 1.0,
    zoomManual: false, // true cuando el usuario eligió el zoom a mano
    annotations: {}, // { pageNum: { strokes: [], objects: [] } }
    isSpeaking: false
  };

  function ensurePageData(pageNum) {
    if (!state.annotations[pageNum]) {
      state.annotations[pageNum] = { strokes: [], objects: [] };
    }
    return state.annotations[pageNum];
  }

  async function loadFromBytes(uint8Array, fileName, savedAnnotations = null, startPage = 1) {
    state.pdfBytes = new Uint8Array(uint8Array);
    state.fileName = fileName || 'Documento.pdf';
    state.annotations = savedAnnotations || {};

    const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes.slice() });
    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;
    state.currentPage = Math.min(Math.max(1, startPage), state.totalPages);

    document.getElementById('docTitle').textContent = state.fileName;
    document.getElementById('pageCount').textContent = state.totalPages;
    document.getElementById('pageInput').max = state.totalPages;

    state.zoomManual = false;
    await fitToScreenWidth();
    await renderCurrentPage();
    persistNow();
  }

  async function fitToScreenWidth() {
    if (!state.pdfDoc) return;
    const page = await state.pdfDoc.getPage(state.currentPage);
    const viewport = page.getViewport({ scale: 1.0 });
    const scrollArea = document.getElementById('pdfScrollArea');
    const availableWidth = Math.max(260, scrollArea.clientWidth - 36);
    const idealZoom = availableWidth / viewport.width;
    state.zoom = Math.min(Math.max(idealZoom, 0.45), 1.6);
    updateZoomLabel();
  }

  function updateZoomLabel() {
    const lbl = document.getElementById('zoomLabel');
    if (lbl) lbl.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  async function renderCurrentPage() {
    if (!state.pdfDoc) return;
    const page = await state.pdfDoc.getPage(state.currentPage);
    const viewport = page.getViewport({ scale: state.zoom });
    const dpr = window.devicePixelRatio || 1;

    const pdfCanvas = document.getElementById('pdfCanvas');
    const annoCanvas = document.getElementById('annotationCanvas');
    const pageWrapper = document.getElementById('pageWrapper');

    // Tamaño en píxeles reales de la pantalla, redondeado, y el tamaño visible sale de ahí:
    // así cada píxel del dibujo cae justo en un píxel de la pantalla y la letra se ve nítida
    const anchoPx = Math.round(viewport.width * dpr);
    const altoPx = Math.round(viewport.height * dpr);
    const anchoCss = `${anchoPx / dpr}px`;
    const altoCss = `${altoPx / dpr}px`;

    pageWrapper.style.width = anchoCss;
    pageWrapper.style.height = altoCss;

    pdfCanvas.width = anchoPx;
    pdfCanvas.height = altoPx;
    pdfCanvas.style.width = anchoCss;
    pdfCanvas.style.height = altoCss;

    annoCanvas.width = anchoPx;
    annoCanvas.height = altoPx;
    annoCanvas.style.width = anchoCss;
    annoCanvas.style.height = altoCss;

    const ctx = pdfCanvas.getContext('2d');
    ctx.setTransform(anchoPx / viewport.width, 0, 0, altoPx / viewport.height, 0, 0);

    await page.render({ canvasContext: ctx, viewport }).promise;

    document.getElementById('pageInput').value = state.currentPage;

    if (window.QuipuCartuchera) {
      window.QuipuCartuchera.redrawPage(state.currentPage);
    }
  }

  async function goToPage(num) {
    if (!state.pdfDoc) return;
    stopSpeech();
    const target = Math.min(Math.max(1, num), state.totalPages);
    state.currentPage = target;
    await renderCurrentPage();
    persistNow();
  }

  // Escalones de zoom fijos: desde cualquier valor, "+" va al siguiente y "−" al anterior
  const NIVELES_ZOOM = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];

  async function changeZoom(delta) {
    if (!state.pdfDoc) return;
    const actual = state.zoom;
    const siguiente = delta > 0
      ? NIVELES_ZOOM.find((n) => n > actual + 0.01)
      : [...NIVELES_ZOOM].reverse().find((n) => n < actual - 0.01);
    if (!siguiente) return;

    // Mantener a la vista la misma parte de la hoja al cambiar el zoom
    const area = document.getElementById('pdfScrollArea');
    const proporcionX = area.scrollWidth > area.clientWidth ? (area.scrollLeft + area.clientWidth / 2) / area.scrollWidth : 0.5;
    const proporcionY = (area.scrollTop + area.clientHeight / 2) / Math.max(1, area.scrollHeight);

    state.zoom = siguiente;
    state.zoomManual = true;
    updateZoomLabel();
    await renderCurrentPage();

    area.scrollLeft = proporcionX * area.scrollWidth - area.clientWidth / 2;
    area.scrollTop = proporcionY * area.scrollHeight - area.clientHeight / 2;
  }

  // Vuelve a "ajustar al ancho" (por ejemplo, al tocar el porcentaje)
  async function ajustarAlAncho() {
    if (!state.pdfDoc) return;
    state.zoomManual = false;
    await fitToScreenWidth();
    await renderCurrentPage();
  }

  // Al girar la tablet o cambiar el tamaño de la ventana, la hoja se reacomoda al ancho
  // (salvo que el usuario haya elegido un zoom a mano)
  let esperaGiro = null;
  window.addEventListener('resize', () => {
    clearTimeout(esperaGiro);
    esperaGiro = setTimeout(() => {
      if (state.pdfDoc && !state.zoomManual) ajustarAlAncho();
    }, 250);
  });

  function prepararEtiquetaZoom() {
    const lbl = document.getElementById('zoomLabel');
    if (lbl) {
      lbl.style.cursor = 'pointer';
      lbl.title = 'Tocá para ajustar la hoja al ancho';
      lbl.addEventListener('click', ajustarAlAncho);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepararEtiquetaZoom);
  else prepararEtiquetaZoom();

  async function toggleReadAloud() {
    if (!state.pdfDoc || !('speechSynthesis' in window)) return;
    const grille = document.getElementById('speakerGrille');

    if (state.isSpeaking) {
      stopSpeech();
      return;
    }

    const page = await state.pdfDoc.getPage(state.currentPage);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ').trim();

    if (!pageText) return;

    const utterance = new SpeechSynthesisUtterance(pageText);
    utterance.lang = 'es-AR';
    utterance.rate = 1.02;

    utterance.onend = () => stopSpeech();
    utterance.onerror = () => stopSpeech();

    state.isSpeaking = true;
    grille.classList.add('speaking');
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    state.isSpeaking = false;
    const grille = document.getElementById('speakerGrille');
    if (grille) grille.classList.remove('speaking');
  }

  function persistNow() {
    // Resto de una versión anterior: el guardado real lo hace el botón Guardar
    if (!state.pdfBytes || typeof window.QuipuStorage.saveSession !== 'function') return;
    window.QuipuStorage.saveSession({
      pdfBytes: state.pdfBytes,
      fileName: state.fileName,
      currentPage: state.currentPage,
      annotations: state.annotations
    });
  }

  return {
    state,
    ensurePageData,
    loadFromBytes,
    renderCurrentPage,
    goToPage,
    changeZoom,
    ajustarAlAncho,
    toggleReadAloud,
    stopSpeech,
    persistNow
  };
})();
