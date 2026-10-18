import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, TouchableOpacity, Alert, ScrollView as SV } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Updates from 'expo-updates';
import * as XLSX from 'xlsx';
import { Ionicons } from '@expo/vector-icons';
import { C, Btn, Field, Select, Scanner, Card, Empty } from './ui';
import { parseRow } from './importParse';
import { booksSync, membersSync } from './sync';
import { db, CATS, LANGS, DAY, fmt, addBook, importBooks, repairCounters, wipeBooksAndIssues, nextNumbers, findBook, findOpenIssue, doc, getDoc, getDocs, collection, setDoc, updateDoc } from './db';

const pad = { padding: 16, paddingBottom: 40 };
const Title = ({ children }) => <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink, marginBottom: 14 }}>{children}</Text>;
const cats = Object.keys(CATS);
// returns the first non-empty value
const or = (...v) => { for (const a of v) { if (a) return a; } return v[v.length - 1]; };
const confirmAsync = (title, msg, yes) => new Promise((res) => Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: yes, onPress: () => res(true) }], { cancelable: false }));
/* ---------- Dashboard ---------- */
const QUOTES = ['A reader lives a thousand lives before he dies.', 'Today a reader, tomorrow a leader.', 'A room without books is like a body without a soul.',
  'The more that you read, the more things you will know.', 'Books are a uniquely portable magic.', 'Read, learn, grow — one page at a time.'];
const Tile = ({ label, value, color, onPress }) => (
  <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
    <Text style={{ fontSize: 34, fontWeight: '800', color }}>{value}</Text>
    <Text style={{ fontSize: 15, fontWeight: '700', color: C.mute, marginTop: 2 }}>{label}</Text>
  </TouchableOpacity>
);
export function Dashboard({ books, issued, members, openCat, goStock, goBackup }) {
  const counts = useMemo(() => { const m = {}; books.forEach((b) => (m[b.category] = (m[b.category] ?? 0) + 1)); return m; }, [books]);
  const q = QUOTES[Math.floor(Date.now() / DAY) % QUOTES.length];
  return (
    <ScrollView contentContainerStyle={pad}>
      <Title>Dashboard</Title>
      <Card style={{ backgroundColor: C.ink, borderColor: C.ink, padding: 20 }}>
        <Text style={{ color: C.amber, fontSize: 40, fontWeight: '800', lineHeight: 40 }}>“</Text>
        <Text style={{ color: '#fff', fontSize: 19, lineHeight: 28, fontWeight: '600' }}>{q}</Text>
        <Text style={{ color: C.amber, marginTop: 12, fontWeight: '800', letterSpacing: 2, fontSize: 13 }}>READ · LEARN · GROW</Text>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Tile label="Total Stock" value={books.length} color={C.teal} onPress={goStock} />
        <Tile label="Books Issued" value={issued} color={C.amber} />
        <Tile label="Available" value={Math.max(books.length - issued, 0)} color={C.green} />
        <Tile label="Members" value={members} color={C.ink} />
      </View>
      <Text style={{ fontSize: 19, fontWeight: '800', color: C.ink, marginTop: 8, marginBottom: 12 }}>Books by category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {cats.map((c) => (
          <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => openCat(c)} style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: C.tealSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: C.teal, fontWeight: '800', fontSize: 15 }}>{CATS[c]}</Text>
            </View>
            <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '700', color: C.ink, marginTop: 8, minHeight: 40 }}>{c}</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: C.ink }}>{counts[c] ?? 0}</Text>
          </TouchableOpacity>))}
      </View>
      <Btn title="Backup & settings" icon="cloud-upload" kind="ghost" onPress={goBackup} style={{ marginTop: 6 }} />
      <Text style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(0,0,0,0.05)' }}>Developed by Vishnu</Text>
    </ScrollView>
  );
}

