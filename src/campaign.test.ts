import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAPTERS,
  FINAL_CHAPTER_NUMBER,
  completeChapter,
  createChapterRun,
  createEmptyProgress,
  createStageTracker,
  decodeProgress,
  describeObjectiveHud,
  encodeProgress,
  fitPointsToBounds,
  getChapter,
  getChapterByNumber,
  getChapterRank,
  isChapterUnlocked,
  layoutPoints,
  loadProgress,
  saveProgress,
  type ChapterDef,
  type ChapterSnapshot,
  type StageDef,
  type Vec3,
} from './campaign.ts';

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(vec: Vec3): Vec3 {
  const length = Math.hypot(vec.x, vec.y, vec.z);
  return length > 0 ? { x: vec.x / length, y: vec.y / length, z: vec.z / length } : { x: 0, y: 0, z: 1 };
}

const anchor: Vec3 = { x: 0, y: 0, z: 0 };
const forward: Vec3 = { x: 0, y: 0, z: 1 };

test('chapter table integrity and lookup helpers stay coherent', () => {
  assert.equal(CHAPTERS.length, 7);
  assert.equal(FINAL_CHAPTER_NUMBER, 7);
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.id), ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7']);
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.difficulty), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(CHAPTERS.map((chapter) => chapter.id)).size, CHAPTERS.length);

  const objectiveKinds = new Set(CHAPTERS.flatMap((chapter) => chapter.stages.map((stage) => stage.kind)));
  assert.equal(objectiveKinds.size, 8);
  assert.deepEqual(CHAPTERS[1].stages.map((stage) => stage.kind), ['scan', 'stealth']);
  assert.equal(CHAPTERS.at(-1)?.stages.at(-1)?.kind, 'boss');

  for (let index = 1; index < CHAPTERS.length; index += 1) {
    const previous = CHAPTERS[index - 1].environment.hostileScale;
    const current = CHAPTERS[index].environment.hostileScale;
    assert.ok(current.count >= previous.count, `count scaling ${index}`);
    assert.ok(current.damage >= previous.damage, `damage scaling ${index}`);
    assert.ok(current.durability >= previous.durability, `durability scaling ${index}`);
  }

  for (const chapter of CHAPTERS) {
    assert.ok(chapter.briefing.length >= 2);
    assert.ok(chapter.parTimeSec > 0);
    assert.equal(getChapter(chapter.id)?.title, chapter.title);
    assert.equal(getChapterByNumber(chapter.number)?.id, chapter.id);
  }
});

test('layoutPoints is deterministic, keeps scatter separation, and marches chains forward', () => {
  const scatterA = layoutPoints(anchor, forward, 5, 90, 17, { minSeparation: 30 });
  const scatterB = layoutPoints(anchor, forward, 5, 90, 17, { minSeparation: 30 });
  assert.deepEqual(scatterA, scatterB);

  for (let i = 0; i < scatterA.length; i += 1) {
    assert.ok(dot(scatterA[i], normalize(forward)) >= -1e-6, 'scatter stays ahead of the anchor');
    for (let j = i + 1; j < scatterA.length; j += 1) {
      assert.ok(distance(scatterA[i], scatterA[j]) >= 30 - 1e-6);
    }
  }

  const chain = layoutPoints(anchor, { x: 0.2, y: 0.1, z: 1 }, 4, 100, 23, { chain: true, minSeparation: 40 });
  const dir = normalize({ x: 0.2, y: 0.1, z: 1 });
  for (let index = 1; index < chain.length; index += 1) {
    const delta = {
      x: chain[index].x - chain[index - 1].x,
      y: chain[index].y - chain[index - 1].y,
      z: chain[index].z - chain[index - 1].z,
    };
    assert.ok(dot(delta, dir) > 45, `chain step ${index} should progress forward`);
    assert.ok(distance(chain[index], chain[index - 1]) >= 40);
  }
});

