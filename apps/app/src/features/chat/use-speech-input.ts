import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  resolveSpeechRecognitionLocale,
  translateRuntimeMessage,
} from "@yinjie/i18n";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";
import { transcribeSpeechInput } from "./api/transcriptions";
import type {
  BrowserSpeechRecognition,
  BrowserSpeechRecognitionConstructor,
  BrowserSpeechRecognitionErrorEvent,
  BrowserSpeechRecognitionEvent,
  SpeechInputEngine,
  SpeechInputStatus,
} from "./speech-input-types";

type UseSpeechInputOptions = {
  baseUrl?: string;
  conversationId: string;
  characterId?: string;
  enabled: boolean;
  language?: string;
  mode?: "dictation" | "voice";
  /**
   * 走查新一轮 R3（perf 中）：默认 true 与 chat-composer 长按语音"已录制 0:03"
   * 元数据兼容。三套 voice-call session hook 不消费 displayText（VAD 的指示环
   * 已经实时反映音量），传 false 跳过 4Hz setInterval，免得每次 recording 阶段
   * 拖着 1000+ 行的通话屏父组件每秒重渲染 4 次。
   */
  trackElapsed?: boolean;
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

type RecordedSpeechAudio = {
  blob: Blob;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs: number;
};

type WebAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function getRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (window.SpeechRecognition ??
    window.webkitSpeechRecognition ??
    null) as BrowserSpeechRecognitionConstructor | null;
}

function getSupportedRecordingMimeType() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  return candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );
}

function isNativeModelAudioMimeType(mimeType?: string) {
  const normalized = mimeType?.toLowerCase() ?? "";
  return (
    normalized.includes("audio/wav") ||
    normalized.includes("audio/wave") ||
    normalized.includes("audio/x-wav") ||
    normalized.includes("audio/mpeg") ||
    normalized.includes("audio/mp3")
  );
}

async function prepareVoiceMessageAudioBlob(blob: Blob) {
  if (isNativeModelAudioMimeType(blob.type)) {
    return blob;
  }

  const wavBlob = await convertAudioBlobToWav(blob);
  return wavBlob?.size ? wavBlob : blob;
}

async function convertAudioBlobToWav(blob: Blob): Promise<Blob | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const audioWindow = window as WebAudioWindow;
  const AudioContextConstructor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  const audioContext = new AudioContextConstructor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(
      await blob.arrayBuffer(),
    );
    return encodeAudioBufferToWav(audioBuffer);
  } catch {
    return null;
  } finally {
    void audioContext.close().catch(() => undefined);
  }
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer) {
  const channelCount = Math.max(
    1,
    Math.min(2, audioBuffer.numberOfChannels),
  );
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = audioBuffer.sampleRate * blockAlign;
  const dataSize = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, audioBuffer.sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channelData = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  for (let frame = 0; frame < audioBuffer.length; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function mapRecognitionError(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        message: resolveMicrophonePermissionDeniedCopy(),
        permissionDenied: true,
      };
    case "no-speech":
      return {
        message: translateRuntimeMessage(msg`没有听到有效语音，请再说一遍。`),
        permissionDenied: false,
      };
    case "audio-capture":
      return {
        message: translateRuntimeMessage(msg`当前设备无法采集麦克风音频。`),
        permissionDenied: false,
      };
    case "network":
      return {
        message: isNativeMobileRuntime()
          ? translateRuntimeMessage(msg`语音识别网络异常，已可改用录音转写。`)
          : translateRuntimeMessage(
              msg`浏览器语音识别网络异常，已可改用录音转写。`,
            ),
        permissionDenied: false,
      };
    default:
      return {
        message: translateRuntimeMessage(msg`语音识别中断了，请重试。`),
        permissionDenied: false,
      };
  }
}

function mergeInputText(currentValue: string, nextText: string) {
  const trimmedNextText = nextText.trim();
  if (!trimmedNextText) {
    return currentValue;
  }

  if (!currentValue.trim()) {
    return trimmedNextText;
  }

  return `${currentValue.trimEnd()} ${trimmedNextText}`;
}

