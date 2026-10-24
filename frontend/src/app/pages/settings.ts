import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, BlockDto, ServiceDto, Window } from '../api.service';

interface ServiceRow {
  id: string | null; // null = servicio nuevo sin guardar
  name: string;
  durationMin: number;
  price: string; // en euros, como lo escribe la persona
  deposit: string;
}

const toEuros = (cents: number) => (cents / 100).toString().replace('.', ',');
const toCents = (v: string) => Math.round(parseFloat(String(v).replace(',', '.')) * 100);

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    @if (msg()) {
      <p class="toast" [class.err]="msgError()">{{ msg() }}</p>
    }

    @if (loaded()) {
      <h2>Tu página de reservas</h2>
      <div class="linkbox">
        <code>{{ publicUrl }}</code>
        <button class="btn small secondary" (click)="copy()">{{ copied() ? '¡Copiado!' : 'Copiar enlace' }}</button>
      </div>
      <p class="muted small">Este es el enlace que pones en tu web, en Google o en Instagram.</p>

      <h2>Tu marca</h2>
      <p class="muted small">Esto es lo que ven los pacientes en la cabecera de tu página de reservas.</p>
      <div class="logo-block">
        <div class="logo-preview">
          @if (logoUrl()) {
            <img [src]="logoUrl()" alt="Logo actual" />
          } @else {
            <span class="muted small">Sin logo: se muestra un monograma con tus iniciales.</span>
          }
        </div>
        @if (uploadsEnabled()) {
          <div class="row">
            <input #file type="file" accept="image/png,image/jpeg,image/webp" style="display: none" (change)="onFile($event)" />
            <button class="btn small secondary" [disabled]="uploading()" (click)="file.click()">
              {{ uploading() ? 'Subiendo…' : logoUrl() ? 'Cambiar logo' : 'Subir logo' }}
            </button>
            @if (logoUrl()) {
              <button class="btn small secondary" [disabled]="uploading()" (click)="removeLogo()">Quitar logo</button>
            }
          </div>
          <p class="muted small">PNG, JPG o WebP, hasta 2 MB. Se ve mejor con fondo transparente o blanco.</p>
          @if (logoUrl()) {
            <label class="check">
              <input type="checkbox" [(ngModel)]="showName" />
              <span>Mostrar el nombre de la clínica junto al logo <span class="muted small">(quítalo si tu logo ya incluye el nombre)</span></span>
            </label>
            <p class="muted small">Recuerda pulsar "Guardar datos" después de cambiar esta opción.</p>
          }
        } @else {
          <p class="muted small">La subida de logos no está configurada en el servidor (falta CLOUDINARY_URL).</p>
        }
      </div>

      <h2>Datos de la clínica</h2>
      <label>Nombre <input [(ngModel)]="name" /></label>
      <label>
        Frase de presentación <span class="muted small">(opcional, máx. 90 caracteres)</span>
        <input [(ngModel)]="tagline" maxlength="90" placeholder="Fisioterapia y nutrición en Madrid" />
      </label>
      <label>Dirección <input [(ngModel)]="address" maxlength="120" placeholder="Calle Mayor 1, Madrid" /></label>
      <label>Teléfono <input [(ngModel)]="phone" type="tel" placeholder="+34 600 000 000" /></label>
      <label>
        Web de la clínica <span class="muted small">(opcional: se usa en el botón "Volver a la web")</span>
        <input [(ngModel)]="website" type="url" placeholder="https://tuclinica.es" />
      </label>
      <div class="row">
        <label class="grow">Color de tu marca <input type="color" [(ngModel)]="color" class="color" /></label>
        <label class="grow">
          Cancelación gratis hasta (horas antes)
          <input type="number" min="0" max="168" [(ngModel)]="cancelHours" />
        </label>
      </div>
      <button class="btn" (click)="saveClinic()">Guardar datos</button>

      <h2>Servicios, precios y señal</h2>
      <p class="muted small">
        La señal se descuenta del precio. Mínimo 0,50 €. Los cambios solo afectan a las reservas nuevas: las que ya
        están hechas conservan la señal con la que se pagaron.
      </p>
      @for (r of rows(); track r) {
        <div class="svc">
          <label>Servicio <input [(ngModel)]="r.name" placeholder="Fisioterapia" /></label>
          <div class="grid3">
            <label>Duración (min) <input type="number" min="10" max="240" [(ngModel)]="r.durationMin" /></label>
            <label>Precio (€) <input [(ngModel)]="r.price" inputmode="decimal" /></label>
            <label>Señal (€) <input [(ngModel)]="r.deposit" inputmode="decimal" /></label>
          </div>
          <div class="row">
            <button class="btn small" (click)="saveService(r)">{{ r.id ? 'Guardar' : 'Crear servicio' }}</button>
            <button class="btn small secondary" (click)="removeService(r)">
              {{ r.id ? 'Quitar' : 'Descartar' }}
            </button>
          </div>
        </div>
      }
      <button class="btn secondary" (click)="addService()">+ Añadir servicio</button>

      <h2>Horario semanal</h2>
      <p class="muted small">Los pacientes solo verán huecos dentro de estos tramos. Un día sin tramos está cerrado.</p>
      @for (d of days; track d.n) {
        <div class="day-row">
          <strong>{{ d.label }}</strong>
          <div class="wins">
            @for (w of windowsFor(d.n); track w) {
              <span class="win">
                <input type="time" [(ngModel)]="w.start" /> – <input type="time" [(ngModel)]="w.end" />
                <button class="x" (click)="removeWindow(w)" aria-label="Quitar tramo">×</button>
              </span>
            } @empty {
              <span class="muted small">Cerrado</span>
            }
            <button class="btn small secondary" (click)="addWindow(d.n)">+ tramo</button>
          </div>
        </div>
      }
      <button class="btn" (click)="saveAvailability()">Guardar horario</button>

      <h2>Bloquear días u horas</h2>
      <p class="muted small">
        Para vacaciones, una comida o una cita médica: esas horas aparecen ocupadas (en gris) en tu página de reservas.
        Las citas que ya tengas reservadas no se cancelan solas.
      </p>
      <div class="block-form">
        <label class="field">Día <input type="date" [(ngModel)]="bDate" [min]="today" /></label>
        <label class="check">
          <input type="checkbox" [(ngModel)]="bAllDay" />
          <span>Todo el día</span>
        </label>
        @if (!bAllDay()) {
          <div class="row">
            <label class="field">Desde <input type="time" [(ngModel)]="bFrom" /></label>
            <label class="field">Hasta <input type="time" [(ngModel)]="bTo" /></label>
          </div>
        }
        <label class="field">Nota (solo la ves tú) <input type="text" [(ngModel)]="bNote" maxlength="80" placeholder="Vacaciones, comida…" /></label>
        <button class="btn secondary" [disabled]="!bDate()" (click)="addBlock()">Bloquear</button>
      </div>
      @for (b of blocks(); track b.id) {
        <div class="block-row">
          <span>
            <b>{{ blockLabel(b) }}</b>
            @if (b.note) { <span class="muted small"> · {{ b.note }}</span> }
          </span>
          <button class="x" (click)="removeBlock(b)" aria-label="Quitar bloqueo">×</button>
        </div>
      } @empty {
        <p class="muted small">No tienes ningún bloqueo.</p>
      }
    } @else {
      <p class="muted">Cargando ajustes…</p>
    }
  `,
  styles: `
    .toast { position: sticky; top: 8px; z-index: 2; padding: 10px 12px; border-radius: 10px; background: #dcfce7; color: #166534; font-weight: 600; }
    .block-form { display: grid; gap: 10px; max-width: 360px; margin-bottom: 12px; }
    .block-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; }
    .toast.err { background: #fee2e2; color: #991b1b; }
    .linkbox { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 12px; background: var(--bg); border-radius: 10px; }
    .linkbox code { flex: 1; word-break: break-all; font-size: 0.85rem; }
    .grow { flex: 1; }
    .logo-block { padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
    .logo-preview { display: grid; place-items: center; min-height: 84px; margin-bottom: 10px; background: var(--bg); border-radius: 10px; }
    .logo-preview img { display: block; max-width: 200px; max-height: 72px; object-fit: contain; padding: 6px; }
    .logo-block .row .btn { margin-top: 0; }
    .color { height: 44px; padding: 2px; }
    .svc { padding: 12px; margin-bottom: 10px; border: 1px solid var(--line); border-radius: 12px; }
    .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .day-row { display: grid; grid-template-columns: 90px 1fr; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); align-items: start; }
    .wins { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .win { display: inline-flex; align-items: center; gap: 4px; }
    .win input { width: auto; margin: 0; padding: 6px 8px; }
    .x { border: 0; background: none; font-size: 1.2rem; color: var(--muted); cursor: pointer; }
    @media (max-width: 520px) { .grid3 { grid-template-columns: 1fr; } .day-row { grid-template-columns: 1fr; } }
  `,
})
export class Settings implements OnInit {
  private api = inject(ApiService);
  unauthorized = output<void>();

  readonly days = [
    { n: 1, label: 'Lunes' },
    { n: 2, label: 'Martes' },
    { n: 3, label: 'Miércoles' },
    { n: 4, label: 'Jueves' },
    { n: 5, label: 'Viernes' },
    { n: 6, label: 'Sábado' },
    { n: 7, label: 'Domingo' },
  ];

  loaded = signal(false);
  blocks = signal<BlockDto[]>([]);
  bDate = signal('');
  bAllDay = signal(false);
  bFrom = signal('14:00');
  bTo = signal('16:00');
  bNote = signal('');
  readonly today = new Date().toLocaleDateString('en-CA');
  msg = signal('');
  msgError = signal(false);
  copied = signal(false);
  logoUrl = signal<string | null>(null);
  uploadsEnabled = signal(false);
  uploading = signal(false);

  slug = '';
  name = '';
  showName = true;
  tagline = '';
  address = '';
  phone = '';
  website = '';
  color = '#0f766e';
  cancelHours = 24;
  rows = signal<ServiceRow[]>([]);
  windows = signal<Window[]>([]);

  get publicUrl() {
    return `${location.origin}/c/${this.slug}`;
  }

  ngOnInit() {
    this.api.adminSettings().subscribe({
      next: (d) => {
        this.slug = d.clinic.slug;
        this.name = d.clinic.name;
        this.color = d.clinic.color;
        this.cancelHours = d.clinic.cancelHours;
        this.showName = d.clinic.showName !== false;
        this.tagline = d.clinic.tagline ?? '';
        this.address = d.clinic.address ?? '';
        this.phone = d.clinic.phone ?? '';
        this.website = d.clinic.website ?? '';
        this.logoUrl.set(d.clinic.logoUrl ?? null);
        this.uploadsEnabled.set(d.uploadsEnabled);
        this.rows.set(d.services.map((s) => this.toRow(s)));
        this.windows.set(d.availability.map((w) => ({ ...w })));
        this.loaded.set(true);
        this.loadBlocks();
      },
      error: (e: HttpErrorResponse) => this.fail(e),
    });
  }

  private toRow(s: ServiceDto): ServiceRow {
    return {
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      price: toEuros(s.priceCents),
      deposit: toEuros(s.depositCents),
    };
  }

  private ok(text: string) {
    this.msgError.set(false);
    this.msg.set(text);
    setTimeout(() => this.msg.set(''), 3500);
  }
  private fail(e: HttpErrorResponse) {
    if (e.status === 401) return this.unauthorized.emit();
    this.msgError.set(true);
    this.msg.set(
      e.status === 0
        ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
        : (e.error?.error ?? 'No se pudo guardar. Inténtalo de nuevo.')
    );
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.publicUrl);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* sin portapapeles: la persona puede seleccionar el texto a mano */
    }
  }

  saveClinic() {
    this.api
      .adminSaveClinic({
        name: this.name,
        color: this.color,
        cancelHours: Number(this.cancelHours),
        tagline: this.tagline,
        address: this.address,
        phone: this.phone,
        website: this.website,
        showName: this.showName,
      })
      .subscribe({ next: () => this.ok('Datos guardados'), error: (e) => this.fail(e) });
  }

  // ---- Logo ----
  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.msgError.set(true);
      this.msg.set('El logo debe ser una imagen PNG, JPG o WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.msgError.set(true);
      this.msg.set('El logo no puede pesar más de 2 MB.');
      return;
    }
    this.uploading.set(true);
    this.api.adminUploadLogo(file).subscribe({
      next: (r) => {
        this.logoUrl.set(r.logoUrl);
        this.uploading.set(false);
        this.ok('Logo actualizado');
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.fail(e);
      },
    });
  }
  removeLogo() {
    if (!confirm('¿Quitar el logo? Se mostrará el monograma con tus iniciales.')) return;
    this.uploading.set(true);
    this.api.adminDeleteLogo().subscribe({
      next: () => {
        this.logoUrl.set(null);
        this.uploading.set(false);
        this.ok('Logo quitado');
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.fail(e);
      },
    });
  }

  // ---- Servicios ----
  addService() {
    this.rows.update((l) => [...l, { id: null, name: '', durationMin: 45, price: '40', deposit: '10' }]);
  }
  private body(r: ServiceRow) {
    return {
      name: r.name,
      durationMin: Number(r.durationMin),
      priceCents: toCents(r.price),
      depositCents: toCents(r.deposit),
    };
  }
  saveService(r: ServiceRow) {
    const body = this.body(r);
    if (Number.isNaN(body.priceCents) || Number.isNaN(body.depositCents)) {
      this.msgError.set(true);
      this.msg.set('Escribe el precio y la señal como números (por ejemplo 40 o 12,50).');
      return;
    }
    const req = r.id ? this.api.adminUpdateService(r.id, body) : this.api.adminCreateService(body);
    req.subscribe({
      next: (s) => {
        const saved = this.toRow(s);
        this.rows.update((l) => l.map((x) => (x === r ? saved : x)));
        this.ok('Servicio guardado');
      },
      error: (e) => this.fail(e),
    });
  }
  removeService(r: ServiceRow) {
    if (!r.id) return this.rows.update((l) => l.filter((x) => x !== r));
    if (!confirm(`¿Quitar "${r.name}"? Dejará de aparecer a los pacientes. Las citas ya hechas no se tocan.`)) return;
    this.api.adminDeleteService(r.id).subscribe({
      next: () => {
        this.rows.update((l) => l.filter((x) => x !== r));
        this.ok('Servicio quitado');
      },
      error: (e) => this.fail(e),
    });
  }

  // ---- Horario ----
  windowsFor(day: number) {
    return this.windows().filter((w) => w.weekday === day);
  }
  addWindow(day: number) {
    // El nuevo tramo empieza donde acaba el último del día, para no solaparse (el servidor lo rechazaría).
    const ends = this.windowsFor(day).map((w) => w.end).sort();
    const start = ends.length ? ends[ends.length - 1] : '10:00';
    const [h, m] = start.split(':').map(Number);
    const end = `${String(Math.min(h + 4, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.windows.update((l) => [...l, { weekday: day, start, end: end > start ? end : '23:59' }]);
  }
  removeWindow(w: Window) {
    this.windows.update((l) => l.filter((x) => x !== w));
  }
  saveAvailability() {
    this.api.adminSaveAvailability(this.windows()).subscribe({
      next: () => this.ok('Horario guardado'),
      error: (e) => this.fail(e),
    });
  }

  // ---- Bloqueos ----
  private loadBlocks() {
    this.api.adminBlocks().subscribe({ next: (b) => this.blocks.set(b), error: (e) => this.fail(e) });
  }
  blockLabel(b: BlockDto) {
    const o = { timeZone: 'Europe/Madrid' } as const;
    const s = new Date(b.start);
    const e = new Date(b.end);
    const day = s.toLocaleDateString('es-ES', { ...o, weekday: 'short', day: 'numeric', month: 'short' });
    const t = (d: Date) => d.toLocaleTimeString('es-ES', { ...o, hour: '2-digit', minute: '2-digit' });
    const allDay = e.getTime() - s.getTime() >= 23 * 36e5 && t(s) === '00:00';
    return allDay ? `${day} · todo el día` : `${day} · ${t(s)}–${t(e)}`;
  }
  addBlock() {
    this.api
      .adminCreateBlock({ date: this.bDate(), allDay: this.bAllDay(), from: this.bFrom(), to: this.bTo(), note: this.bNote() })
      .subscribe({
        next: (b) => {
          this.bNote.set('');
          this.loadBlocks();
          this.ok(
            b.conflicts
              ? `Bloqueado. Ojo: ya tienes ${b.conflicts} cita(s) en ese horario; no se han cancelado.`
              : 'Horas bloqueadas'
          );
        },
        error: (e) => this.fail(e),
      });
  }
  removeBlock(b: BlockDto) {
    this.api.adminDeleteBlock(b.id).subscribe({
      next: () => {
        this.loadBlocks();
        this.ok('Bloqueo quitado');
      },
      error: (e) => this.fail(e),
    });
  }
}