/* ---------- Add Book ---------- */
export function AddBook() {
  const blank = { barcode: '', category: '', language: '', name: '', author: '', publication: '', cost: '' };
  const [f, setF] = useState(blank), [next, setNext] = useState(null), [scan, setScan] = useState(false), [busy, setBusy] = useState(false), [prog, setProg] = useState('');
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => { nextNumbers(f.category ? f.category : 'Others').then(setNext).catch(() => {}); }, [f.category, busy]);

  const save = async () => {
    if (!(f.category && f.language && f.name.trim())) return Alert.alert('Missing details', 'Category, language and book name are required.');
    setBusy(true);
    try {
      const r = await addBook({ ...f, name: f.name.trim(), author: f.author.trim(), publication: f.publication.trim(), cost: Number(f.cost) > 0 ? Number(f.cost) : 0 });
      Alert.alert('Book added', 'Book ID ' + r.id + '\nCategory No ' + r.catCode);
      setF(blank);
    } catch (e) { Alert.alert('Could not save', e.message); }
    setBusy(false);
  };

  const importXlsx = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true,
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'] });
    if (r.canceled) return;
    setBusy(true); setProg('Reading the Excel file…');
    try {
      const b64 = await FS.readAsStringAsync(r.assets[0].uri, { encoding: 'base64' });
      const wb = XLSX.read(b64, { type: 'base64' });
      // use the sheet that has the most rows (ignores small summary sheets)
      let rows = [];
      for (const n of wb.SheetNames) { const rr = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); if (rr.length > rows.length) rows = rr; }
      const heads = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith('__EMPTY')).join(', ') : '';
      const keys = rows.length ? Object.keys(rows[0]).map((k) => k.toLowerCase().replace(/[^a-z]/g, '')) : [];
      const hasCat = keys.some((k) => ['category', 'catagory', 'categoryname', 'cat', 'bookcategoryno', 'categoryno', 'catno'].includes(k));
      if (!hasCat && !f.category) return Alert.alert('Choose a category first', 'Your Excel has no Category column. Select the Category above (for example Novel) and import again. Every book in the file will be saved in that category.');

      const items = []; let blank = 0; const badCat = new Set(), badLang = new Set();
      for (const raw of rows) {
        const p = parseRow(raw, { category: f.category, language: f.language });
        if (p.skip) { blank++; continue; }
        if (p.badCat) badCat.add(p.badCat);
        if (p.badLang) badLang.add(p.badLang);
        items.push(p);
      }
      if (!items.length) return Alert.alert('No books found', 'No row has a Book Name.\n\nColumns found: ' + heads);

      // Show what will happen BEFORE anything is written
      const e = items[0], withId = items.filter((x) => x.id).length;
      const pre = 'Found ' + items.length + ' books' + (blank ? ' (' + blank + ' empty rows ignored)' : '') + '.\n' + withId + ' have their own Book ID; the rest get new numbers.\n\nFirst row:\n' + e.rec.name
        + '\nBook ID: ' + (e.id ?? 'automatic') + '\nCategory No: ' + (e.catNo ? CATS[e.rec.category] + '-' + e.catNo : 'automatic')
        + '\nBarcode: ' + (e.rec.barcode || 'none') + '\nLanguage: ' + e.rec.language + '\nCategory: ' + e.rec.category;
      if (!(await confirmAsync('Check before importing', pre, 'Import'))) return;

      const res = await importBooks(items, (d, t) => setProg('Saving ' + d + ' of ' + t + '…'));
      const list = (a) => a.slice(0, 8).map((x) => x.id).join(', ') + (a.length > 8 ? ' …' : '');
      let msg = res.added + ' books added.';
      if (res.kept) msg += '\n' + res.kept + ' kept their own Book ID and Category No from Excel.';
      if (res.existing.length) msg += '\n\n' + res.existing.length + ' skipped - already in the library (same Book ID): ' + list(res.existing);
      if (res.dupInFile.length) msg += '\n\n' + res.dupInFile.length + ' skipped - the same Book Stock No appears more than once in the file: ' + list(res.dupInFile);
      if (blank) msg += '\n\n' + blank + ' empty rows ignored (no book name).';
      if (badCat.size) msg += '\n\nCategory not recognised: ' + [...badCat].slice(0, 6).join(', ');
      if (badLang.size) msg += '\n\nLanguage not recognised: ' + [...badLang].slice(0, 6).join(', ');
      msg += '\n\nColumns found: ' + heads;
      Alert.alert('Import finished', msg);
    } catch (e) { Alert.alert('Import failed', e.message); } finally { setBusy(false); setProg(''); }
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
      {!!prog && <Text style={{ color: C.teal, marginTop: 10, fontWeight: '700', textAlign: 'center' }}>{prog}</Text>}
      <Text style={{ color: C.mute, marginTop: 10, fontSize: 12 }}>Excel columns: Book Stock No, Book Category No (e.g. P-12), Book ID / Barcode, Book Name, Author Name, Category Type (e.g. P-M or Malayalam), Publisher Name, Cost. First row = headings. A summary is shown before anything is saved.</Text>
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={set('barcode')} />
    </ScrollView>
  );
}

