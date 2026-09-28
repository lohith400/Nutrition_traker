"use client";

import { Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  isLoading?: boolean;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function VoiceInputButton({ onTranscript, isLoading }: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const startRecording = () => {
    // Suppress error if browser doesn't support it
    if (!recognitionRef.current) {
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          // Silently fail - voice not supported
          return;
        }
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.language = "en-US";
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onstart = () => setIsRecording(true);
        recognitionRef.current.onresult = (event: any) => {
          if (event.results && event.results[0]) {
            const transcript = event.results[0][0].transcript;
            onTranscript(transcript);
          }
          setIsRecording(false);
        };
        recognitionRef.current.onerror = (event: any) => {
          setError(`Voice error: ${event.error}`);
          setIsRecording(false);
        };
        recognitionRef.current.onend = () => setIsRecording(false);
      } catch (err) {
        // Silently handle errors
        return;
      }
    }

    try {
      if (isRecording) {
        recognitionRef.current?.stop();
        setIsRecording(false);
      } else {
        setError(null);
        recognitionRef.current?.start();
      }
    } catch (err) {
      // Silently handle errors
    }
  };

  return (
    <div className="voice-button-group">
      <button
        type="button"
        className={`voice-btn ${isRecording ? "recording" : ""} ${isLoading ? "disabled" : ""}`}
        onClick={startRecording}
        disabled={isLoading}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
        title={isRecording ? "Listening... Click to stop" : "Click to speak"}
      >
        {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      {isRecording && <span className="recording-indicator">Listening...</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
