// =====================================
// minigames/bom_battle.js
// 爆弾バトル プラグイン
// 爆弾のみが出現するフィールドで、爆風や落下から最後まで生き残る
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['bom_battle'] = {
    hp: 3,
    maxHp: 3,
    invincibleTimer: 0,
    isPlaying: false,
    timeLimit: 3,
    remainTime: 0,
    startTime: 0,
    hpUI: null,

    // カウントダウン開始時に呼ばれる初期化処理
    init: function(settings) {
        console.log("[Bom Battle] Initializing...");
        this.isPlaying = false;
        this.hp = this.maxHp;
        this.invincibleTimer = 0;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;

        // ★アイテムシステムの特別ルールを適用 (コアを汚さずハイジャック)
        if (window.ItemSystem) {
            window.ItemSystem.forceItemType = 'bomb'; // 爆弾のみ出現
            window.ItemSystem.isStackable = true;     // スタック可能
            let baseItems = settings && settings.items ? parseInt(settings.items, 10) : 1;
            window.ItemSystem.maxItems = baseItems + 3; // 指定数 + 3 個出現
        }

        this.createUI();
    },

    // 「START!!」表示後に呼ばれる
    start: function() {
        console.log("[Bom Battle] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
        this.startTime = Date.now();
    },

    // 毎フレームの更新処理
    update: function(delta) {
        if (!this.isPlaying) return;

        // タイマーの処理
        this.remainTime -= delta;
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.isPlaying = false;
            
            // 時間切れ＝生き残ったので生存クリア
            if (window.MinigameManager && window.MinigameManager.resultData) {
                const limitSec = this.timeLimit * 60;
                let m = Math.floor(limitSec / 60);
                let s = Math.floor(limitSec % 60);
                let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                window.MinigameManager.resultData.forEach(data => {
                    if (!data.isRetired) {
                        data.scoreValue = limitSec; 
                        data.scoreText = timeStr; 
                        data.statusText = "生存クリア"; 
                    }
                });
                window.MinigameManager.endGame();
            }
            return;
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        // 無敵時間と点滅のアニメーション
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= delta;
            
            if (typeof player !== 'undefined' && player && !window.isSpectatorMode) {
                // 点滅 (0.1秒間隔)
                const isVisible = Math.floor(this.invincibleTimer * 10) % 2 === 0;
                player.traverse(child => {
                    if (child.isMesh) { // スプライト（名前等）は消さず、体だけ点滅させる
                        child.visible = isVisible;
                    }
                });
            }
            
            if (this.invincibleTimer <= 0) {
                this.invincibleTimer = 0;
                // 点滅終了時に必ず表示を戻す
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => {
                        if (child.isMesh) {
                            child.visible = true;
                        }
                    });
                }
            }
        }

        // 爆風によるダメージ判定
        if (!window.isSpectatorMode && this.invincibleTimer <= 0) {
            // knockbackフラグを参照（システムによって所属先が変わるため両対応）
            let kb = null;
            if (window.ItemEffects && window.ItemEffects.knockback) kb = window.ItemEffects.knockback;
            else if (window.ItemSystem && window.ItemSystem.knockback) kb = window.ItemSystem.knockback;

            if (kb && kb.timer > 0) {
                this.takeDamage();
            }
        }
    },

    // ダメージ処理
    takeDamage: function() {
        this.hp--;
        this.updateHPUI();
        
        if (typeof window.addLog === 'function') {
            window.addLog(`<span style="color:#ff4444;">爆発に巻き込まれた！ 残りライフ: ${this.hp}</span>`, 'sys');
        }

        if (this.hp <= 0) {
            this.isPlaying = false; // ダメージ判定を止める
            if (window.MinigameManager) {
                // HP0でリタイア実行。アイテム没収や観戦モード移行はマネージャーが自動で行う
                window.MinigameManager.executeRetire();
            }
        } else {
            // 無敵時間を2秒付与
            this.invincibleTimer = 2.0;
        }
    },

    // リタイア時のスコア（生存時間）登録
    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                let survivedSeconds = 0;
                if (this.startTime) {
                    survivedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                }
                
                const limitSec = this.timeLimit * 60;
                if (survivedSeconds > limitSec) survivedSeconds = limitSec;

                let m = Math.floor(survivedSeconds / 60);
                let s = Math.floor(survivedSeconds % 60);
                let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                data.isRetired = true;
                data.scoreValue = survivedSeconds; 
                data.scoreText = timeStr; // 生存時間
            }
        }
        
        // 自分がリタイアしたらライフUIを消す
        if (this.hpUI) this.hpUI.style.display = 'none';
    },

    // ゲーム終了時
    end: function() {
        console.log("[Bom Battle] Game Ended.");
        this.isPlaying = false;
        this.invincibleTimer = 0;

        // 点滅の復元（念のため）
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => {
                if (child.isMesh) {
                    child.visible = true;
                }
            });
        }

        // ランキング計算
        if (window.MinigameManager && window.MinigameManager.resultData) {
            let rd = window.MinigameManager.resultData;
            rd.sort((a, b) => b.scoreValue - a.scoreValue);
            
            let currentRank = 1;
            for (let i = 0; i < rd.length; i++) {
                if (i > 0 && rd[i].scoreValue < rd[i-1].scoreValue) {
                    currentRank = i + 1;
                }
                rd[i].rank = currentRank;
            }
        }

        // UI破棄
        if (this.hpUI) {
            this.hpUI.remove();
            this.hpUI = null;
        }
    },

    // ---------------------------------
    // UI関連の処理
    // ---------------------------------
    createUI: function() {
        this.hpUI = document.createElement('div');
        this.hpUI.id = 'bom-battle-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        this.hpUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid #ff4444; border-radius: 12px; padding: 5px 10px; color: white; font-size: 20px; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 5px;`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.hpUI);
        
        this.updateHPUI();
    },

    updateHPUI: function() {
        if (!this.hpUI) return;
        let hearts = '';
        for (let i = 0; i < this.maxHp; i++) {
            if (i < this.hp) {
                // 残りライフ（赤）
                hearts += '<span style="color:#ff4444; text-shadow:0 0 5px #ff0000;">❤️</span>';
            } else {
                // 失ったライフ（グレー）
                hearts += '<span style="color:#555555; filter:grayscale(100%);">🖤</span>';
            }
        }
        this.hpUI.innerHTML = hearts;
    },
    
    // 他のプレイヤーへの同期用 (今回はマネージャー側で完結するため使用しない)
    handleNetwork: function(data) {}
};
