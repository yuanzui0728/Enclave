import { Button, InlineNotice } from "@yinjie/ui";

export function DigitalHumanEntryNotice({
  tone,
  message,
  onContinue,
  onSwitchToVoice,
  continueLabel = "继续视频通话",
  voiceLabel = "改用语音通话",
}: {
  tone: "info" | "warning";
  message: string;
  onContinue: () => void;
  onSwitchToVoice: () => void;
  continueLabel?: string;
  voiceLabel?: string;
}) {
  return (
    <InlineNotice tone={tone}>
      <div className="flex flex-col gap-3">
        <div className="text-sm leading-6">{message}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSwitchToVoice}
            className="rounded-full"
          >
            {voiceLabel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onContinue}
            className="rounded-full"
          >
            {continueLabel}
          </Button>
        </div>
      </div>
    </InlineNotice>
  );
}
