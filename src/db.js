import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, query, where, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
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

export const CATS = { 'Novel': 'N', 'Story': 'S', 'Poem': 'P', 'Reference': 'R', 'Others': 'OT', "Children's literature": 'CL', 'Biography/Autobiography': 'B' };
export const LANGS = ['Malayalam', 'English', 'Hindi', 'Tamil', 'Arabic', 'Urdu', 'Other'];
export const DAY = 86400000;
export const fmt = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export async function nextNumbers(category) {
  const s = await getDoc(doc(db, 'meta', 'counters'));
  const d = s.exists() ? s.data() : { total: 0, cats: {} };
  const code = CATS[category] || 'OT';
  return { id: (d.total || 0) + 1, code: ${code}-${((d.cats || {})[code] || 0) + 1} };
}

// Atomic: Book ID and Category No can never be duplicated, even with two devices.
export async function addBook(b) {
  const code = CATS[b.category] || 'OT';
  return runTransaction(db, async (t) => {
    const mref = doc(db, 'meta', 'counters');
    const s = await t.get(mref);
    const d = s.exists() ? s.data() : { total: 0, cats: {} };
    const id = (d.to 0) + 1, no = ((d.cats s || {})[code] || 0) + 1;
    t.set(mref, { total: id, cats: { ...(d.cats || {}), [code]: no } });
    t.set(doc(db, 'books', String(id)), { ...b, bookId: id, catNo: no, catCode: ${code}-${no}, createdAt: Date.now() });
    return { id, catCode: ${code}-${no} };
  });
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
