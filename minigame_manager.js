// =====================================
// minigame_manager.js
// ミニゲームの進行、リタイア機能、多数決管理
// ★PROPOSING(60秒待機)とCOUNTDOWN(10秒同期)の2段階フェーズへ完全移行
// ★バックグラウンド移行時の大きなラグ(delta)を検知し、終了予定時間から再計算する機能を追加
// ★未回答者、途中入室者、通信エラー(スコア未着)の処理を完璧に整備
// =====================================

window.MinigameManager = {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    gameUsers: {}, // ルーム内の全プレイヤーの状態と参加意志を管理
    
    proposeEndTime: 0,
    targetStartTime: 0, 
    targetEndTime: 0,
    earliestReadyTime: Infinity,
    
    currentPlugin: null,
    resultData: [],

    init: function() {
        console.log("Minigame Manager Initialized.");
        window.isSpectatorMode = false;
    },

    openListView: function() {
        if (this.state !== 'IDLE') return;
        document.getElementById('mg-list-window').style.display = 'flex';
        this.renderList();
    },

    closeAllViews: function() {
        document.getElementById('mg-list-window').style.display = 'none';
        document.getElementById('mg-detail-window').style.display = 'none';
        document.getElementById('mg-proposal-popup').style.display = 'none';
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
            item.onclick = () => this.openDetailView(game);
            
            container.appendChild(item);
        });
    },

    openDetailView: function(game) {
        document.getElementById('mg-list-window').style.display = 'none';
        document.getElementById('mg-detail-window').style.display = 'flex';
        
        document.getElementById('mg-detail-title').innerText = game.title;
        document.getElementById('mg-detail-desc').innerText = game.description;
        
        const iconEl = document.getElementById('mg-detail-icon');
        iconEl.style.backgroundImage = `url(${game.icon})`;
        iconEl.innerText = '';
        const img = new Image();
        img.onerror = () => { 
            iconEl.style.backgroundImage = 'none';
            iconEl.style.backgroundColor = '#555'; 
            iconEl.innerText = '🎮'; 
        };
        img.src = game.icon;

        this.setupToggles('mg-toggle-time', 3);
        this.setupToggles('mg-toggle-item', 1);
        this.setupToggles('mg-toggle-pos', 'current');

        const startBtn = document.getElementById('mg-detail-start-btn');
        startBtn.onclick = () => {
            this.proposeGame(game);
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

    // 参加者リストの初期化
    initGameUsers: function() {
        this.gameUsers = {};
        
        const addToUsers = (id, name, icon) => {
            this.gameUsers[id] = {
                id: id, name: name, icon: icon,
                myVote: null, // null(未回答), true(参加), false(不参加)
                isRetired: false,
                scoreValue: null, scoreText: "", statusText: "", isError: false,
                currentScoreValue: 0, currentScoreText: "", currentStatusText: "" // 途中経過用
            };
        };

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        const myName = (window.GameState && window.GameState.userInfo) ? (window.GameState.userInfo.user_name || window.GameState.userInfo.name || "Player") : "Player";
        const myIcon = (window.GameState && window.GameState.userInfo) ? (window.GameState.userInfo.portrait || window.GameState.userInfo.portait || "") : "";
        addToUsers(myId, myName, myIcon);

        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            for (let id in window.MultiplayerManager.otherPlayers) {
                let op = window.MultiplayerManager.otherPlayers[id];
                addToUsers(id, op.name || "Player", op.icon || "");
            }
        }
    },

    // ゲーム申請（ホスト役）
    proposeGame: function(game) {
        const time = this.getToggleValue('mg-toggle-time');
        const items = this.getToggleValue('mg-toggle-item');
        const pos = this.getToggleValue('mg-toggle-pos');

        this.closeAllViews();

        const timestamp = Date.now();
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';

        this.currentProposal = {
            gameId: game.id, title: game.title, icon: game.icon, script: game.script, 
            settings: { time, items, pos },
            proposerId: myId,
            timestamp: timestamp
        };

        this.state = 'PROPOSING';
        this.initGameUsers();
        this.gameUsers[myId].myVote = true; // 申請者は強制参加

        this.proposeEndTime = timestamp + 60000; // 60秒後
        
        const totalUsers = Object.keys(this.gameUsers).length;

        // UIボタンの変更
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.innerText = 'ゲーム詳細';
            mgBtn.classList.add('detail-mode');
        }

        if (totalUsers === 1) {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">参加者が1人のため、シングルプレイで開始します！</span>', 'sys');
            this.startCountdownPrepare();
        } else {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームを申請しました。他プレイヤーの参加受付中です...</span>', 'sys');
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({
                    type: 'mg_propose',
                    proposal: this.currentProposal
                });
            }
            this.startProposingTimer();
        }
    },

    // ネットワークメッセージのハンドリング
    handleNetworkMessage: function(msg) {
        if (msg.type === 'mg_propose') {
            this.receiveProposal(msg.proposal);
        } else if (msg.type === 'mg_vote') {
            if (this.gameUsers[msg.userId]) {
                this.gameUsers[msg.userId].myVote = msg.vote;
                this.checkProposingStatus();
            }
        } else if (msg.type === 'mg_cancel') {
            this.cancelProposal(msg.reason);
        } else if (msg.type === 'mg_ready') {
            this.receiveReady(msg.userId, msg.timestamp);
        } else if (msg.type === 'mg_sync_state') {
            this.syncState(msg.state, msg.targetStartTime, msg.proposal, msg.gameUsers);
        } else if (msg.type === 'mg_plugin_sync') {
            if (this.currentPlugin && typeof this.currentPlugin.handleNetwork === 'function') {
                this.currentPlugin.handleNetwork(msg.data);
            }
        } else if (msg.type === 'mg_update_score') {
            // 確定スコア（リタイア・終了時）
            const data = this.gameUsers[msg.userId];
            if (data) {
                if (msg.isRetired && !data.isRetired && typeof window.addLog === 'function') {
                    window.addLog(`<span style="color:#ff3300;">${data.name} がリタイアしました。</span>`, 'sys');
                }
                data.scoreValue = msg.scoreValue;
                data.scoreText = msg.scoreText;
                data.statusText = msg.statusText; 
                data.isRetired = msg.isRetired;
            }
        } else if (msg.type === 'mg_request_score') {
            // 途中経過の要求を受信
            this.replyMyScore();
        } else if (msg.type === 'mg_reply_score') {
            // 途中経過の回答を受信
            const data = this.gameUsers[msg.userId];
            if (data && msg.currentScoreText) {
                data.currentScoreValue = msg.currentScoreValue;
                data.currentScoreText = msg.currentScoreText;
                data.currentStatusText = msg.currentStatusText;
                
                // メンバーリストが開いていればUIを更新
                const statusEl = document.getElementById('member-score-' + msg.userId);
                if (statusEl) {
                    statusEl.innerText = msg.currentScoreText;
                    statusEl.style.color = '#ffaa00';
                }
            }
        }
    },

    // 他人の申請を受信
    receiveProposal: function(proposal) {
        if (this.state !== 'IDLE') {
            if (this.state === 'PROPOSING' && this.currentProposal && proposal.timestamp < this.currentProposal.timestamp) {
                this.cancelProposal("より早く申請された別のゲームが優先されました。");
            } else {
                return;
            }
        }

        this.state = 'PROPOSING';
        this.currentProposal = proposal;
        this.initGameUsers();
        
        const proposer = this.gameUsers[proposal.proposerId];
        if (proposer) proposer.myVote = true;

        this.proposeEndTime = proposal.timestamp + 60000;
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.innerText = 'ゲーム詳細';
            mgBtn.classList.add('detail-mode');
        }

        this.showProposalPopup();
        this.startProposingTimer();
    },

    // 途中入室時の同期処理
    syncState: function(remoteState, targetStartTime, proposal, remoteGameUsers) {
        if (this.state !== 'IDLE' && this.state !== 'PROPOSING') return;

        this.currentProposal = proposal;
        
        // リモートのgameUsersをローカルにマージする
        if (remoteGameUsers) {
            if (!this.gameUsers || Object.keys(this.gameUsers).length === 0) this.initGameUsers();
            for (let uid in remoteGameUsers) {
                if (this.gameUsers[uid]) {
                    this.gameUsers[uid].myVote = remoteGameUsers[uid].myVote;
                    this.gameUsers[uid].isRetired = remoteGameUsers[uid].isRetired;
                }
            }
        }

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';

        if (remoteState === 'PROPOSING') {
            this.state = 'PROPOSING';
            this.proposeEndTime = proposal.timestamp + 60000;
            
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn) {
                mgBtn.innerText = 'ゲーム詳細';
                mgBtn.classList.add('detail-mode');
            }
            
            if (this.gameUsers[myId] && this.gameUsers[myId].myVote === null) {
                this.showProposalPopup();
            }
            this.startProposingTimer();

        } else if (remoteState === 'COUNTDOWN' || remoteState === 'PLAYING') {
            this.state = remoteState;
            if (this.gameUsers[myId]) this.gameUsers[myId].myVote = false; // 途中入室は強制不参加(観戦)
            
            this.closeAllViews();

            if (typeof window.addLog === 'function') {
                window.addLog('<span style="color:#aaaaaa;">ゲーム進行中のルームに入室しました。観戦モードになります。</span>', 'sys');
            }
            this.enterSpectatorMode();
            this.loadPlugin();

            if (remoteState === 'COUNTDOWN' && targetStartTime) {
                this.startCountdown(targetStartTime); 
            } else if (remoteState === 'PLAYING') {
                const mgBtn = document.getElementById('minigame-btn');
                if (mgBtn) {
                    mgBtn.classList.remove('detail-mode');
                    mgBtn.classList.add('abort-mode');
                    mgBtn.innerText = '観戦モード';
                    mgBtn.classList.add('spectator-mode');
                }
            }
        }
    },

    // ポップアップの表示（動的ボタン）
    showProposalPopup: function() {
        if (!this.currentProposal || this.state !== 'PROPOSING') return;
        const p = this.currentProposal;
        
        const popup = document.getElementById('mg-proposal-popup');
        if(!popup) return;

        document.getElementById('mg-popup-title').innerText = p.title;
        document.getElementById('mg-popup-rules').innerText = `制限時間: ${p.settings.time}分 | アイテム: ${p.settings.items}個 | 開始: ${p.settings.pos === 'current' ? '現在地' : '初期地'}`;
        document.getElementById('mg-popup-icon').style.backgroundImage = `url(${p.icon})`;

        const btnContainer = document.getElementById('mg-popup-btns-container');
        btnContainer.innerHTML = '';

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        
        if (p.proposerId === myId) {
            // 申請者の場合
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
            // 他ユーザー（途中入室者含む）の場合
            const joinBtn = document.createElement('button');
            joinBtn.className = 'mg-popup-btn join';
            joinBtn.innerText = '参加する';
            joinBtn.onclick = () => {
                popup.style.display = 'none';
                if (typeof window.addLog === 'function') window.addLog('参加を表明しました！', 'sys');
                this.sendMyVote(true);
            };
            
            const declineBtn = document.createElement('button');
            declineBtn.className = 'mg-popup-btn decline';
            declineBtn.innerText = '参加しない';
            declineBtn.onclick = () => {
                popup.style.display = 'none';
                if (typeof window.addLog === 'function') window.addLog('不参加（観戦モード）を選択しました。', 'sys');
                this.sendMyVote(false);
            };
            
            btnContainer.appendChild(joinBtn);
            btnContainer.appendChild(declineBtn);
        }

        popup.style.display = 'flex';
    },

    sendMyVote: function(isJoin) {
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (this.gameUsers[myId]) this.gameUsers[myId].myVote = isJoin;
        
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({
                type: 'mg_vote',
                userId: myId,
                vote: isJoin
            });
        }
        this.checkProposingStatus();
    },

    cancelProposal: function(reason) {
        if (this.state === 'IDLE') return;
        this.state = 'IDLE';
        this.currentProposal = null;
        this.gameUsers = {};
        
        this.closeAllViews();
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('detail-mode');
            mgBtn.innerText = 'ミニゲーム';
        }
        
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
        this.exitSpectatorMode();
    },

    // PROPOSING(60秒)のタイマー処理と監視
    startProposingTimer: function() {
        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
        const label = overlay.querySelector('.mg-cd-label');
        
        label.innerText = '参加受付終了まで';
        overlay.style.display = 'flex';

        const updateTimer = () => {
            if (this.state !== 'PROPOSING') {
                overlay.style.display = 'none';
                return;
            }

            const remain = Math.ceil((this.proposeEndTime - Date.now()) / 1000);
            
            // ポップアップ内のタイマーも更新
            const popTimer = document.getElementById('mg-popup-timer');
            if (popTimer) popTimer.innerText = `残り受付時間: ${Math.max(0, remain)}秒`;

            if (remain > 0) {
                countText.innerText = remain;
                requestAnimationFrame(updateTimer);
            } else {
                // 60秒終了時の処理
                overlay.style.display = 'none';
                
                // 未回答のユーザーを不参加(false)に強制変更
                for (let uid in this.gameUsers) {
                    if (this.gameUsers[uid].myVote === null) {
                        this.gameUsers[uid].myVote = false;
                    }
                }
                
                // 参加者がいるかチェック
                let joinCount = 0;
                let isProposerJoined = false;
                for (let uid in this.gameUsers) {
                    if (this.gameUsers[uid].myVote === true) {
                        joinCount++;
                        if (this.currentProposal && uid === this.currentProposal.proposerId) isProposerJoined = true;
                    }
                }

                if (joinCount >= 2 || (joinCount === 1 && isProposerJoined && Object.keys(this.gameUsers).length === 1)) {
                    this.startCountdownPrepare();
                } else {
                    if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_cancel', reason: '参加者が集まりませんでした。（申請者のみ）' });
                    this.cancelProposal("参加者が集まりませんでした。（申請者のみ）");
                }
            }
        };
        updateTimer();
    },

    // 全員回答したかのチェック
    checkProposingStatus: function() {
        if (this.state !== 'PROPOSING') return;

        let allAnswered = true;
        let joinCount = 0;
        
        for (let uid in this.gameUsers) {
            if (this.gameUsers[uid].myVote === null) allAnswered = false;
            if (this.gameUsers[uid].myVote === true) joinCount++;
        }

        if (allAnswered) {
            // 全員回答済みなら60秒を待たずに次へ
            this.proposeEndTime = 0; 
        }
    },

    // COUNTDOWN(10秒)への移行準備（全員で一番早い送信時刻を決める）
    startCountdownPrepare: function() {
        if (this.state === 'COUNTDOWN') return;
        this.state = 'COUNTDOWN';
        this.closeAllViews();
        
        const now = Date.now();
        this.earliestReadyTime = now;
        
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({
                type: 'mg_ready',
                userId: myId,
                timestamp: now
            });
        }
        
        // 自分自身で計算
        this.calcTargetTimes();
        this.startCountdown();
    },

    receiveReady: function(userId, timestamp) {
        if (this.state !== 'COUNTDOWN' && this.state !== 'PLAYING') return;
        if (timestamp < this.earliestReadyTime) {
            this.earliestReadyTime = timestamp;
            this.calcTargetTimes();
        }
    },

    calcTargetTimes: function() {
        // 最も早いready送信時刻から10秒後をゲーム開始時間とする
        this.targetStartTime = this.earliestReadyTime + 10000;
        
        if (this.currentProposal && this.currentProposal.settings && this.currentProposal.settings.time) {
            const timeLimitSec = parseInt(this.currentProposal.settings.time, 10) * 60;
            this.targetEndTime = this.targetStartTime + (timeLimitSec * 1000);
        }
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
                }
            });
        }
    },

    startCountdown: function() {
        this.loadPlugin();

        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
        const label = overlay.querySelector('.mg-cd-label');
        
        label.innerText = 'ゲーム開始まで';
        overlay.style.display = 'flex';
        
        const updateTimer = () => {
            if (this.state !== 'COUNTDOWN') return; 
            
            const remain = Math.ceil((this.targetStartTime - Date.now()) / 1000);
            
            if (remain > 0) {
                countText.innerText = remain;
                requestAnimationFrame(updateTimer); 
            } else {
                overlay.style.display = 'none';
                this.startGame();
            }
        };
        updateTimer();
    },

    startGame: function() {
        this.state = 'PLAYING';
        
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        const myData = this.gameUsers[myId];
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('detail-mode');
            mgBtn.classList.add('abort-mode');
            if (myData && myData.myVote === true) {
                mgBtn.innerText = 'リタイア';
                window.isSpectatorMode = false;
            } else {
                mgBtn.innerText = '観戦モード';
                mgBtn.classList.add('spectator-mode');
                this.enterSpectatorMode();
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

        // START演出
        const centerMsg = document.createElement('div');
        centerMsg.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); font-size:100px; color:white; font-weight:bold; text-shadow:0 0 20px #ffaa00; z-index:10000; pointer-events:none;';
        document.body.appendChild(centerMsg);

        let startCount = 3;
        centerMsg.innerText = startCount;
        
        const startTimer = setInterval(() => {
            startCount--;
            if (startCount > 0) {
                centerMsg.innerText = startCount;
            } else if (startCount === 0) {
                centerMsg.innerText = "START!!";
                centerMsg.style.color = "#ffaa00";
                centerMsg.style.fontSize = "120px";
            } else {
                clearInterval(startTimer);
                centerMsg.remove();
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームが開始されました！</span>', 'sys');
                
                if (window.ItemSystem) window.ItemSystem.canPickup = true;
                if (this.currentPlugin && typeof this.currentPlugin.start === 'function') {
                    this.currentPlugin.start();
                }
            }
        }, 1000);
    },

    // PLAYING中の更新とラグ検知
    update: function(delta) {
        if (this.state !== 'PLAYING') return;

        // ★ラグ検知：deltaが1.0(1秒)を超えた場合、ブラウザがバックグラウンドに行っていたと判断し再計算
        if (delta > 1.0 && this.targetEndTime > 0) {
            const remainSec = (this.targetEndTime - Date.now()) / 1000;
            if (remainSec <= 0) {
                // 既に終了時間を過ぎていれば即終了
                if (this.currentPlugin && typeof this.currentPlugin.isPlaying !== 'undefined') {
                    this.currentPlugin.isPlaying = false;
                }
                this.endGame();
                return;
            } else {
                // プラグイン側の残り時間を強制上書き
                if (this.currentPlugin && typeof this.currentPlugin.remainTime !== 'undefined') {
                    this.currentPlugin.remainTime = remainSec;
                }
            }
        }

        if (this.currentPlugin && typeof this.currentPlugin.update === 'function') {
            this.currentPlugin.update(delta);
        }
    },

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
        
        if (this.currentPlugin && typeof this.currentPlugin.onRetire === 'function') {
            this.currentPlugin.onRetire(myId);
        } else {
            const myData = this.gameUsers[myId];
            if (myData) {
                myData.isRetired = true;
                myData.scoreText = "";
                myData.statusText = "";
                myData.scoreValue = -1;
            }
        }
        
        const updatedData = this.gameUsers[myId];
        if (window.MultiplayerManager && updatedData) {
            window.MultiplayerManager.sendData({ 
                type: 'mg_update_score', 
                userId: myId, 
                scoreValue: updatedData.scoreValue, 
                scoreText: updatedData.scoreText,
                statusText: updatedData.statusText,
                isRetired: updatedData.isRetired
            });
        }

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

    // 途中経過スコアの送信（メンバーリストを開かれた時）
    replyMyScore: function() {
        if (this.state !== 'PLAYING') return;
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        
        let cVal = 0, cText = "", cStatus = "";
        
        if (this.currentPlugin) {
            if (this.currentProposal.gameId === 'coin_rush') {
                cVal = this.currentPlugin.myScore;
                cText = `${cVal}枚`;
            } else if (this.currentProposal.gameId === 'bom_battle') {
                cVal = this.currentPlugin.hp;
                cText = this.currentPlugin.getHeartsString(this.currentPlugin.hp);
            } else if (this.currentProposal.gameId === 'survival') {
                const survived = Math.floor((Date.now() - this.currentPlugin.startTime) / 1000);
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
                currentScoreValue: cVal,
                currentScoreText: cText,
                currentStatusText: cStatus
            });
        }
        
        // 自分のUIも更新
        if (this.gameUsers[myId]) {
            this.gameUsers[myId].currentScoreText = cText;
            const statusEl = document.getElementById('member-score-' + myId);
            if (statusEl) {
                statusEl.innerText = cText;
                statusEl.style.color = '#ffaa00';
            }
        }
    },

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
                window.MultiplayerManager.forceSendPos();
            }
            
            if (typeof window.toggleSpectatorUI === 'function') window.toggleSpectatorUI(false);
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn) mgBtn.classList.remove('spectator-mode');
        }
    },

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
        if (this.gameUsers[userId]) {
            this.gameUsers[userId].isRetired = true;
        }
        if (this.state === 'PROPOSING') {
            this.checkProposingStatus();
        } else if (this.state === 'PLAYING') {
            this.checkAllSpectators();
        }
    },

    endGame: function() {
        this.state = 'RESULT';
        
        const timerUI = document.getElementById('mg-timer-ui');
        if (timerUI) timerUI.style.display = 'none';

        if (this.currentPlugin && typeof this.currentPlugin.end === 'function') {
            this.currentPlugin.end();
        }
        this.currentPlugin = null;

        // ★リザルト用データの生成
        // gameUsersから myVote === true の人を抽出
        this.resultData = [];
        for (let uid in this.gameUsers) {
            let u = this.gameUsers[uid];
            if (u.myVote === true) {
                // スコアがnull（確定送信が来ていない）ならエラー扱い
                if (u.scoreValue === null && !u.isRetired) {
                    u.isError = true;
                }
                this.resultData.push(u);
            }
        }

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
        
        setTimeout(() => {
            this.state = 'IDLE';
            this.gameUsers = {};
        }, 5000);
    }
};

setTimeout(() => {
    if (window.MinigameManager) window.MinigameManager.init();
}, 1000);
