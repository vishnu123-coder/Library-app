import * as FS from 'expo-file-system/legacy';
import { collection, doc, getDoc, getDocs, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './db';
import { createSynced } from './syncCore';

const file = (n) => FS.documentDirectory + 'cache-' + n + '.json';

const deps = {
  readFile: async (n) => { const i = await FS.getInfoAsync(file(n)); return i.exists ? FS.readAsStringAsync(file(n)) : null; },
  writeFile: (n, txt) => FS.writeAsStringAsync(file(n), txt),
  getAll: async (n) => (await getDocs(collection(db, n))).docs.map((d) => ({ id: d.id, data: d.data() })),
  getSince: async (n, since) => {
    const q = since ? query(collection(db, n), where('createdAt', '>=', since)) : collection(db, n);
    return (await getDocs(q)).docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  count: async (n) => (await getCountFromServer(collection(db, n))).data().count,
  getEpoch: async () => (await getDoc(doc(db, 'meta', 'counters'))).data()?.epoch ?? 0,
  listen: (n, since, cb) => {
    const q = since ? query(collection(db, n), where('createdAt', '>=', since)) : collection(db, n);
    return onSnapshot(q, (s) => cb(s.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() }))), () => {});
  },
};

export const booksSync = createSynced('books', 'bookId', deps);
export const membersSync = createSynced('members', 'memberId', deps);
