import { useEffect, useRef, useState } from "react";
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
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function getRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.SpeechRecognition ??
    window.webkitSpeechRecognition ??
    null
  ) as BrowserSpeechRecognitionConstructor | null;
}

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
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
}: UseSpeechInputOptions) {
  const [status, setStatus] = useState<SpeechInputStatus>("idle");
  const [engine, setEngine] = useState<SpeechInputEngine>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const shouldUploadRecordingRef = useRef(true);
  const recognitionFinalTextRef = useRef("");
  const recognitionActiveRef = useRef(false);
  const recognitionConstructor = getRecognitionConstructor();
  const canUseBrowserRecognition = enabled && Boolean(recognitionConstructor);
  const canUseMediaRecorder =
    enabled &&
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const supported = canUseBrowserRecognition || canUseMediaRecorder;
  const displayText = transcript || interimTranscript;

  const resetState = () => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    setEngine(null);
    setStatus("idle");
    recognitionFinalTextRef.current = "";
  };

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const cancel = () => {
    shouldUploadRecordingRef.current = false;

    if (recognitionRef.current) {
      recognitionActiveRef.current = false;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      stopMediaTracks();
    }

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    resetState();
  };

  useEffect(() => cancel, []);

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
      setError("当前浏览器不支持录音转写。");
      return;
    }

    setEngine("server-transcription");
    setStatus("requesting-permission");
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    shouldUploadRecordingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];
      const mimeType = getSupportedRecordingMimeType();
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setStatus("listening");
      };

      mediaRecorder.onstop = async () => {
        const shouldUpload = shouldUploadRecordingRef.current;
        const recordedChunks = [...recordedChunksRef.current];
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
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

        setStatus("processing");

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, `speech-input.${audioBlob.type.includes("ogg") ? "ogg" : "webm"}`);
          formData.append("conversationId", conversationId);
          formData.append("mode", "dictation");

          const result = await transcribeSpeechInput(formData, baseUrl);
          setTranscript(result.text.trim());
          setInterimTranscript("");
          setStatus(result.text.trim() ? "ready" : "error");
          setError(result.text.trim() ? null : "这段语音没有识别出有效文字，请再试一次。");
        } catch (uploadError) {
          setStatus("error");
          setError(uploadError instanceof Error ? uploadError.message : "语音转写失败，请稍后再试。");
        }
      };

      mediaRecorder.start();
    } catch (startError) {
      stopMediaTracks();
      mediaRecorderRef.current = null;
      setStatus("error");
      setError(
        startError instanceof Error && /permission|denied|allowed/i.test(startError.message)
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

    if (status === "listening" || status === "processing") {
      return;
    }

    if (canUseBrowserRecognition) {
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
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const commitToInput = (currentValue: string) => {
    const mergedValue = mergeInputText(currentValue, transcript || interimTranscript);
    resetState();
    return mergedValue;
  };

  return {
    canCommit: Boolean((transcript || interimTranscript).trim()),
    canUseBrowserRecognition,
    canUseMediaRecorder,
    commitToInput,
    displayText,
    engine,
    error,
    interimTranscript,
    start,
    status,
    stop,
    supported,
    transcript,
    cancel,
  };
}
