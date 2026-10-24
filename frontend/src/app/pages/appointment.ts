import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, BookingDetail, ClinicInfo } from '../api.service';
import { ClinicHero } from './clinic-hero';
import { STATUS_LABEL, dateLabel, euros, readableOn, timeLabel } from '../format';

@Component({
  selector: 'app-appointment',
  imports: [RouterLink, ClinicHero],
  styleUrl: './patient.css',
  template: `
    <div class="page" [style.--accent]="color()" [style.--accent-ink]="ink(color())">
      <app-clinic-hero
        [name]="clinic()?.name ?? b()?.clinic ?? 'Tu cita'"
        [logoUrl]="clinic()?.logoUrl ?? null"
        [showName]="clinic()?.showName ?? true"
        [address]="clinic()?.address ?? ''"
        [phone]="clinic()?.phone ?? ''"
      />

      <main class="sheet">
        @if (error()) {
          <p class="error">{{ error() }}</p>
        } @else if (b(); as b) {
          <!-- Estado -->
          @switch (b.status) {
            @case ('confirmada') {
              <div class="ok-head">
                <div class="ok-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </div>
                <h2>¡Cita confirmada!</h2>
                @if (b.emailHint) {
                  <p>Te hemos enviado un email a {{ b.emailHint }} con los detalles y el enlace para gestionarla.</p>
                }
              </div>
            }
            @case ('pendiente_pago') {
              <div class="ok-head">
                <h2>Confirmando tu pago…</h2>
                <p>Esta página se actualiza sola en unos segundos.</p>
              </div>
            }
            @default {
              <div class="ok-head">
                <h2>{{ label(b.status) }}</h2>
              </div>
            }
          }

          <div class="recap">
            <b>{{ b.service }}</b>
            <span>{{ dateLabel(b.start) }}, {{ timeLabel(b.start) }}</span>
            @if (clinic()?.address; as addr) {
              <span class="where-line">{{ addr }}</span>
            }
          </div>

          @if (b.status === 'confirmada') {
            <p class="notice" [class.warn]="!b.freeCancellation">
              @if (b.freeCancellation) {
                Puedes cancelar gratis hasta {{ b.cancelHours }} h antes y te devolvemos la señal de
                {{ euros(b.depositCents) }}.
              } @else {
                Faltan menos de {{ b.cancelHours }} h para tu cita. Si cancelas ahora, la clínica conserva la señal de
                {{ euros(b.depositCents) }}.
              }
            </p>

            <div class="stack">
              <a class="btn" [href]="api.calendarUrl(token)">Añadir al calendario</a>
              @if (clinic()?.website; as web) {
                <a class="btn ghost" [href]="web">Volver a la web de {{ clinic()?.name }}</a>
              }
            </div>
          } @else if (clinic()?.website; as web) {
            <div class="stack"><a class="btn ghost" [href]="web">Volver a la web de {{ clinic()?.name }}</a></div>
          }

          @if (msg()) {
            <p class="notice">{{ msg() }}</p>
          }

          <a class="again" [routerLink]="['/c', slug]">Reservar otra cita</a>

          @if (b.status === 'confirmada') {
            @if (!confirming()) {
              <button class="linkbtn" (click)="confirming.set(true)">Cancelar esta cita</button>
            } @else {
              <p class="notice warn"><b>¿Seguro que quieres cancelar?</b></p>
              <div class="actions even">
                <button class="btn ghost" (click)="confirming.set(false)">No, mantener</button>
                <button class="btn danger" (click)="cancel()">Sí, cancelar</button>
              </div>
            }
          }
        } @else {
          <p class="muted">Cargando…</p>
        }
      </main>
    </div>
  `,
})
export class Appointment implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly euros = euros;
  readonly dateLabel = dateLabel;
  readonly timeLabel = timeLabel;
  readonly ink = readableOn;
  readonly label = (s: string) => STATUS_LABEL[s] ?? s;

  slug = '';
  token = '';
  b = signal<BookingDetail | null>(null);
  color = signal('#0f766e');
  clinic = signal<ClinicInfo | null>(null);
  error = signal('');
  msg = signal('');
  confirming = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    // El color y la marca vienen de la ficha pública de la clínica.
    this.api.getClinic(this.slug).subscribe({
      next: (c) => {
        this.clinic.set(c);
        this.color.set(c.color);
      },
    });
    this.load();
    // Tras pagar en Stripe, el webhook puede tardar unos segundos en confirmar.
    let tries = 0;
    this.timer = setInterval(() => {
      if (this.b()?.status === 'pendiente_pago' && tries++ < 10) this.load();
    }, 2000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }

  load() {
    this.api.getBooking(this.token).subscribe({
      next: (b) => this.b.set(b),
      error: () => this.error.set('No encontramos esta cita. Revisa el enlace que te enviaron.'),
    });
  }

  cancel() {
    this.api.cancelBooking(this.token).subscribe({
      next: (r) => {
        this.msg.set(
          r.refunded
            ? 'Cita cancelada. Te hemos devuelto la señal.'
            : 'Cita cancelada. La clínica conserva la señal.'
        );
        this.confirming.set(false);
        this.load();
      },
      error: () => this.msg.set('No se pudo cancelar. Inténtalo de nuevo.'),
    });
  }
}
