import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

export const C = { ink: '#12263A', teal: '#0E7C86', tealSoft: '#E3F2F3', paper: '#F3F5F8', card: '#FFFFFF', line: '#DDE3EA', mute: '#6B7A8C', amber: '#E9A23B', red: '#C0392B', green: '#2E8B57' };

export const Btn = ({ title, onPress, icon, kind = 'primary', busy, style }) => (
  <TouchableOpacity disabled={busy} onPress={onPress} activeOpacity={0.8}
    style={[s.btn, kind === 'ghost' && s.ghost, kind === 'danger' && { backgroundColor: C.red }, busy && { opacity: 0.6 }, style]}>
    {icon && <Ionicons name={icon} size={18} color={kind === 'ghost' ? C.teal : '#fff'} style={{ marginRight: 8 }} />}
    <Text style={[s.btnT, kind === 'ghost' && { color: C.teal }]}>{busy ? 'Please wait…' : title}</Text>
  </TouchableOpacity>
);

export const Field = ({ label, onScan, ...p }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}</Text>
    <View style={s.inputRow}>
      <TextInput {...p} placeholderTextColor="#9AA7B5" style={s.input} />
      {onScan && <TouchableOpacity onPress={onScan} style={s.scanBtn}><Ionicons name="barcode-outline" size={22} color={C.teal} /></TouchableOpacity>}
    </View>
  </View>
);

export function Select({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={[s.inputRow, { paddingHorizontal: 14, height: 48, justifyContent: 'space-between' }]} onPress={() => setOpen(true)}>
        <Text style={{ color: value ? C.ink : '#9AA7B5', fontSize: 16 }}>{value || 'Select…'}</Text>
        <Ionicons name="chevron-down" size={18} color={C.mute} />
      </TouchableOpacity>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <Text style={[s.label, { padding: 16, paddingBottom: 6 }]}>{label}</Text>
            <FlatList data={options} keyExtractor={(o) => o} renderItem={({ item }) => (
              <TouchableOpacity style={s.opt} onPress={() => { onChange(item); setOpen(false); }}>
                <Text style={{ fontSize: 16, color: item === value ? C.teal : C.ink, fontWeight: item === value ? '700' : '400' }}>{item}</Text>
                {item === value && <Ionicons name="checkmark" size={18} color={C.teal} />}
              </TouchableOpacity>)} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Accuracy: only accepts a code after 3 identical consecutive reads, so a half-read barcode is never used.
export function Scanner({ visible, onClose, onScan }) {
  const [perm, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const seen = useRef({ v: '', n: 0 });
  const handle = ({ data }) => {
    const v = String(data).trim();
    seen.current = seen.current.v === v ? { v, n: seen.current.n + 1 } : { v, n: 1 };
    if (seen.current.n >= 3) { seen.current = { v: '', n: 0 }; Vibration.vibrate(80); onScan(v); onClose(); }
  };
  return (
    <Modal visible={visible} animationType="slide" onShow={() => !perm?.granted && ask()} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {perm?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back" enableTorch={torch} onBarcodeScanned={handle}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }} />
        ) : <Text style={{ color: '#fff', margin: 40, textAlign: 'center' }}>Camera permission is needed to scan.</Text>}
        <View style={s.frame} pointerEvents="none" />
        <Text style={s.hint}>Hold steady — align the code inside the frame</Text>
        <View style={s.camBar}>
          <Btn title={torch ? 'Light off' : 'Light on'} icon="flashlight" kind="ghost" onPress={() => setTorch(!torch)} style={{ flex: 1, marginRight: 10 }} />
          <Btn title="Close" icon="close" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const Empty = ({ text }) => <Text style={{ textAlign: 'center', color: C.mute, marginTop: 40 }}>{text}</Text>;

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.teal, borderRadius: 12, height: 50, paddingHorizontal: 18 },
  ghost: { backgroundColor: C.tealSoft },
  btnT: { color: '#fff', fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: C.mute, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12 },
  input: { flex: 1, height: 48, paddingHorizontal: 14, fontSize: 16, color: C.ink },
  scanBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: C.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(18,38,58,.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, maxHeight: '70%', paddingBottom: 8 },
  opt: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  frame: { position: 'absolute', top: '28%', alignSelf: 'center', width: '78%', height: 190, borderWidth: 3, borderColor: C.amber, borderRadius: 16 },
  hint: { position: 'absolute', top: '18%', alignSelf: 'center', color: '#fff', fontSize: 15, fontWeight: '600' },
  camBar: { position: 'absolute', bottom: 40, left: 20, right: 20, flexDirection: 'row' },
});