test('eliminate tracker counts only player combat kills and freezes after completion', () => {
  const stage: StageDef = {
    kind: 'eliminate',
    label: 'Break the patrol',
    roster: ['fighter', 'interceptor', 'shuttle'],
    bonusRoster: ['freighter'],
  };
  const tracker = createStageTracker(stage, { anchor, forward, seed: 1 });

  tracker.apply({ type: 'kill', shipClass: 'shuttle', byPlayer: true });
  tracker.apply({ type: 'kill', shipClass: 'fighter', byPlayer: false });
  assert.equal(tracker.snapshot().progressText, 'HOSTILES 0/2');

  tracker.apply({ type: 'kill', shipClass: 'fighter', byPlayer: true });
  assert.equal(tracker.snapshot().progressText, 'HOSTILES 1/2');
  tracker.apply({ type: 'kill', shipClass: 'interceptor', byPlayer: true });
  assert.equal(tracker.snapshot().status, 'complete');

  tracker.apply({ type: 'kill', shipClass: 'bomber', byPlayer: true });
  assert.equal(tracker.snapshot().counters.destroyed, 2);
});

test('scan tracker handles progress, decay, speed limits, and ambush scheduling once', () => {
  const stage: StageDef = {
    kind: 'scan',
    label: 'Read the chain',
    beacons: 2,
    scanSeconds: 10,
    scanRadius: 8,
    maxScanSpeed: 20,
    spread: 120,
    ambushes: [
      { atSec: 0, roster: ['fighter'] },
      { atSec: 5, roster: ['bomber'] },
    ],
  };
  const tracker = createStageTracker(stage, { anchor, forward, seed: 2 });
  const beacon = tracker.points[0];

  tracker.apply({ type: 'tick', dt: 5, playerPos: beacon, playerSpeed: 15 });
  assert.equal(tracker.snapshot().progressText, 'BEACON 1/2 · SCANNING 50%');

  tracker.apply({ type: 'tick', dt: 2, playerPos: beacon, playerSpeed: 30 });
  assert.equal(tracker.snapshot().progressText, 'BEACON 1/2 · SLOW DOWN TO SCAN · 40%');

  tracker.apply({ type: 'tick', dt: 6, playerPos: beacon, playerSpeed: 10 });
  assert.equal(tracker.snapshot().counters.scanned, 1);
  assert.deepEqual(tracker.consumeRaids().map((raid) => raid.roster), [['fighter']]);
  assert.deepEqual(tracker.consumeRaids(), []);

  tracker.apply({ type: 'tick', dt: 4, playerPos: tracker.points[1], playerSpeed: 10 });
  assert.deepEqual(tracker.consumeRaids(), []);
  tracker.apply({ type: 'tick', dt: 1, playerPos: tracker.points[1], playerSpeed: 10 });
  assert.deepEqual(tracker.consumeRaids().map((raid) => raid.roster), [['bomber']]);

  tracker.apply({ type: 'tick', dt: 10, playerPos: tracker.points[1], playerSpeed: 10 });
  assert.equal(tracker.snapshot().status, 'complete');
  tracker.apply({ type: 'tick', dt: 10, playerPos: tracker.points[1], playerSpeed: 10 });
  assert.equal(tracker.snapshot().counters.scanned, 2);
});

test('stealth tracker is deterministic, escalates detection with noise, decays in the clear, and replays alarm raids', () => {
  const stage: StageDef = {
    kind: 'stealth',
    label: 'Slip the net',
    sensors: 3,
    sensorRange: 120,
    targetRadius: 14,
    spread: 80,
    maxAlarms: 2,
    quietSpeed: 12,
    alarmRaid: [{ atSec: 0, roster: ['interceptor', 'fighter'] }],
  };
  const trackerA = createStageTracker(stage, { anchor, forward, seed: 21 });
  const trackerB = createStageTracker(stage, { anchor, forward, seed: 21 });
  assert.deepEqual(trackerA.points, trackerB.points);
  assert.equal(trackerA.points.length, 4);

  const sensorA = trackerA.points[0];
  const silent = createStageTracker(stage, { anchor, forward, seed: 21 });
  const loud = createStageTracker(stage, { anchor, forward, seed: 21 });
  silent.apply({ type: 'tick', dt: 1, playerPos: sensorA, playerSpeed: 10 });
  loud.apply({ type: 'tick', dt: 1, playerPos: sensorA, playerSpeed: 30, boosting: true, firing: true });
  assert.ok((loud.snapshot().detection ?? 0) > (silent.snapshot().detection ?? 0));
  assert.match(loud.snapshot().progressText, /EXPOSED/);

  const clearDetection = silent.snapshot().detection ?? 0;
  silent.apply({ type: 'tick', dt: 1, playerPos: { x: 10_000, y: 0, z: 10_000 }, playerSpeed: 0 });
  assert.ok((silent.snapshot().detection ?? 0) < clearDetection);

  const multi = createStageTracker(stage, { anchor, forward, seed: 21 });
  const sensorB = multi.points[1];
  const midpoint = {
    x: (sensorA.x + sensorB.x) / 2,
    y: (sensorA.y + sensorB.y) / 2,
    z: (sensorA.z + sensorB.z) / 2,
  };
  multi.apply({ type: 'tick', dt: 1, playerPos: midpoint, playerSpeed: 10 });
  assert.ok((multi.snapshot().counters.sensorsInRange ?? 0) >= 2);

  const alarms = createStageTracker(stage, { anchor, forward, seed: 21 });
  alarms.apply({ type: 'tick', dt: 2, playerPos: sensorA, playerSpeed: 36, boosting: true, firing: true });
  assert.equal(alarms.snapshot().counters.alarms, 1);
  assert.deepEqual(alarms.consumeRaids().map((raid) => raid.roster), [['interceptor', 'fighter']]);
  assert.deepEqual(alarms.consumeRaids(), []);

  alarms.apply({ type: 'tick', dt: 2, playerPos: sensorA, playerSpeed: 36, boosting: true, firing: true });
  assert.equal(alarms.snapshot().counters.alarms, 2);
  assert.deepEqual(alarms.consumeRaids().map((raid) => raid.roster), [['interceptor', 'fighter']]);
});

