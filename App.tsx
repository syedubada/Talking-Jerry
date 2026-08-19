// Hello World
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
    const [audioVolume, setAudioVolume] = useState(0); 

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const sfxAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const chatContainerRef = useRef<HTMLDivElement>(null); 

    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [userTranscript, jerryTranscript]);
    
    useEffect(() => {
        if (gameState === GameState.IDLE || gameState === GameState.PRE_GAME) return;

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
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        setAudioVolume(0);

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

    useEffect(() => {
        return () => stopAudioProcessing(true);
    }, [stopAudioProcessing]);
    
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
                contents: [{ parts: [{ text: `Say cheerfully: Hey, ${name}! I am Jerry! Let's play!` }] }],
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
                
                if (gameMode === GameMode.MIMIC) {
                    source.playbackRate.value = 1.4;
                }

                source.connect(outputAudioContextRef.current!.destination);
                source.start();
                source.onended = () => {
                    handleToggleConversation(true);
                }
            } else {
                 handleToggleConversation(true);
            }
        } catch (err) {
            console.error("Greeting error:", err);
            setError("Couldn't say hello! Starting conversation anyway.");
            handleToggleConversation(true);
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

    const monitorAudioVolume = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setAudioVolume(average); 

        animationFrameRef.current = requestAnimationFrame(monitorAudioVolume);
    };

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
            
            analyserRef.current = outputAudioContextRef.current!.createAnalyser();
            analyserRef.current.fftSize = 256;
            analyserRef.current.connect(outputAudioContextRef.current!.destination);

            try {
                mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (micError) {
                setError("Microphone access denied! Please allow microphone to talk to Jerry.");
                setGameState(GameState.IDLE);
                return; 
            }

            let systemInstruction = '';
            
            if (gameMode === GameMode.AI) {
                systemInstruction = `You are Jerry, a mischievous cartoon mouse talking to ${userName} (${userAge}). Your primary role is to be a helpful and smart AI assistant.

                Your tasks, in order of importance:
                1.  Listen and Transcribe: Accurately understand the user's speech in English or Roman Urdu.
                2.  Answer Questions: If the user asks a question, you MUST answer it. Provide a short, correct, and factual answer first. KEEP IT BRIEF (1-2 sentences).
                3.  Add Personality: ONLY AFTER you have answered, you can add your fun, cheesy personality.
                4.  Set Reaction: Call the 'setJerrysReaction' function before you speak ('smart' for answers, 'laughing' for jokes, etc.).

                CRITICAL RULE: DO NOT, under any circumstances, repeat or mimic the user's words. Your job is to have a conversation and ANSWER questions.`;
            } else { 
                systemInstruction = `You are in "Mimic Mode." You have one, single, exclusive job: act as a perfect echo.
                
                Procedure:
                1. Call the 'setJerrysReaction' function with the 'mimicking' reaction.
                2. Immediately after, repeat every single word the user says, verbatim. Speak in a fast, funny voice.
                
                CRITICAL RULES:
                - DO NOT answer questions.
                - DO NOT add any commentary.
                - Your response MUST be an EXACT copy of the user's words.`;
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
                            setUserTranscript(prev => prev + '\n'); 
                            setJerryTranscript(prev => prev + '\n'); 
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
                            
                            const playbackSpeed = gameMode === GameMode.MIMIC ? 1.4 : 1;
                            source.playbackRate.value = playbackSpeed;

                            source.connect(analyserRef.current!);
                            
                            source.addEventListener('ended', () => {
                                audioSourcesRef.current.delete(source);
                                if (audioSourcesRef.current.size === 0) {
                                    setGameState(GameState.LISTENING);
                                    setJerryReaction(JerryReaction.IDLE);
                                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                                    setAudioVolume(0);
                                }
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += (audioBuffer.duration / playbackSpeed);
                            audioSourcesRef.current.add(source);

                            if (!animationFrameRef.current) {
                                monitorAudioVolume();
                            }
                        }

                         if (message.serverContent?.interrupted) {
                            for (const source of audioSourcesRef.current.values()) {
                                source.stop();
                            }
                            audioSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                            setAudioVolume(0);
                        }
                    },
                    onerror: (e) => {
                        console.error('Session error:', e);
                        setError('An error occurred with the AI connection.');
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
    
    const handlePokeBelly = () => {
        if(gameState === GameState.LISTENING || gameState === GameState.IDLE) {
            setJerryReaction(JerryReaction.LAUGHING);
            setTimeout(() => setJerryReaction(JerryReaction.IDLE), 2000);
        }
    };

    const handlePokeHead = () => {
        if(gameState === GameState.LISTENING || gameState === GameState.IDLE) {
            setJerryReaction(JerryReaction.SAD);
            setTimeout(() => setJerryReaction(JerryReaction.IDLE), 2000);
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
    <option value="" disabled className="text-gray-900 bg-white">Select your age</option>
    <option value="under 10" className="text-gray-900 bg-white">Under 10</option>
    <option value="10-18" className="text-gray-900 bg-white">10-18</option>
    <option value="18-30" className="text-gray-900 bg-white">18-30</option>
    <option value="30+" className="text-gray-900 bg-white">30+</option>
</select>
                    
                    <div className="w-full">
                        <p className="text-left text-gray-300 mb-2 font-semibold">Choose a mode:</p>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => setMode(GameMode.AI)} className={`px-4 py-3 rounded-lg transition-all border-2 ${mode === GameMode.AI ? 'bg-blue-500 border-blue-300' : 'bg-white/20 border-transparent hover:bg-white/30'}`}>
                                <h3 className="font-bold text-white">Talk to Jerry</h3>
                                <p className="text-xs text-blue-100">Answers your questions!</p>
                            </button>
                             <button onClick={() => setMode(GameMode.MIMIC)} className={`px-4 py-3 rounded-lg transition-all border-2 ${mode === GameMode.MIMIC ? 'bg-yellow-500 border-yellow-300' : 'bg-white/20 border-transparent hover:bg-white/30'}`}>
                                <h3 className="font-bold text-white">Mimic Mode</h3>
                                <p className="text-xs text-yellow-100">Repeats in funny voice!</p>
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
            <p className="text-gray-300 text-lg mb-8 bg-black/40 px-4 py-1 rounded-full text-sm">
                {gameMode === GameMode.AI ? 'Tip: Ask him a question!' : 'Tip: Say something, he will repeat it! Poke him!'}
            </p>
            
            <div className="w-full bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-6 md:p-10 flex flex-col items-center gap-6">
                
                <JerryCharacter 
                    state={gameState} 
                    reaction={jerryReaction} 
                    volume={audioVolume} 
                    onPokeBelly={handlePokeBelly}
                    onPokeHead={handlePokeHead}
                />

                <div 
                    ref={chatContainerRef}
                    className="w-full h-40 overflow-y-auto bg-black/30 rounded-2xl p-4 flex flex-col gap-3 shadow-inner text-white scroll-smooth"
                >
                    {userTranscript.split('\n').map((line, i) => line.trim() && (
                         <div key={`u-${i}`} className="flex items-start bg-blue-900/30 p-2 rounded-lg">
                            <span className="text-blue-400 font-bold w-16 flex-shrink-0">You:</span>
                            <p className="leading-tight text-sm">{line}</p>
                        </div>
                    ))}
                     {jerryTranscript.split('\n').map((line, i) => line.trim() && (
                         <div key={`j-${i}`} className="flex items-start bg-purple-900/30 p-2 rounded-lg">
                            <span className="text-purple-400 font-bold w-16 flex-shrink-0">Jerry:</span>
                            <p className="leading-tight text-sm">{line}</p>
                        </div>
                    ))}
                    
                    {!userTranscript && !jerryTranscript && (
                        <p className="text-gray-400 text-center italic mt-auto mb-auto">Start talking...</p>
                    )}
                </div>

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg w-full text-center">{error}</p>}

                <ControlButton onClick={() => handleToggleConversation(false)} state={gameState} />
            </div>
        </div>
    )

    return (
        <div className="bg-[#121212] min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative">
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
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }



              
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
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }

    @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
    }
    .animate-float { animation: float 3s ease-in-out infinite; }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px) rotate(-5deg); }
        75% { transform: translateX(5px) rotate(5deg); }
    }
    .animate-shake { animation: shake 0.4s ease-in-out infinite; }








            `}</style>
            
            {gameState === GameState.PRE_GAME ? <IntroScreen /> : <GameScreen />}

            <footer className="absolute bottom-4 text-gray-500 text-sm z-10">
                Powered by Syed Ubada
            </footer>
        </div>
    );
};

export default App;
