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

    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;

    pdfCanvas.width = Math.floor(viewport.width * dpr);
    pdfCanvas.height = Math.floor(viewport.height * dpr);
    pdfCanvas.style.width = `${viewport.width}px`;
    pdfCanvas.style.height = `${viewport.height}px`;

    annoCanvas.width = Math.floor(viewport.width * dpr);
    annoCanvas.height = Math.floor(viewport.height * dpr);
    annoCanvas.style.width = `${viewport.width}px`;
    annoCanvas.style.height = `${viewport.height}px`;

    const ctx = pdfCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

  async function changeZoom(delta) {
    if (!state.pdfDoc) return;
    state.zoom = Math.min(Math.max(0.4, +(state.zoom + delta).toFixed(2)), 2.5);
    updateZoomLabel();
    await renderCurrentPage();
  }

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
    toggleReadAloud,
    stopSpeech,
    persistNow
  };
})();
