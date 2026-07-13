// =====================================
// minigame_flow.js
// ミニゲームの進行フローとUI遷移管理（3分割の2/3）
// ★通信を使わず、ローカルのMinigameListから説明文を取得して表示
// ★PLAYING状態での途中入室時、プラグインを正しく再現・開始する処理を追加
// ★カウントダウンと3,2,1演出を setInterval から requestAnimationFrame と絶対時間計算に修正し、タイマーのズレを解消
// ★詳細画面・申請ポップアップ画面にアイコンのフォールバック表示(🎮)を追加
// =====================================

window.MinigameManager = window.MinigameManager || {};

Object.assign(window.MinigameManager, {

    init: function() {
        console.log("Minigame Flow Initialized.");
        window.isSpectatorMode = false;
    },

    openListView: function() {
        if (this.state !== 'IDLE') return;
        document.getElementById('mg-list-window').style.display = 'flex';
        if (typeof this.renderList === 'function') this.renderList();
    },

    closeAllViews: function() {
        const els = ['mg-list-window', 'mg-detail-window', 'mg-proposal-popup'];
        els.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    },

    renderList: function() {
        const container = document.getElementById('mg-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        window.MinigameList.forEach(game => {
            const item = document.createElement('div');
            item.className = 'mg-list-item';
            
            const icon = document.createElement('div');
            icon.className = 'mg-list-icon';
            const img = new Image();
            img.onload = () => { icon.style.backgroundImage = `url(${game.icon})`; };
            img.onerror = () => { 
                icon.style.backgroundColor = '#555'; 
                icon.innerText = '🎮'; 
                icon.style.display = 'flex';
                icon.style.justifyContent = 'center';
                icon.style.alignItems = 'center';
                icon.style.fontSize = '30px';
            };
            img.src = game.icon;

            const title = document.createElement('div');
            title.className = 'mg-list-title';
            title.innerText = game.title;

            item.appendChild(icon);
            item.appendChild(title);
            item.onclick = () => {
                if (typeof this.openDetailView === 'function') this.openDetailView(game);
            };
            
            container.appendChild(item);
        });
    },

    openDetailView: function(game) {
        document.getElementById('mg-list-window').style.display = 'none';
        document.getElementById('mg-detail-window').style.display = 'flex';
        
        document.getElementById('mg-detail-title').innerText = game.title;
        document.getElementById('mg-detail-desc').innerText = game.description;
        
        // ★ 変更点: アイコンのフォールバック処理を実装
        const iconEl = document.getElementById('mg-detail-icon');
        iconEl.style.backgroundImage = 'none';
        iconEl.innerText = '';
        iconEl.style.backgroundColor = 'transparent';
        
        const img = new Image();
        img.onload = () => { 
            iconEl.style.backgroundImage = `url(${game.icon})`; 
        };
        img.onerror = () => { 
            iconEl.style.backgroundColor = '#555'; 
            iconEl.innerText = '🎮'; 
        };
        img.src = game.icon;

        if (typeof this.setupToggles === 'function') {
            this.setupToggles('mg-toggle-time', 3);
            this.setupToggles('mg-toggle-item', 1);
            this.setupToggles('mg-toggle-pos', 'current');
        }

        const startBtn = document.getElementById('mg-detail-start-btn');
        startBtn.onclick = () => {
            if (typeof this.proposeGame === 'function') this.proposeGame(game);
        };
    },

    setupToggles: function(containerId, defaultValue) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const btns = container.querySelectorAll('.mg-toggle-btn');
        btns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.val == defaultValue) btn.classList.add('active');
            btn.onclick = () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
    },

    getToggleValue: function(containerId) {
        const container = document.getElementById(containerId);
        const activeBtn = container.querySelector('.mg-toggle-btn.active');
        return activeBtn ? activeBtn.dataset.val : null;
    },

    proposeGame: function(game) {
        const time = this.getToggleValue('mg-toggle-time');
        const items = this.getToggleValue('mg-toggle-item');
        const pos = this.getToggleValue('mg-toggle-pos');

        this.closeAllViews();

        const timestamp = Date.now();
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        this.currentProposal = {
            gameId: game.id, title: game.title, icon: game.icon, script: game.script, 
            settings: { time, items, pos },
            proposerId: myId,
            timestamp: timestamp,
            votes: { [myId]: true }
        };

        this.state = 'PROPOSING';
        this.myVote = true;
        this.earliestReadyTime = Infinity;
        this.proposeEndTime = timestamp + 60000; 
        
        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }

        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.innerText = 'ゲーム詳細';
            mgBtn.classList.add('detail-mode');
        }

        if (totalUsers === 1) {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">参加者が1人のため、シングルプレイで開始します！</span>', 'sys');
            if (typeof this.startCountdownPrepare === 'function') this.startCountdownPrepare();
        } else {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームを申請しました。他プレイヤーの参加受付中です...</span>', 'sys');
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({ type: 'mg_propose', proposal: this.currentProposal });
            }
            if (typeof this.startProposingTimer === 'function') this.startProposingTimer();
        }
    },

    receiveProposal: function(proposal) {
        if (this.state !== 'IDLE') {
            if (this.state === 'PROPOSING' && this.currentProposal && proposal.timestamp < this.currentProposal.timestamp) {
                if (typeof this.cancelProposal === 'function') this.cancelProposal("より早く申請された別のゲームが優先されました。");
            } else {
                return;
            }
        }

        this.state = 'PROPOSING';
        this.currentProposal = proposal;
        this.myVote = null;
        this.earliestReadyTime = Infinity;

        this.proposeEndTime = proposal.timestamp + 60000;
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.innerText = 'ゲーム詳細';
            mgBtn.classList.add('detail-mode');
        }

        if (typeof this.showProposalPopup === 'function') this.showProposalPopup();
        if (typeof this.startProposingTimer === 'function') this.startProposingTimer();
    },

    cancelProposal: function(reason) {
        if (this.state === 'IDLE') return;
        this.state = 'IDLE';
        this.currentProposal = null;
        this.myVote = null;
        
        this.closeAllViews();
        const overlay = document.getElementById('mg-countdown-overlay');
        if (overlay) overlay.style.display = 'none';
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('detail-mode');
            mgBtn.innerText = 'ミニゲーム';
        }
        
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
        if (typeof this.exitSpectatorMode === 'function') this.exitSpectatorMode();
    },

    showProposalPopup: function() {
        if (!this.currentProposal || this.state !== 'PROPOSING') return;
        const p = this.currentProposal;
        
        const popup = document.getElementById('mg-proposal-popup');
        if (!popup) return;

        document.getElementById('mg-popup-title').innerText = p.title;

        // ★ 変更点: ポップアップのアイコン表示およびフォールバック処理を実装
        const iconEl = document.getElementById('mg-popup-icon');
        if (iconEl) {
            iconEl.style.backgroundImage = 'none';
            iconEl.innerText = '';
            iconEl.style.backgroundColor = 'transparent';
            
            const img = new Image();
            img.onload = () => { 
                iconEl.style.backgroundImage = `url(${p.icon})`; 
            };
            img.onerror = () => { 
                iconEl.style.backgroundColor = '#555'; 
                iconEl.innerText = '🎮'; 
            };
            img.src = p.icon;
        }

        const descEl = document.getElementById('mg-popup-desc');
        if (descEl) {
            const listData = window.MinigameList ? window.MinigameList.find(g => g.id === p.gameId) : null;
            if (listData && listData.description) {
                descEl.innerText = listData.description;
                descEl.style.display = 'block';
            } else {
                descEl.innerText = '';
                descEl.style.display = 'none';
            }
        }

        document.getElementById('mg-popup-rules').innerText = `制限時間: ${p.settings.time}分 | アイテム: ${p.settings.items}個 | 開始: ${p.settings.pos === 'current' ? '現在地' : '初期地'}`;
        
        const btnContainer = document.getElementById('mg-popup-btns-container');
        btnContainer.innerHTML = '';

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        if (String(p.proposerId) === myId) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'mg-popup-btn cancel';
            cancelBtn.innerText = '申請を取り下げる';
            cancelBtn.onclick = () => {
                popup.style.display = 'none';
                if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_cancel', reason: '申請者によりゲームの申請が取り下げられました。' });
                this.cancelProposal("ゲームの申請を取り下げました。");
            };
            btnContainer.appendChild(cancelBtn);
        } else {
            const joinBtn = document.createElement('button');
            joinBtn.className = 'mg-popup-btn join';
            joinBtn.innerText = '参加する';
            joinBtn.onclick = () => {
                popup.style.display = 'none';
                if (typeof window.addLog === 'function') window.addLog('参加を表明しました！', 'sys');
                if (typeof this.sendMyVote === 'function') this.sendMyVote(true);
            };
            
            const declineBtn = document.createElement('button');
            declineBtn.className = 'mg-popup-btn decline';
            declineBtn.innerText = '参加しない';
            declineBtn.onclick = () => {
                popup.style.display = 'none';
                if (typeof window.addLog === 'function') window.addLog('不参加（観戦モード）を選択しました。', 'sys');
                if (typeof this.sendMyVote === 'function') this.sendMyVote(false);
            };
            
            btnContainer.appendChild(joinBtn);
            btnContainer.appendChild(declineBtn);
        }

        popup.style.display = 'flex';
    },

    startProposingTimer: function() {
        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
        const label = overlay.querySelector('.mg-cd-label');
        
        label.innerText = '参加受付終了まで';
        overlay.style.display = 'flex';

        const updateTimer = () => {
            if (this.state !== 'PROPOSING') {
                return;
            }

            const remain = Math.ceil((this.proposeEndTime - Date.now()) / 1000);
            
            const popTimer = document.getElementById('mg-popup-timer');
            if (popTimer) popTimer.innerText = `残り受付時間: ${Math.max(0, remain)}秒`;

            if (remain > 0) {
                countText.innerText = remain;
                requestAnimationFrame(updateTimer);
            } else {
                if (typeof this.endProposingAndPrepare === 'function') this.endProposingAndPrepare();
            }
        };
        updateTimer();
    },

    checkProposingStatus: function() {
        if (this.state !== 'PROPOSING' || !this.currentProposal) return;

        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }
        
        const answeredCount = Object.keys(this.currentProposal.votes || {}).length;

        if (answeredCount >= totalUsers) {
            this.proposeEndTime = 0; 
            if (typeof this.endProposingAndPrepare === 'function') this.endProposingAndPrepare();
        }
    },

    endProposingAndPrepare: function() {
        if (this.state !== 'PROPOSING') return; 
        const overlay = document.getElementById('mg-countdown-overlay');
        if (overlay) overlay.style.display = 'none';

        let joinCount = 0;
        let isProposerJoined = false;
        const votes = this.currentProposal.votes || {};
        
        for (let uid in votes) {
            if (votes[uid] === true) {
                joinCount++;
                if (String(uid) === String(this.currentProposal.proposerId)) isProposerJoined = true;
            }
        }

        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }

        if (joinCount >= 2 || (joinCount === 1 && isProposerJoined && totalUsers === 1)) {
            if (typeof this.startCountdownPrepare === 'function') this.startCountdownPrepare();
        } else {
            if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_cancel', reason: '参加者が集まりませんでした。（申請者のみ）' });
            this.cancelProposal("参加者が集まりませんでした。（申請者のみ）");
        }
    },

    startCountdownPrepare: function() {
        if (this.state === 'COUNTDOWN') return;
        this.state = 'COUNTDOWN';
        this.closeAllViews();
        
        const now = Date.now();
        
        if (now < this.earliestReadyTime) {
            this.earliestReadyTime = now;
        }
        
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'mg_ready', userId: myId, timestamp: now });
        }
        
        if (typeof this.calcTargetTimes === 'function') this.calcTargetTimes();
        if (typeof this.startCountdown === 'function') this.startCountdown();
    },

    loadPlugin: function() {
        if (!this.currentProposal || !this.currentProposal.script) return;
        
        if (window.loadGameScript) {
            window.loadGameScript(this.currentProposal.script, () => {
                const pluginName = this.currentProposal.gameId; 
                if (window.MinigamePlugins && window.MinigamePlugins[pluginName]) {
                    this.currentPlugin = window.MinigamePlugins[pluginName];
                    console.log(`Plugin ${pluginName} loaded.`);
                    
                    if (this.state === 'COUNTDOWN' && typeof this.currentPlugin.init === 'function') {
                        this.currentPlugin.init(this.currentProposal.settings);
                    } 
                    // ★追加：PLAYING状態での途中参加時のプラグイン再現と残り時間同期
                    else if (this.state === 'PLAYING' && typeof this.currentPlugin.init === 'function') {
                        this.currentPlugin.init(this.currentProposal.settings);
                        if (typeof this.currentPlugin.start === 'function') {
                            this.currentPlugin.start();
                        }
                        if (this.targetEndTime > 0) {
                            const actualRemainSec = (this.targetEndTime - Date.now()) / 1000;
                            if (actualRemainSec > 0) {
                                this.currentPlugin.remainTime = actualRemainSec;
                            }
                        }
                    }
                }
            });
        }
    },

    startCountdown: function(forcedTargetTime) {
        if (forcedTargetTime) {
            this.targetStartTime = forcedTargetTime;
            this.state = 'COUNTDOWN';
        }
        
        if (typeof this.loadPlugin === 'function') this.loadPlugin();

        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
        const label = overlay.querySelector('.mg-cd-label');
        
        label.innerText = 'ゲーム開始まで';
        overlay.style.display = 'flex';
        
        const updateTimer = () => {
            if (this.state !== 'COUNTDOWN') return; 
            
            // ★修正: 本当の開始時刻(targetStartTime)から4秒を引いた時間を、UI上の待機目標とする
            const remainToAnim = this.targetStartTime - 4000 - Date.now();
            const remainSec = Math.ceil(remainToAnim / 1000);
            
            if (remainSec > 0) {
                countText.innerText = remainSec;
                requestAnimationFrame(updateTimer); 
            } else {
                overlay.style.display = 'none';
                if (typeof this.startGame === 'function') this.startGame();
            }
        };
        updateTimer();
    },

    startGame: function() {
        this.state = 'PLAYING';
        
        this.resultData = [];
        let allUsers = [];
        
        if (window.GameState && window.GameState.userInfo) {
            allUsers.push({
                user_id: window.GameState.userInfo.user_id,
                name: window.GameState.userInfo.name || window.GameState.userInfo.user_name || "Player",
                portrait: window.GameState.userInfo.portrait || window.GameState.userInfo.portait || ""
            });
        } else {
            allUsers.push({ user_id: 'local', name: 'Player', portrait: '' });
        }

        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            for (let id in window.MultiplayerManager.otherPlayers) {
                let op = window.MultiplayerManager.otherPlayers[id];
                allUsers.push({
                    user_id: op.id,
                    name: op.name || "Player",
                    portrait: op.icon || ""
                });
            }
        }

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        allUsers.forEach(u => {
            let isParticipating = false;
            const uidStr = String(u.user_id);
            
            if (this.currentProposal && this.currentProposal.votes && this.currentProposal.votes[uidStr] === true) {
                isParticipating = true;
            }
            if (uidStr === 'local' && this.myVote !== false) {
                isParticipating = true;
            }
            
            if (isParticipating) {
                this.resultData.push({
                    id: uidStr,
                    name: u.name,
                    icon: u.portrait,
                    scoreText: "", 
                    scoreValue: null, 
                    statusText: "", 
                    isRetired: false,
                    isError: false,
                    rank: 0,
                    currentScoreText: "計算中...",
                    currentScoreValue: 0,
                    currentStatusText: ""
                });
            }
        });
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('detail-mode');
            mgBtn.classList.add('abort-mode');
            if (this.myVote !== false) {
                mgBtn.innerText = 'リタイア';
                window.isSpectatorMode = false;
            } else {
                mgBtn.innerText = '観戦モード';
                mgBtn.classList.add('spectator-mode');
                if (typeof this.enterSpectatorMode === 'function') this.enterSpectatorMode();
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#aaaaaa;">観戦モードに移行しました。自由に飛び回れます！</span>', 'sys');
            }
        }

        const timerUI = document.getElementById('mg-timer-ui');
        if (timerUI) {
            timerUI.style.display = 'block';
            let initialMinutes = this.currentProposal && this.currentProposal.settings.time ? parseInt(this.currentProposal.settings.time, 10) : 3;
            timerUI.innerText = `${initialMinutes.toString().padStart(2, '0')}:00`;
        }

        if (window.ItemSystem && this.currentProposal) {
            window.ItemSystem.maxItems = parseInt(this.currentProposal.settings.items, 10);
            window.ItemSystem.clearAllItems();
            window.ItemSystem.canPickup = false;
        }

        if (this.currentProposal && this.currentProposal.settings.pos === 'initial' && !window.isSpectatorMode) {
            if (typeof player !== 'undefined' && player) {
                player.position.set(0, 20, 0); 
                window.verticalVelocity = 0;
                window.isJumping = true;
            }
        }

        const centerMsg = document.createElement('div');
        centerMsg.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); font-size:100px; color:white; font-weight:bold; text-shadow:0 0 20px #ffaa00; z-index:10000; pointer-events:none;';
        document.body.appendChild(centerMsg);

        // ★修正: setIntervalを廃止し、targetStartTimeとの絶対時間計算で正確に同期させる
        let isPluginStarted = false;
        
        const updateStartAnim = () => {
            if (this.state !== 'PLAYING') {
                centerMsg.remove();
                return;
            }
            
            const remainToStart = this.targetStartTime - Date.now();
            
            if (remainToStart > 3000) {
                centerMsg.innerText = "3";
            } else if (remainToStart > 2000) {
                centerMsg.innerText = "2";
            } else if (remainToStart > 1000) {
                centerMsg.innerText = "1";
            } else if (remainToStart > 0) {
                if (centerMsg.innerText !== "START!!") {
                    centerMsg.innerText = "START!!";
                    centerMsg.style.color = "#ffaa00";
                    centerMsg.style.fontSize = "120px";
                }
            } else {
                if (!isPluginStarted) {
                    isPluginStarted = true;
                    centerMsg.remove();
                    if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームが開始されました！</span>', 'sys');
                    
                    if (window.ItemSystem) window.ItemSystem.canPickup = true;
                    if (this.currentPlugin && typeof this.currentPlugin.start === 'function') {
                        this.currentPlugin.start();
                    }
                }
                return; // アニメーション終了
            }
            
            requestAnimationFrame(updateStartAnim);
        };
        updateStartAnim();
    }
});

