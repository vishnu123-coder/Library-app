import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { onSnapshot } from 'firebase/firestore';
import { C, Btn, Field } from './src/ui';
import { db, collection, signIn, APP_USER_ID } from './src/db';
import { AddBook, Stock, Search, Issue, Members, Backup } from './src/screens';

const TABS = [['stock', 'Stock', 'library'], ['search', 'Search', 'search'], ['add', 'Add', 'add-circle'], ['issue', 'Issue', 'swap-horizontal'], ['members', 'Members', 'people'], ['backup', 'Backup', 'cloud-upload']];

function Login({ onOk }) {
  const [id, setId] = useState('');
  const go = async () => {
    if (id.trim() !== APP_USER_ID) return Alert.alert('Wrong user ID', 'Check the ID and try again.');
    try { await signIn(); } catch (e) { return Alert.alert('Firebase sign-in failed', 'Enable Anonymous sign-in in Firebase console > Authentication.'); }
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
    </View>
  );
}

export default function App() {
  const [auth, setAuth] = useState(false), [tab, setTab] = useState('stock'), [books, setBooks] = useState([]), [members, setMembers] = useState([]);
  useEffect(() => {
    if (!auth) return;
    const a = onSnapshot(collection(db, 'books'), (s) => setBooks(s.docs.map((d) => d.data()).sort((x, y) => x.bookId - y.bookId)));
    const b = onSnapshot(collection(db, 'members'), (s) => setMembers(s.docs.map((d) => d.data()).sort((x, y) => x.name.localeCompare(y.name))));
    return () => { a(); b(); };
  }, [auth]);

  const screen = { stock: <Stock books={books} />, search: <Search books={books} />, add: <AddBook />, issue: <Issue />, members: <Members members={members} />, backup: <Backup onLogout={() => setAuth(false)} /> }[tab];
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!auth ? <Login onOk={() => setAuth(true)} /> : (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }}>
          <View style={{ padding: 10, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }}><Image source={require('./assets/logo.png')} style={{ width: 34, height: 34, marginRight: 10 }} /><Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Brothers Vayanasala</Text></View>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{screen}</KeyboardAvoidingView>
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 6 }}>
            {TABS.map(([k, l, i]) => (
              <TouchableOpacity key={k} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }} onPress={() => setTab(k)}>
                <Ionicons name={i} size={22} color={tab === k ? C.teal : C.mute} />
                <Text style={{ fontSize: 11, marginTop: 2, fontWeight: '600', color: tab === k ? C.teal : C.mute }}>{l}</Text>
              </TouchableOpacity>))}
          </View>
        </SafeAreaView>)}
    </SafeAreaProvider>
  );
}
