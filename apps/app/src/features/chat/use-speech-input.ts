import { useEffect, useEffectEvent, useRef, useState } from "react";
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
  enabled: boolean;
  language?: string;
  mode?: "dictation" | "voice";
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

type RecordedSpeechAudio = {
  blob: Blob;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs: number;
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

function mapRecognitionError(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "麦克风权限被拒绝，请先允许浏览器访问麦克风。";
    case "no-speech":
      return "没有听到有效语音，请再说一遍。";
    case "audio-capture":
      return "当前设备无法采集麦克风音频。";
    case "network":
      return "浏览器语音识别网络异常，已可改用录音转写。";
    default:
      return "语音识别中断了，请重试。";
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
  enabled,
  language = "zh-CN",
  mode = "dictation",
}: UseSpeechInputOptions) {
  const [status, setStatus] = useState<SpeechInputStatus>("idle");
  const [engine, setEngine] = useState<SpeechInputEngine>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [recordedAudio, setRecordedAudio] =
    useState<RecordedSpeechAudio | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
    } else {
      stopMediaTracks();
    }

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
    if (mode !== "voice" || status !== "listening") {
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
  }, [mode, status]);

  const startBrowserRecognition = () => {
    if (!recognitionConstructor) {
      return false;
    }

    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;
    recognitionActiveRef.current = true;
    recognitionFinalTextRef.current = "";
    setEngine("browser-recognition");
    setStatus("requesting-permission");
    setTranscript("");
    setInterimTranscript("");
    setError(null);

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
      recognitionActiveRef.current = false;
      recognitionRef.current = null;
      setEngine("browser-recognition");
      setStatus("error");
      setError(mapRecognitionError(event.error));
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
      setError(
        mode === "voice"
          ? "当前浏览器不支持语音发送。"
          : "当前浏览器不支持录音转写。",
      );
      return;
    }

    setEngine(mode === "voice" ? "media-recorder" : "server-transcription");
    setStatus("requesting-permission");
    setTranscript("");
    setInterimTranscript("");
    setRecordedAudio(null);
    setRecordingElapsedMs(0);
    setError(null);
    shouldUploadRecordingRef.current = true;
    const requestId = mediaStartRequestIdRef.current + 1;
    mediaStartRequestIdRef.current = requestId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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

        const audioBlob = new Blob(recordedChunks, {
          type: mediaRecorder.mimeType || mimeType || "audio/webm",
        });

        if (!audioBlob.size) {
          setStatus("error");
          setError("没有录到有效语音，请再试一次。");
          return;
        }

        if (audioBlob.size > MAX_AUDIO_BYTES) {
          setStatus("error");
          setError("这段录音太长了，请缩短单次语音输入时长。");
          return;
        }

        if (mode === "voice") {
          setRecordedAudio({
            blob: audioBlob,
            mimeType: audioBlob.type || mimeType || "audio/webm",
            fileName: buildRecordedAudioFileName(audioBlob.type || mimeType),
            size: audioBlob.size,
            durationMs,
          });
          setTranscript("");
          setInterimTranscript("");
          setRecordingElapsedMs(durationMs);
          setStatus("ready");
          setError(null);
          return;
        }

        setStatus("processing");

        try {
          const formData = new FormData();
          formData.append(
            "file",
            audioBlob,
            buildRecordedAudioFileName(audioBlob.type),
          );
          formData.append("conversationId", conversationId);
          formData.append("mode", "dictation");

          const result = await transcribeSpeechInput(formData, baseUrl);
          setTranscript(result.text.trim());
          setInterimTranscript("");
          setStatus(result.text.trim() ? "ready" : "error");
          setError(
            result.text.trim()
              ? null
              : "这段语音没有识别出有效文字，请再试一次。",
          );
        } catch (uploadError) {
          setStatus("error");
          setError(
            uploadError instanceof Error
              ? uploadError.message
              : "语音转写失败，请稍后再试。",
          );
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
      setError(
        startError instanceof Error &&
          /permission|denied|allowed/i.test(startError.message)
          ? "麦克风权限被拒绝，请先允许浏览器访问麦克风。"
          : "无法启动录音，请检查浏览器麦克风权限。",
      );
    }
  };

  const start = async () => {
    if (!supported) {
      setStatus("error");
      setError("当前环境不支持语音输入，请改用键盘输入。");
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
    interimTranscript,
    mode,
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
    return `已录制 ${formatDurationLabel(recordingElapsedMs)}`;
  }

  if (status === "ready" && recordedAudio) {
    return `语音时长 ${formatDurationLabel(recordedAudio.durationMs)}`;
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
