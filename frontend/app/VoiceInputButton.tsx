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
    // Initialize speech recognition on first use
    if (!recognitionRef.current) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          console.warn("Web Speech API not supported in this browser");
          return;
        }
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.language = "en-US";
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onstart = () => {
          setIsRecording(true);
          setError(null);
        };

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

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      } catch (err) {
        console.error("Failed to initialize speech recognition:", err);
        setError("Voice not supported");
      }
    }

    // Toggle recording
    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch (err) {
        console.error("Error stopping recording:", err);
      }
    } else {
      try {
        setError(null);
        recognitionRef.current?.start();
      } catch (err) {
        console.error("Error starting recording:", err);
        setError("Could not start recording");
      }
    }
  };

  if (!recognitionRef.current && typeof window !== "undefined") {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return null; // Don't render if not supported
    }
  }

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
