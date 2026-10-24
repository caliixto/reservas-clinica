import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, ClinicInfo, ServiceInfo } from '../api.service';
import { ClinicHero } from './clinic-hero';
import { dateLabel, euros, hourOf, readableOn, timeLabel } from '../format';

type Step = 'servicio' | 'hora' | 'datos' | 'pago';

@Component({
  selector: 'app-booking',
  imports: [FormsModule, ClinicHero],
  styleUrl: './patient.css',
  template: `
    @if (error() && !clinic()) {
      <section class="sheet"><p class="error">{{ error() }}</p></section>
    } @else if (clinic(); as c) {
      <div class="page" [style.--accent]="c.color" [style.--accent-ink]="ink(c.color)">
        <app-clinic-hero
          [name]="c.name"
          [logoUrl]="c.logoUrl"
          [showName]="c.showName"
          [lead]="c.tagline || 'Reserva tu cita online en menos de un minuto.'"
          [trust]="['Pago seguro con tarjeta', 'Cancelas gratis hasta ' + c.cancelHours + ' h antes']"
          [address]="c.address"
          [phone]="c.phone"
        />

        <main class="sheet">
          <div class="progress" aria-hidden="true">
            @for (s of stepList; track s.id; let i = $index) {
              <i [class.on]="stepIndex() >= i"></i>
            }
          </div>
          <p class="where">Paso {{ stepIndex() + 1 }} de 4: {{ stepList[stepIndex()].label }}</p>

          @if (step() === 'servicio') {
            <h2>¿Qué necesitas?</h2>
            @for (s of c.services; track s.id) {
              <button class="service" (click)="pickService(s)">
                <span>
                  <b>{{ s.name }}</b>
                  <span class="dur">{{ s.durationMin }} min</span>
                </span>
                <span class="price">
                  {{ euros(s.priceCents) }}
                  <small>señal {{ euros(s.depositCents) }}</small>
                </span>
              </button>
            }
          }

          @if (step() === 'hora') {
            <h2>Elige día y hora</h2>
            <div class="days" role="listbox" aria-label="Días disponibles">
              @for (d of days; track d.key) {
                <button class="day" [class.on]="date() === d.key" (click)="pickDate(d.key)">
                  <span class="wd">{{ d.weekday }}</span>
                  <span class="num">{{ d.day }}</span>
                  <span class="mo">{{ d.month }}</span>
                </button>
              }
            </div>

            @if (loadingSlots()) {
              <p class="muted">Buscando huecos…</p>
            } @else if (date()) {
              @if (slots().length === 0) {
                <p class="muted">
                  {{ grid().length ? 'Ese día está completo.' : 'Ese día no hay citas disponibles.' }} Prueba con otro día.
                </p>
              } @else {
                @if (morning().length) {
                  <p class="part">Mañana</p>
                  <div class="slots">
                    @for (s of morning(); track s.start) {
                      <button class="slot" [class.on]="slot() === s.start" [disabled]="!s.free" [attr.title]="s.free ? null : 'Ocupado'" (click)="slot.set(s.start)">{{ timeLabel(s.start) }}</button>
                    }
                  </div>
                }
                @if (afternoon().length) {
                  <p class="part">Tarde</p>
                  <div class="slots">
                    @for (s of afternoon(); track s.start) {
                      <button class="slot" [class.on]="slot() === s.start" [disabled]="!s.free" [attr.title]="s.free ? null : 'Ocupado'" (click)="slot.set(s.start)">{{ timeLabel(s.start) }}</button>
                    }
                  </div>
                }
                @if (grid().length > slots().length) {
                  <p class="muted small">Las horas tachadas en gris ya están ocupadas.</p>
                }
              }
            } @else {
              <p class="muted">Elige un día para ver las horas libres.</p>
            }
            @if (error()) { <p class="error">{{ error() }}</p> }
            <div class="actions">
              <button class="btn ghost" (click)="step.set('servicio')">Atrás</button>
              <button class="btn" [disabled]="!slot()" (click)="step.set('datos')">Continuar</button>
            </div>
          }

          @if (step() === 'datos') {
            <h2>Tus datos</h2>
            <div class="recap">
              <b>{{ service()?.name }}</b>
              <span>{{ dateText() }}, {{ timeLabel(slot()) }}</span>
            </div>
            <label class="field">Nombre <input type="text" [(ngModel)]="name" autocomplete="name" /></label>
            <label class="field">Teléfono <input type="tel" [(ngModel)]="phone" autocomplete="tel" /></label>
            <label class="field">
              Email
              <input type="email" [(ngModel)]="email" autocomplete="email" />
              <span class="hint">Te enviaremos la confirmación y el enlace para ver o cancelar tu cita.</span>
            </label>

            <section class="ticket" aria-label="Cuánto pagas">
              <h3>Así funciona la señal</h3>
              <div class="row big"><span>Pagas hoy</span><span>{{ euros(service()!.depositCents) }}</span></div>
              <div class="cut"></div>
              <div class="row">
                <span>Pagas en la clínica</span>
                <span>{{ euros(service()!.priceCents - service()!.depositCents) }}</span>
              </div>
              <div class="row muted"><span>Precio de la sesión</span><span>{{ euros(service()!.priceCents) }}</span></div>
              <p class="note">
                Si cancelas con {{ c.cancelHours }} h o más de antelación, te devolvemos la señal. Si cancelas más tarde
                o no vienes, la clínica la conserva.
              </p>
            </section>
            <label class="check">
              <input type="checkbox" [(ngModel)]="accepted" />
              <span>He leído y acepto la política de cancelación</span>
            </label>

            @if (error()) { <p class="error">{{ error() }}</p> }
            <div class="actions">
              <button class="btn ghost" (click)="step.set('hora')">Atrás</button>
              <button class="btn" [disabled]="!canSubmit() || sending()" (click)="submit()">
                {{ sending() ? 'Reservando…' : 'Pagar señal de ' + euros(service()!.depositCents) }}
              </button>
            </div>
          }

          @if (step() === 'pago') {
            <h2>Paga la señal</h2>
            <p class="demo-note">
              <strong>Modo demo:</strong> el pago es simulado. Con Stripe activo, aquí se abre la pasarela segura de
              tarjeta.
            </p>
            <div class="card-fake">
              <span class="muted small">Tarjeta de prueba</span>
              <b>4242 4242 4242 4242</b>
            </div>
            <button class="btn" [disabled]="sending()" (click)="demoPay()">
              {{ sending() ? 'Procesando…' : 'Pagar ' + euros(service()!.depositCents) }}
            </button>
          }
        </main>
      </div>
    } @else {
      <section class="sheet"><p class="muted">Cargando…</p></section>
    }
  `,
})
export class Booking implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly euros = euros;
  readonly timeLabel = timeLabel;
  readonly ink = readableOn;
  readonly stepList: { id: Step; label: string }[] = [
    { id: 'servicio', label: 'Servicio' },
    { id: 'hora', label: 'Hora' },
    { id: 'datos', label: 'Datos' },
    { id: 'pago', label: 'Pago' },
  ];

  slug = '';
  clinic = signal<ClinicInfo | null>(null);
  error = signal('');
  step = signal<Step>('servicio');
  stepIndex = computed(() => this.stepList.findIndex((s) => s.id === this.step()));

  service = signal<ServiceInfo | null>(null);
  date = signal('');
  slots = signal<string[]>([]); // libres
  taken = signal<string[]>([]); // ocupados
  slot = signal('');
  loadingSlots = signal(false);

  name = signal('');
  phone = signal('');
  email = signal('');
  accepted = signal(false);
  sending = signal(false);
  private token = '';

  /** Próximos 14 días. */
  readonly days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      key: d.toLocaleDateString('en-CA'),
      weekday: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
      day: d.getDate(),
      month: i === 0 || d.getDate() === 1 ? d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') : '',
    };
  });

  canSubmit = computed(
    () =>
      this.name().trim().length > 1 &&
      this.phone().trim().length >= 9 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email().trim()) &&
      this.accepted()
  );
  dateText = computed(() => (this.slot() ? dateLabel(this.slot()) : ''));
  /** Todas las horas del día (libres y ocupadas), ordenadas. */
  grid = computed(() =>
    [...this.slots().map((start) => ({ start, free: true })), ...this.taken().map((start) => ({ start, free: false }))].sort(
      (a, b) => a.start.localeCompare(b.start)
    )
  );
  morning = computed(() => this.grid().filter((s) => hourOf(s.start) < 14));
  afternoon = computed(() => this.grid().filter((s) => hourOf(s.start) >= 14));

  ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.api.getClinic(this.slug).subscribe({
      next: (c) => this.clinic.set(c),
      error: () => this.error.set('No encontramos esta clínica.'),
    });
  }

  pickService(s: ServiceInfo) {
    this.service.set(s);
    this.slot.set('');
    this.date.set('');
    this.slots.set([]);
    this.taken.set([]);
    this.step.set('hora');
  }

  pickDate(key: string) {
    this.date.set(key);
    this.slot.set('');
    this.error.set('');
    this.loadSlots();
  }

  private loadSlots() {
    this.loadingSlots.set(true);
    this.api.getSlots(this.slug, this.service()!.id, this.date()).subscribe({
      next: (r) => {
        this.slots.set(r.slots);
        this.taken.set(r.taken ?? []);
        this.loadingSlots.set(false);
      },
      error: () => {
        this.slots.set([]);
        this.taken.set([]);
        this.loadingSlots.set(false);
        this.error.set('No hemos podido cargar las horas. Comprueba tu conexión e inténtalo de nuevo.');
      },
    });
  }

  submit() {
    this.error.set('');
    this.sending.set(true);
    this.api
      .createBooking(this.slug, {
        serviceId: this.service()!.id,
        start: this.slot(),
        patient: { name: this.name(), phone: this.phone(), email: this.email() },
      })
      .subscribe({
        next: (r) => {
          this.token = r.cancelToken;
          if (r.checkoutUrl) {
            window.location.href = r.checkoutUrl; // Stripe Checkout
          } else {
            this.sending.set(false);
            this.step.set('pago'); // modo demo
          }
        },
        error: (e: HttpErrorResponse) => {
          this.sending.set(false);
          this.error.set(this.errorText(e));
          if (e.status === 409) {
            // Alguien se adelantó: volvemos a la lista con las horas actualizadas.
            this.slot.set('');
            this.step.set('hora');
            this.loadSlots();
          }
        },
      });
  }

  private errorText(e: HttpErrorResponse): string {
    if (e.status === 0) return 'No hay conexión con el servidor. Comprueba tu conexión (o que el servidor esté en marcha) e inténtalo de nuevo.';
    if (typeof e.error?.error === 'string') return e.error.error;
    return 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.';
  }

  demoPay() {
    this.sending.set(true);
    this.api.demoPay(this.token).subscribe({
      next: () => this.router.navigate(['/c', this.slug, 'cita', this.token]),
      error: () => {
        this.sending.set(false);
        this.error.set('Falló el pago simulado.');
      },
    });
  }
}
