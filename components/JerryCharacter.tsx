import React, { useState } from 'react';
import { GameState, JerryReaction, JerryCharacterProps } from '../types';

export const JerryCharacter: React.FC<JerryCharacterProps> = ({ state, reaction, volume = 0, onPokeBelly, onPokeHead }) => {
    const [imgFailed, setImgFailed] = useState(false);
    
    const glowScale = 1 + (volume / 100);
    const glowOpacity = Math.min(0.8, volume / 60);
    
    const getStatusText = () => {
        if (state === GameState.CONNECTING) return "Connecting...";
        if (state === GameState.LISTENING) return "Listening...";
        if (state === GameState.THINKING) return "Thinking...";
        if (state === GameState.TALKING) return "Talking...";
        return "";
    };

    return (
        <div className="relative flex flex-col items-center justify-center w-56 h-56 select-none mt-8 mb-8">
            <div className="absolute -top-12 text-white/90 font-semibold text-sm animate-pulse bg-black/50 px-5 py-1.5 rounded-full z-20 border border-white/10 shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md">
                {getStatusText()}
            </div>

            {state === GameState.TALKING && (
                <div 
                    className="absolute bg-blue-500 rounded-full blur-[40px] transition-all duration-75 pointer-events-none"
                    style={{
                        width: `${160 * glowScale}px`,
                        height: `${160 * glowScale}px`,
                        opacity: glowOpacity
                    }}
                />
            )}

            <div 
                onClick={onPokeBelly}
                onContextMenu={(e) => { e.preventDefault(); onPokeHead?.(); }}
                className={`
                    relative w-48 h-48 rounded-full z-10 cursor-pointer overflow-hidden
                    border-4 border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.6)]
                    transition-all duration-300 bg-[#1e1e2e] flex items-center justify-center
                    ${state === GameState.IDLE ? 'animate-float' : ''}
                    ${reaction === JerryReaction.SAD ? 'grayscale-[80%] brightness-75 translate-y-4' : ''}
                    ${reaction === JerryReaction.SURPRISED ? 'scale-110 -translate-y-4 shadow-[0_0_80px_rgba(255,255,255,0.4)]' : ''}
                    ${reaction === JerryReaction.LAUGHING ? 'animate-shake' : ''}
                `}
                style={{
                    transform: state === GameState.TALKING ? `scale(${1 + (volume / 500)})` : '',
                }}
            >
                {!imgFailed ? (
                    <img 
                        src="/jerry.png" 
                        alt="Realistic Jerry"
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                        onError={() => setImgFailed(true)}
                        title="Left Click: Tickle Belly | Right Click: Poke Head"
                    />
                ) : (
                    <svg viewBox="0 0 200 200" className="w-full h-full p-4">
                        <defs>
                            <radialGradient id="earGrad" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="#ffb3ba" />
                                <stop offset="100%" stopColor="#ff677d" />
                            </radialGradient>
                            <linearGradient id="mouseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#f6ad55" />
                                <stop offset="100%" stopColor="#dd6b20" />
                            </linearGradient>
                        </defs>
                        <circle cx="55" cy="65" r="32" fill="url(#mouseGrad)" stroke="#b7791f" strokeWidth="2" />
                        <circle cx="55" cy="65" r="20" fill="url(#earGrad)" />
                        <circle cx="145" cy="65" r="32" fill="url(#mouseGrad)" stroke="#b7791f" strokeWidth="2" />
                        <circle cx="145" cy="65" r="20" fill="url(#earGrad)" />
                        <ellipse cx="100" cy="115" rx="55" ry="50" fill="url(#mouseGrad)" stroke="#b7791f" strokeWidth="2" />
                        <ellipse cx="80" cy="100" rx="10" ry="14" fill="white" />
                        <circle cx="80" cy="100" r="5" fill="black" />
                        <circle cx="78" cy="97" r="2" fill="white" />
                        <ellipse cx="120" cy="100" rx="10" ry="14" fill="white" />
                        <circle cx="120" cy="100" r="5" fill="black" />
                        <circle cx="118" cy="97" r="2" fill="white" />
                        <ellipse cx="100" cy="125" rx="22" ry="15" fill="#feebc8" />
                        <polygon points="92,118 108,118 100,126" fill="#2d3748" />
                        <path d="M 90,130 Q 100,140 110,130" fill="none" stroke="#2d3748" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                )}
            </div>
            
            <p className="absolute -bottom-6 text-xs text-gray-400 italic">
                Left click to tickle, Right click to poke!
            </p>
        </div>
    );
};