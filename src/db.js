import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, query, where, runTransaction, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { CATS, LANGS, DAY, MAX_ID } from './consts';
import { planImport } from './importParse';
import { getAuth, signInAnonymously } from 'firebase/auth';

// Paste your Firebase console > Project settings > Web app config here
const app = initializeApp({
  apiKey: "AIzaSyBl0qrR-HCp3jO8SZ-wvXo0gS0gCrbm81c",
  authDomain: "brothers-vayanasala-libr-ebca4.firebaseapp.com",
  projectId: "brothers-vayanasala-libr-ebca4",
  storageBucket: "brothers-vayanasala-libr-ebca4.firebasestorage.app",
  messagingSenderId: "503118293299",
  appId: "1:503118293299:web:779c57b923e7dd3b253646",
});
export const db = getFirestore(app);
export const signIn = () => signInAnonymously(getAuth(app));
export const APP_USER_ID = '9048';

export { CATS, LANGS, DAY, MAX_ID };
export const fmt = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const DAMAGED = (n) => 'The ID counter is damaged (' + n + '). Open Backup > Library tools > Repair counters, then try again.';

export async function nextNumbers(category) {
  const s = await getDoc(doc(db, 'meta', 'counters'));
  const d = s.exists() ? s.data() : { total: 0, cats: {} };
  if ((d.total ?? 0) > MAX_ID) return { id: '!', code: 'Repair counters' };
  const code = CATS[category] ?? 'OT';
  return { id: (d.total ?? 0) + 1, code: code + '-' + (((d.cats ?? {})[code] ?? 0) + 1) };
}

// Atomic: Book ID and Category No can never be duplicated, even with two devices.
export async function addBook(b) {
  const code = CATS[b.category] ?? 'OT';
  return runTransaction(db, async (t) => {
    const mref = doc(db, 'meta', 'counters');
    const s = await t.get(mref);
    const d = s.exists() ? s.data() : { total: 0, cats: {} };
    if ((d.total ?? 0) > MAX_ID) throw new Error(DAMAGED(d.total));
    const id = (d.total ?? 0) + 1, no = ((d.cats ?? {})[code] ?? 0) + 1;
    const bref = doc(db, 'books', String(id));
    if ((await t.get(bref)).exists()) throw new Error('Book ID ' + id + ' already exists. Open Backup > Library tools > Repair counters.');
    t.set(mref, { total: id, cats: { ...(d.cats ?? {}), [code]: no } });
    t.set(bref, { ...b, bookId: id, catNo: no, catCode: code + '-' + no, createdAt: Date.now() });
    return { id, catCode: code + '-' + no };
  });
}

// Keeps a book's own Book ID and Category No (old labels). Refuses numbers that
// are not realistic stock numbers, so a barcode can never poison the counters.
export async function addBookKeep(b, id, code, no) {
  if (!(id > 0 && id <= MAX_ID && no > 0 && no <= MAX_ID)) throw new Error('Book ID / Category No out of range');
  return runTransaction(db, async (t) => {
    const bref = doc(db, 'books', String(id)), mref = doc(db, 'meta', 'counters');
    const bs = await t.get(bref), ms = await t.get(mref);
    if (bs.exists()) throw new Error('duplicate');
    const d = ms.exists() ? ms.data() : { total: 0, cats: {} };
    if ((d.total ?? 0) > MAX_ID) throw new Error(DAMAGED(d.total));
    const cats = { ...(d.cats ?? {}) };
    cats[code] = Math.max(cats[code] ?? 0, no);
    t.set(mref, { total: Math.max(d.total ?? 0, id), cats });
    t.set(bref, { ...b, bookId: id, catNo: no, catCode: code + '-' + no, createdAt: Date.now() });
    return { id };
  });
}

// Recomputes the counters from the books that really exist. Ignores any book
// whose ID is not a realistic stock number (> MAX_ID).
export async function repairCounters() {
  const snap = await getDocs(collection(db, 'books'));
  let total = 0, bad = 0;
  const cats = {};
  snap.docs.forEach((x) => {
    const b = x.data(), id = Number(b.bookId);
    if (!(id > 0 && id <= MAX_ID)) { bad++; return; }
    total = Math.max(total, id);
    const m = String(b.catCode ?? '').match(/^([A-Za-z]+)-(\d+)$/);
    if (m) { const n = parseInt(m[2], 10), c = m[1].toUpperCase(); if (n <= MAX_ID) cats[c] = Math.max(cats[c] ?? 0, n); }
  });
  await setDoc(doc(db, 'meta', 'counters'), { total, cats });
  return { total, cats, books: snap.size, bad };
}

const CHUNK = 400; // Firestore allows at most 500 writes per batch

async function deleteAll(name) {
  const snap = await getDocs(collection(db, name));
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const b = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach((x) => b.delete(x.ref));
    await b.commit();
  }
  return snap.docs.length;
}

// Danger: removes every book and every issue record, resets the counters.
// Members are kept.
export async function wipeBooksAndIssues() {
  const books = await deleteAll('books');
  const issues = await deleteAll('issues');
  await setDoc(doc(db, 'meta', 'counters'), { total: 0, cats: {} });
  return { books, issues };
}

// Fast import: numbers are planned in memory, counters are reserved in ONE
// transaction, and books are written 400 at a time (the old import did one
// slow transaction per book).
export async function importBooks(items, onProgress) {
  const have = new Set((await getDocs(collection(db, 'books'))).docs.map((x) => x.id));
  const mref = doc(db, 'meta', 'counters');

  let counters = (await getDoc(mref)).data() ?? { total: 0, cats: {} };
  if ((counters.total ?? 0) > MAX_ID) await repairCounters(); // heal damaged counters automatically

  let result;
  await runTransaction(db, async (t) => {
    const s = await t.get(mref);
    const c = s.exists() ? s.data() : { total: 0, cats: {} };
    if ((c.total ?? 0) > MAX_ID) throw new Error(DAMAGED(c.total));
    result = planImport({ items, have, counters: c });
    t.set(mref, result.counters);
  });

  const { plan } = result;
  let done = 0;
  for (let i = 0; i < plan.length; i += CHUNK) {
    const part = plan.slice(i, i + CHUNK);
    const b = writeBatch(db);
    part.forEach((p) => b.set(doc(db, 'books', String(p.id)), { ...p.rec, bookId: p.id, catNo: p.no, catCode: p.code + '-' + p.no, createdAt: Date.now() }));
    await b.commit();
    done += part.length;
    if (onProgress) onProgress(done, plan.length);
  }
  return { added: plan.length, kept: result.kept, existing: result.existing, dupInFile: result.dupInFile };
}

export async function findBook(input) {
  const v = String(input).trim();
  const byCode = await getDocs(query(collection(db, 'books'), where('barcode', '==', v)));
  if (!byCode.empty) return byCode.docs[0].data();
  const s = await getDoc(doc(db, 'books', v));
  return s.exists() ? s.data() : null;
}
export const findOpenIssue = async (bookId) => {
  const q = await getDocs(query(collection(db, 'issues'), where('bookId', '==', bookId), where('returned', '==', false)));
  return q.empty ? null : q.docs[0];
};
export { doc, getDoc, getDocs, collection, setDoc, updateDoc };
