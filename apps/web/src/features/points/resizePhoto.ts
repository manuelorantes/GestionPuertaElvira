/** Lado mayor de la foto que se sube: suficiente para verla bien en la galería y ligera para el móvil. */
const MAX_SIDE = 1600;

/**
 * Reduce una foto del móvil (pueden ser de 5–10 MB) a JPEG de como mucho 1600 px de lado antes de subirla. Si el
 * navegador no sabe leerla, se sube tal cual (la API rechaza lo que no sea una imagen JPEG, PNG o WebP).
 */
export async function resizePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
