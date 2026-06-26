import { useCallback, useEffect, useRef, useState } from 'react'

// Thin wrapper over the browser's built-in Web Speech API (Chrome/Edge). No
// server, no API key — speech is transcribed client-side. Unsupported browsers
// (Firefox/Safari) report `supported: false` so the UI can hide the mic.

const getSpeechRecognition = () =>
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

/**
 * @param {object}   opts
 * @param {string}   opts.lang     BCP-47 tag, e.g. 'en-US'
 * @param {function} opts.onResult called with each finalized transcript chunk
 * @returns {{ supported, listening, error, start, stop, toggle }}
 */
export default function useSpeechRecognition({ lang = 'en-US', onResult } = {}) {
  const supported = !!getSpeechRecognition()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  // keep the latest callback without re-creating the recognizer
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    if (!supported) return undefined
    const SR = getSpeechRecognition()
    const recognition = new SR()
    recognition.lang = lang
    recognition.continuous = true // keep listening until the user stops
    recognition.interimResults = false // commit only finalized phrases

    recognition.onresult = (event) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript
      }
      finalText = finalText.trim()
      if (finalText) onResultRef.current?.(finalText)
    }
    recognition.onerror = (event) => {
      setError(event.error)
      setListening(false)
    }
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null
    }
  }, [supported, lang])

  const start = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || listening) return
    setError(null)
    try {
      recognition.start()
      setListening(true)
    } catch {
      // .start() throws if it's already running — safe to ignore
    }
  }, [listening])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      /* already stopped */
    }
    setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { supported, listening, error, start, stop, toggle }
}
