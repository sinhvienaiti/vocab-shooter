import type { VocabularyEntry } from "../types";

const DB_NAME = "typingGameVocabulary";
const DB_VERSION = 1;
const STORE = "entries";

const seedEntries: VocabularyEntry[] = [
  { id: crypto.randomUUID(), en: "cache", vi: "bộ nhớ đệm", ipa: "/kæʃ/" },
  { id: crypto.randomUUID(), en: "parent block", vi: "block cha", ipa: "/ˈper.ənt blɑːk/" },
  { id: crypto.randomUUID(), en: "dependency injection", vi: "tiêm phụ thuộc", ipa: "/dɪˈpen.dən.si ɪnˈdʒek.ʃən/" },
  { id: crypto.randomUUID(), en: "business logic", vi: "logic nghiệp vụ", ipa: "/ˈbɪz.nəs ˈlɑː.dʒɪk/" },
  { id: crypto.randomUUID(), en: "service container", vi: "container dịch vụ", ipa: "/ˈsɝː.vɪs kənˈteɪ.nɚ/" },
  { id: crypto.randomUUID(), en: "database connection", vi: "kết nối cơ sở dữ liệu", ipa: "/ˈdeɪ.tə.beɪs kəˈnek.ʃən/" },
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getVocabulary(): Promise<VocabularyEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const entries = await requestToPromise(tx.objectStore(STORE).getAll() as IDBRequest<VocabularyEntry[]>);
  db.close();

  if (entries.length > 0) return entries;
  await replaceVocabulary(seedEntries);
  return seedEntries;
}

export async function replaceVocabulary(entries: VocabularyEntry[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}
