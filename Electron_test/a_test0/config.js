import dotenv from 'dotenv';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const envFile = isDev ? '.env.development' : '.env';

// Важливо: при розробці беремо корінь проекту, після збірки - папку з exe
const baseDir = isDev ? __dirname : path.dirname(app.getPath('exe'));
dotenv.config({ path: path.join(baseDir, envFile) });

export const config = {
  isDev,
  root: __dirname,
  siteUrl: process.env.SITE_URL,
  allowMulti: process.env.ALLOW_MULTI === 'true'
};
