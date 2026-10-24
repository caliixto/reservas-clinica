import { Component } from '@angular/core';

/** Portada neutra: no enlaza ni a reservas ni al panel. Cada clínica tiene su propio enlace (/c/su-slug). */
@Component({
  selector: 'app-home',
  template: `
    <main class="card center">
      <h1>Reservas con señal</h1>
      <p class="muted">Para reservar una cita, usa el enlace que te ha dado tu clínica.</p>
    </main>
  `,
})
export class Home {}
