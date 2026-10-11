/** Opt-in real service check. Prints only safe summaries, never credentials or asset IDs. */
import '../config.js';
import { v2 as cloudinary } from 'cloudinary';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { analyzeImage, assessmentSchema, ImageServiceError, sanitizeImage, storeImage } from './images.js';

function status(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const key of ['status', 'http_code', 'statusCode']) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === 'number' && value >= 100 && value <= 599) return value;
  }
  return undefined;
}
const summarizeError = (error: unknown) => ({
  status: status(error),
  code: error instanceof ImageServiceError ? error.code : 'provider_or_network_failure',
});

async function main() {
  // A deliberately unrelated graphic, not a photograph of a drain or field evidence.
  const fixture = Buffer.from('<svg width="512" height="384" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="384" fill="#fafafa"/><circle cx="180" cy="175" r="85" fill="#ed684c"/><rect x="310" y="90" width="110" height="180" rx="14" fill="#4977ce"/><text x="256" y="345" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">Geometric test graphic</text></svg>');
  const original = await sharp(fixture).png().withMetadata().withExif({ IFD0: { Copyright: 'Synthetic private metadata for stripping verification' } }).toBuffer();
  const image = await sanitizeImage(original);
  const metadata = await sharp(image.bytes).metadata();
  console.log(JSON.stringify({ step: 'fixture_sanitization', jpeg: metadata.format === 'jpeg', metadataRemoved: !metadata.exif && !metadata.xmp && !metadata.iptc, fixtureKind: 'synthetic_unrelated_graphic' }));

  const cloudConfigured = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].every(name => Boolean(process.env[name]));
  console.log(JSON.stringify({ step: 'credential_presence', cloudinary: cloudConfigured, gemini: Boolean(process.env.GEMINI_API_KEY) }));
  if (cloudConfigured) {
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    try { await cloudinary.api.ping(); console.log(JSON.stringify({ step: 'cloudinary_authentication', ok: true })); }
    catch (error) { console.log(JSON.stringify({ step: 'cloudinary_authentication', ok: false, ...summarizeError(error) })); }
    let createdAsset: string | undefined;
    const previousMode = process.env.IMAGE_STORAGE;
    try {
      process.env.IMAGE_STORAGE = 'cloudinary';
      const stored = await storeImage(image);
      createdAsset = stored.storageKey;
      const response = await fetch(stored.url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw Object.assign(new Error('Delivery failed'), { status: response.status });
      const delivered = Buffer.from(await response.arrayBuffer());
      const deliveredMetadata = await sharp(delivered).metadata();
      console.log(JSON.stringify({ step: 'cloudinary_roundtrip', ok: true, persistentDelivery: true, exactBytes: delivered.equals(image.bytes), jpeg: deliveredMetadata.format === 'jpeg', metadataRemoved: !deliveredMetadata.exif && !deliveredMetadata.xmp && !deliveredMetadata.iptc }));
    } catch (error) { console.log(JSON.stringify({ step: 'cloudinary_roundtrip', ok: false, ...summarizeError(error) })); }
    finally {
      if (previousMode === undefined) delete process.env.IMAGE_STORAGE; else process.env.IMAGE_STORAGE = previousMode;
      if (createdAsset && /^draindispatch\/[0-9a-f-]{36}$/.test(createdAsset)) {
        try { const result = await cloudinary.uploader.destroy(createdAsset, { resource_type: 'image', invalidate: true }); console.log(JSON.stringify({ step: 'created_fixture_cleanup', ok: result.result === 'ok' || result.result === 'not found' })); }
        catch (error) { console.log(JSON.stringify({ step: 'created_fixture_cleanup', ok: false, ...summarizeError(error) })); }
      }
    }
  }
  if (process.env.GEMINI_API_KEY) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
      const model = await ai.models.get({ model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite' });
      console.log(JSON.stringify({ step: 'gemini_model_access', ok: true, supportsGenerateContent: model.supportedActions?.includes('generateContent') }));
    } catch (error) { console.log(JSON.stringify({ step: 'gemini_model_access', ok: false, ...summarizeError(error) })); }
    try {
      const result = await analyzeImage(image);
      console.log(JSON.stringify({ step: 'gemini_fixture_analysis', ok: true, schemaValid: assessmentSchema.safeParse(result).success, irrelevantCorrectlyClassified: !result.drainVisible && result.suggestedCategory === 'other' && result.humanReviewRecommended, uncertainty: result.uncertainty, realDrainPhotoEvaluated: false }));
    } catch (error) { console.log(JSON.stringify({ step: 'gemini_fixture_analysis', ok: false, ...summarizeError(error), realDrainPhotoEvaluated: false })); }
  }
}
main().catch(error => { console.log(JSON.stringify({ step: 'verification', ok: false, ...summarizeError(error) })); process.exitCode = 1; });
