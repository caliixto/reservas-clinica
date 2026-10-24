import { Component, input } from '@angular/core';
import { initials } from '../format';

/** Cabecera con la marca de la clínica (logo o monograma, nombre, frase, contacto). La comparten reserva y "Tu cita". */
@Component({
  selector: 'app-clinic-hero',
  template: `
    <header class="hero">
      <div class="hero-in">
        <div class="brand" [class.stack]="logoUrl()">
          @if (logoUrl()) {
            <img class="logo" [src]="logoUrl()" [alt]="'Logo de ' + name()" />
          } @else {
            <span class="mono" aria-hidden="true">{{ initials(name()) }}</span>
          }
          <h1 [class.sr]="!!logoUrl() && !showName()">{{ name() }}</h1>
        </div>
        @if (lead()) {
          <p class="lead">{{ lead() }}</p>
        }
        @if (trust().length) {
          <ul class="trust">
            @for (t of trust(); track t) {
              <li>{{ t }}</li>
            }
          </ul>
        }
        @if (address() || phone()) {
          <ul class="contact">
            @if (address()) {
              <li>
                <a [href]="mapsUrl()" target="_blank" rel="noopener">{{ address() }}</a>
              </li>
            }
            @if (phone()) {
              <li>
                <a [href]="'tel:' + phoneDigits()">{{ phone() }}</a>
              </li>
            }
          </ul>
        }
      </div>
    </header>
  `,
  styles: `
    :host { display: block; }
    .hero { background: var(--accent); color: var(--accent-ink); padding: 28px 20px 64px; }
    .hero-in { max-width: 560px; margin: 0 auto; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .mono {
      flex: none; width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center;
      background: var(--accent-ink); color: var(--accent);
      font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 1.25rem; letter-spacing: 0.02em;
    }
    /* Los logos son de formas y colores muy distintos: van sobre una placa blanca para que siempre se vean. */
    .logo {
      flex: none; display: block; box-sizing: content-box; height: 44px; max-width: 150px; width: auto; object-fit: contain;
      padding: 8px 10px; background: #fff; border-radius: 14px;
    }
    h1 {
      margin: 0; font-family: 'Bricolage Grotesque', 'Figtree', sans-serif; font-weight: 700;
      font-size: clamp(1.6rem, 6vw, 2.3rem); line-height: 1.08; letter-spacing: -0.01em; overflow-wrap: anywhere;
    }
    /* Con el nombre oculto sigue disponible para lectores de pantalla. */
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .lead { margin: 14px 0 0; max-width: 34ch; font-size: 1.05rem; opacity: 0.92; }
    .trust, .contact { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; padding: 0; list-style: none; }
    .trust li {
      padding: 5px 12px; border-radius: 99px; font-size: 0.85rem; font-weight: 500;
      border: 1px solid color-mix(in srgb, var(--accent-ink) 40%, transparent);
    }
    .contact { flex-direction: column; gap: 4px; margin-top: 16px; font-size: 0.92rem; }
    .contact a { color: inherit; text-underline-offset: 3px; }
    .contact a:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 2px; }

    @media (min-width: 600px) { .hero { padding-top: 40px; } }

    /* Ordenador: la cabecera pasa a ser una columna fija a la izquierda. */
    @media (min-width: 980px) {
      :host { position: sticky; top: 0; height: 100vh; }
      .hero { height: 100%; box-sizing: border-box; display: flex; align-items: center; padding: 56px 56px; }
      .hero-in { margin: 0; max-width: 420px; }
      .logo { height: 56px; max-width: 220px; }
      .brand.stack { flex-direction: column; align-items: flex-start; gap: 18px; }
      h1 { font-size: 2.6rem; }
    }
  `,
})
export class ClinicHero {
  name = input.required<string>();
  logoUrl = input<string | null>(null);
  showName = input(true);
  lead = input('');
  trust = input<string[]>([]);
  address = input('');
  phone = input('');

  readonly initials = initials;
  mapsUrl = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.address())}`;
  phoneDigits = () => this.phone().replace(/[^+\d]/g, '');
}
