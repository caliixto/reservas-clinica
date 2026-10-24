/** Busca la IP de tu PC en la consola (ej: 192.168.1.33) */
const LOCAL_IP = '192.168.1.11'; // <-- Pon aquí la IP local de tu ordenador

export const API_URL =
  typeof location !== 'undefined' && 
  (location.hostname === 'localhost' || location.hostname === LOCAL_IP || location.hostname.startsWith('192.168.'))
    ? `http://${location.hostname}:3000/api`
    : 'https://reservas-clinica.onrender.com/api';

export const CLINIC_TZ = 'Europe/Madrid';