import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'c/:slug', loadComponent: () => import('./pages/booking').then((m) => m.Booking) },
  {
    path: 'c/:slug/cita/:token',
    loadComponent: () => import('./pages/appointment').then((m) => m.Appointment),
  },
  { path: 'panel', loadComponent: () => import('./pages/panel').then((m) => m.Panel) },
  { path: '**', redirectTo: '' },
];
