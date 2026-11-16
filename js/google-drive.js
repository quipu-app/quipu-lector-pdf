window.QuipuDrive = (() => {
  // ⚠️ REEMPLAZÁ ESTE TEXTO POR TU CLIENT ID DE GOOGLE CLOUD:
  const CLIENT_ID = '653768514640-c9stv6t0rap0i07tmo949armgeuu87i2.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';
  const ROOT_FOLDER_NAME = 'Quipu_Estudio_Sync';

  let tokenClient = null;
  let accessToken = null;

  function init(onAuthChange) {
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
    if (!res.ok) throw new Error('Error en Google Drive API: ' + res.status);
    return res;
  }

  // Busca o crea la carpeta principal "Quipu_Estudio_Sync" en el Drive del usuario
  async function getOrCreateAppFolder() {
    const q = encodeURIComponent(`name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
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

  // Convierte Uint8Array a Base64 de forma segura
  function uint8ToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
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

  // Sincronización bidireccional completa (Carpetas + PDFs + Post-its y Subrayados)
  async function syncAll() {
    if (!accessToken) throw new Error('No conectado a Google Drive');
    if (window.runQuipuTrafficLight) window.runQuipuTrafficLight(350);

    const appFolderId = await getOrCreateAppFolder();
    const localFolders = await window.QuipuStorage.getAllFolders();

    // 1. Subir / actualizar estructura de carpetas (quipu_folders.json)
    const foldersPayload = JSON.stringify(localFolders);
    const qFolders = encodeURIComponent(`name='quipu_folders.json' and '${appFolderId}' in parents and trashed=false`);
    const resFolders = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${qFolders}&fields=files(id)`);
    const existingFoldersFile = (await resFolders.json()).files[0];

    if (existingFoldersFile) {
      await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFoldersFile.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: foldersPayload
      });
    } else {
      await uploadMultipartFile(appFolderId, 'quipu_folders.json', 'application/json', foldersPayload);
    }

    // 2. Obtener todos los documentos locales y subir cada uno como paquete .quipu.json
    const allLocalDocs = await getAllLocalDocuments(localFolders);
    const qRemote = encodeURIComponent(`'${appFolderId}' in parents and trashed=false`);
    const resRemote = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${qRemote}&fields=files(id,name,modifiedTime)`);
    const remoteFiles = (await resRemote.json()).files || [];

    for (const doc of allLocalDocs) {
      const remoteName = `${doc.id}.quipu.json`;
      const serialized = JSON.stringify({
        id: doc.id,
        folderId: doc.folderId,
        fileName: doc.fileName,
        pdfBase64: uint8ToBase64(new Uint8Array(doc.pdfBytes)),
        annotations: doc.annotations,
        currentPage: doc.currentPage,
        updatedAt: doc.updatedAt
      });

      const foundRemote = remoteFiles.find((f) => f.name === remoteName);
      if (foundRemote) {
        await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${foundRemote.id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: serialized
        });
      } else {
        await uploadMultipartFile(appFolderId, remoteName, 'application/json', serialized);
      }
    }

    // 3. Descargar documentos que existan en Drive y aún no estén en este dispositivo (ej: creados en PC y abiertos en celular)
    const localIds = new Set(allLocalDocs.map((d) => d.id));
    for (const rFile of remoteFiles) {
      if (!rFile.name.endsWith('.quipu.json')) continue;
      const docId = rFile.name.replace('.quipu.json', '');
      if (!localIds.has(docId)) {
        const dlRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${rFile.id}?alt=media`);
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
      }
    }

    // 4. Descargar carpetas remotas faltantes
    const dlFoldersRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${qFolders}&fields=files(id)`);
    const fList = (await dlFoldersRes.json()).files;
    if (fList && fList[0]) {
      const fContentRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fList[0].id}?alt=media`);
      const remoteFolders = await fContentRes.json();
      const localFolderIds = new Set(localFolders.map((f) => f.id));
      for (const rf of remoteFolders) {
        if (!localFolderIds.has(rf.id)) {
          await window.QuipuStorage.createFolder(rf.name, rf.parentId);
        }
      }
    }

    if (window.runQuipuTrafficLight) window.runQuipuTrafficLight(250);
    return true;
  }

  async function getAllLocalDocuments(folders) {
    const folderIds = ['root', ...folders.map((f) => f.id)];
    const docs = [];
    for (const fid of folderIds) {
      const list = await window.QuipuStorage.getDocumentsByFolder(fid);
      docs.push(...list);
    }
    return docs;
  }

  async function uploadMultipartFile(parentId, fileName, mimeType, content) {
    const boundary = '-------quipu_boundary_2026';
    const metadata = JSON.stringify({ name: fileName, parents: [parentId] });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n` +
      `--${boundary}--`;

    return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
  }

  return { init, signIn, isConnected, syncAll };
})();