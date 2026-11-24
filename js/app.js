document.addEventListener('DOMContentLoaded', async () => {
  const screenDisplay = document.getElementById('screenDisplay');
  const welcomeState = document.getElementById('welcomeState');
  const viewerState = document.getElementById('viewerState');
  const fileInput = document.getElementById('fileInput');
  const mergeFileInput = document.getElementById('mergeFileInput');

  const ledRed = document.getElementById('ledRed');
  const ledYellow = document.getElementById('ledYellow');
  const ledGreen = document.getElementById('ledGreen');
  const lensOuter = document.querySelector('.lens-outer');

  let lensTimer = null;
  let trafficTimer1 = null;
  let trafficTimer2 = null;

  // Estado del documento abierto y carpeta actual en biblioteca
  let currentDocId = null;
  let currentDocFolderId = null;
  let browsingFolderId = 'root';

  // Titileo de la lente grande ante cualquier movimiento o acción
  window.pulseQuipuLens = function () {
    if (!lensOuter) return;
    lensOuter.classList.add('lens-pulse');
    clearTimeout(lensTimer);
    lensTimer = setTimeout(() => lensOuter.classList.remove('lens-pulse'), 200);
  };

  // Semáforo progresivo: Rojo -> Amarillo -> Verde
  window.runQuipuTrafficLight = function (stepDuration = 280) {
    clearTimeout(trafficTimer1);
    clearTimeout(trafficTimer2);

    ledRed.className = 'led led-red lit-red';
    ledYellow.className = 'led led-yellow';
    ledGreen.className = 'led led-green';

    trafficTimer1 = setTimeout(() => {
      ledRed.className = 'led led-red';
      ledYellow.className = 'led led-yellow lit-yellow';
    }, stepDuration);

    trafficTimer2 = setTimeout(() => {
      ledYellow.className = 'led led-yellow';
      ledGreen.className = 'led led-green lit-green';
    }, stepDuration * 2);
  };

  const deviceEl = document.querySelector('.quipu-device');
  if (deviceEl) {
    deviceEl.addEventListener('pointerdown', () => window.pulseQuipuLens());
    deviceEl.addEventListener('pointermove', (e) => {
      if (e.buttons > 0) window.pulseQuipuLens();
    });
  }

  window.QuipuCartuchera.init();
  await window.QuipuUpdater.init();

  // Inicializar Google Drive Sync
  const btnConnectDrive = document.getElementById('btnConnectDrive');
  const btnSyncDrive = document.getElementById('btnSyncDrive');
  const driveStatusText = document.getElementById('driveStatusText');

    if (window.QuipuDrive) {
    window.QuipuDrive.init((connected) => {
      if (connected) {
        driveStatusText.textContent = '☁️ Drive: Conectado';
        btnConnectDrive.classList.add('hidden');
        btnSyncDrive.classList.remove('hidden');
        btnSyncDrive.click(); // Sincroniza automáticamente al conectar
      } else {
        // La sesión de Google venció: vuelve a mostrar el botón para conectar
        btnConnectDrive.classList.remove('hidden');
        btnSyncDrive.classList.add('hidden');
      }
    });

    btnConnectDrive.addEventListener('click', () => window.QuipuDrive.signIn());

    btnSyncDrive.addEventListener('click', async () => {
      try {
        driveStatusText.textContent = '🔄 Sincronizando...';
        await window.QuipuDrive.syncAll();
        driveStatusText.textContent = '✅ Sincronizado con Drive';
        await renderLibraryView();
      } catch (err) {
        console.error(err);
        driveStatusText.textContent = window.QuipuDrive.isConnected()
          ? '⚠️ Error al sincronizar'
          : '⚠️ La sesión de Google venció: volvé a conectar';
      }
    });
  }

  async function openDocumentBytes(bytes, name, savedAnnotations = null, startPage = 1, docMeta = null) {
    window.runQuipuTrafficLight(260);
    currentDocId = docMeta ? docMeta.id : null;
    currentDocFolderId = docMeta ? docMeta.folderId : null;

    welcomeState.classList.add('hidden');
    viewerState.classList.remove('hidden');

    await window.QuipuVisor.loadFromBytes(bytes, name, savedAnnotations, startPage);
  }

  async function handleFileSelected(file) {
    if (!file || file.type !== 'application/pdf') return;
    const buffer = await file.arrayBuffer();
    await openDocumentBytes(new Uint8Array(buffer), file.name);
  }

  // Abrir PDF desde dispositivo
  document.getElementById('btnOpenPdf').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelected(e.target.files[0]);
    fileInput.value = '';
  });

  // Arrastrar y soltar PDF
  ['dragenter', 'dragover'].forEach((ev) => {
    screenDisplay.addEventListener(ev, (e) => {
      e.preventDefault();
      screenDisplay.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((ev) => {
    screenDisplay.addEventListener(ev, (e) => {
      e.preventDefault();
      screenDisplay.classList.remove('drag-over');
    });
  });

  screenDisplay.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });

  // Botón circular rojo liso -> Cierra el PDF actual
  document.getElementById('btnCloseDoc').addEventListener('click', () => {
    window.QuipuVisor.stopSpeech();
    clearTimeout(trafficTimer1);
    clearTimeout(trafficTimer2);
    ledRed.className = 'led led-red lit-red';
    ledYellow.className = 'led led-yellow';
    ledGreen.className = 'led led-green';
    setTimeout(() => {
      ledRed.className = 'led led-red';
    }, 650);

    currentDocId = null;
    currentDocFolderId = null;
    viewerState.classList.add('hidden');
    welcomeState.classList.remove('hidden');
  });

  // Ranuras de sonido -> Lectura en voz alta
  document.getElementById('speakerGrille').addEventListener('click', () => {
    window.runQuipuTrafficLight(220);
    window.QuipuVisor.toggleReadAloud();
  });

  // Navegación y zoom
  document.getElementById('btnPrevPage').addEventListener('click', () => {
    window.pulseQuipuLens();
    window.QuipuVisor.goToPage(window.QuipuVisor.state.currentPage - 1);
  });

  document.getElementById('btnNextPage').addEventListener('click', () => {
    window.pulseQuipuLens();
    window.QuipuVisor.goToPage(window.QuipuVisor.state.currentPage + 1);
  });

  document.getElementById('pageInput').addEventListener('change', (e) => {
    window.pulseQuipuLens();
    window.QuipuVisor.goToPage(Number(e.target.value));
  });

  document.getElementById('btnZoomIn').addEventListener('click', () => {
    window.pulseQuipuLens();
    window.QuipuVisor.changeZoom(0.15);
  });

  document.getElementById('btnZoomOut').addEventListener('click', () => {
    window.pulseQuipuLens();
    window.QuipuVisor.changeZoom(-0.15);
  });

  document.getElementById('btnToggleCartuchera').addEventListener('click', () => {
    window.pulseQuipuLens();
    document.getElementById('cartucheraBar').classList.toggle('hidden');
  });

  // ==========================================
  // BOTÓN 1: GUARDAR EN CARPETAS DE QUIPU (💾 Guardar)
  // ==========================================
  const libraryModal = document.getElementById('libraryModal');
  const btnSaveHere = document.getElementById('btnSaveHere');

  async function saveCurrentDocIntoFolder(targetFolderId) {
    const visor = window.QuipuVisor;
    if (!visor.state.pdfBytes) return;

    window.runQuipuTrafficLight(300);

    const record = {
      id: currentDocId || 'doc_' + Date.now(),
      folderId: targetFolderId,
      fileName: visor.state.fileName,
      pdfBytes: visor.state.pdfBytes,
      annotations: visor.state.annotations,
      currentPage: visor.state.currentPage,
      updatedAt: new Date().toLocaleString('es-AR')
    };

    await window.QuipuStorage.saveDocumentToFolder(record);
    currentDocId = record.id;
    currentDocFolderId = targetFolderId;
  }

  document.getElementById('btnSaveInternal').addEventListener('click', async () => {
    // Si ya tiene carpeta asignada, guarda directo ahí; si es nuevo, abre carpetas para elegir dónde guardarlo
    if (currentDocId && currentDocFolderId) {
      await saveCurrentDocIntoFolder(currentDocFolderId);
    } else {
      await openLibraryModal(true);
    }
  });

  // ==========================================
  // BOTÓN 2: DESCARGAR PDF EXTERNO (⬇️ Descargar)
  // ==========================================
  document.getElementById('btnDownloadPdf').addEventListener('click', async () => {
    window.runQuipuTrafficLight(320);
    await window.QuipuExport.downloadModifiedPdf();
  });

  // ==========================================
  // BIBLIOTECA DE CARPETAS Y SUBCARPETAS
  // ==========================================
  async function openLibraryModal(isSavingMode = false) {
    browsingFolderId = currentDocFolderId || 'root';
    btnSaveHere.classList.toggle('hidden', !isSavingMode || !window.QuipuVisor.state.pdfBytes);
    libraryModal.classList.remove('hidden');
    await renderLibraryView();
  }

  document.getElementById('btnOpenLibraryHome').addEventListener('click', () => openLibraryModal(false));
  document.getElementById('btnOpenLibraryViewer').addEventListener('click', () => openLibraryModal(true));
  document.getElementById('btnCloseLibraryModal').addEventListener('click', () => libraryModal.classList.add('hidden'));

  btnSaveHere.addEventListener('click', async () => {
    await saveCurrentDocIntoFolder(browsingFolderId);
    libraryModal.classList.add('hidden');
  });

  document.getElementById('btnNewFolder').addEventListener('click', async () => {
    const folderName = prompt('Nombre de la nueva carpeta o subcarpeta:');
    if (!folderName || !folderName.trim()) return;
    await window.QuipuStorage.createFolder(folderName, browsingFolderId);
    await renderLibraryView();
  });

  async function renderLibraryView() {
    const allFolders = await window.QuipuStorage.getAllFolders();
    const subFolders = await window.QuipuStorage.getFoldersByParent(browsingFolderId);
    const docs = await window.QuipuStorage.getDocumentsByFolder(browsingFolderId);

    // Construir ruta de navegación (Inicio > Materia > Unidad)
    const breadcrumbEl = document.getElementById('folderBreadcrumb');
    breadcrumbEl.innerHTML = '';

    const chain = [];
    let cursorId = browsingFolderId;
    while (cursorId && cursorId !== 'root') {
      const found = allFolders.find((f) => f.id === cursorId);
      if (!found) break;
      chain.unshift(found);
      cursorId = found.parentId;
    }

    const rootBtn = document.createElement('button');
    rootBtn.type = 'button';
    rootBtn.className = 'crumb-btn';
    rootBtn.textContent = '🏠 Inicio';
    rootBtn.addEventListener('click', () => {
      browsingFolderId = 'root';
      renderLibraryView();
    });
    breadcrumbEl.appendChild(rootBtn);

    chain.forEach((fld) => {
      const sep = document.createElement('span');
      sep.textContent = ' › ';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crumb-btn';
      btn.textContent = fld.name;
      btn.addEventListener('click', () => {
        browsingFolderId = fld.id;
        renderLibraryView();
      });
      breadcrumbEl.append(sep, btn);
    });

    // Listar subcarpetas y archivos
    const listEl = document.getElementById('libraryList');
    listEl.innerHTML = '';

    if (subFolders.length === 0 && docs.length === 0) {
      listEl.innerHTML = `<div class="lib-empty">Esta carpeta está vacía.<br>Creá una subcarpeta o guardá tu PDF acá.</div>`;
      return;
    }

    subFolders.forEach((fld) => {
      const row = document.createElement('div');
      row.className = 'lib-item';
      row.innerHTML = `
        <div class="lib-item-main">
          <span>📁</span>
          <div>
            <div class="lib-item-title">${fld.name}</div>
            <div class="lib-item-meta">Carpeta · ${fld.createdAt}</div>
          </div>
        </div>
        <div class="btn-row">
          <button type="button" class="icon-btn btn-rename-fld" title="Editar nombre de carpeta">✏️</button>
          <button type="button" class="icon-btn btn-del-fld" title="Eliminar carpeta">🗑️</button>
        </div>
      `;
      row.querySelector('.lib-item-main').addEventListener('click', () => {
        browsingFolderId = fld.id;
        renderLibraryView();
      });
      row.querySelector('.btn-rename-fld').addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = prompt('Nuevo nombre para la carpeta:', fld.name);
        if (updated && updated.trim()) {
          await window.QuipuStorage.renameFolder(fld.id, updated);
          await renderLibraryView();
        }
      });
      row.querySelector('.btn-del-fld').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.QuipuStorage.deleteFolder(fld.id);
        await renderLibraryView();
      });
      listEl.appendChild(row);
    });

    docs.forEach((doc) => {
      const row = document.createElement('div');
      row.className = 'lib-item';
      row.innerHTML = `
        <div class="lib-item-main">
          <span>📄</span>
          <div>
            <div class="lib-item-title">${doc.fileName}</div>
            <div class="lib-item-meta">Guardado: ${doc.updatedAt}</div>
          </div>
        </div>
        <div class="btn-row">
          <button type="button" class="icon-btn btn-rename-doc" title="Editar nombre del archivo">✏️</button>
          <button type="button" class="icon-btn btn-del-doc" title="Eliminar archivo">🗑️</button>
        </div>
      `;
      row.querySelector('.lib-item-main').addEventListener('click', async () => {
        libraryModal.classList.add('hidden');
        await openDocumentBytes(doc.pdfBytes, doc.fileName, doc.annotations, doc.currentPage, doc);
      });
      row.querySelector('.btn-rename-doc').addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = prompt('Nuevo nombre para el archivo:', doc.fileName);
        if (updated && updated.trim()) {
          const finalName = updated.trim().toLowerCase().endsWith('.pdf')
            ? updated.trim()
            : `${updated.trim()}.pdf`;
          await window.QuipuStorage.renameDocument(doc.id, finalName);
          if (currentDocId === doc.id) {
            window.QuipuVisor.state.fileName = finalName;
            document.getElementById('docTitle').textContent = finalName;
          }
          await renderLibraryView();
        }
      });
      row.querySelector('.btn-del-doc').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.QuipuStorage.deleteDocument(doc.id);
        await renderLibraryView();
      });
      listEl.appendChild(row);
    });
  }

  // Modal de Configuración
  const settingsModal = document.getElementById('settingsModal');
  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    window.pulseQuipuLens();
    settingsModal.classList.remove('hidden');
  });

  document.getElementById('btnCloseModal').addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.pulseQuipuLens();
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      screenDisplay.classList.remove('mode-sepia', 'mode-night');
      if (btn.dataset.mode === 'sepia') screenDisplay.classList.add('mode-sepia');
      if (btn.dataset.mode === 'night') screenDisplay.classList.add('mode-night');
    });
  });

  document.getElementById('btnReadAloudModal').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    window.runQuipuTrafficLight(220);
    window.QuipuVisor.toggleReadAloud();
  });

  document.getElementById('btnAddRuledPage').addEventListener('click', async () => {
    settingsModal.classList.add('hidden');
    window.runQuipuTrafficLight(280);
    await window.QuipuPaginas.addRuledPageAfterCurrent();
  });

  document.getElementById('btnRotatePage').addEventListener('click', async () => {
    window.runQuipuTrafficLight(250);
    await window.QuipuPaginas.rotateCurrentPage();
  });

  document.getElementById('btnDeletePage').addEventListener('click', async () => {
    settingsModal.classList.add('hidden');
    window.runQuipuTrafficLight(280);
    await window.QuipuPaginas.deleteCurrentPage();
  });

  document.getElementById('btnMergePdf').addEventListener('click', () => mergeFileInput.click());
  mergeFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    settingsModal.classList.add('hidden');
    window.runQuipuTrafficLight(300);
    await window.QuipuPaginas.mergeWithBytes(new Uint8Array(buffer));
    mergeFileInput.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (document.activeElement.tagName !== 'TEXTAREA' && !document.activeElement.isContentEditable) {
        e.preventDefault();
        window.pulseQuipuLens();
        window.QuipuCartuchera.undo();
      }
    }
  });
});
