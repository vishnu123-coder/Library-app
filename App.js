// Brothers Vayanasala library app - developed by Vishnu
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { onSnapshot, query, where } from 'firebase/firestore';
import { booksSync, membersSync } from './src/sync';
import { C, Btn, Field } from './src/ui';
import { db, collection, signIn, APP_USER_ID } from './src/db';
import { AddBook, Stock, Search, Issue, Members, Backup, Dashboard } from './src/screens';

const TABS = [['home', 'Home', 'home'], ['stock', 'Stock', 'library'], ['search', 'Search', 'search'], ['add', 'Add', 'add-circle'], ['issue', 'Issue', 'swap-horizontal'], ['members', 'Members', 'people'], ['backup', 'Backup', 'cloud-upload']];


// Shows when a new version of the app has been downloaded in the background.
function UpdateBanner({ state }) {
  const insets = useSafeAreaInsets();
  if (state === 'idle') return null;
  const ready = state === 'ready';
  return (
    <TouchableOpacity activeOpacity={ready ? 0.8 : 1} onPress={() => ready && Updates.reloadAsync()}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, backgroundColor: C.amber, paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={ready ? 'sparkles' : 'cloud-download'} size={18} color={C.ink} style={{ marginRight: 8 }} />
      <Text style={{ color: C.ink, fontWeight: '800', fontSize: 15 }}>{ready ? 'New version ready - tap to restart' : 'Downloading update…'}</Text>
    </TouchableOpacity>
  );
}

function Login({ onOk }) {
  const [id, setId] = useState('');
  const pre = React.useRef(null);
  useEffect(() => { pre.current = signIn().catch(() => null); }, []); // sign in while the user is typing the ID
  const go = async () => {
    if (id.trim() !== APP_USER_ID) return Alert.alert('Wrong user ID', 'Check the ID and try again.');
    try { const u = await pre.current; if (!u) await signIn(); } catch (e) { return Alert.alert('Firebase sign-in failed', 'Enable Anonymous sign-in in Firebase console > Authentication.'); }
    onOk();
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, justifyContent: 'center', padding: 28 }}>
      <Image source={require('./assets/logo.png')} style={{ width: 120, height: 120, alignSelf: 'center' }} />
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>Brothers Vayanasala</Text>
      <Text style={{ color: C.amber, marginBottom: 28, marginTop: 4, textAlign: 'center', letterSpacing: 2 }}>READ · LEARN · GROW</Text>
      <View style={{ backgroundColor: '#F3F5F8', padding: 18, borderRadius: 16 }}>
        <Field label="User ID" value={id} onChangeText={setId} keyboardType="number-pad" secureTextEntry />
        <Btn title="Sign in" onPress={go} />
      </View>
      <Text style={{ position: 'absolute', bottom: 20, alignSelf: 'center', fontSize: 11, color: 'rgba(255,255,255,0.05)' }}>Developed by Vishnu</Text>
    </View>
  );
}

export default function App() {
  const [auth, setAuth] = useState(false), [tab, setTab] = useState('home'), [books, setBooks] = useState([]), [members, setMembers] = useState([]), [issued, setIssued] = useState(0), [catSel, setCatSel] = useState(''), [upd, setUpd] = useState('idle');
  const authRef = React.useRef(false);
  authRef.current = auth;
  // Over-the-air updates: check when the app opens and whenever it comes back to the foreground.
  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (__DEV__ || !Updates.isEnabled || busy) return;
      busy = true;
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) {
          setUpd('downloading');
          await Updates.fetchUpdateAsync();
          if (authRef.current) setUpd('ready'); // never restart while someone is working
          else await Updates.reloadAsync();     // on the sign-in screen it is safe to restart now
        }
      } catch (e) { setUpd('idle'); }
      busy = false;
    };
    check();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => sub.remove();
  }, []);
  // The library is kept on the phone: it opens instantly and only NEW books are downloaded
  // (about 10 Firebase reads per open instead of about 4,300).
  const sortBooks = (r) => setBooks(r.sort((x, y) => x.bookId - y.bookId));
  const sortMembers = (r) => setMembers(r.sort((x, y) => String(x.name ?? '').localeCompare(String(y.name ?? ''))));
  useEffect(() => { // show the saved copy straight away, even before sign-in finishes
    booksSync.loadCache().then((r) => r && sortBooks(r));
    membersSync.loadCache().then((r) => r && sortMembers(r));
  }, []);
  useEffect(() => {
    if (!auth) return;
    booksSync.start(sortBooks);
    membersSync.start(sortMembers);
    const c = onSnapshot(query(collection(db, 'issues'), where('returned', '==', false)), (s) => setIssued(s.size)); // only books currently out
    return () => { booksSync.stop(); membersSync.stop(); c(); };
  }, [auth]);
  useEffect(() => { // save the copy when leaving the app; re-check when coming back after a while
    let left = 0;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' || st === 'inactive') { left = Date.now(); booksSync.flush(); membersSync.flush(); }
      else if (st === 'active' && authRef.current && left && Date.now() - left > 5 * 60 * 1000) { booksSync.resync(); membersSync.resync(); }
    });
    return () => sub.remove();
  }, []);

  const screen = { home: <Dashboard books={books} issued={issued} members={members.length} openCat={(c) => { setCatSel(c); setTab('search'); }} goStock={() => setTab('stock')} goBackup={() => setTab('backup')} />, stock: <Stock books={books} />, search: <Search key={catSel} books={books} initCat={catSel} />, add: <AddBook />, issue: <Issue />, members: <Members members={members} />, backup: <Backup onLogout={() => setAuth(false)} /> }[tab];
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <UpdateBanner state={upd} />
      {!auth ? <Login onOk={() => setAuth(true)} /> : (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }}>
          <View style={{ padding: 10, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }}><Image source={require('./assets/logo.png')} style={{ width: 34, height: 34, marginRight: 10 }} /><Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Brothers Vayanasala</Text></View>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{screen}</KeyboardAvoidingView>
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 6 }}>
            {TABS.map(([k, l, i]) => (
              <TouchableOpacity key={k} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }} onPress={() => { if (k === 'search') setCatSel(''); setTab(k); }}>
                <Ionicons name={i} size={24} color={tab === k ? C.teal : C.mute} />
                <Text style={{ fontSize: 12, marginTop: 2, fontWeight: '600', color: tab === k ? C.teal : C.mute }}>{l}</Text>
              </TouchableOpacity>))}
          </View>
        </SafeAreaView>)}
    </SafeAreaProvider>
  );
}
