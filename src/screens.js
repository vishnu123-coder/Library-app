import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, TouchableOpacity, Alert, ScrollView as SV } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { Ionicons } from '@expo/vector-icons';
import { C, Btn, Field, Select, Scanner, Card, Empty } from './ui';
import { db, CATS, LANGS, DAY, fmt, addBook, nextNumbers, findBook, findOpenIssue, doc, getDoc, getDocs, collection, setDoc, updateDoc } from './db';

const pad = { padding: 16, paddingBottom: 40 };
const Title = ({ children }) => <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 14 }}>{children}</Text>;
const cats = Object.keys(CATS);

/* ---------- Add Book ---------- */
export function AddBook() {
  const blank = { barcode: '', category: '', language: '', name: '', author: '', publication: '', cost: '' };
  const [f, setF] = useState(blank), [next, setNext] = useState(null), [scan, setScan] = useState(false), [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => { nextNumbers(f.category || 'Others').then(setNext).catch(() => {}); }, [f.category, busy]);

  const save = async () => {
    if (!f.category || !f.language || !f.name.trim()) return Alert.alert('Missing details', 'Category, language and book name are required.');
    setBusy(true);
    try {
      const r = await addBook({ ...f, name: f.name.trim(), author: f.author.trim(), publication: f.publication.trim(), cost: Number(f.cost) || 0 });
      Alert.alert('Book added', `Book ID ${r.id}\nCategory No ${r.catCode}`);
      setF(blank);
    } catch (e) { Alert.alert('Could not save', e.message); }
    setBusy(false);
  };

  const importXlsx = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true,
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'] });
    if (r.canceled) return;
    setBusy(true);
    try {
      const b64 = await FS.readAsStringAsync(r.assets[0].uri, { encoding: 'base64' });
      const wb = XLSX.read(b64, { type: 'base64' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      let ok = 0, bad = 0;
      for (const raw of rows) {
        const x = {}; Object.keys(raw).forEach((k) => (x[k.toLowerCase().replace(/[^a-z]/g, '')] = String(raw[k]).trim()));
        const name = x.bookname || x.name || x.title;
        if (!name) { bad++; continue; }
        const cat = cats.find((c) => c.toLowerCase() === (x.category || '').toLowerCase()) || 'Others';
        const lang = LANGS.find((l) => l.toLowerCase() === (x.language || x.categorytype || '').toLowerCase()) || 'Other';
        try { await addBook({ barcode: x.barcode || '', category: cat, language: lang, name, author: x.authorname || x.author || '',
          publication: x.publicationsname || x.publication || x.publisher || '', cost: Number(x.cost || x.price) || 0 }); ok++; } catch { bad++; }
      }
      Alert.alert('Import finished', `${ok} books added${bad ? `, ${bad} skipped` : ''}.`);
    } catch (e) { Alert.alert('Import failed', e.message); }
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <Title>Add book</Title>
      <Card style={{ flexDirection: 'row', backgroundColor: C.ink }}>
        <View style={{ flex: 1 }}><Text style={{ color: '#9FB3C8' }}>Book ID (auto)</Text><Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{next ? next.id : '—'}</Text></View>
        <View style={{ flex: 1 }}><Text style={{ color: '#9FB3C8' }}>Category No (auto)</Text><Text style={{ color: C.amber, fontSize: 26, fontWeight: '800' }}>{next ? next.code : '—'}</Text></View>
      </Card>
      <Field label="Barcode" value={f.barcode} onChangeText={set('barcode')} placeholder="Scan or type" onScan={() => setScan(true)} />
      <Select label="Category" value={f.category} options={cats} onChange={set('category')} />
      <Select label="Category type (language)" value={f.language} options={LANGS} onChange={set('language')} />
      <Field label="Book name" value={f.name} onChangeText={set('name')} />
      <Field label="Author name" value={f.author} onChangeText={set('author')} />
      <Field label="Publications name" value={f.publication} onChangeText={set('publication')} />
      <Field label="Cost" value={f.cost} onChangeText={set('cost')} keyboardType="decimal-pad" />
      <Btn title="Save book" icon="save" onPress={save} busy={busy} />
      <Btn title="Import from Excel (.xlsx)" icon="document-text" kind="ghost" onPress={importXlsx} busy={busy} style={{ marginTop: 10 }} />
      <Text style={{ color: C.mute, marginTop: 10, fontSize: 12 }}>Excel columns: Category, Language, Book Name, Author Name, Publications Name, Cost, Barcode (first row = headings). IDs are assigned automatically.</Text>
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={set('barcode')} />
    </ScrollView>
  );
}

/* ---------- Book list (Stock + Search) ---------- */
const FILTERS = [['all', 'All Fields'], ['category', 'Category'], ['name', 'Book Name'], ['author', 'Author Name'], ['publication', 'Publication Name']];
function BookList({ books, search }) {
  const [q, setQ] = useState(''), [flt, setFlt] = useState('all');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!search || !t) return books;
    const val = (b) => ({ category: `${b.category} ${b.catCode}`, name: b.name, author: b.author, publication: b.publication,
      all: `${b.category} ${b.catCode} ${b.name} ${b.author} ${b.publication} ${b.bookId} ${b.barcode}` }[flt] || '').toLowerCase();
    return books.filter((b) => val(b).includes(t));
  }, [books, q, flt, search]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6 }}>
        <Title>{search ? 'Global search' : 'Total stock'}</Title>
        {search && <>
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center', paddingHorizontal: 12 }}>
            <Ionicons name="search" size={18} color={C.mute} />
            <TextInput value={q} onChangeText={setQ} placeholder={flt === 'all' ? 'Search all fields…' : `Search by ${FILTERS.find((x) => x[0] === flt)[1]}…`} style={{ flex: 1, height: 46, marginLeft: 8, fontSize: 16 }} />
          </View>
          <SV horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
            {FILTERS.map(([k, l]) => (
              <TouchableOpacity key={k} onPress={() => setFlt(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: flt === k ? C.teal : '#fff', borderWidth: 1, borderColor: flt === k ? C.teal : C.line }}>
                <Text style={{ color: flt === k ? '#fff' : C.ink, fontWeight: '600' }}>{l}</Text>
              </TouchableOpacity>))}
          </SV>
        </>}
        <Text style={{ color: C.mute }}>{rows.length} of {books.length} books</Text>
      </View>
      <FlatList data={rows} keyExtractor={(b) => String(b.bookId)} contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        ListEmptyComponent={<Empty text="No books found" />}
        renderItem={({ item: b }) => (
          <Card style={{ flexDirection: 'row' }}>
            <View style={{ width: 64, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.line, marginRight: 14, paddingRight: 14 }}>
              <Text style={{ fontSize: 11, color: C.mute }}>ID</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{b.bookId}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.teal, marginTop: 4 }}>{b.catCode}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{b.name}</Text>
              <Text style={{ color: C.mute, marginTop: 2 }}>{b.author || 'Author not set'}</Text>
              <Text style={{ color: C.mute }}>{b.publication || 'Publication not set'} · {b.language}</Text>
              <Text style={{ color: C.ink, fontWeight: '700', marginTop: 4 }}>₹{b.cost}</Text>
            </View>
          </Card>)} />
    </View>
  );
}
export const Stock = ({ books }) => <BookList books={books} />;
export const Search = ({ books }) => <BookList books={books} search />;