test('stealth tracker fails after too many alarms, requires target dwell, and freezes after terminal states', () => {
  const failStage: StageDef = {
    kind: 'stealth',
    label: 'Tripwire',
    sensors: 2,
    sensorRange: 120,
    targetRadius: 12,
    spread: 80,
    maxAlarms: 1,
    quietSpeed: 12,
    alarmRaid: [{ atSec: 0, roster: ['fighter', 'fighter'] }],
  };
  const failed = createStageTracker(failStage, { anchor, forward, seed: 22 });
  const failSensor = failed.points[0];
  failed.apply({ type: 'tick', dt: 2, playerPos: failSensor, playerSpeed: 36, boosting: true, firing: true });
  assert.equal(failed.snapshot().status, 'active');
  failed.apply({ type: 'tick', dt: 2, playerPos: failSensor, playerSpeed: 36, boosting: true, firing: true });
  const failedSnapshot = failed.snapshot();
  assert.equal(failedSnapshot.status, 'failed');
  assert.equal(failedSnapshot.failReason, 'INFILTRATION COMPROMISED');
  const failedDetection = failedSnapshot.detection;
  failed.apply({ type: 'tick', dt: 3, playerPos: failed.points.at(-1) ?? anchor, playerSpeed: 0 });
  assert.equal(failed.snapshot().status, 'failed');
  assert.equal(failed.snapshot().detection, failedDetection);

  const completeStage: StageDef = {
    kind: 'stealth',
    label: 'Ghost entry',
    sensors: 1,
    sensorRange: 30,
    targetRadius: 15,
    spread: 110,
    maxAlarms: 1,
    quietSpeed: 12,
    alarmRaid: [{ atSec: 0, roster: ['interceptor'] }],
  };
  const complete = createStageTracker(completeStage, { anchor, forward, seed: 23 });
  const target = complete.points.at(-1) ?? anchor;
  complete.apply({ type: 'tick', dt: 2.4, playerPos: target, playerSpeed: 0 });
  assert.equal(complete.snapshot().status, 'active');
  assert.match(complete.snapshot().progressText, /LISTENING POST LINK 96%/);
  complete.apply({ type: 'tick', dt: 0.2, playerPos: target, playerSpeed: 0 });
  assert.equal(complete.snapshot().status, 'complete');
  const completeDetection = complete.snapshot().detection;
  complete.apply({ type: 'tick', dt: 2, playerPos: complete.points[0], playerSpeed: 40, boosting: true, firing: true });
  assert.equal(complete.snapshot().status, 'complete');
  assert.equal(complete.snapshot().detection, completeDetection);
});

