// =====================================
// minigame_core.js
// ミニゲーム本編のメインロジックとリザルト管理（3分割の3/3）
// ★ラグ検知、全滅判定（Spectator基準）、リタイア処理、リザルトの即時表示を担当
// =====================================

window.MinigameManager = window.MinigameManager || {};

Object.assign(window.MinigameManager, {

    // ---------------------------------
    // 🎮 ゲームプレイ中の更新とラグ検知
    // ---------------------------------
    update: function(delta) {
        if (this.state !== 'PLAYING') return;

        // ★ ラグ検知：バックグラウンド等で1秒以上止まっていたら残り時間を終了予定時刻から強制再計算
        if (delta > 1.0 && this.targetEndTime > 0) {
            const remainSec = (this.targetEndTime - Date.now()) / 1000;
            if (remainSec <= 0) {
                if (this.currentPlugin && typeof this.currentPlugin.isPlaying !== 'undefined') {
                    this.currentPlugin.isPlaying = false;
                }
                this.endGame();
                return;
            } else {
                if (this.currentPlugin && typeof this.currentPlugin.remainTime !== 'undefined') {
                    this.currentPlugin.remainTime = remainSec;
                }
            }
        }

        if (this.currentPlugin && typeof this.currentPlugin.update === 'function') {
            this.currentPlugin.update(delta);
        }
    },

    // ---------------------------------
    // リタイア処理とスコアの固定
    // ---------------------------------
    confirmRetire: function() {
        const popup = document.getElementById('mg-retire-popup');
        if (popup) {
            popup.style.display = 'flex';
            document.getElementById('mg-btn-retire-yes').onclick = () => {
                popup.style.display = 'none';
                this.executeRetire();
            };
            document.getElementById('mg-btn-retire-no').onclick = () => {
                popup.style.display = 'none';
            };
        }
    },

    executeRetire: function() {
        if (typeof window.addLog === 'function') window.addLog('<span style="color:#ffaa00;">リタイアしました。観戦モードに移行します。</span>', 'sys');
        
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        
        // プラグイン側のリタイア処理を実行
        if (this.currentPlugin && typeof this.currentPlugin.onRetire === 'function') {
            this.currentPlugin.onRetire(myId);
        }
        
        // ★ リタイア時のスコアを計算・確定させて固定する
        const myData = this.resultData.find(d => d.id === myId);
        if (myData) {
            myData.isRetired = true;
            let cVal = 0, cText = "", cStatus = "";
            
            if (this.currentPlugin && this.currentProposal) {
                if (this.currentProposal.gameId === 'coin_rush') {
                    cVal = typeof this.currentPlugin.myScore !== 'undefined' ? this.currentPlugin.myScore : 0;
                    cText = `${cVal}枚`;
                } else if (this.currentProposal.gameId === 'bom_battle') {
                    cVal = typeof this.currentPlugin.hp !== 'undefined' ? this.currentPlugin.hp : 0;
                    cText = typeof this.currentPlugin.getHeartsString === 'function' ? this.currentPlugin.getHeartsString(cVal) : `${cVal} HP`;
                } else if (this.currentProposal.gameId === 'survival') {
                    const survived = Math.floor((Date.now() - (this.currentPlugin.startTime || this.targetStartTime)) / 1000);
                    let m = Math.floor(survived / 60);
                    let s = Math.floor(survived % 60);
                    cText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }
            }
            myData.scoreValue = cVal;
            myData.scoreText = cText;
            myData.statusText = cStatus;

            // 固定したスコアを他プレイヤーに送信
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({ 
                    type: 'mg_update_score', 
                    userId: myId, 
                    scoreValue: myData.scoreValue, 
                    scoreText: myData.scoreText,
                    statusText: myData.statusText,
                    isRetired: myData.isRetired
                });
            }
        }

        // アイテム装備のリセット
        if (window.ItemSystem) {
            window.ItemSystem.mySlotItem = null;
            window.ItemSystem.stackedCount = 0;
            window.ItemSystem.isFlyMode = false;
            window.ItemSystem.isCoolingDown = false;
            if (window.ItemSystem.slotUI) window.ItemSystem.slotUI.classList.remove('cooling');
            window.ItemSystem.updateSlotUI();
        }

        this.enterSpectatorMode();
    },

    // ---------------------------------
    // スコアの途中経過送信（メンバーリスト用）
    // ---------------------------------
    replyMyScore: function() {
        if (this.state !== 'PLAYING') return;
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        const myData = this.resultData.find(d => d.id === myId);

        let cVal = 0, cText = "", cStatus = "";

        // ★ リタイア済みなら固定されたスコアを返す。生存中なら現在値を計算する。
        if (myData && myData.isRetired) {
            cVal = myData.scoreValue;
            cText = myData.scoreText;
            cStatus = "リタイア";
        } else if (this.currentPlugin && this.currentProposal) {
            if (this.currentProposal.gameId === 'coin_rush') {
                cVal = typeof this.currentPlugin.myScore !== 'undefined' ? this.currentPlugin.myScore : 0;
                cText = `${cVal}枚`;
            } else if (this.currentProposal.gameId === 'bom_battle') {
                cVal = typeof this.currentPlugin.hp !== 'undefined' ? this.currentPlugin.hp : 0;
                cText = typeof this.currentPlugin.getHeartsString === 'function' ? this.currentPlugin.getHeartsString(cVal) : `${cVal} HP`;
            } else if (this.currentProposal.gameId === 'survival') {
                const survived = Math.floor((Date.now() - (this.currentPlugin.startTime || this.targetStartTime)) / 1000);
                let m = Math.floor(survived / 60);
                let s = Math.floor(survived % 60);
                cText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                cStatus = "生存中";
            }
        }

        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_reply_score',
                userId: myId,
                currentScoreText: cText
            });
        }
        
        const statusEl = document.getElementById('member-score-' + myId);
        if (statusEl) {
            statusEl.innerText = cText;
            statusEl.style.color = '#ffaa00';
        }
    },

    // ---------------------------------
    // 観戦モードと終了判定
    // ---------------------------------
    enterSpectatorMode: function() {
        if (!window.isSpectatorMode) {
            window.isSpectatorMode = true;
            if (typeof player !== 'undefined' && player) {
                player.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => { m.transparent = true; m.opacity = 0.4; m.needsUpdate = true; });
                        } else {
                            child.material.transparent = true;
                            child.material.opacity = 0.4;
                            child.material.needsUpdate = true;
                        }
                    }
                });
            }
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({ type: 'mg_spectator', isSpectator: true });
            }
            
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn && mgBtn.classList.contains('abort-mode')) {
                mgBtn.innerText = '観戦モード';
                mgBtn.classList.add('spectator-mode');
            }
            if (typeof window.toggleSpectatorUI === 'function') window.toggleSpectatorUI(true);

            this.checkAllSpectators();
        }
    },

    exitSpectatorMode: function() {
        if (window.isSpectatorMode) {
            window.isSpectatorMode = false;
            if (typeof player !== 'undefined' && player) {
                player.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => { m.transparent = false; m.opacity = 1; m.needsUpdate = true; });
                        } else {
                            child.material.transparent = false;
                            child.material.opacity = 1;
                            child.material.needsUpdate = true;
                        }
                    }
                });
            }
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({ type: 'mg_spectator', isSpectator: false });
                if (typeof window.MultiplayerManager.forceSendPos === 'function') {
                    window.MultiplayerManager.forceSendPos();
                }
            }
            
            if (typeof window.toggleSpectatorUI === 'function') window.toggleSpectatorUI(false);
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn) mgBtn.classList.remove('spectator-mode');
        }
    },

    // ★ 初期仕様へ復元: 終了判定は「全員がSpectatorModeになったか」で行う
    checkAllSpectators: function() {
        if (this.state !== 'PLAYING') return;

        let allSpectators = true;
        if (!window.isSpectatorMode) allSpectators = false;

        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            for (let id in window.MultiplayerManager.otherPlayers) {
                if (!window.MultiplayerManager.otherPlayers[id].isSpectator) {
                    allSpectators = false;
                    break;
                }
            }
        }

        if (allSpectators) {
            if (typeof window.addLog === 'function') {
                window.addLog('<span style="color:#ff3300;">生存者がいなくなりました。ゲームを終了します。</span>', 'sys');
            }
            this.endGame();
        }
    },

    handlePlayerExit: function(userId) {
        // 退出者をリタイア扱いにする
        const data = this.resultData.find(d => d.id === userId);
        if (data) data.isRetired = true;

        if (this.state === 'PLAYING') {
            this.checkAllSpectators();
        }
    },

    // ---------------------------------
    // 🏆 ゲーム終了とリザルト
    // ---------------------------------
    endGame: function() {
        if (this.state === 'RESULT') return; 
        this.state = 'RESULT';
        
        const timerUI = document.getElementById('mg-timer-ui');
        if (timerUI) timerUI.style.display = 'none';

        // 先にプラグインを終了させ、リザルトに最終スコアを書き込ませる
        if (this.currentPlugin && typeof this.currentPlugin.end === 'function') {
            this.currentPlugin.end();
        }

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        const myData = this.resultData.find(d => d.id === myId);
        
        // ★ 自分が参加者でリタイアしていない場合、最終スコアを計算して確定送信する
        if (myData && !myData.isRetired) {
            // プラグイン側が書き込んでいなかった場合のフォールバック計算
            if (myData.scoreValue === null) {
                let cVal = 0, cText = "", cStatus = "生存クリア";
                if (this.currentProposal) {
                    if (this.currentProposal.gameId === 'coin_rush') {
                        cVal = typeof this.currentPlugin.myScore !== 'undefined' ? this.currentPlugin.myScore : 0;
                        cText = `${cVal}枚`;
                        cStatus = "タイムアップ";
                    } else if (this.currentProposal.gameId === 'bom_battle') {
                        cVal = typeof this.currentPlugin.hp !== 'undefined' ? this.currentPlugin.hp : 0;
                        cText = typeof this.currentPlugin.getHeartsString === 'function' ? this.currentPlugin.getHeartsString(cVal) : `${cVal} HP`;
                    } else if (this.currentProposal.gameId === 'survival') {
                        const survived = Math.floor((Date.now() - (this.currentPlugin.startTime || this.targetStartTime)) / 1000);
                        let m = Math.floor(survived / 60);
                        let s = Math.floor(survived % 60);
                        cText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }
                }
                myData.scoreValue = cVal;
                myData.scoreText = cText;
                myData.statusText = cStatus;
            }

            // 自分の最終結果を必ず送信する（これが無いと他人は全員通信エラーになってしまう）
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({ 
                    type: 'mg_update_score', 
                    userId: myId, 
                    scoreValue: myData.scoreValue, 
                    scoreText: myData.scoreText,
                    statusText: myData.statusText,
                    isRetired: myData.isRetired
                });
            }
        }

        this.currentPlugin = null;

        // まだスコアを受信していない人は「通信エラー」扱いにしておく
        this.resultData.forEach(d => {
            if (d.scoreValue === null && !d.isRetired) {
                d.isError = true;
            }
        });

        // ★ 待たずに即座にリザルトを表示する
        if (window.MinigameUI && typeof window.MinigameUI.showResult === 'function') {
            window.MinigameUI.showResult(this.currentProposal ? this.currentProposal.title : "ミニゲーム", this.resultData);
        }

        this.currentProposal = null;
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('abort-mode');
            mgBtn.classList.remove('spectator-mode');
            mgBtn.classList.remove('detail-mode');
            mgBtn.innerText = 'ミニゲーム';
        }

        this.exitSpectatorMode();
        
        if (window.ItemSystem) {
            window.ItemSystem.clearAllItems();
            window.ItemSystem.canPickup = true; 
            window.ItemSystem.forceItemType = null; 
            window.ItemSystem.isStackable = false; 
        }
        
        // 5秒後にIDLEへ戻る
        setTimeout(() => {
            this.state = 'IDLE';
        }, 5000);
    }
});