export function useSpeechInput({
  baseUrl,
  conversationId,
  characterId,
  enabled,
  language,
  mode = "dictation",
  trackElapsed = true,
}: UseSpeechInputOptions) {
  const [status, setStatus] = useState<SpeechInputStatus>("idle");
  const [engine, setEngine] = useState<SpeechInputEngine>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [recordedAudio, setRecordedAudio] =
    useState<RecordedSpeechAudio | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStartRequestIdRef = useRef(0);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const shouldUploadRecordingRef = useRef(true);
  const recognitionFinalTextRef = useRef("");
  const recognitionActiveRef = useRef(false);
  const recognitionConstructor = getRecognitionConstructor();
  const canUseBrowserRecognition =
    enabled && mode === "dictation" && Boolean(recognitionConstructor);
  const canUseMediaRecorder =
    enabled &&
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const supported =
    mode === "voice"
      ? canUseMediaRecorder
      : canUseBrowserRecognition || canUseMediaRecorder;
  const displayText =
    mode === "voice"
      ? resolveVoiceDisplayText(status, recordingElapsedMs, recordedAudio)
      : transcript || interimTranscript;

  const resetState = () => {
    setTranscript("");
    setInterimTranscript("");
    setRecordedAudio(null);
    setRecordingElapsedMs(0);
    setError(null);
    setPermissionDenied(false);
    setEngine(null);
    setStatus("idle");
    recognitionFinalTextRef.current = "";
    recordingStartedAtRef.current = null;
  };

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const cancel = useEffectEvent(() => {
    mediaStartRequestIdRef.current += 1;
    shouldUploadRecordingRef.current = false;

    if (recognitionRef.current) {
      recognitionActiveRef.current = false;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    // 走查新一轮 R5：原版 if/else——recorder 活跃时只 stop()，预期 onstop
    // 异步触发 stopMediaTracks() 把 MediaStream 关掉。但 cancel 自己刚把
    // mediaStartRequestIdRef.current 自增过一次，onstop 进入后 requestId 不匹配
    // 直接 return（line 480）→ stopMediaTracks 从不跑 → MediaStream tracks
    // 残留活跃 → 麦克风硬件灯继续亮、系统隐私指示器持续显示 mic in use，要等
    // 下一次 start()（覆盖 mediaStreamRef）后才靠 GC 间接关闭硬件。voice-call
    // 通话 cancel 频繁（每个 leaving / hidden / 切换 character 都触发），用户
    // 体感"挂断后麦克风灯还亮 10 秒"。
    // 改：cancel 内无条件 stopMediaTracks()。recorder.stop() 触发的 onstop 仍
    // 会 stale-return；正常 speech.stop() 路径下 onstop 走完后再 stopMediaTracks
    // 是对已经停止的 track 二次 stop，浏览器 spec 规定 idempotent，无副作用。
    stopMediaTracks();

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    resetState();
  });

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  useEffect(() => {
    // 走查新一轮 R3：voice-call 三套 session hook 传 trackElapsed=false 跳过这个
    // 4Hz setInterval —— 它们不消费 displayText（VAD 指示环已经实时反映音量），
    // 4Hz setState 只会拖着大体量通话屏父组件每秒多重渲染 4 次。chat-composer
    // 默认 trackElapsed=true 保留"已录制 0:03"文字。
    if (mode !== "voice" || status !== "listening" || !trackElapsed) {
      return;
    }

    const tick = () => {
      const startedAt = recordingStartedAtRef.current;
      if (!startedAt) {
        return;
      }

      setRecordingElapsedMs(Date.now() - startedAt);
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [mode, status, trackElapsed]);

  const startBrowserRecognition = () => {
    if (!recognitionConstructor) {
      return false;
    }

    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = resolveSpeechRecognitionLocale(language);
    recognition.maxAlternatives = 1;
    recognitionActiveRef.current = true;
    recognitionFinalTextRef.current = "";
    setEngine("browser-recognition");
    setStatus("requesting-permission");
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    setPermissionDenied(false);

    recognition.onstart = () => {
      setStatus("listening");
    };

    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      const finalParts: string[] = [];
      const interimParts: string[] = [];

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcriptPart = result[0]?.transcript?.trim() ?? "";

        if (!transcriptPart) {
          continue;
        }

        if (result.isFinal) {
          finalParts.push(transcriptPart);
        } else {
          interimParts.push(transcriptPart);
        }
      }

      recognitionFinalTextRef.current = finalParts.join("");
      setTranscript(recognitionFinalTextRef.current);
      setInterimTranscript(interimParts.join(""));
    };

    recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
      const mappedError = mapRecognitionError(event.error);
      recognitionActiveRef.current = false;
      recognitionRef.current = null;
      setEngine("browser-recognition");
      setStatus("error");
      setError(mappedError.message);
      setPermissionDenied(mappedError.permissionDenied);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (!recognitionActiveRef.current) {
        return;
      }

      recognitionActiveRef.current = false;
      setInterimTranscript("");
      setStatus(recognitionFinalTextRef.current.trim() ? "ready" : "idle");
    };

    recognitionRef.current = recognition;
    recognition.start();
    return true;
  };

  const startMediaRecorder = async () => {
    if (!canUseMediaRecorder) {
      setStatus("error");
      setError(resolveSpeechInputUnsupportedCopy(mode));
      setPermissionDenied(false);
      return;
    }

    setEngine(mode === "voice" ? "media-recorder" : "server-transcription");
    setStatus("requesting-permission");
    setTranscript("");
    setInterimTranscript("");
    setRecordedAudio(null);
    setRecordingElapsedMs(0);
    setError(null);
    setPermissionDenied(false);
    shouldUploadRecordingRef.current = true;
    const requestId = mediaStartRequestIdRef.current + 1;
    mediaStartRequestIdRef.current = requestId;

    try {
      // 免提连续通话（VAD）下扬声器会回灌进麦克风；开 echoCancellation /
      // noiseSuppression / autoGainControl 压回声 + 抬低音量人声，AnalyserNode
      // 的静音检测更干净。这些约束不被支持时浏览器会自动忽略，等价于旧的
      // { audio: true }，不影响 dictation 录音转写质量。
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (
        mediaStartRequestIdRef.current !== requestId ||
        !shouldUploadRecordingRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];
      const mimeType = getSupportedRecordingMimeType();
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        recordingStartedAtRef.current = Date.now();
        setRecordingElapsedMs(0);
        setStatus("listening");
      };

      mediaRecorder.onstop = async () => {
        // 走查 R4：cancel→start 快速循环里旧 recorder 的 stop 触发会异步走到
        // 这里。彼时 mediaRecorderRef/mediaStreamRef/recordedChunksRef 都已被新
        // 一轮 start 接管 —— 老 onstop 再去 null mediaRecorderRef / 调
        // stopMediaTracks 会把新流的轨道全部停掉，再 setStatus("error")
        // ("没有录到有效语音") 让 loop 进 error 永久卡死。requestId 同步守门：
        // 仅自己这一轮请求活跃时才碰共享 ref / state，过期 onstop 静默退出。
        if (mediaStartRequestIdRef.current !== requestId) {
          return;
        }
        const shouldUpload = shouldUploadRecordingRef.current;
        const recordedChunks = [...recordedChunksRef.current];
        const durationMs = resolveRecordingDuration(
          recordingStartedAtRef.current,
        );
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        recordingStartedAtRef.current = null;
        stopMediaTracks();

        if (!shouldUpload) {
          resetState();
          return;
        }

        const recordedBlob = new Blob(recordedChunks, {
          type: mediaRecorder.mimeType || mimeType || "audio/webm",
        });

        if (!recordedBlob.size) {
          setStatus("error");
          setError(
            translateRuntimeMessage(msg`没有录到有效语音，请再试一次。`),
          );
          setPermissionDenied(false);
          return;
        }

        if (recordedBlob.size > MAX_AUDIO_BYTES) {
          setStatus("error");
          setError(
            translateRuntimeMessage(
              msg`这段录音太长了，请缩短单次语音输入时长。`,
            ),
          );
          setPermissionDenied(false);
          return;
        }

        const audioBlob =
          mode === "voice"
            ? await prepareVoiceMessageAudioBlob(recordedBlob)
            : recordedBlob;

        if (audioBlob.size > MAX_AUDIO_BYTES) {
          setStatus("error");
          setError(
            translateRuntimeMessage(
              msg`这段录音太长了，请缩短单次语音输入时长。`,
            ),
          );
          setPermissionDenied(false);
          return;
        }

        if (mode === "voice") {
          const resolvedMimeType =
            audioBlob.type || recordedBlob.type || mimeType || "audio/webm";
          setRecordedAudio({
            blob: audioBlob,
            mimeType: resolvedMimeType,
            fileName: buildRecordedAudioFileName(resolvedMimeType),
            size: audioBlob.size,
            durationMs,
          });
          setTranscript("");
          setInterimTranscript("");
          setRecordingElapsedMs(durationMs);
          setStatus("ready");
          setError(null);
          setPermissionDenied(false);
          return;
        }

        setStatus("processing");

        try {
          const formData = new FormData();
          formData.append(
            "file",
            audioBlob,
            buildRecordedAudioFileName(audioBlob.type || recordedBlob.type),
          );
          formData.append("conversationId", conversationId);
          if (characterId) {
            formData.append("characterId", characterId);
          }
          formData.append("mode", "dictation");

          const result = await transcribeSpeechInput(formData, baseUrl);
          setTranscript(result.text.trim());
          setInterimTranscript("");
          setStatus(result.text.trim() ? "ready" : "error");
          setError(
            result.text.trim()
              ? null
              : translateRuntimeMessage(
                  msg`这段语音没有识别出有效文字，请再试一次。`,
                ),
          );
          setPermissionDenied(false);
        } catch (uploadError) {
          setStatus("error");
          setError(
            uploadError instanceof Error
              ? uploadError.message
              : translateRuntimeMessage(msg`语音转写失败，请稍后再试。`),
          );
          setPermissionDenied(false);
        }
      };

      mediaRecorder.start();
    } catch (startError) {
      stopMediaTracks();
      mediaRecorderRef.current = null;

      if (
        mediaStartRequestIdRef.current !== requestId ||
        !shouldUploadRecordingRef.current
      ) {
        return;
      }

      setStatus("error");
      const nextPermissionDenied =
        startError instanceof Error &&
        /permission|denied|allowed/i.test(startError.message);
      setError(
        nextPermissionDenied
          ? resolveMicrophonePermissionDeniedCopy()
          : resolveMicrophonePermissionCheckCopy(),
      );
      setPermissionDenied(nextPermissionDenied);
    }
  };

  const start = async () => {
    if (!supported) {
      setStatus("error");
      setError(
        translateRuntimeMessage(msg`当前环境不支持语音输入，请改用键盘输入。`),
      );
      setPermissionDenied(false);
      return;
    }

    if (
      status === "listening" ||
      status === "processing" ||
      status === "requesting-permission"
    ) {
      return;
    }

    if (mode === "dictation" && canUseBrowserRecognition) {
      try {
        const started = startBrowserRecognition();
        if (started) {
          return;
        }
      } catch {
        recognitionRef.current = null;
      }
    }

    await startMediaRecorder();
  };

  const stop = () => {
    if (status === "requesting-permission") {
      cancel();
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const commitToInput = (currentValue: string) => {
    if (mode === "voice") {
      return currentValue;
    }

    const mergedValue = mergeInputText(
      currentValue,
      transcript || interimTranscript,
    );
    resetState();
    return mergedValue;
  };

  const clearResult = () => {
    resetState();
  };

  // VAD 连续监听复用这条活流挂 AnalyserNode，避免二次 getUserMedia。
  // 返回稳定 accessor 读 ref.current（实时），不直接外泄 ref 本体。
  const getMediaStream = useCallback(() => mediaStreamRef.current, []);

  return {
    canCommit:
      mode === "voice"
        ? Boolean(recordedAudio)
        : Boolean((transcript || interimTranscript).trim()),
    canUseBrowserRecognition,
    canUseMediaRecorder,
    clearResult,
    commitToInput,
    displayText,
    engine,
    error,
    getMediaStream,
    interimTranscript,
    mode,
    permissionDenied,
    recordedAudio,
    start,
    status,
    stop,
    supported,
    transcript,
    cancel,
  };
}

function resolveRecordingDuration(startedAt: number | null) {
  if (!startedAt) {
    return 0;
  }

  return Math.max(Date.now() - startedAt, 0);
}

function resolveVoiceDisplayText(
  status: SpeechInputStatus,
  recordingElapsedMs: number,
  recordedAudio: RecordedSpeechAudio | null,
) {
  if (status === "listening" && recordingElapsedMs > 0) {
    return `${translateRuntimeMessage(msg`已录制`)} ${formatDurationLabel(recordingElapsedMs)}`;
  }

  if (status === "ready" && recordedAudio) {
    return `${translateRuntimeMessage(msg`语音时长`)} ${formatDurationLabel(recordedAudio.durationMs)}`;
  }

  return "";
}

function buildRecordedAudioFileName(mimeType?: string) {
  if (mimeType?.includes("ogg")) {
    return "voice-message.ogg";
  }

  if (mimeType?.includes("mp4")) {
    return "voice-message.m4a";
  }

  if (mimeType?.includes("mpeg")) {
    return "voice-message.mp3";
  }

  if (mimeType?.includes("wav")) {
    return "voice-message.wav";
  }

  return "voice-message.webm";
}

function formatDurationLabel(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function resolveSpeechInputUnsupportedCopy(mode: "dictation" | "voice") {
  if (mode === "voice") {
    return isNativeMobileRuntime()
      ? translateRuntimeMessage(msg`当前设备不支持语音发送。`)
      : translateRuntimeMessage(msg`当前浏览器不支持语音发送。`);
  }

  return isNativeMobileRuntime()
    ? translateRuntimeMessage(msg`当前设备不支持录音转写。`)
    : translateRuntimeMessage(msg`当前浏览器不支持录音转写。`);
}

function resolveMicrophonePermissionDeniedCopy() {
  return isNativeMobileRuntime()
    ? translateRuntimeMessage(msg`麦克风权限被拒绝，请先允许应用访问麦克风。`)
    : translateRuntimeMessage(msg`麦克风权限被拒绝，请先允许浏览器访问麦克风。`);
}

function resolveMicrophonePermissionCheckCopy() {
  return isNativeMobileRuntime()
    ? translateRuntimeMessage(msg`无法启动录音，请检查应用麦克风权限。`)
    : translateRuntimeMessage(msg`无法启动录音，请检查浏览器麦克风权限。`);
}