/* ---------- Book list (Stock + Search) ---------- */
const FIELDS = [['all', 'All Fields'], ['name', 'Book Name'], ['author', 'Author Name'], ['publication', 'Publication Name']];
const CAT_CHIPS = [['', 'All Categories'], ...cats.map((c) => [c, c + ' - ' + CATS[c]])];
const Sec = ({ children }) => <Text style={{ fontSize: 13, fontWeight: '800', color: C.mute, letterSpacing: 1, marginTop: 12, marginBottom: 8 }}>{children}</Text>;
const Chip = ({ on, label, onPress }) => (
  <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, marginRight: 8, backgroundColor: on ? C.teal : '#fff', borderWidth: 1.5, borderColor: on ? C.teal : C.line }}>
    <Text style={{ color: on ? '#fff' : C.ink, fontWeight: '700', fontSize: 15 }}>{label}</Text>
  </TouchableOpacity>
);
function BookList({ books, search, initCat = '' }) {
  const [q, setQ] = useState(''), [flt, setFlt] = useState('all'), [cat, setCat] = useState(initCat);
  const rows = useMemo(() => {
    const r = cat ? books.filter((b) => b.category === cat) : books;
    const t = q.trim().toLowerCase();
    if (!(search && t)) return r;
    const val = (b) => ({ name: b.name, author: b.author, publication: b.publication,
      all: [b.category, b.catCode, b.name, b.author, b.publication, b.bookId, b.barcode].join(' ') }[flt] ?? '').toLowerCase();
    return r.filter((b) => val(b).includes(t));
  }, [books, q, flt, cat, search]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6 }}>
        <Title>{search ? 'Global search' : 'Total stock'}</Title>
        {search && <>
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', paddingHorizontal: 12 }}>
            <Ionicons name="search" size={20} color={C.mute} />
            <TextInput value={q} onChangeText={setQ} placeholderTextColor="#8795A5" style={{ flex: 1, height: 50, marginLeft: 8, fontSize: 17, color: C.ink }}
              placeholder={flt === 'all' ? 'Search all fields…' : 'Search by ' + FIELDS.find((x) => x[0] === flt)[1] + '…'} />
          </View>
          <Sec>SEARCH BY</Sec>
          <SV horizontal showsHorizontalScrollIndicator={false}>{FIELDS.map(([k, l]) => <Chip key={k} on={flt === k} label={l} onPress={() => setFlt(k)} />)}</SV>
          <Sec>CATEGORY</Sec>
          <SV horizontal showsHorizontalScrollIndicator={false}>{CAT_CHIPS.map(([k, l]) => <Chip key={l} on={cat === k} label={l} onPress={() => setCat(k)} />)}</SV>
        </>}
        <Text style={{ color: C.mute, fontSize: 15, fontWeight: '600', marginTop: 12 }}>{rows.length} of {books.length} books</Text>
      </View>
      <FlatList data={rows} keyExtractor={(b) => String(b.bookId)} contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        ListEmptyComponent={<Empty text="No books found" />}
        renderItem={({ item: b }) => (
          <Card style={{ flexDirection: 'row' }}>
            <View style={{ width: 72, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.line, marginRight: 14, paddingRight: 14 }}>
              <Text style={{ fontSize: 12, color: C.mute, fontWeight: '700' }}>ID</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{b.bookId}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.teal, marginTop: 4 }}>{b.catCode}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{b.name}</Text>
              <Text style={{ color: C.mute, marginTop: 3, fontSize: 15 }}>{or(b.author, 'Author not set')}</Text>
              <Text style={{ color: C.mute, fontSize: 15 }}>{or(b.publication, 'Publication not set')} · {b.language}</Text>
              <Text style={{ color: C.ink, fontWeight: '800', marginTop: 4, fontSize: 16 }}>₹{b.cost}</Text>
            </View>
          </Card>)} />
    </View>
  );
}
export const Stock = ({ books }) => <BookList books={books} />;
export const Search = ({ books, initCat }) => <BookList books={books} search initCat={initCat} />;