test('retrieve tracker ignores duplicate pickups, selects nearest target, and opens the gate', () => {
  const stage: StageDef = {
    kind: 'retrieve',
    label: 'Sweep the wreck field',
    artefacts: 3,
    pickupRadius: 6,
    spread: 100,
    gateRadius: 12,
    gateDistance: 220,
    raids: [
      { atSec: 0, roster: ['fighter'] },
      { atSec: 4, roster: ['interceptor'] },
    ],
  };
  const tracker = createStageTracker(stage, { anchor, forward, seed: 3 });
  assert.equal(tracker.points.length, 4);

  tracker.apply({ type: 'tick', dt: 0, playerPos: tracker.points[1], playerSpeed: 0 });
  assert.equal(tracker.snapshot().focusIndex, 1);

  tracker.apply({ type: 'pickup', index: 1 });
  tracker.apply({ type: 'pickup', index: 1 });
  assert.equal(tracker.snapshot().counters.collected, 1);
  assert.deepEqual(tracker.consumeRaids().map((raid) => raid.roster), [['fighter']]);

  tracker.apply({ type: 'tick', dt: 4, playerPos: tracker.points[0], playerSpeed: 0 });
  assert.deepEqual(tracker.consumeRaids().map((raid) => raid.roster), [['interceptor']]);

  tracker.apply({ type: 'pickup', index: 0 });
  tracker.apply({ type: 'pickup', index: 99 });
  tracker.apply({ type: 'pickup', index: 2 });
  assert.equal(tracker.snapshot().focusIndex, 3);
  assert.equal(tracker.snapshot().progressText, 'CORES 3/3 · REACH GATE');

  tracker.apply({ type: 'tick', dt: 1, playerPos: tracker.points[3], playerSpeed: 0 });
  assert.equal(tracker.snapshot().status, 'complete');
  tracker.apply({ type: 'pickup', index: 2 });
  assert.equal(tracker.snapshot().counters.collected, 3);
});

test('defend tracker exposes hull and time, emits waves once, and fails immutably', () => {
  const stage: StageDef = {
    kind: 'defend',
    label: 'Hold the relay',
    durationSec: 20,
    assetHull: 100,
    assetName: 'Relay Barge',
    assetSpeed: 0,
    raids: [
      { atSec: 0, roster: ['fighter'] },
      { atSec: 5, roster: ['bomber'] },
      { atSec: 19, roster: ['destroyer'] },
    ],
  };
  const tracker = createStageTracker(stage, { anchor, forward, seed: 4 });
  assert.deepEqual(tracker.consumeRaids().map((raid) => raid.roster), [['fighter']]);

  tracker.apply({ type: 'tick', dt: 4, playerPos: anchor, playerSpeed: 0 });
  tracker.apply({ type: 'assetDamaged', amount: 30 });
  tracker.apply({ type: 'assetPosition', pos: { x: 10, y: 0, z: 0 } });
  const snapshot = tracker.snapshot();
  assert.deepEqual(snapshot.assetHull, { current: 70, max: 100 });
  assert.equal(snapshot.timeRemainingSec, 16);
  assert.equal(snapshot.counters.assetX, 10);

  tracker.apply({ type: 'tick', dt: 1, playerPos: anchor, playerSpeed: 0 });
  assert.deepEqual(tracker.consumeRaids().map((raid) => raid.roster), [['bomber']]);

  tracker.apply({ type: 'assetDamaged', amount: 99 });
  assert.equal(tracker.snapshot().status, 'failed');
  assert.match(tracker.snapshot().failReason ?? '', /RELAY BARGE DESTROYED/);

  tracker.apply({ type: 'tick', dt: 20, playerPos: anchor, playerSpeed: 0 });
  assert.equal(tracker.snapshot().timeRemainingSec, 15);
  assert.deepEqual(tracker.consumeRaids(), []);
});

test('navigate tracker advances through ordered gates and fails on time expiry', () => {
  const stage: StageDef = {
    kind: 'navigate',
    label: 'Run the storm',
    gates: 3,
    gateRadius: 10,
    spacing: 90,
    timeLimitSec: 15,
  };
  const tracker = createStageTracker(stage, { anchor, forward, seed: 5 });

  tracker.apply({ type: 'tick', dt: 1, playerPos: tracker.points[0], playerSpeed: 30 });
  assert.equal(tracker.snapshot().counters.passed, 1);
  assert.equal(tracker.snapshot().focusIndex, 1);

  tracker.apply({ type: 'tick', dt: 1, playerPos: tracker.points[1], playerSpeed: 30 });
  assert.equal(tracker.snapshot().counters.passed, 2);

  tracker.apply({ type: 'tick', dt: 13, playerPos: anchor, playerSpeed: 30 });
  assert.equal(tracker.snapshot().status, 'failed');
  assert.equal(tracker.snapshot().progressText, 'TIME EXPIRED');

  tracker.apply({ type: 'tick', dt: 1, playerPos: tracker.points[2], playerSpeed: 30 });
  assert.equal(tracker.snapshot().counters.passed, 2);
});