/* ---------- Issue / Return ---------- */
export function Issue() {
  const [mode, setMode] = useState('issue'), [mid, setMid] = useState(''), [bk, setBk] = useState(''), [scan, setScan] = useState(null), [busy, setBusy] = useState(false);
  const now = Date.now();
  const go = async () => {
    if (!bk.trim() || (mode === 'issue' && !mid.trim())) return Alert.alert('Missing details', 'Enter or scan the member and the book.');
    setBusy(true);
    try {
      const book = await findBook(bk);
      if (!book) throw new Error('Book not found.');
      const open = await findOpenIssue(book.bookId);
      if (mode === 'issue') {
        const m = await getDoc(doc(db, 'members', mid.trim()));
        if (!m.exists()) throw new Error('Member not found. Add the member first.');
        if (open) throw new Error('This book is already issued.');
        const t = Date.now();
        await setDoc(doc(collection(db, 'issues')), { memberId: mid.trim(), memberName: m.data().name, bookId: book.bookId, bookName: book.name, issueDate: t, dueDate: t + 15 * DAY, returned: false });
        Alert.alert('Book issued', `${book.name}\nto ${m.data().name}\nReturn by ${fmt(t + 15 * DAY)}`);
      } else {
        if (!open) throw new Error('This book is not currently issued.');
        await updateDoc(open.ref, { returned: true, returnedAt: Date.now() });
        const late = Date.now() > open.data().dueDate;
        Alert.alert('Book returned', `${book.name}${late ? '\nThis return is overdue.' : ''}`);
      }
      setBk(''); setMid('');
    } catch (e) { Alert.alert('Not completed', e.message); }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <Title>Issue / Return</Title>
      <View style={{ flexDirection: 'row', backgroundColor: '#E6EBF1', borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {['issue', 'return'].map((m) => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} style={{ flex: 1, padding: 11, borderRadius: 9, alignItems: 'center', backgroundColor: mode === m ? '#fff' : 'transparent' }}>
            <Text style={{ fontWeight: '700', color: mode === m ? C.teal : C.mute }}>{m === 'issue' ? 'Issue book' : 'Return book'}</Text>
          </TouchableOpacity>))}
      </View>
      {mode === 'issue' && <Field label="Member ID" value={mid} onChangeText={setMid} placeholder="Scan or enter" onScan={() => setScan('m')} />}
      <Field label="Book (scan barcode / enter Book ID)" value={bk} onChangeText={setBk} placeholder="Scan or enter" onScan={() => setScan('b')} />
      {mode === 'issue' && <Card style={{ backgroundColor: C.tealSoft, borderColor: C.tealSoft }}>
        <Text style={{ color: C.ink }}>Issue date: <Text style={{ fontWeight: '800' }}>{fmt(now)}</Text></Text>
        <Text style={{ color: C.ink, marginTop: 4 }}>Return date: <Text style={{ fontWeight: '800' }}>{fmt(now + 15 * DAY)}</Text> (15 days)</Text>
      </Card>}
      <Btn title={mode === 'issue' ? 'Issue book' : 'Return book'} icon="swap-horizontal" onPress={go} busy={busy} />
      <Scanner visible={!!scan} onClose={() => setScan(null)} onScan={(v) => (scan === 'm' ? setMid(v) : setBk(v))} />
    </ScrollView>
  );
}