/* ---------- Issue / Return ---------- */
export function Issue() {
  const [mode, setMode] = useState('issue'), [mid, setMid] = useState(''), [bk, setBk] = useState(''), [scan, setScan] = useState(null), [busy, setBusy] = useState(false);
  const now = Date.now();
  const go = async () => {
    if (!bk.trim() ? true : (mode === 'issue' && !mid.trim())) return Alert.alert('Missing details', 'Enter or scan the member and the book.');
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
        Alert.alert('Book issued', book.name + '\nto ' + m.data().name + '\nReturn by ' + fmt(t + 15 * DAY));
      } else {
        if (!open) throw new Error('This book is not currently issued.');
        await updateDoc(open.ref, { returned: true, returnedAt: Date.now() });
        const late = Date.now() > open.data().dueDate;
        Alert.alert('Book returned', book.name + (late ? '\nThis return is overdue.' : ''));
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
    if (!(f.name.trim() && id && f.phone.trim())) return Alert.alert('Missing details', 'Name, member ID and phone number are required.');
    setBusy(true);
    try {
      if ((await getDoc(doc(db, 'members', id))).exists()) throw new Error('This member ID already exists.');
      await setDoc(doc(db, 'members', id), { ...f, memberId: id, name: f.name.trim(), createdAt: Date.now() });
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
      let ok = 0, skip = 0;
      for (const raw of rows) {
        const x = {}; Object.keys(raw).forEach((k) => (x[k.toLowerCase().replace(/[^a-z]/g, '')] = String(raw[k]).trim()));
        const id = or(x.memberid, x.id), name = or(x.name, x.membername);
        if (!(id && name)) { skip++; continue; }
        const ref = doc(db, 'members', id);
        if ((await getDoc(ref)).exists()) { skip++; continue; }
        await setDoc(ref, { memberId: id, name, phone: or(x.phonenumber, x.phone, x.mobile, ''), address: or(x.address, ''), createdAt: Date.now() });
        ok++;
      }
      Alert.alert('Import finished', ok + ' members added' + (skip ? ', ' + skip + ' skipped (duplicate or missing ID/name)' : '') + '.');
    } catch (e) { Alert.alert('Import failed', e.message); }
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
      <Btn title="Import members from Excel (.xlsx)" icon="document-text" kind="ghost" onPress={importXlsx} busy={busy} style={{ marginTop: 10 }} />
      <Text style={{ color: C.mute, marginTop: 10, fontSize: 13 }}>Excel columns: Name, Member ID, Phone, Address (first row = headings). Existing member IDs are skipped.</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 26, marginBottom: 10 }}>Members ({members.length})</Text>
      {members.length === 0 && <Empty text="No members yet" />}
      {members.map((m) => (
        <Card key={m.memberId}><Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>{m.name}</Text>
          <Text style={{ color: C.teal, fontWeight: '700' }}>ID {m.memberId} · {m.phone}</Text>
          {!!m.address && <Text style={{ color: C.mute }}>{m.address}</Text>}</Card>))}
      <Scanner visible={scan} onClose={() => setScan(false)} onScan={set('memberId')} />
    </ScrollView>
  );
}