test('hunt tracker tracks named aces separately from escort kills', () => {
  const stage: StageDef = {
    kind: 'hunt',
    label: 'Break the elite screen',
    aces: [
      { id: 'ace-a', callsign: 'Rime Coil', shipClass: 'fighter', durabilityMultiplier: 1.2, damageMultiplier: 1.1 },
      { id: 'ace-b', callsign: 'Cinder Arc', shipClass: 'interceptor', durabilityMultiplier: 1.3, damageMultiplier: 1.2 },
    ],
    escort: ['fighter', 'shuttle', 'bomber'],
  };
  const tracker = createStageTracker(stage, { anchor, forward, seed: 6 });

  tracker.apply({ type: 'kill', shipClass: 'fighter', tag: 'ace-a', byPlayer: false });
  tracker.apply({ type: 'kill', shipClass: 'fighter', byPlayer: true });
  tracker.apply({ type: 'kill', shipClass: 'bomber', byPlayer: true });
  tracker.apply({ type: 'kill', shipClass: 'fighter', tag: 'unknown', byPlayer: true });
  assert.equal(tracker.snapshot().progressText, 'ACES 1/2 · ESCORT 2/2');

  tracker.apply({ type: 'kill', shipClass: 'interceptor', tag: 'ace-b', byPlayer: true });
  assert.equal(tracker.snapshot().status, 'complete');

  tracker.apply({ type: 'kill', shipClass: 'destroyer', byPlayer: true });
  assert.equal(tracker.snapshot().counters.aces, 2);
  assert.equal(tracker.snapshot().counters.escort, 2);
});

test('boss tracker completes only on bossDefeated and then freezes', () => {
  const tracker = createStageTracker(
    {
      kind: 'boss',
      label: 'Face the carrier',
      bossName: 'The Leviathan',
    },
    { anchor, forward, seed: 7 },
  );

  assert.equal(tracker.snapshot().status, 'active');
  tracker.apply({ type: 'tick', dt: 10, playerPos: anchor, playerSpeed: 0 });
  assert.equal(tracker.snapshot().status, 'active');
  tracker.apply({ type: 'bossDefeated' });
  assert.equal(tracker.snapshot().status, 'complete');
  tracker.apply({ type: 'bossDefeated' });
  assert.equal(tracker.snapshot().fraction, 1);
});

test('chapter runs sequence stages, preserve elapsed time, and buffer raids across transitions', () => {
  const chapter: ChapterDef = {
    id: 'sim',
    number: 77,
    title: 'Simulator',
    codename: 'Chain Test',
    homage: 'Synthetic mission for sequencing coverage.',
    briefing: ['Line one.', 'Line two.'],
    debrief: 'Done.',
    difficulty: 1,
    parTimeSec: 30,
    environment: {
      asteroids: 0,
      asteroidSpeed: 0,
      environmentSpeed: 0,
      hostileScale: { count: 1, damage: 1, durability: 1 },
    },
    stages: [
      { kind: 'eliminate', label: 'Clear', roster: ['fighter'] },
      {
        kind: 'defend',
        label: 'Hold',
        durationSec: 5,
        assetHull: 40,
        assetName: 'Node',
        assetSpeed: 0,
        raids: [{ atSec: 0, roster: ['fighter'] }],
      },
      { kind: 'boss', label: 'Finish', bossName: 'Mirror Gate' },
    ],
    reward: { label: 'Test reward', score: 1, upgrade: 'hull' },
  };
  const run = createChapterRun(chapter, { anchor, forward, seed: 9 });
  assert.equal(run.stageIndex, 0);

  run.apply({ type: 'kill', shipClass: 'fighter', byPlayer: true });
  assert.equal(run.stageIndex, 1);
  assert.deepEqual(run.consumeRaids().map((raid) => raid.roster), [['fighter']]);

  run.apply({ type: 'tick', dt: 2, playerPos: anchor, playerSpeed: 0 });
  run.apply({ type: 'tick', dt: 3, playerPos: anchor, playerSpeed: 0 });
  assert.equal(run.stageIndex, 2);
  assert.equal(run.snapshot().elapsedSec, 5);
  assert.equal(run.snapshot().overallFraction, 2 / 3);

  run.apply({ type: 'bossDefeated' });
  assert.equal(run.snapshot().status, 'complete');
  assert.equal(run.snapshot().overallFraction, 1);
});

