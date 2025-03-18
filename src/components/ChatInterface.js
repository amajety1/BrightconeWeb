import React, { useState, useEffect } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { OpenAI } from 'openai';
import './ChatInterface.css';

// Import the BART context file
import bartContext from '../data/bart_context.txt';

const ChatInterface = () => {
  const [messages, setMessages] = useState([
    'Welcome to the BART AI Assistant! Speak or type about schedules, fares, or stations.'
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const openai = new OpenAI({
    apiKey: process.env.REACT_APP_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
  });

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript && !isProcessing && !listening) {
      console.log('Processing transcript:', transcript);
      handleUserInput(transcript);
      resetTranscript();
    }
  }, [transcript, listening, isProcessing]);

  const extractRelevantContext = (userQuery) => {
    const keywords = userQuery.toLowerCase().split(' ');
    const lines = bartContext.split('\n');
    const relevantLines = lines.filter(line =>
      keywords.some(keyword => line.toLowerCase().includes(keyword))
    );
    return relevantLines.join('\n').slice(0, 1000);
  };

  const handleUserInput = async (userInput) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setMessages(prev => [...prev, userInput]);

    try {
      const contextSnippet = extractRelevantContext(userInput);
      const prompt = `You are a BART AI Assistant. Use this context to inform your response: "${contextSnippet}". Answer the user's query: "${userInput}"`;

      const textPromise = openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userInput }
        ],
        max_tokens: 2048,
        temperature: 0.5
      });

      const [textResponse] = await Promise.all([textPromise]);
      const aiText = textResponse.choices[0].message.content;
      setMessages(prev => [...prev, `AI: ${aiText}`]);

      const speechPromise = openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: aiText
      });

      const speechResponse = await speechPromise;
      const audioBlob = await speechResponse.arrayBuffer();
      const audioUrl = URL.createObjectURL(new Blob([audioBlob], { type: 'audio/mp3' }));
      const audio = new Audio(audioUrl);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(audioUrl);
    } catch (error) {
      console.error('Error fetching OpenAI response:', error);
      setMessages(prev => [...prev, 'AI: Sorry, something went wrong.']);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      handleUserInput(input);
      setInput('');
    }
  };

  const handleVoiceInput = () => {
    if (!listening) {
      SpeechRecognition.startListening({ continuous: false });
    } else {
      SpeechRecognition.stopListening();
    }
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="chat-container">
        <div className="error-message">
          Your browser doesn't support speech recognition.
        </div>
      </div>
    );
  }

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
          placeholder="Speak or type about BART..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="send-button" disabled={isProcessing}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;