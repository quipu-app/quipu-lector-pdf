window.QuipuCartuchera = (() => {
  const toolState = {
    activeTool: 'pan',
    color: '#F4C430',
    size: 5,
    stickerText: '¡Entra en el parcial!',
    isDrawing: false,
    currentStroke: null,
    history: [] // historial para Ctrl+Z
  };

  function init() {
    const annoCanvas = document.getElementById('annotationCanvas');

    // Selección de herramientas
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        toolState.activeTool = btn.dataset.tool;

        const stickerSelect = document.getElementById('stickerSelect');
        stickerSelect.classList.toggle('hidden', toolState.activeTool !== 'sticker');

        annoCanvas.style.pointerEvents = toolState.activeTool === 'pan' ? 'none' : 'auto';
        annoCanvas.style.cursor = toolState.activeTool === 'pan' ? 'default' : 'crosshair';
      });
    });

    // Selección de color
    document.querySelectorAll('.color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        toolState.color = dot.dataset.color;
      });
    });

    document.getElementById('strokeSizeSelect').addEventListener('change', (e) => {
      toolState.size = Number(e.target.value);
    });

    document.getElementById('stickerSelect').addEventListener('change', (e) => {
      toolState.stickerText = e.target.value;
    });

    document.getElementById('btnUndo').addEventListener('click', undo);

    // Eventos táctiles y de mouse unificados (Pointer Events)
    annoCanvas.addEventListener('pointerdown', onPointerDown);
    annoCanvas.addEventListener('pointermove', onPointerMove);
    annoCanvas.addEventListener('pointerup', onPointerUp);
    annoCanvas.addEventListener('pointercancel', onPointerUp);

    // Por defecto empieza en Mover
    annoCanvas.style.pointerEvents = 'none';
  }

  function getNormalizedPoint(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
    };
  }

  function onPointerDown(e) {
    const tool = toolState.activeTool;
    if (tool === 'pan') return;

    const canvas = e.currentTarget;
    const pt = getNormalizedPoint(e, canvas);
    const pageNum = window.QuipuVisor.state.currentPage;
    const pageData = window.QuipuVisor.ensurePageData(pageNum);

    if (tool === 'postit' || tool === 'text' || tool === 'sticker') {
      createFloatingObject(tool, pt.x, pt.y);
      return;
    }

    if (tool === 'eraser') {
      eraseNear(pt.x, pt.y);
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    toolState.isDrawing = true;

    toolState.currentStroke = {
      type: tool, // 'highlight', 'underline', 'pen', 'recall'
      color: toolState.color,
      size: tool === 'highlight' ? Math.max(toolState.size * 3, 18) : toolState.size,
      points: [pt]
    };

    pageData.strokes.push(toolState.currentStroke);
    toolState.history.push({ pageNum, kind: 'stroke' });
    redrawPage(pageNum);
  }

  function onPointerMove(e) {
    if (!toolState.isDrawing || !toolState.currentStroke) return;
    const canvas = e.currentTarget;
    const pt = getNormalizedPoint(e, canvas);

    if (toolState.currentStroke.type === 'underline' || toolState.currentStroke.type === 'recall') {
      // Línea recta o rectángulo entre inicio y punto actual
      toolState.currentStroke.points[1] = pt;
    } else {
      toolState.currentStroke.points.push(pt);
    }

    redrawPage(window.QuipuVisor.state.currentPage);
  }

  function onPointerUp(e) {
    if (!toolState.isDrawing) return;
    toolState.isDrawing = false;

    const stroke = toolState.currentStroke;
    const pageNum = window.QuipuVisor.state.currentPage;
    const pageData = window.QuipuVisor.ensurePageData(pageNum);

    // Convertir el trazo 'recall' en un objeto interactivo de cinta correctora
    if (stroke && stroke.type === 'recall' && stroke.points.length >= 2) {
      pageData.strokes.pop();
      toolState.history.pop();
      const [p1, p2] = stroke.points;
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.max(Math.abs(p2.x - p1.x), 0.08);
      const h = Math.max(Math.abs(p2.y - p1.y), 0.035);

      const obj = {
        id: Date.now().toString(),
        type: 'recall',
        x,
        y,
        w,
        h,
        color: toolState.color
      };
      pageData.objects.push(obj);
      toolState.history.push({ pageNum, kind: 'object', id: obj.id });
    }

    toolState.currentStroke = null;
    redrawPage(pageNum);
    window.QuipuVisor.persistNow();
  }

  function createFloatingObject(type, x, y) {
    const pageNum = window.QuipuVisor.state.currentPage;
    const pageData = window.QuipuVisor.ensurePageData(pageNum);

    const obj = {
      id: Date.now().toString(),
      type,
      x: Math.min(x, 0.78),
      y: Math.min(y, 0.85),
      color: toolState.color,
      text: type === 'sticker' ? toolState.stickerText : '',
      collapsed: false
    };

    pageData.objects.push(obj);
    toolState.history.push({ pageNum, kind: 'object', id: obj.id });
    redrawPage(pageNum);
    window.QuipuVisor.persistNow();
  }

  function eraseNear(nx, ny) {
    const pageNum = window.QuipuVisor.state.currentPage;
    const pageData = window.QuipuVisor.ensurePageData(pageNum);

    const beforeLen = pageData.strokes.length;
    pageData.strokes = pageData.strokes.filter((st) => {
      return !st.points.some((p) => Math.hypot(p.x - nx, p.y - ny) < 0.035);
    });

    if (pageData.strokes.length !== beforeLen) {
      redrawPage(pageNum);
      window.QuipuVisor.persistNow();
    }
  }

  function undo() {
    const last = toolState.history.pop();
    if (!last) return;
    const pageData = window.QuipuVisor.ensurePageData(last.pageNum);

    if (last.kind === 'stroke') {
      pageData.strokes.pop();
    } else if (last.kind === 'object') {
      pageData.objects = pageData.objects.filter((o) => o.id !== last.id);
    }

    redrawPage(window.QuipuVisor.state.currentPage);
    window.QuipuVisor.persistNow();
  }

  function redrawPage(pageNum) {
    const annoCanvas = document.getElementById('annotationCanvas');
    const objectsLayer = document.getElementById('objectsLayer');
    if (!annoCanvas || !objectsLayer) return;

    const dpr = window.devicePixelRatio || 1;
    const width = annoCanvas.width / dpr;
    const height = annoCanvas.height / dpr;

    const ctx = annoCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pageData = window.QuipuVisor.ensurePageData(pageNum);

    // 1. Dibujar trazos (resaltado, subrayado, lápiz)
    pageData.strokes.forEach((st) => {
      if (!st.points || st.points.length === 0) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.size * window.QuipuVisor.state.zoom;

      if (st.type === 'highlight') {
        ctx.globalAlpha = 0.36;
        ctx.lineCap = 'butt';
      } else {
        ctx.globalAlpha = 0.95;
      }

      if (st.type === 'recall' && st.points.length >= 2) {
        const [p1, p2] = st.points;
        ctx.fillStyle = st.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(
          Math.min(p1.x, p2.x) * width,
          Math.min(p1.y, p2.y) * height,
          Math.abs(p2.x - p1.x) * width,
          Math.abs(p2.y - p1.y) * height
        );
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(st.points[0].x * width, st.points[0].y * height);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x * width, st.points[i].y * height);
      }
      ctx.stroke();
      ctx.restore();
    });

    // 2. Renderizar objetos flotantes (Post-its, Textos, Stickers, Cintas de repaso)
    objectsLayer.innerHTML = '';
    pageData.objects.forEach((obj) => {
      const el = buildObjectElement(obj, pageNum, objectsLayer);
      objectsLayer.appendChild(el);
    });
  }

  function buildObjectElement(obj, pageNum, container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'anno-object';
    wrapper.style.left = `${obj.x * 100}%`;
    wrapper.style.top = `${obj.y * 100}%`;

    if (obj.type === 'postit') {
      if (obj.collapsed) {
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'sticky-note-pin';
        pin.style.backgroundColor = obj.color;
        pin.title = 'Expandir nota';
        pin.textContent = '📌';
        pin.addEventListener('click', () => {
          obj.collapsed = false;
          redrawPage(pageNum);
          window.QuipuVisor.persistNow();
        });
        wrapper.appendChild(pin);
      } else {
        const card = document.createElement('div');
        card.className = 'sticky-note-card';
        card.style.backgroundColor = obj.color;

        const header = document.createElement('div');
        header.className = 'sticky-note-header';
        header.innerHTML = `<span>📝 Nota</span>`;

        const actions = document.createElement('div');
        actions.className = 'sticky-note-actions';

        const btnMin = document.createElement('button');
        btnMin.type = 'button';
        btnMin.className = 'sticky-mini-btn';
        btnMin.textContent = '—';
        btnMin.title = 'Minimizar a pin';
        btnMin.addEventListener('click', () => {
          obj.collapsed = true;
          redrawPage(pageNum);
          window.QuipuVisor.persistNow();
        });

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'sticky-mini-btn';
        btnDel.textContent = '✕';
        btnDel.title = 'Eliminar nota';
        btnDel.addEventListener('click', () => removeObject(pageNum, obj.id));

        actions.append(btnMin, btnDel);
        header.appendChild(actions);
        makeDraggable(header, wrapper, obj, container);

        const textarea = document.createElement('textarea');
        textarea.className = 'sticky-note-body';
        textarea.placeholder = 'Escribí tu apunte acá...';
        textarea.value = obj.text;
        textarea.addEventListener('input', (e) => {
          obj.text = e.target.value;
          window.QuipuVisor.persistNow();
        });

        card.append(header, textarea);
        wrapper.appendChild(card);
      }
    } else if (obj.type === 'text') {
      const box = document.createElement('div');
      box.className = 'free-text-box';
      box.contentEditable = 'true';
      box.style.color = obj.color === '#F4C430' ? '#0D1117' : obj.color;
      box.textContent = obj.text || 'Escribí acá...';

      box.addEventListener('focus', () => {
        if (box.textContent === 'Escribí acá...') box.textContent = '';
      });
      box.addEventListener('input', () => {
        obj.text = box.textContent;
        window.QuipuVisor.persistNow();
      });
      box.addEventListener('dblclick', () => removeObject(pageNum, obj.id));

      makeDraggable(box, wrapper, obj, container);
      wrapper.appendChild(box);
    } else if (obj.type === 'sticker') {
      const sticker = document.createElement('div');
      sticker.className = 'study-sticker';
      sticker.style.backgroundColor = obj.color;
      sticker.textContent = obj.text;
      sticker.title = 'Arrastrá para mover o doble clic para quitar';
      sticker.addEventListener('dblclick', () => removeObject(pageNum, obj.id));

      makeDraggable(sticker, wrapper, obj, container);
      wrapper.appendChild(sticker);
    } else if (obj.type === 'recall') {
      const tape = document.createElement('div');
      tape.className = 'recall-tape';
      tape.style.backgroundColor = obj.color;
      tape.style.width = `${obj.w * container.clientWidth}px`;
      tape.style.height = `${obj.h * container.clientHeight}px`;
      tape.textContent = '👁️ Repaso';
      tape.title = 'Clic para espiar, doble clic para quitar';

      tape.addEventListener('click', () => tape.classList.toggle('peeked'));
      tape.addEventListener('dblclick', () => removeObject(pageNum, obj.id));

      wrapper.appendChild(tape);
    }

    return wrapper;
  }

  function removeObject(pageNum, objId) {
    const pageData = window.QuipuVisor.ensurePageData(pageNum);
    pageData.objects = pageData.objects.filter((o) => o.id !== objId);
    redrawPage(pageNum);
    window.QuipuVisor.persistNow();
  }

  function makeDraggable(handle, wrapper, obj, container) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = obj.x;
      origY = obj.y;
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = (e.clientX - startX) / container.clientWidth;
      const dy = (e.clientY - startY) / container.clientHeight;
      obj.x = Math.min(Math.max(origX + dx, 0), 0.92);
      obj.y = Math.min(Math.max(origY + dy, 0), 0.94);
      wrapper.style.left = `${obj.x * 100}%`;
      wrapper.style.top = `${obj.y * 100}%`;
    });

    handle.addEventListener('pointerup', () => {
      if (dragging) {
        dragging = false;
        window.QuipuVisor.persistNow();
      }
    });
  }

  return { init, redrawPage, undo };
})();