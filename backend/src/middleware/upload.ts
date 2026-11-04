import multer from 'multer';

/** Vercel caps a whole request body at 4.5 MB, so both files together must stay under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 4, fields: 5 },
});
