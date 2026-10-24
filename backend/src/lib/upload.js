import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

/** La subida de imágenes solo funciona si hay CLOUDINARY_URL en el .env (cloudinary://clave:secreto@nombre). */
export const UPLOADS_ENABLED = Boolean(process.env.CLOUDINARY_URL);

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new Error('Solo se admiten imágenes PNG, JPG o WebP.')),
});

/** El tipo que declara el navegador se puede falsear: comprobamos los primeros bytes del archivo. */
export function hasImageSignature(buf) {
  if (!buf || buf.length < 12) return false;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return png || jpg || webp;
}

/** Middleware: recibe el campo "logo" y devuelve errores claros en JSON (400). */
export function logoUpload(req, res, next) {
  upload.single('logo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El logo no puede pesar más de 2 MB.' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen.' });
    if (!hasImageSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'El archivo no es una imagen PNG, JPG o WebP válida.' });
    }
    next();
  });
}

/** Sube (o reemplaza) el logo de una clínica. Devuelve la URL segura y el identificador en Cloudinary. */
export function uploadLogo(buffer, clinicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'reservas-clinica/logos',
        public_id: String(clinicId),
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        // Máximo 600x600, sin ampliar; formato y calidad automáticos para que cargue rápido.
        transformation: [{ width: 600, height: 600, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => (err ? reject(err) : resolve({ url: result.secure_url, publicId: result.public_id }))
    );
    stream.end(buffer);
  });
}

export async function deleteLogo(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}
