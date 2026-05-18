import * as path from 'node:path';

export const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:5173';
export const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080/api';
export const STORAGE_STATE = path.join(__dirname, '.auth/user.json');