test('HUD description uses chapter metadata and marks urgent objectives', () => {
  const scanRun = createChapterRun(CHAPTERS[1], { anchor, forward, seed: 11 });
  scanRun.apply({ type: 'tick', dt: 1, playerPos: scanRun.currentTracker.points[0], playerSpeed: 99 });
  const scanHud = describeObjectiveHud(scanRun.snapshot());
  assert.match(scanHud.title, /^CH 2 · SILENT CHOIR — STAGE 1\/2$/);
  assert.equal(scanHud.urgent, true);

  const stealthUrgent: ChapterSnapshot = {
    chapterId: 'ch2',
    status: 'active',
    stageIndex: 1,
    stageCount: 2,
    elapsedSec: 120,
    overallFraction: 0.75,
    stage: {
      kind: 'stealth',
      label: 'Slip the net',
      status: 'active',
      fraction: 0.75,
      progressText: 'EXPOSED — SLOW DOWN, NO BOOST/FIRE · DETECTION 82% · ALARMS 1/1',
      hint: 'CREEP TO THE LISTENING POST',
      focusIndex: 5,
      timeRemainingSec: null,
      detection: 0.82,
      counters: { alarms: 1, sensorsInRange: 2 },
    },
  };
  assert.equal(describeObjectiveHud(stealthUrgent).urgent, true);

  const urgentSnapshot: ChapterSnapshot = {
    chapterId: 'ch4',
    status: 'active',
    stageIndex: 0,
    stageCount: 1,
    elapsedSec: 170,
    overallFraction: 0.9,
    stage: {
      kind: 'defend',
      label: 'Hold',
      status: 'active',
      fraction: 0.9,
      progressText: 'HEARTHLIGHT 25% · HOLD 10s',
      hint: 'Protect it.',
      focusIndex: null,
      timeRemainingSec: 10,
      assetHull: { current: 25, max: 100 },
      counters: {},
    },
  };
  assert.equal(describeObjectiveHud(urgentSnapshot).urgent, true);
});

test('chapter ranking thresholds separate S, A, B, and C clears', () => {
  const chapter = CHAPTERS[2];
  assert.equal(getChapterRank(chapter, { timeSec: chapter.parTimeSec, damageTaken: 10, maxDurability: 200, accuracy: 0.7 }), 'S');
  assert.equal(getChapterRank(chapter, { timeSec: chapter.parTimeSec * 1.1, damageTaken: 35, maxDurability: 200, accuracy: 0.5 }), 'A');
  assert.equal(getChapterRank(chapter, { timeSec: chapter.parTimeSec * 1.3, damageTaken: 90, maxDurability: 200, accuracy: 0.46 }), 'B');
  assert.equal(getChapterRank(chapter, { timeSec: chapter.parTimeSec * 1.8, damageTaken: 150, maxDurability: 200, accuracy: 0.2 }), 'C');
});

test('completeChapter grants first-clear rewards once and only improves stored bests', () => {
  const chapter = CHAPTERS[0];
  const empty = createEmptyProgress();
  const first = completeChapter(empty, chapter, {
    timeSec: chapter.parTimeSec * 1.4,
    damageTaken: 130,
    maxDurability: 150,
    accuracy: 0.25,
    score: 250,
  });
  assert.equal(first.firstClear, true);
  assert.equal(first.unlockedNext, true);
  assert.equal(first.rewardGranted?.label, chapter.reward.label);
  assert.equal(first.progress.unlocked, 2);
  assert.equal(isChapterUnlocked(first.progress, 2), true);
  assert.equal(first.progress.completed[chapter.id].bestRank, 'C');

  const second = completeChapter(first.progress, chapter, {
    timeSec: chapter.parTimeSec * 0.95,
    damageTaken: 8,
    maxDurability: 150,
    accuracy: 0.7,
    score: 600,
  });
  assert.equal(second.firstClear, false);
  assert.equal(second.rewardGranted, null);
  assert.equal(second.newRank, true);
  assert.equal(second.newBestTime, true);
  assert.equal(second.progress.completed[chapter.id].bestRank, 'S');
  assert.equal(second.progress.completed[chapter.id].bestScore, 600);
  assert.equal(second.progress.completed[chapter.id].completions, 2);

  const third = completeChapter(second.progress, chapter, {
    timeSec: chapter.parTimeSec * 1.2,
    damageTaken: 40,
    maxDurability: 150,
    accuracy: 0.5,
    score: 300,
  });
  assert.equal(third.newRank, false);
  assert.equal(third.newBestTime, false);
  assert.equal(third.progress.completed[chapter.id].bestRank, 'S');
  assert.equal(third.progress.completed[chapter.id].bestTimeSec, second.progress.completed[chapter.id].bestTimeSec);
  assert.equal(third.progress.rewardsClaimed.filter((id) => id === chapter.id).length, 1);
});

