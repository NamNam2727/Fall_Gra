// =====================================
// bgm_system.js
// Web Audio API を用いたプロシージャルなロビーBGMの生成と制御
// =====================================

window.BGMSystem = {
    ctx: null,
    masterGain: null,
    compressor: null,
    isPlaying: false,
    nextStartTime: 0,
    scheduleTimer: null,
    currentBarIndex: 0,
    
    // 設定
    volume: 0.5,
    isMuted: false,

    // 音楽理論データ (testmusic.html.txt から移植)
    BPM: 120,
    get BEAT() { return 60 / this.BPM; },
    get BAR() { return this.BEAT * 4; },

    chordProgression: [
        'C','Am','F','G', 'C','Am','F','G',
        'C','Am','F','G', 'C','Am','F','G',
        'C','Am','F','G', 'C','Am','F','G',
        'F','G','Em','Am', 'F','G','C','C',
        'F','G','E7','Am', 'F','G','C','C',
        'F','G','E7','Am', 'F','G','C','C',
        'Ab','Bb','C','C', 'Ab','Bb','Gsus4','G',
        'C','Am','F','G', 'C','Am','F','G',
    ],
    chordNotes: {
        'C': ['C4','E4','G4','B4'], 'Am': ['A3','C4','E4','G4'], 'F': ['F3','A3','C4','E4'], 
        'G': ['G3','B3','D4','F4'], 'Em': ['E3','G3','B3','D4'], 'E7': ['E3','G#3','B3','D4'], 
        'Ab': ['Ab3','C4','Eb4','G4'], 'Bb': ['Bb3','D4','F4','A4'], 'Gsus4': ['G3','C4','D4','F4'] 
    },
    chordRoots: {
        'C': 'C2', 'Am': 'A1', 'F': 'F1', 'G': 'G1',
        'Em': 'E1', 'E7': 'E1', 'Ab': 'Ab1', 'Bb': 'Bb1', 'Gsus4': 'G1'
    },
    melA: [
        [0, 2, 'G4', 2], [0, 6, 'A4', 2], [0, 10, 'C5', 4], [1, 2, 'D5', 2], [1, 6, 'C5', 4], [1, 12, 'A4', 2],
        [2, 2, 'G4', 2], [2, 6, 'A4', 2], [2, 10, 'C5', 4], [3, 0, 'E5', 4], [3, 6, 'D5', 4], [3, 10, 'C5', 6],
        [4, 2, 'G4', 2], [4, 6, 'A4', 2], [4, 10, 'C5', 4], [5, 2, 'D5', 2], [5, 6, 'C5', 4], [5, 12, 'E5', 2],
        [6, 2, 'G5', 4], [6, 8, 'E5', 4], [6, 12, 'C5', 4], [7, 0, 'D5', 12]
    ],
    melB: [
        [0, 0, 'A4', 4], [0, 6, 'G4', 4], [0, 12, 'A4', 4], [1, 0, 'C5', 4], [1, 6, 'A4', 4], [1, 12, 'G4', 4],
        [2, 0, 'E4', 4], [2, 6, 'G4', 4], [2, 12, 'A4', 4], [3, 0, 'G4', 16],
        [4, 0, 'A4', 4], [4, 6, 'G4', 4], [4, 12, 'A4', 4], [5, 0, 'C5', 4], [5, 6, 'D5', 4], [5, 12, 'E5', 4],
        [6, 0, 'G5', 6], [6, 8, 'E5', 6], [7, 0, 'D5', 16]
    ],
    melChorus: [
        [0, 0, 'E5', 3], [0, 3, 'G5', 3], [0, 6, 'A5', 4], [0, 12, 'G5', 4], [1, 0, 'E5', 4], [1, 4, 'D5', 2], [1, 6, 'C5', 6],
        [2, 0, 'A4', 3], [2, 3, 'C5', 3], [2, 6, 'D5', 4], [2, 12, 'E5', 4], [3, 0, 'D5', 6], [3, 8, 'C5', 8],
        [4, 0, 'E5', 3], [4, 3, 'G5', 3], [4, 6, 'A5', 4], [4, 12, 'C6', 4], [5, 0, 'B5', 4], [5, 4, 'G5', 2], [5, 6, 'E5', 6],
        [6, 0, 'D5', 4], [6, 6, 'E5', 4], [6, 12, 'G5', 4], [7, 0, 'C5', 16]
    ],
    melBridge: [
        [0, 0, 'Eb5', 8], [0, 8, 'D5', 8], [1, 0, 'C5', 16], [2, 0, 'Eb5', 8], [2, 8, 'F5', 8], [3, 0, 'G5', 16],
        [4, 0, 'Ab5', 8], [4, 8, 'G5', 8], [5, 0, 'F5', 8], [5, 8, 'Eb5', 8], [6, 0, 'D5', 8], [6, 8, 'C5', 8], [7, 0, 'D5', 16]
    ],

    getFreq: function(noteStr) {
        const notes = { 'C': -9, 'C#': -8, 'Db': -8, 'D': -7, 'D#': -6, 'Eb': -6, 'E': -5, 'F': -4, 'F#': -3, 'Gb': -3, 'G': -2, 'G#': -1, 'Ab': -1, 'A': 0, 'A#': 1, 'Bb': 1, 'B': 2 };
        const match = noteStr.match(/([A-G][#b]?)([0-9])/);
        if (!match) return 0;
        const n = notes[match[1]];
        const octave = parseInt(match[2]) - 4; 
        return 440 * Math.pow(2, (n + octave * 12) / 12);
    },

    init: function() {
        if (!this.ctx) {
            this.ctx = window.AudioContext ? new AudioContext() : new webkitAudioContext();
        }
    },

    setVolume: function(v) {
        this.volume = v;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume * 0.8, this.ctx.currentTime, 0.1);
        }
    },

    setMute: function(m) {
        this.isMuted = m;
        this.setVolume(this.volume);
    },

    createLoungeReverb: function() {
        const length = this.ctx.sampleRate * 2.0; 
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const channel = impulse.getChannelData(c);
            for (let i = 0; i < length; i++) {
                channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.0) * 0.5;
            }
        }
        const convolver = this.ctx.createConvolver();
        convolver.buffer = impulse;
        return convolver;
    },

    playEPiano: function(freq, startTime, duration, vol) {
        const osc1 = this.ctx.createOscillator(); osc1.type = 'sine';
        const osc2 = this.ctx.createOscillator(); osc2.type = 'triangle';
        osc1.frequency.value = freq; osc2.frequency.value = freq;
        const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, startTime); filter.frequency.exponentialRampToValueAtTime(500, startTime + duration);
        const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.02); gain.gain.exponentialRampToValueAtTime(vol * 0.4, startTime + 0.3); gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        osc1.start(startTime); osc2.start(startTime); osc1.stop(startTime + duration); osc2.stop(startTime + duration);
    },
    playMarimba: function(freq, startTime, duration, vol) {
        const osc = this.ctx.createOscillator(); osc.type = 'sine'; const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(freq * 1.5, startTime); osc.frequency.exponentialRampToValueAtTime(freq, startTime + 0.05);
        gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol * 1.5, startTime + 0.01); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + 0.4);
    },
    playSynthLead: function(freq, startTime, duration, vol) {
        const osc = this.ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = freq;
        const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, startTime); filter.frequency.linearRampToValueAtTime(2000, startTime + 0.1); filter.frequency.linearRampToValueAtTime(1200, startTime + duration);
        const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.05); gain.gain.setValueAtTime(vol, startTime + duration - 0.1); gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
        const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.0;
        const lfoGain = this.ctx.createGain(); lfoGain.gain.setValueAtTime(0, startTime); lfoGain.gain.linearRampToValueAtTime(freq * 0.01, startTime + 0.2);
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        osc.start(startTime); lfo.start(startTime); osc.stop(startTime + duration); lfo.stop(startTime + duration);
    },
    playGlocken: function(freq, startTime, vol) {
        const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq * 2; 
        const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.01); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0);
        osc.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + 1.0);
    },
    playSubBass: function(freq, startTime, duration, vol) {
        const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
        const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.05); gain.gain.setValueAtTime(vol, startTime + duration - 0.1); gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + duration);
    },
    playPluckChord: function(freqs, startTime, vol) {
        freqs.forEach(freq => {
            const osc = this.ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq;
            const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(2000, startTime); filter.frequency.exponentialRampToValueAtTime(400, startTime + 0.2);
            const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.01); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
            osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + 0.4);
        });
    },
    playPad: function(freqs, startTime, duration, vol) {
        freqs.forEach(freq => {
            const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
            const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.5); gain.gain.setValueAtTime(vol, startTime + duration - 0.5); gain.gain.linearRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + duration);
        });
    },
    playDrum: function(type, startTime, vol) {
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        if (type === 'kick') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(100, startTime); osc.frequency.exponentialRampToValueAtTime(30, startTime + 0.1);
            gain.gain.setValueAtTime(vol, startTime); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
            osc.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + 0.2);
        } else if (type === 'rim') { 
            osc.type = 'triangle'; osc.frequency.setValueAtTime(800, startTime); osc.frequency.exponentialRampToValueAtTime(200, startTime + 0.05);
            gain.gain.setValueAtTime(vol, startTime); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
            osc.connect(gain); gain.connect(this.masterGain); osc.start(startTime); osc.stop(startTime + 0.05);
        } else if (type === 'hihat') {
            const bufferSize = this.ctx.sampleRate * 0.05; const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate); const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1; const noise = this.ctx.createBufferSource(); noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 6000;
            gain.gain.setValueAtTime(vol, startTime); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
            noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain); noise.start(startTime); noise.stop(startTime + 0.1);
        }
    },

    scheduleBar: function(barIndex, t) {
        const chordName = this.chordProgression[barIndex];
        const rootFreq = this.getFreq(this.chordRoots[chordName]);
        const noteFreqs = this.chordNotes[chordName].map(f => this.getFreq(f));
        const block = Math.floor(barIndex / 8); 
        const barInBlock = barIndex % 8;        

        if (block === 0 || block === 6 || block === 7) {
            this.playPad(noteFreqs, t, this.BAR, 0.08);
        } else {
            this.playPad(noteFreqs, t, this.BAR, 0.03); 
            this.playPluckChord(noteFreqs, t + 0 * this.BEAT, 0.05);
            this.playPluckChord(noteFreqs, t + 1.5 * this.BEAT, 0.04);
            this.playPluckChord(noteFreqs, t + 2.5 * this.BEAT, 0.05);
        }

        if (block === 0 || block === 6) {
            this.playSubBass(rootFreq, t, this.BAR, 0.5);
        } else {
            for (let i = 0; i < 8; i++) {
                if (i === 0 || i === 3 || i === 4 || i === 7) {
                    this.playSubBass(rootFreq, t + i * (this.BEAT/2), (this.BEAT/2) * 0.8, 0.45);
                }
            }
        }

        if (block !== 6) { 
            for (let i = 0; i < 4; i++) {
                const bt = t + i * this.BEAT;
                if (block > 0 && block !== 7) { 
                    if (i === 0 || i === 2) this.playDrum('kick', bt, 0.5);
                    if (i === 1 || i === 3) this.playDrum('rim', bt, 0.3); 
                } else {
                    if (i === 0) this.playDrum('kick', bt, 0.4);
                    if (i === 2) this.playDrum('rim', bt, 0.15);
                }
                this.playDrum('hihat', bt, 0.08);
                this.playDrum('hihat', bt + this.BEAT * 0.5, 0.12);
                if (block === 4 || block === 5) { 
                    this.playDrum('hihat', bt + this.BEAT * 0.25, 0.04);
                    this.playDrum('hihat', bt + this.BEAT * 0.75, 0.04);
                }
            }
        }

        let currentMelody = null;
        let instrument = '';
        if (block === 1) { currentMelody = this.melA; instrument = 'epiano'; }
        else if (block === 2) { currentMelody = this.melA; instrument = 'marimba'; }
        else if (block === 3) { currentMelody = this.melB; instrument = 'epiano'; }
        else if (block === 4) { currentMelody = this.melChorus; instrument = 'synth'; }
        else if (block === 5) { currentMelody = this.melChorus; instrument = 'synth_glocken'; }
        else if (block === 6) { currentMelody = this.melBridge; instrument = 'epiano'; }

        if (currentMelody) {
            currentMelody.forEach(noteData => {
                if (noteData[0] === barInBlock) { 
                    const step = noteData[1];
                    const freq = this.getFreq(noteData[2]);
                    const durStep = noteData[3];
                    const noteTime = t + step * (this.BEAT / 4);
                    const noteDur = durStep * (this.BEAT / 4);
                    
                    if (instrument === 'epiano') this.playEPiano(freq, noteTime, noteDur, 0.15);
                    else if (instrument === 'marimba') this.playMarimba(freq, noteTime, noteDur, 0.18);
                    else if (instrument === 'synth') this.playSynthLead(freq, noteTime, noteDur, 0.12);
                    else if (instrument === 'synth_glocken') {
                        this.playSynthLead(freq, noteTime, noteDur, 0.12);
                        this.playGlocken(freq, noteTime, 0.06); 
                    }
                }
            });
        }
    },

    checkAndSchedule: function() {
        if (!this.isPlaying) return;
        const LOOKAHEAD = 1.0; 
        while (this.nextStartTime < this.ctx.currentTime + LOOKAHEAD) {
            this.scheduleBar(this.currentBarIndex, this.nextStartTime);
            this.nextStartTime += this.BAR;
            this.currentBarIndex = (this.currentBarIndex + 1) % 64; 
        }
        this.scheduleTimer = setTimeout(() => this.checkAndSchedule(), 100);
    },

    startLobbyBGM: function() {
        if (this.isPlaying) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        this.currentBarIndex = 0; 
        this.masterGain = this.ctx.createGain();
        
        // 音量設定を反映
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume * 0.8; 
        
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -25;
        this.compressor.knee.value = 40;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.01;
        this.compressor.release.value = 0.25;
        
        const reverb = this.createLoungeReverb();
        const reverbWetGain = this.ctx.createGain();
        reverbWetGain.gain.value = 0.25; 
        
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        this.masterGain.connect(reverb);
        reverb.connect(reverbWetGain);
        reverbWetGain.connect(this.compressor);
        
        this.isPlaying = true;
        this.nextStartTime = this.ctx.currentTime + 0.1;
        this.checkAndSchedule();
    },

    stopBGM: function(fadeDuration = 1.5) {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearTimeout(this.scheduleTimer);
        
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, fadeDuration / 5);
            let targetGain = this.masterGain;
            setTimeout(() => {
                if (targetGain) {
                    targetGain.disconnect();
                }
            }, fadeDuration * 1000); 
        }
    }
};
