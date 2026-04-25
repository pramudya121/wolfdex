import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useWolfVoice — thin wrapper over the browser's Web Speech APIs.
 *
 *   • SpeechRecognition (STT) — captures user voice, returns transcript.
 *   • SpeechSynthesis (TTS) — speaks AI replies aloud in the detected
 *     language. Picks a matching voice automatically.
 *
 * No external API keys, no network round-trips, supports ~50+ languages out
 * of the box on modern Chromium / Safari. Falls back gracefully when the
 * browser doesn't support the APIs (returns `supported: false`).
 */

type SR = any;

function getSpeechRecognition(): { ctor: any; supported: boolean } {
  if (typeof window === 'undefined') return { ctor: null, supported: false };
  const w = window as any;
  const ctor = w.SpeechRecognition || w.webkitSpeechRecognition || null;
  return { ctor, supported: !!ctor };
}

/** Best-effort language guess from a chunk of text (BCP-47 like 'id-ID'). */
export function guessLanguage(text: string): string {
  const t = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko-KR';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar-SA';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru-RU';
  if (/[\u0900-\u097f]/.test(text)) return 'hi-IN';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th-TH';
  // Heuristic word matches for common Latin-script langs
  if (/\b(saya|kamu|tolong|harap|silakan|terima kasih|adalah|tidak|jangan)\b/.test(t)) return 'id-ID';
  if (/\b(merci|bonjour|s'il vous plaît|oui|non|je veux)\b/.test(t)) return 'fr-FR';
  if (/\b(hola|gracias|por favor|quiero|necesito)\b/.test(t)) return 'es-ES';
  if (/\b(danke|bitte|hallo|möchte|kaufen|verkaufen)\b/.test(t)) return 'de-DE';
  if (/\b(obrigado|por favor|olá|quero)\b/.test(t)) return 'pt-BR';
  if (/\b(grazie|prego|ciao|voglio)\b/.test(t)) return 'it-IT';
  if (/\b(merhaba|lütfen|teşekkür|istiyorum)\b/.test(t)) return 'tr-TR';
  if (/\b(xin chào|cảm ơn|làm ơn|tôi muốn)\b/.test(t)) return 'vi-VN';
  return 'en-US';
}

export function useWolfVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [voiceOutput, setVoiceOutput] = useState(false); // user-toggle for TTS
  const recRef = useRef<SR | null>(null);
  const { ctor: SRCtor, supported: sttSupported } = getSpeechRecognition();
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Cancel any in-flight TTS when the component unmounts
  useEffect(() => () => {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
    if (ttsSupported) window.speechSynthesis.cancel();
  }, [ttsSupported]);

  /** Start listening. Resolves with the final transcript (may be empty). */
  const startListening = useCallback((lang = 'en-US'): Promise<string> => {
    return new Promise((resolve) => {
      if (!sttSupported) { resolve(''); return; }
      try {
        const rec: SR = new SRCtor();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = false;
        let finalText = '';
        rec.onresult = (e: any) => {
          let interimText = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else interimText += r[0].transcript;
          }
          setInterim(interimText);
        };
        rec.onerror = () => { setListening(false); setInterim(''); resolve(finalText); };
        rec.onend = () => { setListening(false); setInterim(''); resolve(finalText.trim()); };
        recRef.current = rec;
        setListening(true);
        rec.start();
      } catch { setListening(false); resolve(''); }
    });
  }, [SRCtor, sttSupported]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
    setListening(false);
  }, []);

  /** Speak text aloud in the given language (auto-detect if omitted). */
  const speak = useCallback((text: string, lang?: string) => {
    if (!ttsSupported || !text) return;
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*_`>~|]+/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(cleaned.slice(0, 600));
    const detectedLang = lang || guessLanguage(cleaned);
    u.lang = detectedLang;
    u.rate = 1.02;
    u.pitch = 1.0;
    // Pick the best matching voice
    const voices = synth.getVoices();
    const langPrefix = detectedLang.split('-')[0];
    const match = voices.find(v => v.lang === detectedLang)
      || voices.find(v => v.lang.startsWith(langPrefix))
      || voices.find(v => v.default);
    if (match) u.voice = match;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
  }, [ttsSupported]);

  const stopSpeaking = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  return {
    sttSupported, ttsSupported,
    listening, interim,
    speaking,
    voiceOutput, setVoiceOutput,
    startListening, stopListening,
    speak, stopSpeaking,
  };
}
