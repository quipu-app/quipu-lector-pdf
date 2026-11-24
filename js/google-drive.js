window.QuipuDrive = (() => {
  // ⚠️ REEMPLAZÁ ESTE TEXTO POR TU CLIENT ID DE GOOGLE CLOUD:
  const CLIENT_ID = '653768514640-c9stv6t0rap0i07tmo949armgeuu87i2.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';
  const ROOT_FOLDER_NAME = 'Quipu_Estudio_Sync';
  const FOLDERS_FILE = 'quipu_folders.json';

  let tokenClient = null;
  let accessToken = null;
  let avisarCambioDeSesion = null;

  function init(onAuthChange) {
    avisarCambioDeSesion = onAuthChange;
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      setTimeout(() => init(onAuthChange), 400);
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          if (onAuthChange) onAuthChange(true);
        }
      }
    });
  }

  function signIn() {
    if (!tokenClient) {
      alert('Cargando servicios de Google, intentá de nuevo en un segundo.');
      return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  function isConnected() {
    return Boolean(accessToken);
  }

  async function driveFetch(url, options = {}) {
    const headers = Object.assign({}, options.headers || {}, {
      Authorization: `Bearer ${accessToken}`
    });
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // El permiso de Google dura una hora: hay que volver a conectar
      accessToken = null;
      if (avisarCambioDeSesion) avisarCambioDeSesion(false);
      throw new Error('La sesión de Google venció. Volvé a conectar Drive.');
    }
    if (!res.ok) throw new Error('Error en Google Drive API: ' + res.status);
    return res;
  }

  // Busca o crea la carpeta principal "Quipu_Estudio_Sync" en el Drive del usuario
  async function getOrCreateAppFolder() {
    const q = encodeURIComponent(`name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime&fields=files(id,name)`);
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    const created = await createRes.json();
    return created.id;
  }

  // Convierte Uint8Array a Base64 de a pedazos (más rápido con PDFs grandes)
  function uint8ToBase64(bytes) {
    let binary = '';
    const paso = 0x8000;
    for (let i = 0; i < bytes.length; i += paso) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
    }
    return btoa(binary);
  }

  function base64ToUint8(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Pasa la fecha "24/11/2026, 14:43:05" (o una fecha ISO) a milisegundos para poder comparar
  function fechaEnMs(texto) {
    if (!texto) return 0;
    const m = String(texto).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
    }
    const iso = Date.parse(texto);
    return isNaN(iso) ? 0 : iso;
  }

  // Sube un documento: actualiza el archivo si ya existe en Drive, o lo crea
  async function subirDocumento(appFolderId, doc, remoteFileId) {
    const serialized = JSON.stringify({
      id: doc.id,
      folderId: doc.folderId,
      fileName: doc.fileName,
      pdfBase64: uint8ToBase64(new Uint8Array(doc.pdfBytes)),
      annotations: doc.annotations,
      currentPage: doc.currentPage,
      updatedAt: doc.updatedAt
    });
    // La fecha va también como "etiqueta" del archivo, así se compara sin descargarlo
    const metadata = { appProperties: { actualizado: String(fechaEnMs(doc.updatedAt)) } };

    if (remoteFileId) {
      return uploadMultipartFile(null, null, 'application/json', serialized, metadata, remoteFileId);
    }
    return uploadMultipartFile(appFolderId, `${doc.id}.quipu.json`, 'application/json', serialized, metadata);
  }

  async function bajarDocumento(remoteFileId) {
    const dlRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${remoteFileId}?alt=media`);
    const remoteDoc = await dlRes.json();
    await window.QuipuStorage.saveDocumentToFolder({
      id: remoteDoc.id,
      folderId: remoteDoc.folderId || 'root',
      fileName: remoteDoc.fileName,
      pdfBytes: base64ToUint8(remoteDoc.pdfBase64),
      annotations: remoteDoc.annotations || {},
      currentPage: remoteDoc.currentPage || 1,
      updatedAt: remoteDoc.updatedAt
    });
    return remoteDoc;
  }

  // Sincronización en las dos direcciones (Carpetas + PDFs + Post-its y Subrayados)
  async function syncAll() {
    if (!accessToken) throw new Error('No conectado a Google Drive');
    if (window.runQuipuTrafficLight) window.runQuipuTrafficLight(350);

    const appFolderId = await getOrCreateAppFolder();

    // 1. CARPETAS: primero leer las de Drive (antes se pisaban con las de este equipo)
    const qFolders = encodeURIComponent(`name='${FOLDERS_FILE}' and '${appFolderId}' in parents and trashed=false`);
    const resFolders = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${qFolders}&fields=files(id)`);
    const foldersFile = ((await resFolders.json()).files || [])[0];
    let remoteFolders = [];
    if (foldersFile) {
      const contenido = await driveFetch(`https://www.googleapis.com/drive/v3/files/${foldersFile.id}?alt=media`);
      remoteFolders = await contenido.json();
    }

    // 2. Juntar carpetas: las que faltan acá se crean CON EL MISMO ID que en Drive,
    //    así los apuntes que viven adentro aparecen en su lugar
    let localFolders = await window.QuipuStorage.getAllFolders();
    const localDocs = await window.QuipuStorage.getAllDocuments();
    const idsRemotos = new Set(remoteFolders.map((f) => f.id));

    // Limpia carpetas repetidas que dejó la versión anterior: vacías, con el mismo
    // nombre que una de Drive pero con otro ID
    for (const lf of localFolders) {
      if (idsRemotos.has(lf.id)) continue;
      const gemela = remoteFolders.find((rf) => rf.name === lf.name);
      const tieneDocs = localDocs.some((d) => d.folderId === lf.id);
      const tieneHijas = localFolders.some((f) => f.parentId === lf.id);
      if (gemela && !tieneDocs && !tieneHijas) {
        await window.QuipuStorage.deleteFolder(lf.id);
      }
    }
    localFolders = await window.QuipuStorage.getAllFolders();
    const idsLocales = new Set(localFolders.map((f) => f.id));

    for (const rf of remoteFolders) {
      if (!idsLocales.has(rf.id)) {
        await window.QuipuStorage.saveFolderRecord(rf);
      }
    }

    // 3. Subir la lista completa (las de Drive + las nuevas de este equipo)
    const todasLasCarpetas = await window.QuipuStorage.getAllFolders();
    const foldersPayload = JSON.stringify(todasLasCarpetas);
    if (foldersFile) {
      await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${foldersFile.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: foldersPayload
      });
    } else {
      await uploadMultipartFile(appFolderId, FOLDERS_FILE, 'application/json', foldersPayload);
    }

    // 4. DOCUMENTOS: comparar fechas y quedarse con la versión más nueva de cada uno
    const qRemote = encodeURIComponent(`'${appFolderId}' in parents and trashed=false`);
    const resRemote = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${qRemote}&fields=files(id,name,appProperties)&pageSize=1000`);
    const remoteDocs = ((await resRemote.json()).files || []).filter((f) => f.name.endsWith('.quipu.json'));
    const localPorId = new Map(localDocs.map((d) => [d.id, d]));
    const vistos = new Set();

    for (const rFile of remoteDocs) {
      const docId = rFile.name.replace('.quipu.json', '');
      vistos.add(docId);
      const local = localPorId.get(docId);

      if (!local) {
        // Está en Drive y no en este equipo: se baja
        await bajarDocumento(rFile.id);
        continue;
      }

      const msLocal = fechaEnMs(local.updatedAt);
      const etiqueta = rFile.appProperties && rFile.appProperties.actualizado;

      if (etiqueta) {
        const msRemoto = Number(etiqueta);
        if (msRemoto > msLocal) await bajarDocumento(rFile.id);
        else if (msLocal > msRemoto) await subirDocumento(appFolderId, local, rFile.id);
        // Si son iguales, ya está al día: no se sube ni se baja nada
      } else {
        // Archivo de la versión anterior (sin etiqueta de fecha): se baja para comparar
        const dlRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${rFile.id}?alt=media`);
        const remoteDoc = await dlRes.json();
        if (fechaEnMs(remoteDoc.updatedAt) > msLocal) {
          await window.QuipuStorage.saveDocumentToFolder({
            id: remoteDoc.id,
            folderId: remoteDoc.folderId || 'root',
            fileName: remoteDoc.fileName,
            pdfBytes: base64ToUint8(remoteDoc.pdfBase64),
            annotations: remoteDoc.annotations || {},
            currentPage: remoteDoc.currentPage || 1,
            updatedAt: remoteDoc.updatedAt
          });
        } else {
          // La de este equipo es igual o más nueva: se sube y queda con etiqueta
          await subirDocumento(appFolderId, local, rFile.id);
        }
      }
    }

    // 5. Los que están solo en este equipo se suben
    for (const doc of localDocs) {
      if (!vistos.has(doc.id)) {
        await subirDocumento(appFolderId, doc);
      }
    }

    if (window.runQuipuTrafficLight) window.runQuipuTrafficLight(250);
    return true;
  }

  // Sube un archivo nuevo (parentId + fileName) o reemplaza uno existente (fileId)
  async function uploadMultipartFile(parentId, fileName, mimeType, content, extraMetadata = {}, fileId = null) {
    const boundary = '-------quipu_boundary_2026';
    const meta = Object.assign({}, extraMetadata);
    if (!fileId) {
      meta.name = fileName;
      meta.parents = [parentId];
    }
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n` +
      `--${boundary}--`;

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    return driveFetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
  }

  return { init, signIn, isConnected, syncAll };
})();
