import React, { useState, useEffect, useRef } from 'react';
import './ChatInterface.css';

const ChatInterface = () => {
  const [messages, setMessages] = useState([
    'Welcome to the BART AI Assistant! Tap to talk about schedules, fares, or stations.',
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const pcRef = useRef(null); // WebRTC Peer Connection
  const dcRef = useRef(null); // Data Channel
  const audioRef = useRef(new Audio()); // Audio element for playback

  // Initialize WebRTC connection
  useEffect(() => {
    const initWebRTC = async () => {
      try {
        // Fetch ephemeral token from your server
        const tokenResponse = await fetch('http://localhost:5001/session'); // Your server endpoint
        const data = await tokenResponse.json();
        const ephemeralKey = data.client_secret.value;

        // Create Peer Connection
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // Set up audio playback
        audioRef.current.autoplay = true;
        pc.ontrack = (e) => {
          audioRef.current.srcObject = e.streams[0];
        };

        // Add local microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Set up data channel for events
        const dc = pc.createDataChannel('oai-events');
        dcRef.current = dc;
        dc.onmessage = (e) => {
          const event = JSON.parse(e.data);
          console.log('Received event:', event);
          handleRealtimeEvent(event);
        };
        dc.onopen = () => console.log('Data channel opened');

        // Create and set offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Connect to OpenAI Realtime API
        const baseUrl = 'https://api.openai.com/v1/realtime';
        const model = 'gpt-4o-realtime-preview-2024-12-17';
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        });

        const answer = { type: 'answer', sdp: await sdpResponse.text() };
        await pc.setRemoteDescription(answer);
      } catch (error) {
        console.error('Error initializing WebRTC:', error);
        setMessages((prev) => [...prev, 'AI: Sorry, something went wrong.']);
      }
    };

    initWebRTC();

    // Cleanup on unmount
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (audioRef.current.srcObject) {
        audioRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Handle incoming Realtime API events
  const handleRealtimeEvent = (event) => {
    if (event.type === 'response.audio.delta') {
      // Audio data is streamed in chunks;
      setMessages((prev) => [...prev, 'AI: [Audio response received]']);
    } else if (event.type === 'response.text.delta') {
      // Text response (if multimodal output is enabled)
      setMessages((prev) => [...prev, `AI: ${event.value}`]);
    }
  };

  // Toggle voice input
  const handleVoiceInput = () => {
    if (!listening) {
      setListening(true);
      setIsProcessing(true);
      // Microphone is already streaming via WebRTC; no additional action needed
    } else {
      setListening(false);
      setIsProcessing(false);
      // Send an event to stop audio input if needed (optional)
      if (dcRef.current && dcRef.current.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      }
    }
  };

  // Handle text input (optional fallback)
  const handleSubmit = (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input').value;
    if (input.trim() && !isProcessing) {
      setMessages((prev) => [...prev, input]);
      if (dcRef.current && dcRef.current.readyState === 'open') {
        dcRef.current.send(
          JSON.stringify({
            type: 'input_text',
            value: input,
          })
        );
      }
      e.target.reset();
    }
  };

  return (
    <div className="chat-container">
      <div className="circle-container">
        <div
          className={`ai-circle ${listening ? 'listening' : ''}`}
          onClick={handleVoiceInput}
        ></div>
        {!listening && <div className="tap-to-talk">Tap to Talk</div>}
      </div>
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${index === 0 ? 'ai-message' : index % 2 === 0 ? 'ai-response' : 'user-message'}`}
          >
            {msg}
          </div>
        ))}
      </div>
      <form className="input-container" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder="Type about BART (optional)..."
          disabled={isProcessing}
        />
        <button type="submit" className="send-button" disabled={isProcessing}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;