/* ---------- Members ---------- */
export function Members({ members }) {
  const blank = { name: '', memberId: '', phone: '', address: '' };
  const [f, setF] = useState(blank), [scan, setScan] = useState(false), [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const id = f.memberId.trim();
    if (!f.name.trim() || !id || !f.phone.trim()) return Alert.alert('Missing details', 'Name, member ID and phone number are required.');
    setBusy(true);
    try {
      if ((await getDoc(doc(db, 'members', id))).exists()) throw new Error('This member ID already exists.');
      await setDoc(doc(db, 'members', id), { ...f, memberId: id, name: f.name.trim(), createdAt: Date.now() });
      setF(blank);
    } catch (e) { Alert.alert('Could not save', e.message); }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <Title>New member</Title>
      <Field label="Name" value={f.name} onChangeText={set('name')} />
      <Field label="Member ID" value={f.memberId} onChangeText={set('memberId')} onScan={() => setScan(true)} placeholder="Scan or enter" />
      <Field label="Phone number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label="Address" value={f.address} onChangeText={set('address')} multiline />
      <Btn title="Add member" icon="person-add" onPress={save} busy={busy} />
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 26, marginBottom: 10 }}>Members ({members.length})</Text>
      {members.length === 0 && <Empty text="No members yet" />}
      {members.map((m) => (
        <Card key={m.memberId}><Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{m.name}</Text>
          <Text style={{ color: C.teal, fontWeight: '700' }}>ID {m.memberId} · {m.phone}</Text>
          {!!m.address && <Text style={{ color: C.mute }}>{m.address}</Text>}</Card>))}
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={set('memberId')} />
    </ScrollView>
  );
}

/* ---------- Backup ---------- */
export function Backup({ onLogout }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const wb = XLSX.utils.book_new();
      for (const n of ['books', 'members', 'issues']) {
        const rows = (await getDocs(collection(db, n))).docs.map((d) => d.data());
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), n);
      }
      const uri = `${FS.cacheDirectory}library-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await FS.writeAsStringAsync(uri, XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }), { encoding: 'base64' });
      await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Save library backup' });
    } catch (e) { Alert.alert('Backup failed', e.message); }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={pad}>
      <Title>Backup</Title>
      <Card><Text style={{ color: C.ink, lineHeight: 21 }}>Your data is stored live in Firebase. This also saves a copy of all books, members and issue records as an Excel file you can keep in Drive, email or on your computer.</Text></Card>
      <Btn title="Create & share backup" icon="cloud-download" onPress={run} busy={busy} />
      <Btn title="Log out" icon="log-out" kind="ghost" onPress={onLogout} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