test('progress persistence round-trips and survives corrupt storage', () => {
  const progressed = completeChapter(createEmptyProgress(), CHAPTERS[0], {
    timeSec: 120,
    damageTaken: 10,
    maxDurability: 150,
    accuracy: 0.6,
    score: 500,
  }).progress;
  const encoded = encodeProgress(progressed);
  assert.deepEqual(decodeProgress(encoded), progressed);

  const sanitized = decodeProgress(
    JSON.stringify({
      version: 1,
      unlocked: 99,
      completed: {
        ch1: { bestTimeSec: -5, bestRank: 'Z', bestScore: -3, completions: 0 },
        nope: { bestTimeSec: 5, bestRank: 'S', bestScore: 5, completions: 1 },
      },
      rewardsClaimed: ['ch1', 'nope', 'ch1'],
    }),
  );
  assert.equal(sanitized.unlocked, 7);
  assert.deepEqual(sanitized.completed.ch1, { bestTimeSec: 1, bestRank: 'C', bestScore: 0, completions: 1 });
  assert.deepEqual(sanitized.rewardsClaimed, ['ch1']);

  assert.deepEqual(decodeProgress('{oops'), createEmptyProgress());
  assert.deepEqual(decodeProgress(JSON.stringify({ version: 2 })), createEmptyProgress());

  const storage = {
    data: new Map<string, string>(),
    getItem(key: string) {
      return this.data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.data.set(key, value);
    },
  };
  saveProgress(progressed, storage, 'campaign');
  assert.deepEqual(loadProgress(storage, 'campaign'), progressed);
  assert.deepEqual(loadProgress(undefined, 'campaign'), createEmptyProgress());

  const brokenStorage = {
    getItem() {
      throw new Error('boom');
    },
    setItem() {
      throw new Error('boom');
    },
  };
  assert.deepEqual(loadProgress(brokenStorage, 'campaign'), createEmptyProgress());
  assert.doesNotThrow(() => saveProgress(progressed, brokenStorage, 'campaign'));
});

test('stage layouts shrink to stay inside the play volume', () => {
  const center = { x: 0, y: 0, z: 0 };
  const bounds = { center, radius: 590 };
  for (const chapter of CHAPTERS) {
    chapter.stages.forEach((stage, index) => {
      const tracker = createStageTracker(stage, { anchor: center, forward: { x: 0, y: 0, z: 1 }, seed: 1000 + chapter.number * 77 + index, bounds });
      for (const point of tracker.points) assert.ok(distance(point, center) <= bounds.radius + 1e-6, `ch${chapter.number} stage ${index}`);
    });
  }
  const far = fitPointsToBounds([{ x: 0, y: 0, z: 1000 }], center, bounds);
  assert.ok(Math.abs(far[0].z - 590) < 1e-3);
  const inside = fitPointsToBounds([{ x: 0, y: 0, z: 100 }], center, bounds);
  assert.deepEqual(inside[0], { x: 0, y: 0, z: 100 });
});

test('later stages head back toward the middle when the previous stage ended far out', () => {
  const chapter = getChapterByNumber(2)!;
  const bounds = { center: { x: 0, y: 0, z: 0 }, radius: 590 };
  const run = createChapterRun(chapter, { anchor: bounds.center, forward: { x: 0, y: 0, z: 1 }, seed: 5, bounds });
  const beacons = run.currentTracker.points;
  for (const point of beacons) run.apply({ type: 'tick', dt: 400, playerPos: point, playerSpeed: 0 });
  assert.equal(run.stageIndex, 1);
  for (const point of run.currentTracker.points) assert.ok(distance(point, bounds.center) <= bounds.radius + 1e-6);
});
