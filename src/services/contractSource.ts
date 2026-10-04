/**
 * Prepares a decrypted original for Claude: a PDF as it is (base64), a photo scaled down
 * and converted to JPEG (also HEIC from the iPad camera, which Claude cannot read itself).
 * Runs only after the user tapped "send"; nothing is stored.
 */
import type { ContractSource } from '@/services/ai';
import { bytesToBase64 } from '@/services/crypto/webCrypto';

/** Claude scales larger images down anyway; smaller ones upload faster. */
export const AI_IMAGE_MAX_SIDE = 1568;
/** Base64 adds a third: 20 MB stay below the 32 MB request limit. */
export const MAX_AI_PDF_BYTES = 20 * 1024 * 1024;

export class ContractSourceError extends Error {
  override readonly name = 'ContractSourceError';

  constructor(readonly reason: 'tooLarge' | 'unreadable') {
    super(`Original cannot be sent: ${reason}`);
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

async function photoToJpeg(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width === 0 || height === 0) throw new ContractSourceError('unreadable');
    const scale = Math.min(1, AI_IMAGE_MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new ContractSourceError('unreadable');
    // Transparent areas become white instead of black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!jpeg) throw new ContractSourceError('unreadable');
    return jpeg;
  } catch (error: unknown) {
    if (error instanceof ContractSourceError) throw error;
    throw new ContractSourceError('unreadable');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareContractSource(blob: Blob): Promise<ContractSource> {
  if (blob.type === 'application/pdf') {
    if (blob.size > MAX_AI_PDF_BYTES) throw new ContractSourceError('tooLarge');
    return { kind: 'pdf', data: await blobToBase64(blob) };
  }
  if (!blob.type.startsWith('image/')) throw new ContractSourceError('unreadable');
  const jpeg = await photoToJpeg(blob);
  return { kind: 'image', mediaType: 'image/jpeg', data: await blobToBase64(jpeg) };
}
