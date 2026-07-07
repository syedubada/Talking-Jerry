import React from 'react';
import { GameState } from '../types';

interface ControlButtonProps {
    onClick: () => void;
    state: GameState;
}

export const ControlButton: React.FC<ControlButtonProps> = ({ onClick, state }) => {
    const isPlaying = state !== GameState.IDLE && state !== GameState.PRE_GAME;
    
    return (
        <button 
            onClick={onClick}
            className={`w-full max-w-sm px-8 py-4 rounded-xl font-bold text-white text-xl shadow-lg transition-all transform hover:scale-105 ${isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
        >
            {isPlaying ? 'Stop Conversation' : 'Start Talking'}
        </button>
    );
}