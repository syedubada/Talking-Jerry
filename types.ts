export enum GameState {
    PRE_GAME,
    GREETING,
    CONNECTING,
    LISTENING,
    THINKING,
    TALKING,
    IDLE
}

export enum JerryReaction {
    IDLE = 'idle',
    MIMICKING = 'mimicking',
    SMART = 'smart',
    LAUGHING = 'laughing',
    THINKING = 'thinking',
    SURPRISED = 'surprised',
    SAD = 'sad'
}

export enum GameMode {
    AI = 'ai',
    MIMIC = 'mimic'
}