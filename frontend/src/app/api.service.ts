import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './config';

export interface ServiceInfo {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  depositCents: number;
}
export interface ClinicInfo {
  name: string;
  slug: string;
  color: string;
  logoUrl: string | null;
  showName: boolean;
  tagline: string;
  address: string;
  phone: string;
  website: string;
  cancelHours: number;
  demoMode: boolean;
  services: ServiceInfo[];
}
export interface CreatedBooking {
  bookingId: string;
  cancelToken: string;
  checkoutUrl?: string;
  demo?: boolean;
}
export interface BookingDetail {
  clinic: string;
  service: string;
  start: string;
  status: string;
  depositCents: number;
  cancelHours: number;
  freeCancellation: boolean;
  emailHint: string;
}
export interface AdminBooking {
  id: string;
  start: string;
  end: string;
  service: string;
  patient: { name: string; phone: string; email: string };
  status: string;
  depositCents: number;
  canMark: boolean;
}
export interface ClinicSettings {
  name: string;
  slug: string;
  color: string;
  cancelHours: number;
  logoUrl: string | null;
  showName: boolean;
  tagline: string;
  address: string;
  phone: string;
  website: string;
}
export interface ServiceDto {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  depositCents: number;
}
export interface Window {
  weekday: number;
  start: string;
  end: string;
}
export interface BlockDto {
  id: string;
  start: string;
  end: string;
  note: string;
  conflicts?: number;
}
export interface SettingsData {
  clinic: ClinicSettings;
  uploadsEnabled: boolean;
  services: ServiceDto[];
  availability: Window[];
}

const TOKEN_KEY = 'reservas_admin_token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // ---- Público (paciente) ----
  getClinic(slug: string) {
    return this.http.get<ClinicInfo>(`${API_URL}/public/clinics/${slug}`);
  }
  getSlots(slug: string, serviceId: string, date: string) {
    return this.http.get<{ slots: string[]; taken: string[] }>(`${API_URL}/public/clinics/${slug}/slots`, {
      params: { serviceId, date },
    });
  }
  createBooking(
    slug: string,
    body: { serviceId: string; start: string; patient: { name: string; phone: string; email: string } }
  ) {
    return this.http.post<CreatedBooking>(`${API_URL}/public/clinics/${slug}/bookings`, body);
  }
  demoPay(token: string) {
    return this.http.post<{ ok: boolean }>(`${API_URL}/public/bookings/${token}/demo-pay`, {});
  }
  getBooking(token: string) {
    return this.http.get<BookingDetail>(`${API_URL}/public/bookings/${token}`);
  }
  /** Enlace de descarga del evento de calendario (.ics) de una cita confirmada. */
  calendarUrl(token: string) {
    return `${API_URL}/public/bookings/${token}/calendar.ics`;
  }
  cancelBooking(token: string) {
    return this.http.post<{ ok: boolean; status: string; refunded: boolean }>(
      `${API_URL}/public/bookings/${token}/cancel`,
      {}
    );
  }

  // ---- Panel de la clínica ----
  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  private set token(v: string | null) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* sin almacenamiento: la sesión dura lo que dure la pestaña */
    }
  }
  private authHeaders() {
    return { headers: new HttpHeaders({ Authorization: `Bearer ${this.token ?? ''}` }) };
  }
  async login(slug: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<{ token: string; clinic: { name: string; slug: string } }>(`${API_URL}/admin/login`, {
        slug,
        password,
      })
    );
    this.token = res.token;
    return res.clinic;
  }
  logout() {
    this.token = null;
  }
  adminBookings(from: string) {
    return this.http.get<AdminBooking[]>(`${API_URL}/admin/bookings`, {
      ...this.authHeaders(),
      params: { from },
    });
  }
  adminSetStatus(id: string, status: 'completada' | 'no_show') {
    return this.http.post(`${API_URL}/admin/bookings/${id}/status`, { status }, this.authHeaders());
  }
  adminCancel(id: string) {
    return this.http.post(`${API_URL}/admin/bookings/${id}/cancel`, {}, this.authHeaders());
  }

  // ---- Ajustes ----
  adminSettings() {
    return this.http.get<SettingsData>(`${API_URL}/admin/settings`, this.authHeaders());
  }
  adminSaveClinic(body: {
    name: string;
    color: string;
    cancelHours: number;
    tagline: string;
    address: string;
    phone: string;
    website: string;
    showName: boolean;
  }) {
    return this.http.put(`${API_URL}/admin/settings/clinic`, body, this.authHeaders());
  }
  adminCreateService(body: Omit<ServiceDto, 'id'>) {
    return this.http.post<ServiceDto>(`${API_URL}/admin/services`, body, this.authHeaders());
  }
  adminUpdateService(id: string, body: Omit<ServiceDto, 'id'>) {
    return this.http.put<ServiceDto>(`${API_URL}/admin/services/${id}`, body, this.authHeaders());
  }
  adminDeleteService(id: string) {
    return this.http.delete(`${API_URL}/admin/services/${id}`, this.authHeaders());
  }
  adminSaveAvailability(windows: Window[]) {
    return this.http.put(`${API_URL}/admin/availability`, { windows }, this.authHeaders());
  }
  adminBlocks() {
    return this.http.get<BlockDto[]>(`${API_URL}/admin/blocks`, this.authHeaders());
  }
  adminCreateBlock(body: { date: string; allDay: boolean; from: string; to: string; note: string }) {
    return this.http.post<BlockDto>(`${API_URL}/admin/blocks`, body, this.authHeaders());
  }
  adminDeleteBlock(id: string) {
    return this.http.delete(`${API_URL}/admin/blocks/${id}`, this.authHeaders());
  }
  adminUploadLogo(file: File) {
    const form = new FormData();
    form.append('logo', file);
    return this.http.post<{ ok: boolean; logoUrl: string }>(`${API_URL}/admin/settings/logo`, form, this.authHeaders());
  }
  adminDeleteLogo() {
    return this.http.delete(`${API_URL}/admin/settings/logo`, this.authHeaders());
  }
}