/* ---------- Backup, updates & library tools ---------- */
export function Backup({ onLogout }) {
  const [busy, setBusy] = useState(false), [chk, setChk] = useState(false), [fix, setFix] = useState(false), [rel, setRel] = useState(false), [word, setWord] = useState(''), [wiping, setWiping] = useState(false);
  const version = (() => { try { return require('../app.json').expo.version; } catch (e) { return ''; } })();
  const run = async () => {
    setBusy(true);
    try {
      const wb = XLSX.utils.book_new();
      wb.Props = { Title: 'Brothers Vayanasala backup', Author: 'Vishnu', Comments: 'Developed by Vishnu' };
      for (const n of ['books', 'members', 'issues']) {
        const rows = (await getDocs(collection(db, n))).docs.map((d) => d.data());
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), n);
      }
      const uri = FS.cacheDirectory + 'library-backup-' + new Date().toISOString().slice(0, 10) + '.xlsx';
      await FS.writeAsStringAsync(uri, XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }), { encoding: 'base64' });
      await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Save library backup' });
    } catch (e) { Alert.alert('Backup failed', e.message); }
    setBusy(false);
  };
  const checkNow = async () => {
    if (__DEV__ || !Updates.isEnabled) return Alert.alert('Updates', 'Updates work only in the installed app, not in Expo Go.');
    setChk(true);
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) Alert.alert('Up to date', 'You already have the latest version.');
      else {
        await Updates.fetchUpdateAsync();
        Alert.alert('Update ready', 'The new version has been downloaded.', [{ text: 'Later' }, { text: 'Restart now', onPress: () => Updates.reloadAsync() }]);
      }
    } catch (e) { Alert.alert('Could not check for updates', e.message); }
    setChk(false);
  };
  const repair = async () => {
    setFix(true);
    try {
      const r = await repairCounters();
      Alert.alert('Counters repaired', 'Highest Book ID: ' + r.total + '\nBooks checked: ' + r.books
        + (r.bad ? '\n\n' + r.bad + ' books have a damaged Book ID (a barcode was saved as the ID). Use "Delete all books" below, then import the Excel again to fix them.' : ''));
    } catch (e) { Alert.alert('Repair failed', e.message); }
    setFix(false);
  };
  const reload = async () => {
    setRel(true);
    try { const b = await booksSync.fullReload(), m = await membersSync.fullReload(); Alert.alert('Library reloaded', b + ' books and ' + m + ' members downloaded from the server.'); }
    catch (e) { Alert.alert('Could not reload', e.message + '\n\nCheck the internet connection.'); }
    setRel(false);
  };
  const wipe = () => Alert.alert('Delete all books?', 'ALL books and issue records will be deleted for everyone. Members are kept. This cannot be undone. Make a backup first if unsure.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete all books', style: 'destructive', onPress: async () => {
      setWiping(true);
      try { const r = await wipeBooksAndIssues(); Alert.alert('Deleted', r.books + ' books and ' + r.issues + ' issue records removed. Counters reset - you can import the Excel now.'); setWord(''); await booksSync.reset(); }
      catch (e) { Alert.alert('Failed', e.message); }
      setWiping(false);
    } }]);
  const upd = !Updates.isEnabled ? 'Updates are off (running in development).' : Updates.updateId ? 'Latest update installed: ' + String(Updates.updateId).slice(0, 8) : 'Running the built-in version (no update downloaded yet).';
  return (
    <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <Title>Backup & settings</Title>
      <Card><Text style={{ color: C.ink, lineHeight: 21 }}>Your data is stored live in Firebase. This also saves a copy of all books, members and issue records as an Excel file you can keep in Drive, email or on your computer.</Text></Card>
      <Btn title="Create & share backup" icon="cloud-download" onPress={run} busy={busy} />

      <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 26, marginBottom: 10 }}>App updates</Text>
      <Card>
        <Text style={{ color: C.ink, fontWeight: '800' }}>Version {version}</Text>
        <Text style={{ color: C.mute, marginTop: 4, lineHeight: 20 }}>{upd}</Text>
        <Text style={{ color: C.mute, marginTop: 6, lineHeight: 20 }}>New versions download by themselves when the app opens. You can also check now.</Text>
      </Card>
      <Btn title="Check for updates" icon="refresh" kind="ghost" onPress={checkNow} busy={chk} />

      <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 26, marginBottom: 10 }}>Library tools</Text>
      <Card><Text style={{ color: C.ink, lineHeight: 21 }}>If new books get a strange Book ID, or the numbers look wrong, repair the counters. This only recalculates the counters from your real books - no book is changed.</Text></Card>
      <Btn title="Repair counters" icon="construct" kind="ghost" onPress={repair} busy={fix} />
      <Card style={{ marginTop: 14 }}><Text style={{ color: C.ink, lineHeight: 21 }}>The library is saved on this phone ({booksSync.info().count} books) so the app opens fast and uses very little of the Firebase daily limit. If this phone ever shows different books from the others, reload it from the server. This downloads everything once (about 4,000 Firebase reads), so don't repeat it often.</Text></Card>
      <Btn title="Reload library from server" icon="sync" kind="ghost" onPress={reload} busy={rel} />

      <Card style={{ marginTop: 26, borderColor: C.red }}>
        <Text style={{ color: C.red, fontWeight: '800', fontSize: 16 }}>Danger zone</Text>
        <Text style={{ color: C.ink, marginTop: 6, lineHeight: 21, marginBottom: 12 }}>Deletes ALL books and issue records (members are kept) so you can import a corrected Excel file from scratch.</Text>
        <Field label="Type DELETE to unlock" value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} />
        {word.trim().toUpperCase() === 'DELETE' && <Btn title="Delete all books" icon="trash" kind="danger" onPress={wipe} busy={wiping} />}
      </Card>

      <Btn title="Log out" icon="log-out" kind="ghost" onPress={onLogout} style={{ marginTop: 20 }} />
      <Text style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(0,0,0,0.05)' }}>Developed by Vishnu</Text>
    </ScrollView>
  );
}
