// Pre-renders every narration clip with Microsoft neural voices (msedge-tts) into public/audio/voice.
// Usage: npm i --no-save msedge-tts && node --experimental-strip-types scripts/generate-voice.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { VOICES, VOICE_LINES } from '../src/voiceLines.ts';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'voice');
fs.mkdirSync(outDir, { recursive: true });
const force = process.argv.includes('--force');

for (const [role, voice] of Object.entries(VOICES)) {
  const lines = VOICE_LINES.filter((line) => line.role === role && (force || !fs.existsSync(path.join(outDir, `${line.id}.mp3`))));
  if (lines.length === 0) continue;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice.name, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  for (const line of lines) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const { audioStream } = tts.toStream(line.text, { rate: `${voice.rate >= 0 ? "+" : ""}${voice.rate}%`, pitch: voice.pitch });
        const chunks = [];
        audioStream.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve, reject) => { audioStream.on('close', resolve); audioStream.on('error', reject); });
        const data = Buffer.concat(chunks);
        if (data.length < 1000) throw new Error('empty audio');
        fs.writeFileSync(path.join(outDir, `${line.id}.mp3`), data);
        console.log(`${role} ${line.id} ${data.length}B`);
        break;
      } catch (error) {
        console.warn(`retry ${line.id}: ${error.message}`);
        if (attempt === 3) throw error;
      }
    }
  }
}
