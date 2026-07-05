// =====================================
// se_system.js
// 効果音の生成と3Dサウンド管理 ＆ 既存システムとの連携フック
// =====================================

window.SESystem = {
    ctx: null,
    masterGain: null,
    listener: null, // Three.js 3D AudioListener
    volume: 0.5,
    isMuted: false,
    
    init: function() {
        if (!this.ctx) {
            this.ctx = window.AudioContext ? new AudioContext() : new webkitAudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.updateGain();
        }
        // Three.js のカメラが存在すれば AudioListener を付与 (3Dサウンド用)
        if (!this.listener && typeof camera !== 'undefined' && camera && typeof THREE !== 'undefined') {
            this.listener = new THREE.AudioListener();
            camera.add(this.listener);
        }
    },
    
    setVolume: function(v) { this.volume = v; this.updateGain(); },
    setMute: function(m) { this.isMuted = m; this.updateGain(); },
    updateGain: function() {
        if (this.masterGain) this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
    },
    
    // ---------------------------------
    // 効果音シンセサイザー (仮音源)
    // ---------------------------------
    playJump: function() {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + 0.2);
    },
    
    playCoin: function() {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.setValueAtTime(1600, this.ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(this.volume * 0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + 0.3);
    },

    playFall: function() {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(this.volume * 0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + 0.5);
    },

    playCountdown: function(isStart) {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = isStart ? 880 : 440; // スタートは高いポーン、それ以外はピッ
        gain.gain.setValueAtTime(this.volume * 0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (isStart ? 0.8 : 0.2));
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + 1.0);
    },

    playExplosion3D: function(position) {
        if (!this.ctx || this.isMuted || !this.listener || !position) return;
        const duration = 1.5;
        const sampleRate = this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / buffer.length, 3); // 減衰ノイズ
        }
        
        const sound = new THREE.PositionalAudio(this.listener);
        sound.setBuffer(buffer);
        sound.setRefDistance(5);   // この距離までは減衰しない
        sound.setMaxDistance(50);  // 最大減衰距離
        sound.setVolume(this.volume * 0.8);
        
        // フィルタでこもった爆発音に
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 800;
        sound.setFilter(filter);

        // 音源をその場に配置
        const mesh = new THREE.Object3D();
        mesh.position.copy(position);
        
        if (typeof scene !== 'undefined') scene.add(mesh);
        mesh.add(sound);
        
        sound.play();
        setTimeout(() => { 
            if (typeof scene !== 'undefined') scene.remove(mesh); 
            if (sound.isPlaying) sound.stop(); 
        }, duration * 1000);
    }
};

// =====================================
// フック処理（既存の処理に横入りして音を鳴らす）
// =====================================
window.initAudioHooks = function() {
    // 画面クリックでAudioContextを起動 (ブラウザの制約対策)
    const startAudio = () => {
        window.BGMSystem.init();
        window.SESystem.init();
        window.BGMSystem.startLobbyBGM();
        document.removeEventListener('click', startAudio);
        document.removeEventListener('touchstart', startAudio);
    };
    document.addEventListener('click', startAudio);
    document.addEventListener('touchstart', startAudio, {passive: true});

    // 1. ジャンプ音のハイジャック
    const origDoJump = window.doJump;
    if (origDoJump) {
        window.doJump = function() {
            origDoJump.apply(this, arguments);
            if (window.isJumping && !window.isSpectatorMode) {
                window.SESystem.playJump();
            }
        };
    }

    // 2. コイン取得音のハイジャック
    if (window.MinigamePlugins && window.MinigamePlugins['coin_rush']) {
        const cr = window.MinigamePlugins['coin_rush'];
        const origPickup = cr.pickupCoin;
        cr.pickupCoin = function(id) {
            origPickup.apply(this, arguments);
            window.SESystem.playCoin(); // 自分が取った時だけ鳴る
        };
    }

    // 3. 落下（リタイア）音のハイジャック
    for (let key in window.MinigamePlugins) {
        const plugin = window.MinigamePlugins[key];
        if (plugin.handleFallPenalty) {
             const origFall = plugin.handleFallPenalty;
             plugin.handleFallPenalty = function() {
                 origFall.apply(this, arguments);
                 window.SESystem.playFall();
             };
        }
    }

    // 4. BGM停止とカウントダウン音のハイジャック
    if (window.MinigameManager) {
        const origStartGame = window.MinigameManager.startGame;
        window.MinigameManager.startGame = function() {
            window.BGMSystem.stopBGM(2.0); // 3,2,1 の間に2秒かけてフェードアウト
            
            // カウントダウン音 (3, 2, 1, START)
            setTimeout(() => window.SESystem.playCountdown(false), 0);
            setTimeout(() => window.SESystem.playCountdown(false), 1000);
            setTimeout(() => window.SESystem.playCountdown(false), 2000);
            setTimeout(() => window.SESystem.playCountdown(true), 3000);
            
            origStartGame.apply(this, arguments);
        };
        
        const origEndGame = window.MinigameManager.endGame;
        window.MinigameManager.endGame = function() {
            origEndGame.apply(this, arguments);
            window.BGMSystem.startLobbyBGM(); // リザルトに戻るのでロビーBGM再開
        };
    }

    // 5. 爆発音 (将来のItemSystem連携用ダミーエンドポイント)
    window.playExplosionSE = function(position) {
        window.SESystem.playExplosion3D(position);
    };
};

// 1秒待ってからフックを実行 (他ファイルのロード完了を待つため)
setTimeout(() => {
    window.initAudioHooks();
}, 1000);
