import { CHAPTERS } from './campaign.ts';

export type VoiceRole = 'command' | 'computer' | 'wingman';

/** Microsoft neural voices used to pre-render every clip (see scripts/generate-voice.mjs). */
export const VOICES: Record<VoiceRole, { name: string; rate: number; pitch: string }> = {
  command: { name: 'en-US-ChristopherNeural', rate: 10, pitch: '+0Hz' },
  computer: { name: 'en-US-AriaNeural', rate: 12, pitch: '+0Hz' },
  wingman: { name: 'en-US-GuyNeural', rate: 14, pitch: '+0Hz' },
};

export interface VoiceLine {
  id: string;
  role: VoiceRole;
  text: string;
  /** Higher priority lines interrupt or jump the queue; low ones are dropped when the channel is busy. */
  priority: 1 | 2 | 3;
}

const lines: VoiceLine[] = [
  { id: 'menu-welcome', role: 'command', priority: 1, text: 'Welcome back to Helios Ring, pilot. Pick your craft, pick your chapter, and make the frontier remember your name.' },
  { id: 'launch-arcade', role: 'command', priority: 2, text: 'Operation Shattered Orbit is go. Five waves stand between you and the blockade. Make them count.' },
  { id: 'wave-2', role: 'command', priority: 2, text: 'Wave two. Interceptors are joining the fight.' },
  { id: 'wave-3', role: 'command', priority: 2, text: 'Wave three. Bombers on approach. Watch your shields.' },
  { id: 'wave-4', role: 'command', priority: 2, text: 'Wave four. Heavy contacts. They are throwing everything at you.' },
  { id: 'boss-warning', role: 'computer', priority: 3, text: 'Warning. Capital ship signature detected. The Leviathan has entered the sector.' },
  { id: 'boss-exposed', role: 'wingman', priority: 3, text: 'Shields are down! Hit the bridge tower, now!' },
  { id: 'boss-critical', role: 'wingman', priority: 3, text: 'She is venting! Finish it!' },
  { id: 'victory-arcade', role: 'command', priority: 3, text: 'The blockade is broken. The frontier is free. Welcome home, pilot.' },
  { id: 'defeat', role: 'command', priority: 3, text: 'Signal lost. Squadron, we have lost a pilot. Regroup at Helios Ring.' },
  { id: 'hull-critical', role: 'computer', priority: 3, text: 'Hull integrity critical.' },
  { id: 'shields-down', role: 'computer', priority: 2, text: 'Shields down.' },
  { id: 'low-energy', role: 'computer', priority: 1, text: 'Engine energy low.' },
  { id: 'torpedo-empty', role: 'computer', priority: 1, text: 'Torpedo bays empty.' },
  { id: 'torpedo-away', role: 'computer', priority: 1, text: 'Torpedo away.' },
  { id: 'target-locked', role: 'computer', priority: 1, text: 'Target locked.' },
  { id: 'autopilot-on', role: 'computer', priority: 1, text: 'Autopilot engaged.' },
  { id: 'autocombat-on', role: 'computer', priority: 1, text: 'Combat assist online.' },
  { id: 'manual-control', role: 'computer', priority: 1, text: 'Manual control.' },
  { id: 'upgrade-hull', role: 'computer', priority: 2, text: 'Hull plating upgraded.' },
  { id: 'upgrade-defense', role: 'computer', priority: 2, text: 'Deflector grid upgraded.' },
  { id: 'upgrade-attack', role: 'computer', priority: 2, text: 'Weapons upgraded.' },
  { id: 'pickup-overcharge', role: 'computer', priority: 1, text: 'Weapon overcharge active.' },
  { id: 'pickup-aegis', role: 'computer', priority: 1, text: 'Aegis overshield online.' },
  { id: 'pickup-torpedo', role: 'computer', priority: 1, text: 'Torpedoes restocked.' },
  { id: 'salvage', role: 'wingman', priority: 1, text: 'Salvage pod! Grab it!' },
  { id: 'stealth-alarm', role: 'computer', priority: 3, text: 'Alarm raised. The sensor net has detected you.' },
  { id: 'stealth-warning', role: 'computer', priority: 2, text: 'Detection rising. Reduce speed.' },
  { id: 'scan-slow', role: 'computer', priority: 1, text: 'Too fast to scan. Cut your throttle.' },
  { id: 'asset-low', role: 'wingman', priority: 3, text: 'The tender is taking heavy fire! Protect it!' },
  { id: 'raid-inbound', role: 'wingman', priority: 2, text: 'More raiders inbound!' },
  { id: 'ace-engages', role: 'wingman', priority: 2, text: 'Ace on your six! Watch yourself!' },
  { id: 'stage-complete', role: 'command', priority: 2, text: 'Objective complete. Proceed to the next waypoint.' },
  { id: 'chapter-success', role: 'command', priority: 3, text: 'Chapter complete. Outstanding work, pilot.' },
  { id: 'chapter-failed', role: 'command', priority: 3, text: 'Mission failed. Regroup, and try again.' },
];

for (const chapter of CHAPTERS) {
  lines.push({ id: `ch${chapter.number}-brief`, role: 'command', priority: 3, text: `Chapter ${chapter.number}. ${chapter.title}. ${chapter.briefing.join(' ')}` });
  lines.push({ id: `ch${chapter.number}-debrief`, role: 'command', priority: 3, text: chapter.debrief });
}

export const VOICE_LINES: readonly VoiceLine[] = lines;
export const VOICE_LINE_BY_ID: ReadonlyMap<string, VoiceLine> = new Map(lines.map((line) => [line.id, line]));
