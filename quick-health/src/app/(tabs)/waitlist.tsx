import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Specialty, SPECIALTY_LABELS, WaitlistEntry } from '@/types';

// Demo-data — erstattes med Supabase
const DEMO_WAITLIST: WaitlistEntry[] = [
  {
    id: 'w1',
    patient_id: 'user1',
    specialty: 'dermatology',
    max_distance_km: 20,
    is_active: true,
    created_at: '2026-09-01T10:00:00',
  },
];

export default function WaitlistScreen() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(DEMO_WAITLIST);
  const [showAddForm, setShowAddForm] = useState(false);

  const specialties = Object.entries(SPECIALTY_LABELS) as [Specialty, string][];
  const availableSpecialties = specialties.filter(
    ([key]) => !waitlist.some((w) => w.specialty === key && w.is_active)
  );

  function addToWaitlist(specialty: Specialty) {
    const newEntry: WaitlistEntry = {
      id: `w${Date.now()}`,
      patient_id: 'user1',
      specialty,
      max_distance_km: 30,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    setWaitlist([...waitlist, newEntry]);
    setShowAddForm(false);
    Alert.alert(
      'Tilføjet',
      `Du får besked når der åbner en tid hos en ${SPECIALTY_LABELS[specialty].toLowerCase()}`
    );
  }

  function removeFromWaitlist(id: string) {
    Alert.alert('Fjern fra venteliste?', 'Du vil ikke længere få notifikationer.', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Fjern',
        style: 'destructive',
        onPress: () => setWaitlist(waitlist.filter((w) => w.id !== id)),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Sådan virker ventelisten</Text>
        <Text style={styles.infoText}>
          Tilmeld dig specialer du venter på. Når en aflyst tid åbner op,
          får du en notifikation med det samme.
        </Text>
      </View>

      <FlatList
        data={waitlist.filter((w) => w.is_active)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Ingen aktive ventelister</Text>
            <Text style={styles.emptySubtext}>
              Tilføj et speciale for at få besked om ledige tider
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.waitlistCard}>
            <View style={styles.cardContent}>
              <Text style={styles.specialtyName}>
                {SPECIALTY_LABELS[item.specialty]}
              </Text>
              <Text style={styles.cardDetail}>
                Inden for {item.max_distance_km} km
              </Text>
              <Text style={styles.cardDate}>
                Tilmeldt {new Date(item.created_at).toLocaleDateString('da-DK')}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Aktiv</Text>
              </View>
              <TouchableOpacity onPress={() => removeFromWaitlist(item.id)}>
                <Text style={styles.removeButton}>Fjern</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {showAddForm ? (
        <View style={styles.addForm}>
          <Text style={styles.addFormTitle}>Vælg speciale:</Text>
          <FlatList
            data={availableSpecialties}
            keyExtractor={([key]) => key}
            renderItem={({ item: [key, label] }) => (
              <TouchableOpacity
                style={styles.specialtyOption}
                onPress={() => addToWaitlist(key)}
              >
                <Text style={styles.specialtyOptionText}>{label}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowAddForm(false)}
          >
            <Text style={styles.cancelButtonText}>Annuller</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
        >
          <Text style={styles.addButtonText}>+ Tilføj speciale</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  infoBox: {
    backgroundColor: '#E8F4FD',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A7AFF',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  waitlistCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
  },
  specialtyName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cardDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  cardDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  cardActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  activeBadge: {
    backgroundColor: '#E8F8EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
  },
  removeButton: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#0A7AFF',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  addForm: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 14,
    padding: 16,
    maxHeight: 300,
  },
  addFormTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  specialtyOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  specialtyOptionText: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#FF3B30',
    fontWeight: '500',
  },
});
