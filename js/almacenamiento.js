window.QuipuStorage = (() => {
  const DB_NAME = 'QuipuDB_v3';
  const STORE_FOLDERS = 'folders';
  const STORE_DOCS = 'documents';
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
        }
      };

      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Base de datos bloqueada por otra pestaña'));
    });
  }

  async function createFolder(name, parentId = 'root') {
    const db = await openDB();
    const folder = {
      id: 'fld_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name.trim(),
      parentId: parentId || 'root',
      createdAt: new Date().toLocaleDateString('es-AR')
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);
      const req = store.put(folder);
      req.onsuccess = () => resolve(folder);
      req.onerror = () => reject(req.error);
    });
  }

  async function renameFolder(folderId, newName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);
      const getReq = store.get(folderId);

      getReq.onsuccess = () => {
        const folder = getReq.result;
        if (!folder) {
          resolve(false);
          return;
        }
        folder.name = newName.trim();
        const putReq = store.put(folder);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function getFoldersByParent(parentId = 'root') {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const req = tx.objectStore(STORE_FOLDERS).getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        resolve(all.filter((f) => (f.parentId || 'root') === parentId));
      };
      req.onerror = () => resolve([]);
    });
  }

  async function getAllFolders() {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const req = tx.objectStore(STORE_FOLDERS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async function saveDocumentToFolder(docRecord) {
    const db = await openDB();
    // Clonar bytes y anotaciones de forma limpia para evitar errores de clonación en IndexedDB
    const cleanRecord = {
      id: docRecord.id,
      folderId: docRecord.folderId || 'root',
      fileName: docRecord.fileName,
      pdfBytes: new Uint8Array(docRecord.pdfBytes),
      annotations: JSON.parse(JSON.stringify(docRecord.annotations || {})),
      currentPage: docRecord.currentPage || 1,
      updatedAt: docRecord.updatedAt || new Date().toLocaleString('es-AR')
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      const store = tx.objectStore(STORE_DOCS);
      const req = store.put(cleanRecord);
      req.onsuccess = () => resolve(cleanRecord);
      req.onerror = () => reject(req.error);
    });
  }

  async function renameDocument(docId, newFileName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      const store = tx.objectStore(STORE_DOCS);
      const getReq = store.get(docId);

      getReq.onsuccess = () => {
        const doc = getReq.result;
        if (!doc) {
          resolve(false);
          return;
        }
        doc.fileName = newFileName.trim();
        const putReq = store.put(doc);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function getDocumentsByFolder(folderId = 'root') {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DOCS, 'readonly');
      const req = tx.objectStore(STORE_DOCS).getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        resolve(all.filter((d) => (d.folderId || 'root') === folderId));
      };
      req.onerror = () => resolve([]);
    });
  }

  async function deleteDocument(docId) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      tx.objectStore(STORE_DOCS).delete(docId);
      tx.oncomplete = () => resolve(true);
    });
  }

  async function deleteFolder(folderId) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      tx.objectStore(STORE_FOLDERS).delete(folderId);
      tx.oncomplete = () => resolve(true);
    });
  }

  return {
    createFolder,
    renameFolder,
    getFoldersByParent,
    getAllFolders,
    saveDocumentToFolder,
    renameDocument,
    getDocumentsByFolder,
    deleteDocument,
    deleteFolder
  };
})();