/**
 * Dictation through the browser's speech recognition, where it exists
 * (Chrome, Edge, Safari). Nothing is sent anywhere by Bower; the browser
 * does the listening. Where it does not exist, the Speak button is hidden.
 */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canDictate = (): boolean => typeof window !== 'undefined' && !!ctor();

/** Starts listening; `onText` gets the words so far; returns a stop function. */
export function dictate(onText: (text: string) => void, onEnd: (error?: string) => void): () => void {
  const C = ctor();
  if (!C) {
    onEnd('unsupported');
    return () => undefined;
  }
  const r = new C();
  r.lang = navigator.language || 'en-GB';
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i]?.[0]?.transcript ?? '';
    onText(t);
  };
  r.onerror = (e) => onEnd(e.error);
  r.onend = () => onEnd();
  r.start();
  return () => r.stop();
}
