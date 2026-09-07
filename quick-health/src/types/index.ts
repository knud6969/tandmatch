// Database typer for QuickHealth

export type Specialty =
  | 'dermatology'    // Hudlæge
  | 'psychiatry'     // Psykiater
  | 'ophthalmology'  // Øjenlæge
  | 'rheumatology'   // Reumatologi
  | 'dentist'        // Specialtandlæge
  | 'orthopedics'    // Ortopædkirurgi
  | 'cardiology'     // Kardiologi
  | 'neurology'      // Neurologi
  | 'ent';           // Øre-næse-hals

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  dermatology: 'Hudlæge',
  psychiatry: 'Psykiater',
  ophthalmology: 'Øjenlæge',
  rheumatology: 'Reumatologi',
  dentist: 'Specialtandlæge',
  orthopedics: 'Ortopædkirurgi',
  cardiology: 'Kardiologi',
  neurology: 'Neurologi',
  ent: 'Øre-næse-hals',
};

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'patient' | 'clinic_admin';
  created_at: string;
}

export interface Clinic {
  id: string;
  name: string;
  specialty: Specialty;
  address: string;
  city: string;
  zip: string;
  phone: string;
  latitude: number;
  longitude: number;
  average_wait_days: number;
  created_at: string;
}

export interface Appointment {
  id: string;
  clinic_id: string;
  clinic?: Clinic;
  patient_id: string | null;
  datetime: string;
  duration_minutes: number;
  status: 'available' | 'booked' | 'cancelled' | 'completed';
  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  patient_id: string;
  specialty: Specialty;
  max_distance_km: number;
  is_active: boolean;
  created_at: string;
}
