let audioModule: any = null;
let audioChecked = false;
let audioAvailable = false;

async function getAudioModule(): Promise<any | null> {
  if (audioChecked) return audioAvailable ? audioModule : null;
  audioChecked = true;
  try {
    // Lazy require so the kiosk keeps working when the native module is
    // unavailable (e.g. Expo Go or an un-rebuilt dev client).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-av');
    audioModule = mod?.Audio ?? null;
    audioAvailable = !!audioModule;
  } catch {
    audioAvailable = false;
    audioModule = null;
  }
  return audioAvailable ? audioModule : null;
}

import { getKioskSoundEffectsEnabled } from './appSettings';

let audioModeReady = false;
let successSound: any = null;
let errorSound: any = null;

async function ensureAudioMode(): Promise<void> {
  const Audio = await getAudioModule();
  if (!Audio || audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    audioModeReady = true;
  } catch {
    // Native module may be unavailable; leave sounds disabled.
    audioAvailable = false;
  }
}

async function loadSounds(): Promise<void> {
  const Audio = await getAudioModule();
  if (!Audio) return;
  await ensureAudioMode();
  if (!audioAvailable) return;

  if (!successSound) {
    try {
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../assets/sounds/success.wav'),
        { shouldPlay: false, volume: 1.0 },
      );
      successSound = sound;
    } catch {
      // Ignore; playback will be skipped.
    }
  }
  if (!errorSound) {
    try {
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../assets/sounds/error.wav'),
        { shouldPlay: false, volume: 1.0 },
      );
      errorSound = sound;
    } catch {
      // Ignore; playback will be skipped.
    }
  }
}

export async function preloadKioskSounds(): Promise<void> {
  await loadSounds();
}

export async function playSuccessSound(): Promise<void> {
  if (!getKioskSoundEffectsEnabled()) return;
  await loadSounds();
  if (!successSound) return;
  try {
    await successSound.setPositionAsync(0);
    await successSound.playAsync();
  } catch {
    // Swallow playback errors so the kiosk flow is never blocked.
  }
}

export async function playErrorSound(): Promise<void> {
  if (!getKioskSoundEffectsEnabled()) return;
  await loadSounds();
  if (!errorSound) return;
  try {
    await errorSound.setPositionAsync(0);
    await errorSound.playAsync();
  } catch {
    // Swallow playback errors so the kiosk flow is never blocked.
  }
}

export async function unloadKioskSounds(): Promise<void> {
  try {
    await successSound?.unloadAsync();
  } catch {
    // ignore
  }
  try {
    await errorSound?.unloadAsync();
  } catch {
    // ignore
  }
  successSound = null;
  errorSound = null;
}
