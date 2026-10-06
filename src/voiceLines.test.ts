import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { CHAPTERS } from './campaign.ts';
import { VOICES, VOICE_LINES } from './voiceLines.ts';

test('voice line ids are unique and every role has a configured voice', () => {
  const ids = new Set(VOICE_LINES.map((line) => line.id));
  assert.equal(ids.size, VOICE_LINES.length);
  for (const line of VOICE_LINES) {
    assert.ok(VOICES[line.role], line.id);
    assert.ok(line.text.length > 3 && line.text.length < 600, line.id);
  }
});

test('every chapter has a briefing and a debrief line', () => {
  for (const chapter of CHAPTERS) {
    assert.ok(VOICE_LINES.some((line) => line.id === `ch${chapter.number}-brief`), `ch${chapter.number}-brief`);
    assert.ok(VOICE_LINES.some((line) => line.id === `ch${chapter.number}-debrief`), `ch${chapter.number}-debrief`);
  }
});

test('every line has a pre-rendered clip (run scripts/generate-voice.mjs when this fails)', () => {
  for (const line of VOICE_LINES) {
    const file = new URL(`../public/audio/voice/${line.id}.mp3`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing clip for ${line.id}`);
    assert.ok(fs.statSync(file).size > 1000, `empty clip for ${line.id}`);
  }
});
