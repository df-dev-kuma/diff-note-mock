import { config } from '../config.ts';
import { traces } from '../gemini.ts';

/**
 * #6 音声メモの読み取り（前半）: Google Cloud Speech-to-Text で文字起こしする。
 * GCP の API キー（GOOGLE_CLOUD_API_KEY）が必要。AI Studio のキーでは呼べないので、
 * 検証時は文字起こし済みのテキストを渡して #1 以降だけを試す。
 *
 * 後半（#1 と同じ形にする）は pipeline 側で extractFromText を使う。
 */
export async function transcribe(audio: { data: string; encoding?: string; sampleRateHertz?: number }): Promise<string> {
  if (!config.gcpApiKey) {
    throw new Error('Speech-to-Text には GOOGLE_CLOUD_API_KEY が必要です（検証時は transcript を直接渡してください）');
  }
  const started = performance.now();
  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(config.gcpApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        languageCode: config.sttLanguage,
        enableAutomaticPunctuation: true,
        ...(audio.encoding ? { encoding: audio.encoding } : {}),
        ...(audio.sampleRateHertz ? { sampleRateHertz: audio.sampleRateHertz } : {}),
      },
      audio: { content: audio.data },
    }),
  });
  traces.push({ step: '#6 文字起こし', ms: Math.round(performance.now() - started), model: 'speech-to-text v1' });
  if (!res.ok) throw new Error(`Speech-to-Text エラー ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { results?: { alternatives?: { transcript?: string }[] }[] };
  return (body.results ?? []).map((r) => r.alternatives?.[0]?.transcript ?? '').join('');
}
