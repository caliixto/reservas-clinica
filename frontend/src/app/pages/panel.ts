import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AdminBooking } from '../api.service';
import { Settings } from './settings';
import { STATUS_LABEL, dateLabel, dayKey, euros, timeLabel } from '../format';

@Component({
  selector: 'app-panel',
  imports: [FormsModule, Settings],
  template: `
    @if (!logged()) {
      <main class="card">
        <h1>Panel de la clínica</h1>
        <label>Clínica (identificador) <input [(ngModel)]="slug" placeholder="demo-fisio" /></label>
        <label>Contraseña <input [(ngModel)]="password" type="password" (keyup.enter)="login()" /></label>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="btn" (click)="login()">Entrar</button>
        <p class="muted small">Demo: demo-fisio / demo1234</p>
      </main>
    } @else {
      <main class="card wide">
        <header class="row between">
          <h1>Panel</h1>
          <button class="btn secondary small" (click)="logout()">Salir</button>
        </header>

        <nav class="tabs">
          <button [class.on]="tab() === 'citas'" (click)="tab.set('citas')">Citas</button>
          <button [class.on]="tab() === 'ajustes'" (click)="tab.set('ajustes')">Ajustes</button>
        </nav>

        @if (tab() === 'ajustes') {
          <app-settings (unauthorized)="logout()" />
        } @else {

        <div class="stats">
          <div><strong>{{ upcoming() }}</strong><span>próximas</span></div>
          <div><strong>{{ euros(retained()) }}</strong><span>en señales retenidas</span></div>
        </div>

        <label class="check">
          <input type="checkbox" [ngModel]="showPast()" (ngModelChange)="showPast.set($event)" /> Mostrar pasadas
        </label>

        @for (g of groups(); track g.key) {
          <h2 class="day-title">{{ dateLabel(g.items[0].start) }}</h2>
          @for (b of g.items; track b.id) {
            <article class="booking">
              <div>
                <strong>{{ timeLabel(b.start) }}</strong> · {{ b.patient.name }}
                <div class="muted small">{{ b.service }} · {{ b.patient.phone }}</div>
                <span class="chip" [attr.data-status]="b.status">{{ label(b.status) }}</span>
              </div>
              @if (b.status === 'confirmada') {
                <div class="actions">
                  @if (b.canMark) {
                    <button class="btn small" (click)="setStatus(b, 'completada')">Vino</button>
                    <button class="btn small danger" (click)="setStatus(b, 'no_show')">No vino</button>
                  }
                  <button class="btn small secondary" (click)="cancel(b)">Cancelar</button>
                </div>
              }
            </article>
          }
        } @empty {
          <p class="muted">No hay citas todavía.</p>
        }
        }
      </main>
    }
  `,
})
export class Panel implements OnInit {
  private api = inject(ApiService);
  readonly euros = euros;
  readonly dateLabel = dateLabel;
  readonly timeLabel = timeLabel;
  readonly label = (s: string) => STATUS_LABEL[s] ?? s;

  slug = signal('demo-fisio');
  password = signal('');
  error = signal('');
  logged = signal(false);
  bookings = signal<AdminBooking[]>([]);
  showPast = signal(false);
  tab = signal<'citas' | 'ajustes'>('citas');

  groups = computed(() => {
    const now = Date.now();
    const list = this.bookings().filter((b) => this.showPast() || new Date(b.end).getTime() >= now);
    const map = new Map<string, AdminBooking[]>();
    for (const b of list) {
      const k = dayKey(b.start);
      map.set(k, [...(map.get(k) ?? []), b]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  });
  upcoming = computed(
    () => this.bookings().filter((b) => b.status === 'confirmada' && new Date(b.end).getTime() >= Date.now()).length
  );
  retained = computed(() =>
    this.bookings()
      .filter((b) => b.status === 'no_show' || b.status === 'cancelada_tarde')
      .reduce((sum, b) => sum + b.depositCents, 0)
  );

  ngOnInit() {
    if (this.api.token) {
      this.logged.set(true);
      this.load();
    }
  }

  async login() {
    this.error.set('');
    try {
      await this.api.login(this.slug(), this.password());
      this.logged.set(true);
      this.load();
    } catch {
      this.error.set('Credenciales incorrectas');
    }
  }
  logout() {
    this.api.logout();
    this.logged.set(false);
    this.password.set('');
    this.tab.set('citas');
  }

  load() {
    const from = new Date(Date.now() - 14 * 864e5).toLocaleDateString('en-CA');
    this.api.adminBookings(from).subscribe({
      next: (l) => this.bookings.set(l),
      error: () => this.logout(), // token caducado o inválido
    });
  }
  setStatus(b: AdminBooking, status: 'completada' | 'no_show') {
    this.api.adminSetStatus(b.id, status).subscribe(() => this.load());
  }
  cancel(b: AdminBooking) {
    if (confirm(`¿Cancelar la cita de ${b.patient.name}? Se le devolverá la señal.`)) {
      this.api.adminCancel(b.id).subscribe(() => this.load());
    }
  }
}
