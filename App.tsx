import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { GameState, JerryReaction, GameMode } from './types';
import { JerryCharacter } from './components/JerryCharacter';
import { ControlButton } from './components/ControlButton';
import { ExitIcon } from './components/Icons';
import { decode, encode, decodeAudioData, createBlob } from './utils/audioUtils';
import { playSurpriseSound, playSadSound, playLaughSound, playSmartSound } from './utils/soundEffects';

const setJerrysReactionDeclaration: FunctionDeclaration = {
  name: 'setJerrysReaction',
  description: "Sets Jerry's facial expression to reflect his current mood or action.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reaction: {
        type: Type.STRING,
        description: "The reaction to display. Can be 'idle', 'mimicking', 'smart', 'laughing', 'thinking', 'surprised', or 'sad'.",
        enum: ['idle', 'mimicking', 'smart', 'laughing', 'thinking', 'surprised', 'sad'],
      },
    },
    required: ['reaction'],
  },
};

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(GameState.PRE_GAME);
    const [gameMode, setGameMode] = useState<GameMode>(GameMode.AI);
    const [jerryReaction, setJerryReaction] = useState<JerryReaction>(JerryReaction.IDLE);
    const [userTranscript, setUserTranscript] = useState('');
    const [jerryTranscript, setJerryTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [userAge, setUserAge] = useState('');

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const sfxAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');
    
    useEffect(() => {
        if (gameState === GameState.IDLE) return;

        if (!sfxAudioContextRef.current || sfxAudioContextRef.current.state === 'closed') {
            sfxAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = sfxAudioContextRef.current;
        
        switch(jerryReaction) {
            case JerryReaction.SURPRISED:
                playSurpriseSound(ctx);
                break;
            case JerryReaction.SAD:
                playSadSound(ctx);
                break;
            case JerryReaction.LAUGHING:
                playLaughSound(ctx);
                break;
            case JerryReaction.SMART:
                playSmartSound(ctx);
                break;
            default:
                break;
        }
    }, [jerryReaction, gameState]);

    const stopAudioProcessing = useCallback((isExiting: boolean = false) => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }
        if (scriptProcessorRef.current && mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            scriptProcessorRef.current.disconnect();
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
             for (const source of audioSourcesRef.current.values()) {
                source.stop();
             }
             audioSourcesRef.current.clear();
             outputAudioContextRef.current.close();
             outputAudioContextRef.current = null;
        }
         if (sfxAudioContextRef.current && sfxAudioContextRef.current.state !== 'closed') {
            sfxAudioContextRef.current.close();
            sfxAudioContextRef.current = null;
        }
        if(isExiting) {
             setJerryReaction(JerryReaction.IDLE);
             setUserTranscript('');
             setJerryTranscript('');
             currentInputTranscriptionRef.current = '';
             currentOutputTranscriptionRef.current = '';
             setError(null);
        }
    }, []);
    
    const playGreeting = async (name: string) => {
        try {
             if (!process.env.API_KEY) {
                throw new Error("API_KEY environment variable not set.");
            }
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            setJerryReaction(JerryReaction.MIMICKING);
            setGameState(GameState.GREETING);

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: `Say cheerfully: Hey, ${name}! How can I help you?` }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
                    },
                },
            });
            
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current!, 24000, 1);
                const source = outputAudioContextRef.current!.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAudioContextRef.current!.destination);
                source.start();
                source.onended = () => {
                    handleToggleConversation(true); // Auto-start the main conversation
                }
            } else {
                 handleToggleConversation(true);
            }
        } catch (err) {
            console.error("Greeting error:", err);
            setError("Couldn't say hello! Starting conversation anyway.");
            handleToggleConversation(true); // Start conversation even if greeting fails
        }
    }

    const handleStartGame = (name: string, age: string, mode: GameMode) => {
        if(!name.trim() || !age) {
            setError("Please fill out all fields.");
            return;
        }
        setUserName(name);
        setUserAge(age);
        setGameMode(mode);
        setError(null);
        playGreeting(name);
    }

    const handleExitGame = () => {
        stopAudioProcessing(true);
        setGameState(GameState.PRE_GAME);
    }


    const handleToggleConversation = async (isAutoStart = false) => {
        if (!isAutoStart && gameState !== GameState.IDLE) {
            setGameState(GameState.IDLE);
            setJerryReaction(JerryReaction.IDLE);
            stopAudioProcessing();
            setUserTranscript('');
            setJerryTranscript('');
            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';
            return;
        }

        try {
            setError(null);
            setGameState(GameState.CONNECTING);
            
            if (!process.env.API_KEY) {
                throw new Error("API_KEY environment variable not set.");
            }
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                 outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            let systemInstruction = '';
            
            if (gameMode === GameMode.AI) {
                systemInstruction = `You are Jerry, a mischievous cartoon mouse talking to ${userName} (${userAge}). Your primary role is to be a helpful and smart AI assistant.

                Your tasks, in order of importance:
                1.  Listen and Transcribe: Accurately understand the user's speech in English or Roman Urdu. Do not use Hindi script.
                2.  Answer Questions: If the user asks a question, you MUST answer it. Provide a short, correct, and factual answer first. KEEP IT BRIEF.
                3.  Add Personality: ONLY AFTER you have answered, you can add your fun, cheesy personality.
                4.  Set Reaction: Call the 'setJerrysReaction' function before you speak ('smart' for answers, 'laughing' for jokes, etc.).

                CRITICAL RULE: DO NOT, under any circumstances, repeat or mimic the user's words. Your job is to have a conversation and ANSWER questions, not to be an echo.

                If the user speaks a language other than English or Urdu, politely tell them in English, "I only speak English and Urdu, tee-hee!".`;
            } else { // GameMode.MIMIC
                systemInstruction = `You are in "Mimic Mode." You have one, single, exclusive job: act as a perfect echo.
                
                Procedure:
                1. Call the 'setJerrysReaction' function with the 'mimicking' reaction.
                2. Immediately after, repeat every single word the user says, verbatim. Speak in a funny, high-pitched, squeaky mouse voice.
                
                CRITICAL RULES:
                - DO NOT answer questions.
                - DO NOT add any commentary.
                - DO NOT provide any information.
                - Your response MUST be an EXACT copy of the user's words. This is your only function.`;
            }

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setGameState(GameState.LISTENING);
                        const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
                        const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current!.destination);
                        mediaStreamSourceRef.current = source;
                        scriptProcessorRef.current = scriptProcessor;
                    },
                    onmessage: async (message: LiveServerMessage) => {
                         if (message.toolCall) {
                            for (const fc of message.toolCall.functionCalls) {
                                if (fc.name === 'setJerrysReaction') {
                                    const reaction = fc.args.reaction as JerryReaction;
                                    setJerryReaction(reaction);
                                    sessionPromiseRef.current?.then((session) => {
                                      session.sendToolResponse({
                                        functionResponses: {
                                          id : fc.id,
                                          name: fc.name,
                                          response: { result: "ok" },
                                        }
                                      })
                                    });
                                }
                            }
                        }
                       
                        if (message.serverContent?.outputTranscription) {
                            const text = message.serverContent.outputTranscription.text;
                            currentOutputTranscriptionRef.current += text;
                            setJerryTranscript(currentOutputTranscriptionRef.current);
                        } else if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            currentInputTranscriptionRef.current += text;
                            setUserTranscript(currentInputTranscriptionRef.current);
                        }

                        if (message.serverContent?.turnComplete) {
                            if (currentInputTranscriptionRef.current.trim().length > 0) {
                                setGameState(GameState.THINKING);
                                setJerryReaction(JerryReaction.THINKING);
                            }
                            setUserTranscript(prev => prev + ' '); 
                            setJerryTranscript(prev => prev + ' '); 
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            setGameState(GameState.TALKING);
                            const outputAudioContext = outputAudioContextRef.current;
                            if (!outputAudioContext) return;
                            
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                            
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContext.destination);
                            
                            source.addEventListener('ended', () => {
                                audioSourcesRef.current.delete(source);
                                if (audioSourcesRef.current.size === 0) {
                                    setGameState(GameState.LISTENING);
                                    setJerryReaction(JerryReaction.IDLE);
                                }
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        }

                         if (message.serverContent?.interrupted) {
                            for (const source of audioSourcesRef.current.values()) {
                                source.stop();
                            }
                            audioSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e) => {
                        console.error('Session error:', e);
                        setError('An error occurred. Please try again.');
                        setGameState(GameState.IDLE);
                        stopAudioProcessing();
                    },
                    onclose: () => {
                        setGameState(GameState.IDLE);
                        stopAudioProcessing();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    tools: [{ functionDeclarations: [setJerrysReactionDeclaration] }],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
                    },
                    systemInstruction,
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                },
            });

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            setGameState(GameState.IDLE);
            stopAudioProcessing();
        }
    };
    
    const IntroScreen = () => {
        const [name, setName] = useState('');
        const [age, setAge] = useState('');
        const [mode, setMode] = useState<GameMode>(GameMode.AI);

        return (
             <div className="w-full max-w-lg mx-auto flex flex-col items-center z-10 text-center">
                <h1 className="text-5xl md:text-7xl font-bold text-white mb-2 drop-shadow-lg">Talking Jerry AI</h1>
                <p className="text-gray-300 text-lg mb-8">A new friend is waiting for you!</p>
                
                <div className="w-full bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6">
                    <input 
                        type="text"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-white/20 text-white placeholder-gray-300 rounded-lg border-2 border-transparent focus:border-blue-400 focus:outline-none transition"
                    />
                     <select 
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="w-full px-4 py-3 bg-white/20 text-white rounded-lg border-2 border-transparent focus:border-blue-400 focus:outline-none transition appearance-none"
                        style={{ background: 'rgba(255, 255, 255, 0.2) url(\'data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E\') no-repeat right 1rem center', backgroundSize: '12px' }}
                     >
                        <option value="" disabled>Select your age</option>
                        <option value="under 10">Under 10</option>
                        <option value="10-18">10-18</option>
                        <option value="18-30">18-30</option>
                        <option value="30+">30+</option>
                    </select>
                    
                    <div className="w-full">
                        <p className="text-left text-gray-300 mb-2 font-semibold">Choose a mode:</p>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => setMode(GameMode.AI)} className={`px-4 py-3 rounded-lg transition-all border-2 ${mode === GameMode.AI ? 'bg-blue-500 border-blue-300' : 'bg-white/20 border-transparent hover:bg-white/30'}`}>
                                <h3 className="font-bold text-white">Talk to Jerry</h3>
                                <p className="text-xs text-blue-100">Have a real conversation!</p>
                            </button>
                             <button onClick={() => setMode(GameMode.MIMIC)} className={`px-4 py-3 rounded-lg transition-all border-2 ${mode === GameMode.MIMIC ? 'bg-yellow-500 border-yellow-300' : 'bg-white/20 border-transparent hover:bg-white/30'}`}>
                                <h3 className="font-bold text-white">Repeat After Me</h3>
                                <p className="text-xs text-yellow-100">He repeats what you say!</p>
                            </button>
                        </div>
                    </div>

                    {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg w-full text-center">{error}</p>}
                    <button 
                        onClick={() => handleStartGame(name, age, mode)}
                        className="w-full px-8 py-4 text-2xl font-bold text-white bg-green-500 rounded-xl shadow-lg hover:bg-green-600 transform hover:scale-105 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-300"
                    >
                        Start Game
                    </button>
                </div>
            </div>
        )
    }

    const GameScreen = () => (
         <div className="w-full max-w-4xl mx-auto flex flex-col items-center z-10 relative">
            <button onClick={handleExitGame} className="absolute top-0 right-0 -mt-4 -mr-4 text-white bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors" aria-label="Exit Game">
                <ExitIcon />
            </button>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-2 drop-shadow-lg">Talking Jerry AI</h1>
            <p className="text-gray-300 text-lg mb-8">{gameMode === GameMode.AI ? 'He answers your questions!' : 'He repeats everything you say!'}</p>
            
            <div className="w-full bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-6 md:p-10 flex flex-col items-center gap-6">
                <JerryCharacter state={gameState} reaction={jerryReaction} />

                <div className="w-full min-h-[8rem] bg-black/20 rounded-2xl p-4 flex flex-col gap-2 shadow-inner text-white">
                    <div className="flex items-start">
                        <span className="text-blue-400 font-bold w-16 flex-shrink-0">You:</span>
                        <p className="leading-tight">{userTranscript}</p>
                    </div>
                    <div className="flex items-start">
                        <span className="text-purple-400 font-bold w-16 flex-shrink-0">Jerry:</span>
                        <p className="leading-tight">{jerryTranscript}</p>
                    </div>
                </div>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg w-full text-center">{error}</p>}

                <ControlButton onClick={() => handleToggleConversation(false)} state={gameState} />
            </div>
        </div>
    )

    return (
        <div className="bg-[#121212] min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative">
            {/* Background */}
            <div className="absolute inset-0 bg-radial-gradient from-[#2a2a3a] to-[#121212] z-0"></div>
            <div id="stars" className="absolute inset-0"></div>
            <div id="stars2" className="absolute inset-0"></div>
            <div id="stars3" className="absolute inset-0"></div>

            <style>{`
                @keyframes move-twink-back { from {background-position:0 0;} to {background-position:-10000px 5000px;} }
                .bg-radial-gradient { background-image: radial-gradient(ellipse at bottom, #2a2a3a 0%, #121212 80%); }
                #stars, #stars2, #stars3 {
                    width:100%; height:100%; position:absolute; top:0; left:0;
                    background:transparent;
                    animation:move-twink-back 200s linear infinite;
                }
                #stars { background-image:url('https://www.transparenttextures.com/patterns/stardust.png'); }
                #stars2 { background-image:url('https://www.transparenttextures.com/patterns/stardust.png'); animation-duration: 150s; }
                #stars3 { background-image:url('https://www.transparenttextures.com/patterns/stardust.png'); animation-duration: 100s; }
            `}</style>
            
            {gameState === GameState.PRE_GAME ? <IntroScreen /> : <GameScreen />}

            <footer className="absolute bottom-4 text-gray-500 text-sm z-10">
                Powered by Google Gemini
            </footer>
        </div>
    );
};

export default App;