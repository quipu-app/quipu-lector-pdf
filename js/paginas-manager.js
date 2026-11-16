window.QuipuPaginas = (() => {
  const { PDFDocument, rgb, degrees } = PDFLib;

  async function addRuledPageAfterCurrent() {
    const visor = window.QuipuVisor;
    if (!visor.state.pdfBytes) return;

    const pdfDoc = await PDFDocument.load(visor.state.pdfBytes);
    const currentIndex = visor.state.currentPage - 1;
    const refPage = pdfDoc.getPage(currentIndex);
    const { width, height } = refPage.getSize();

    const newPage = pdfDoc.insertPage(currentIndex + 1, [width, height]);

    // Dibujar renglones suaves y margen estilo cuaderno de estudio
    newPage.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.99, 0.99, 0.97) });
    newPage.drawLine({
      start: { x: 55, y: 0 },
      end: { x: 55, y: height },
      thickness: 1.2,
      color: rgb(0.89, 0.35, 0.35)
    });

    for (let y = height - 65; y > 45; y -= 24) {
      newPage.drawLine({
        start: { x: 30, y },
        end: { x: width - 30, y },
        thickness: 0.7,
        color: rgb(0.75, 0.85, 0.95)
      });
    }

    const updatedBytes = await pdfDoc.save();
    await visor.loadFromBytes(
      updatedBytes,
      visor.state.fileName,
      visor.state.annotations,
      visor.state.currentPage + 1
    );
  }

  async function rotateCurrentPage() {
    const visor = window.QuipuVisor;
    if (!visor.state.pdfBytes) return;

    const pdfDoc = await PDFDocument.load(visor.state.pdfBytes);
    const page = pdfDoc.getPage(visor.state.currentPage - 1);
    const currentAngle = page.getRotation().angle;
    page.setRotation(degrees((currentAngle + 90) % 360));

    const updatedBytes = await pdfDoc.save();
    await visor.loadFromBytes(
      updatedBytes,
      visor.state.fileName,
      visor.state.annotations,
      visor.state.currentPage
    );
  }

  async function deleteCurrentPage() {
    const visor = window.QuipuVisor;
    if (!visor.state.pdfBytes || visor.state.totalPages <= 1) {
      alert('El documento debe tener al menos 1 página.');
      return;
    }

    const pdfDoc = await PDFDocument.load(visor.state.pdfBytes);
    const idx = visor.state.currentPage - 1;
    pdfDoc.removePage(idx);

    const updatedBytes = await pdfDoc.save();
    const nextPage = Math.min(visor.state.currentPage, visor.state.totalPages - 1);

    await visor.loadFromBytes(
      updatedBytes,
      visor.state.fileName,
      visor.state.annotations,
      nextPage
    );
  }

  async function mergeWithBytes(extraBytes) {
    const visor = window.QuipuVisor;
    if (!visor.state.pdfBytes) return;

    const mainDoc = await PDFDocument.load(visor.state.pdfBytes);
    const extraDoc = await PDFDocument.load(extraBytes);
    const copiedPages = await mainDoc.copyPages(extraDoc, extraDoc.getPageIndices());

    copiedPages.forEach((p) => mainDoc.addPage(p));

    const updatedBytes = await mainDoc.save();
    await visor.loadFromBytes(
      updatedBytes,
      visor.state.fileName,
      visor.state.annotations,
      visor.state.currentPage
    );
  }

  return {
    addRuledPageAfterCurrent,
    rotateCurrentPage,
    deleteCurrentPage,
    mergeWithBytes
  };
})();