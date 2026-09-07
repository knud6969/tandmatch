import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Specialty, SPECIALTY_LABELS, Appointment, Clinic } from '@/types';

// Demo-data — erstattes med Supabase-kald
const DEMO_CLINICS: (Clinic & { appointments: Appointment[] })[] = [
  {
    id: '1',
    name: 'Hudlægeklinikken Østerbro',
    specialty: 'dermatology',
    address: 'Østerbrogade 42',
    city: 'København Ø',
    zip: '2100',
    phone: '35 26 10 00',
    latitude: 55.7,
    longitude: 12.58,
    average_wait_days: 14,
    created_at: '',
    appointments: [
      {
        id: 'a1',
        clinic_id: '1',
        patient_id: null,
        datetime: '2026-09-15T10:00:00',
        duration_minutes: 30,
        status: 'available',
        created_at: '',
      },
      {
        id: 'a2',
        clinic_id: '1',
        patient_id: null,
        datetime: '2026-09-18T14:30:00',
        duration_minutes: 30,
        status: 'available',
        created_at: '',
      },
    ],
  },
  {
    id: '2',
    name: 'Dermatologisk Klinik Frederiksberg',
    specialty: 'dermatology',
    address: 'Gammel Kongevej 178',
    city: 'Frederiksberg',
    zip: '1850',
    phone: '33 21 45 00',
    latitude: 55.68,
    longitude: 12.53,
    average_wait_days: 21,
    created_at: '',
    appointments: [
      {
        id: 'a3',
        clinic_id: '2',
        patient_id: null,
        datetime: '2026-09-22T09:00:00',
        duration_minutes: 45,
        status: 'available',
        created_at: '',
      },
    ],
  },
  {
    id: '3',
    name: 'Psykiatrisk Praksis Nørrebro',
    specialty: 'psychiatry',
    address: 'Nørrebrogade 88',
    city: 'København N',
    zip: '2200',
    phone: '35 37 22 00',
    latitude: 55.69,
    longitude: 12.55,
    average_wait_days: 42,
    created_at: '',
    appointments: [
      {
        id: 'a4',
        clinic_id: '3',
        patient_id: null,
        datetime: '2026-10-05T11:00:00',
        duration_minutes: 60,
        status: 'available',
        created_at: '',
      },
    ],
  },
];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const month = months[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}. ${month} kl. ${hours}:${minutes}`;
}

export default function SearchScreen() {
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(null);
  const [searchCity, setSearchCity] = useState('');

  const specialties = Object.entries(SPECIALTY_LABELS) as [Specialty, string][];

  const filteredClinics = DEMO_CLINICS.filter((clinic) => {
    if (selectedSpecialty && clinic.specialty !== selectedSpecialty) return false;
    if (searchCity && !clinic.city.toLowerCase().includes(searchCity.toLowerCase())) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Søgefelt */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Søg by (fx København)"
          placeholderTextColor="#999"
          value={searchCity}
          onChangeText={setSearchCity}
        />
      </View>

      {/* Speciale-filter */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={specialties}
          keyExtractor={([key]) => key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: [key, label] }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedSpecialty === key && styles.filterChipActive,
              ]}
              onPress={() =>
                setSelectedSpecialty(selectedSpecialty === key ? null : key)
              }
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedSpecialty === key && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Resultater */}
      <FlatList
        data={filteredClinics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.results}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Ingen klinikker fundet</Text>
            <Text style={styles.emptySubtext}>Prøv at ændre din søgning</Text>
          </View>
        }
        renderItem={({ item: clinic }) => (
          <View style={styles.clinicCard}>
            <View style={styles.clinicHeader}>
              <Text style={styles.clinicName}>{clinic.name}</Text>
              <View style={styles.waitBadge}>
                <Text style={styles.waitBadgeText}>
                  ~{clinic.average_wait_days} dage
                </Text>
              </View>
            </View>
            <Text style={styles.clinicSpecialty}>
              {SPECIALTY_LABELS[clinic.specialty]}
            </Text>
            <Text style={styles.clinicAddress}>
              {clinic.address}, {clinic.zip} {clinic.city}
            </Text>
            <Text style={styles.clinicPhone}>{clinic.phone}</Text>

            <View style={styles.appointmentsList}>
              <Text style={styles.availableLabel}>Ledige tider:</Text>
              {clinic.appointments
                .filter((a) => a.status === 'available')
                .map((appointment) => (
                  <TouchableOpacity
                    key={appointment.id}
                    style={styles.appointmentRow}
                    onPress={() =>
                      router.push({
                        pathname: '/booking/[id]',
                        params: {
                          id: appointment.id,
                          clinicName: clinic.name,
                          datetime: appointment.datetime,
                          duration: appointment.duration_minutes.toString(),
                        },
                      })
                    }
                  >
                    <Text style={styles.appointmentTime}>
                      {formatDate(appointment.datetime)}
                    </Text>
                    <Text style={styles.appointmentDuration}>
                      {appointment.duration_minutes} min
                    </Text>
                    <Text style={styles.bookButton}>Book →</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  filterSection: {
    paddingBottom: 8,
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#0A7AFF',
    borderColor: '#0A7AFF',
  },
  filterChipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  results: {
    padding: 16,
    gap: 12,
  },
  clinicCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  clinicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clinicName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
  },
  waitBadge: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  waitBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A7AFF',
  },
  clinicSpecialty: {
    fontSize: 14,
    color: '#0A7AFF',
    fontWeight: '500',
    marginTop: 4,
  },
  clinicAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  clinicPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  appointmentsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  availableLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  appointmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  appointmentTime: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  appointmentDuration: {
    fontSize: 13,
    color: '#999',
    marginRight: 12,
  },
  bookButton: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A7AFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
});
