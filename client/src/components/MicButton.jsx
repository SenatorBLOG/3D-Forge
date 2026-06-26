import useSpeechRecognition from '../hooks/useSpeechRecognition.js'

// Round mic button (WhatsApp-style): click to record, click again to stop.
// English (en-US) by default. Transcribed phrases are handed up via onTranscript
// so the parent appends them to its text field. Pure client-side Web Speech API.

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
    <path
      d="M6 11a6 6 0 0 0 12 0M12 17v3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

export default function MicButton({ onTranscript, disabled }) {
  const { supported, listening, error, toggle } = useSpeechRecognition({
    lang: 'en-US',
    onResult: onTranscript,
  })

  if (!supported) {
    return (
      <button
        type="button"
        className="mic-btn"
        disabled
        title="Voice input needs Chrome or Edge"
        aria-label="Voice input unavailable"
      >
        <MicIcon />
      </button>
    )
  }

  const title =
    error === 'not-allowed'
      ? 'Microphone permission denied'
      : listening
        ? 'Stop recording'
        : 'Record voice'

  return (
    <button
      type="button"
      className={`mic-btn${listening ? ' mic-btn--on' : ''}`}
      onClick={toggle}
      disabled={disabled}
      title={title}
      aria-label={listening ? 'Stop recording' : 'Record voice'}
      aria-pressed={listening}
    >
      <MicIcon />
    </button>
  )
}
