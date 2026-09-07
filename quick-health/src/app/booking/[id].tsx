import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const months = [
    'januar', 'februar', 'marts', 'april', 'maj', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'december',
  ];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${dayName} d. ${day}. ${month} kl. ${hours}:${minutes}`;
}

export default function BookingScreen() {
  const { id, clinicName, datetime, duration } = useLocalSearchParams<{
    id: string;
    clinicName: string;
    datetime: string;
    duration: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);

  async function handleBooking() {
    setLoading(true);

    // TODO: Supabase-kald til at booke tiden
    // await supabase.from('appointments').update({ status: 'booked', patient_id: userId }).eq('id', id);

    // Simuler booking
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setBooked(true);
    setLoading(false);
  }

  if (booked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Tid booket!</Text>
          <Text style={styles.successText}>
            Din tid hos {clinicName} er bekræftet.
          </Text>
          <Text style={styles.successDetail}>
            {formatDate(datetime || '')}
          </Text>
          <Text style={styles.successNote}>
            Du modtager en bekræftelse på email.
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.doneButtonText}>Tilbage til forsiden</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.bookingCard}>
          <Text style={styles.cardLabel}>Klinik</Text>
          <Text style={styles.cardValue}>{clinicName}</Text>

          <View style={styles.divider} />

          <Text style={styles.cardLabel}>Tidspunkt</Text>
          <Text style={styles.cardValue}>{formatDate(datetime || '')}</Text>

          <View style={styles.divider} />

          <Text style={styles.cardLabel}>Varighed</Text>
          <Text style={styles.cardValue}>{duration} minutter</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Husk</Text>
          <Text style={styles.infoText}>
            • Medbring din henvisning fra egen læge{'\n'}
            • Medbring sundhedskort{'\n'}
            • Mød op 10 minutter før aftalt tid{'\n'}
            • Aflys senest 24 timer før hvis du bliver forhindret
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.bookButton, loading && styles.bookButtonDisabled]}
          onPress={handleBooking}
          disabled={loading}
        >
          <Text style={styles.bookButtonText}>
            {loading ? 'Booker...' : 'Bekræft booking'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Annuller</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 14,
  },
  infoBox: {
    backgroundColor: '#FFF8E8',
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B8860B',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  bookButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#999',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successIconText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: '700',
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  successDetail: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 12,
  },
  successNote: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  doneButton: {
    backgroundColor: '#0A7AFF',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginTop: 32,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
