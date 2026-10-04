/**
 * Speech to text with the browser's own speech recognition (on the iPad: Apple's, as for
 * keyboard dictation). Cockpit never records or stores audio – it only receives the text.
 * Not every browser (and not every home-screen app) offers it; the keyboard microphone is
 * always the fallback.
 */

/** The part of the (not yet standardised) SpeechRecognition interface Cockpit uses. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  const scope = globalThis as typeof globalThis & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return recognitionClass() !== null;
}

/** Reasons the recognition stopped early; "unavailable" covers blocked or missing service. */
export type SpeechProblem = 'denied' | 'unavailable' | 'noSpeech' | 'network';

function problemOf(code: SpeechRecognitionErrorCode): SpeechProblem | null {
  switch (code) {
    case 'not-allowed':
      return 'denied';
    case 'service-not-allowed':
    case 'audio-capture':
    case 'language-not-supported':
    case 'phrases-not-supported':
      return 'unavailable';
    case 'no-speech':
      return 'noSpeech';
    case 'network':
      return 'network';
    case 'aborted':
      return null;
  }
}

export interface DictationHandlers {
  /** All recognised text so far: final part and the part still being recognised. */
  onText: (final: string, interim: string) => void;
  onProblem: (problem: SpeechProblem) => void;
  /** Recognition ended (stopped by the user, by silence or after a problem). */
  onEnd: () => void;
}

export interface Dictation {
  stop: () => void;
  abort: () => void;
}

/** Starts listening (must be called from a tap). Null when the browser cannot do it. */
export function startDictation(handlers: DictationHandlers, lang = 'de-DE'): Dictation | null {
  const Constructor = recognitionClass();
  if (!Constructor) return null;
  let recognition: Recognition;
  try {
    recognition = new Constructor();
  } catch {
    handlers.onProblem('unavailable');
    handlers.onEnd();
    return null;
  }
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let final = '';
    let interim = '';
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result?.[0]?.transcript ?? '';
      if (result?.isFinal) final += text;
      else interim += text;
    }
    handlers.onText(final.trim(), interim.trim());
  };
  recognition.onerror = (event) => {
    const problem = problemOf(event.error);
    if (problem) handlers.onProblem(problem);
  };
  recognition.onend = () => handlers.onEnd();
  try {
    recognition.start();
  } catch {
    handlers.onProblem('unavailable');
    handlers.onEnd();
    return null;
  }
  return { stop: () => recognition.stop(), abort: () => recognition.abort() };
}
