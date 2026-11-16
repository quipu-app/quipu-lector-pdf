window.QuipuExport = (() => {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    const r = ((num >> 16) & 255) / 255;
    const g = ((num >> 8) & 255) / 255;
    const b = (num & 255) / 255;
    return rgb(r, g, b);
  }

  async function downloadModifiedPdf() {
    const visor = window.QuipuVisor;
    if (!visor.state.pdfBytes) return;

    const pdfDoc = await PDFDocument.load(visor.state.pdfBytes);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1;
      const pageData = visor.state.annotations[pageNum];
      if (!pageData) continue;

      const page = pages[i];
      const { width, height } = page.getSize();

      // 1. Dibujar trazos (resaltado, subrayado, lápiz)
      pageData.strokes.forEach((st) => {
        if (!st.points || st.points.length < 2) return;
        const color = hexToRgb(st.color);
        const opacity = st.type === 'highlight' ? 0.35 : 0.95;

        for (let j = 1; j < st.points.length; j++) {
          const p1 = st.points[j - 1];
          const p2 = st.points[j];
          page.drawLine({
            start: { x: p1.x * width, y: height - p1.y * height },
            end: { x: p2.x * width, y: height - p2.y * height },
            thickness: st.size,
            color,
            opacity
          });
        }
      });

      // 2. Dibujar Post-its, Textos libres y Stickers
      pageData.objects.forEach((obj) => {
        const px = obj.x * width;
        const py = height - obj.y * height;

        if (obj.type === 'postit' && obj.text) {
          const boxW = 155;
          const boxH = 72;
          page.drawRectangle({
            x: px,
            y: py - boxH,
            width: boxW,
            height: boxH,
            color: hexToRgb(obj.color),
            borderColor: rgb(0.05, 0.07, 0.09),
            borderWidth: 1.5
          });
          page.drawText(obj.text.slice(0, 120), {
            x: px + 8,
            y: py - 18,
            size: 9.5,
            font: fontRegular,
            color: rgb(0.05, 0.07, 0.09),
            maxWidth: boxW - 16,
            lineHeight: 12
          });
        } else if (obj.type === 'text' && obj.text) {
          page.drawText(obj.text, {
            x: px,
            y: py - 12,
            size: 11,
            font: fontBold,
            color: obj.color === '#F4C430' ? rgb(0.05, 0.07, 0.09) : hexToRgb(obj.color)
          });
        } else if (obj.type === 'sticker' && obj.text) {
          const badgeW = Math.max(95, obj.text.length * 6.5);
          page.drawRectangle({
            x: px,
            y: py - 22,
            width: badgeW,
            height: 22,
            color: hexToRgb(obj.color),
            borderColor: rgb(0.05, 0.07, 0.09),
            borderWidth: 1.5
          });
          page.drawText(obj.text, {
            x: px + 8,
            y: py - 15,
            size: 9.5,
            font: fontBold,
            color: rgb(0.05, 0.07, 0.09)
          });
        }
      });
    }

    const finalBytes = await pdfDoc.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const baseName = visor.state.fileName.replace(/\.pdf$/i, '');
    a.href = url;
    a.download = `${baseName}-quipu.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { downloadModifiedPdf };
})();