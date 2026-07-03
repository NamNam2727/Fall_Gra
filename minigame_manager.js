// =====================================
// minigame_manager.js
// ミニゲームの進行、リタイア機能、多数決管理
// ★多重表示バグの修正と、スコア・リタイアの同期機能を追加
// =====================================

window.MinigameManager = {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    participantCount: 1, 
    targetStartTime: 0, 
    
    currentPlugin: null,
    resultData: [],

    init: function() {
        console.log("Minigame Manager Initialized.");
        window.isSpectatorMode = false;
    },

    openListView: function() {
        if (this.state !== 'IDLE') {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#ffaa00;">現在はミニゲームリストを開けません。</span>', 'sys');
            return;
        }
        document.getElementById('mg-list-window').style.display = 'flex';
        this.renderList();
    },

    closeAllViews: function() {
        document.getElementById('mg-list-window').style.display = 'none';
        document.getElementById('mg-detail-window').style.display = 'none';
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

    proposeGame: function(game) {
        const time = this.getToggleValue('mg-toggle-time');
        const items = this.getToggleValue('mg-toggle-item');
        const pos = this.getToggleValue('mg-toggle-pos');

        this.closeAllViews();

        const timestamp = Date.now();
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';

        this.currentProposal = {
            gameId: game.id,
            title: game.title,
            icon: game.icon,
            script: game.script, 
            settings: { time, items, pos },
            proposerId: myId,
            timestamp: timestamp,
            votes: { [myId]: true }
        };

        this.state = 'PROPOSING';
        this.myVote = true;
        
        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }

        if (totalUsers === 1) {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">参加者が1人のため、シングルプレイで開始します！</span>', 'sys');
            this.participantCount = 1;
            this.startCountdown();
        } else {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームの開始を申請しました。参加者を待機しています...</span>', 'sys');
            
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({
                    type: 'mg_propose',
                    proposal: this.currentProposal
                });
            }

            setTimeout(() => {
                if (this.state === 'PROPOSING') {
                    if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_cancel', reason: 'タイムアウトによりゲームの申請が取り下げられました。' });
                    this.cancelProposal("タイムアウトによりゲームの申請が取り下げられました。");
                }
            }, 100000); 

            this.checkVotes(); 
        }
    },

    handleNetworkMessage: function(msg) {
        if (msg.type === 'mg_propose') {
            this.receiveProposal(msg.proposal);
        } else if (msg.type === 'mg_vote') {
            this.receiveVote(msg.proposerId, msg.userId, msg.vote);
        } else if (msg.type === 'mg_start_countdown') {
            this.startCountdown(msg.targetStartTime); 
        } else if (msg.type === 'mg_cancel') {
            this.cancelProposal(msg.reason);
        } else if (msg.type === 'mg_sync_state') {
            this.syncState(msg.state, msg.targetStartTime, msg.proposal);
        } else if (msg.type === 'mg_plugin_sync') {
            if (this.currentPlugin && typeof this.currentPlugin.handleNetwork === 'function') {
                this.currentPlugin.handleNetwork(msg.data);
            }
        } else if (msg.type === 'mg_update_score') {
            // ★追加: 他プレイヤーのスコア・リタイア同期
            const data = this.resultData.find(d => d.id === msg.userId);
            if (data) {
                data.scoreValue = msg.scoreValue;
                data.scoreText = msg.scoreText;
                data.isRetired = msg.isRetired;
            }
        }
    },

    receiveProposal: function(proposal) {
        if (this.state !== 'IDLE') {
            if (this.state === 'PROPOSING' && this.currentProposal) {
                if (proposal.timestamp < this.currentProposal.timestamp) {
                    this.cancelProposal("より早く申請された別のゲームが優先されました。");
                    this.currentProposal = proposal;
                    this.showProposalPopup();
                } else {
                    if (typeof window.addLog === 'function') window.addLog('他ユーザーからの申請がありましたが、あなたの申請が優先されました。', 'sys');
                }
            }
            return;
        }

        this.state = 'PROPOSING';
        this.currentProposal = proposal;
        this.myVote = null;
        this.showProposalPopup();
    },

    syncState: function(remoteState, targetStartTime, proposal) {
        if (this.state !== 'IDLE' && this.state !== 'PROPOSING') return;

        this.currentProposal = proposal;

        if (remoteState === 'PROPOSING') {
            const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
            if (this.currentProposal.votes[myId] === undefined) {
                this.state = 'PROPOSING';
                this.myVote = null;
                this.showProposalPopup();
            }
        } else if (remoteState === 'COUNTDOWN' || remoteState === 'PLAYING') {
            this.state = remoteState;
            this.myVote = false; 
            
            document.getElementById('mg-proposal-popup').style.display = 'none';
            document.getElementById('mg-countdown-overlay').style.display = 'none';

            if (typeof window.addLog === 'function') {
                if (remoteState === 'COUNTDOWN') {
                    window.addLog('<span style="color:#aaaaaa;">ゲーム開始待機中のルームに入室しました。観戦モードになります。</span>', 'sys');
                } else {
                    window.addLog('<span style="color:#aaaaaa;">ゲームプレイ中のルームに入室しました。観戦モードになります。</span>', 'sys');
                }
            }
            
            this.enterSpectatorMode();

            if (remoteState === 'COUNTDOWN' && targetStartTime) {
                this.startCountdown(targetStartTime); 
            }

            if (remoteState === 'PLAYING') {
                const mgBtn = document.getElementById('minigame-btn');
                if (mgBtn) {
                    mgBtn.classList.add('abort-mode');
                    mgBtn.innerText = '観戦モード';
                    mgBtn.classList.add('spectator-mode');
                }
                this.loadPlugin();
            }
        }
    },

    showProposalPopup: function() {
        if (!this.currentProposal) return;
        const p = this.currentProposal;
        
        const popup = document.getElementById('mg-proposal-popup');
        document.getElementById('mg-popup-title').innerText = p.title;
        document.getElementById('mg-popup-rules').innerText = `制限時間: ${p.settings.time}分 | アイテム: ${p.settings.items}個 | 開始位置: ${p.settings.pos === 'current' ? '現在地' : '初期地'}`;
        
        const iconEl = document.getElementById('mg-popup-icon');
        iconEl.style.backgroundImage = `url(${p.icon})`;

        popup.style.display = 'flex';

        const timeoutId = setTimeout(() => {
            if (popup.style.display === 'flex') {
                document.getElementById('mg-btn-decline').click();
            }
        }, 100000);

        document.getElementById('mg-btn-join').onclick = () => {
            clearTimeout(timeoutId);
            this.myVote = true;
            popup.style.display = 'none';
            if (typeof window.addLog === 'function') window.addLog('参加を表明しました！', 'sys');
            this.sendMyVote(true);
        };

        document.getElementById('mg-btn-decline').onclick = () => {
            clearTimeout(timeoutId);
            this.myVote = false;
            popup.style.display = 'none';
            if (typeof window.addLog === 'function') window.addLog('不参加（観戦モード）を選択しました。', 'sys');
            this.sendMyVote(false);
        };
    },

    sendMyVote: function(isJoin) {
        if (!this.currentProposal || !window.MultiplayerManager) return;
        
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
        
        window.MultiplayerManager.sendData({
            type: 'mg_vote',
            proposerId: this.currentProposal.proposerId,
            userId: myId,
            vote: isJoin
        });

        this.currentProposal.votes[myId] = isJoin;
        this.checkVotes();
    },

    receiveVote: function(proposerId, userId, vote) {
        if (!this.currentProposal || this.currentProposal.proposerId !== proposerId) return;
        this.currentProposal.votes[userId] = vote;
        this.checkVotes();
    },

    cancelProposal: function(reason) {
        if (this.state === 'IDLE' || !this.currentProposal) return;
        
        this.state = 'IDLE';
        this.currentProposal = null;
        document.getElementById('mg-proposal-popup').style.display = 'none';
        
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
        
        this.exitSpectatorMode();
    },

    checkVotes: function() {
        if (!this.currentProposal) return;
        
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
        if (this.currentProposal.proposerId !== myId) return;

        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }

        let joinCount = 0;
        let declineCount = 0;
        let votes = this.currentProposal.votes;

        for (let uid in votes) {
            if (votes[uid] === true) joinCount++;
            else if (votes[uid] === false) declineCount++;
        }

        const requiredToJoin = Math.floor(totalUsers / 2) + 1; 
        const requiredToDecline = Math.ceil(totalUsers / 2);   

        if (joinCount >= requiredToJoin) {
            this.participantCount = joinCount;
            
            if (this.state === 'PROPOSING') {
                const startTime = Date.now() + 10000; 
                if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_start_countdown', targetStartTime: startTime });
                this.startCountdown(startTime);
            }
        } else if (declineCount >= requiredToDecline) {
            if (this.state === 'PROPOSING') {
                if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_cancel', reason: '参加人数が集まりませんでした。（半数以上が不参加）' });
                this.cancelProposal("参加人数が集まりませんでした。（半数以上が不参加）");
            }
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

    startCountdown: function(targetStartTime) {
        if (this.state === 'COUNTDOWN' && this.targetStartTime === targetStartTime) return; 
        this.state = 'COUNTDOWN';
        this.targetStartTime = targetStartTime || (Date.now() + 10000); 
        
        this.loadPlugin();

        document.getElementById('mg-proposal-popup').style.display = 'none';
        
        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
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
        
        const timerUI = document.getElementById('mg-timer-ui');
        if (timerUI) timerUI.style.display = 'block';
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.add('abort-mode');
            mgBtn.innerText = this.myVote === false ? '観戦モード' : 'リタイア';
            if (this.myVote === false) mgBtn.classList.add('spectator-mode');
        }

        // ★多重表示バグ修正: 自分自身が重複しないようにリストを作る
        this.resultData = [];
        let allUsers = [];
        if (window.GameState && window.GameState.roomUsers) {
            allUsers = [...window.GameState.roomUsers];
        }
        if (window.GameState && window.GameState.userInfo) {
            const myId = window.GameState.userInfo.user_id;
            const hasMe = allUsers.some(u => u.user_id === myId);
            if (!hasMe) {
                allUsers.unshift(window.GameState.userInfo);
            }
        }
        if (allUsers.length === 0) {
            allUsers.push({ user_id: 'local', name: 'Player' });
        }

        allUsers.forEach(u => {
            if (!u) return;
            let isParticipating = true;
            if (this.currentProposal && this.currentProposal.votes) {
                if (this.currentProposal.votes[u.user_id] === false) isParticipating = false;
            }
            
            if (isParticipating) {
                this.resultData.push({
                    id: u.user_id,
                    name: u.name || u.user_name || "Player",
                    icon: u.portrait || u.portait || "",
                    scoreText: "", 
                    scoreValue: 0, // ★追加: ソート用の数値
                    isRetired: false,
                    rank: 0
                });
            }
        });

        if (this.myVote === false) {
            this.enterSpectatorMode();
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#aaaaaa;">観戦モードに移行しました。自由に飛び回れます！</span>', 'sys');
        } else {
            window.isSpectatorMode = false;
        }

        if (window.ItemSystem && this.currentProposal) {
            window.ItemSystem.maxItems = parseInt(this.currentProposal.settings.items, 10);
            window.ItemSystem.clearAllItems();
            window.ItemSystem.canPickup = false;
        }

        if (this.currentProposal && this.currentProposal.settings.pos === 'initial') {
            if (typeof player !== 'undefined' && player) {
                player.position.set(0, 20, 0); 
                window.verticalVelocity = 0;
                window.isJumping = true;
            }
        }

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
        
        // ★プラグイン側に通知して生存時間(スコア)を更新させる
        if (this.currentPlugin && typeof this.currentPlugin.onRetire === 'function') {
            this.currentPlugin.onRetire(myId);
        } else {
            const myData = this.resultData.find(d => d.id === myId);
            if (myData) {
                myData.isRetired = true;
                myData.scoreText = "リタイア";
                myData.scoreValue = -1;
            }
        }
        
        // ★スコアとリタイア状態を他人に同期
        const updatedData = this.resultData.find(d => d.id === myId);
        if (window.MultiplayerManager && updatedData) {
            window.MultiplayerManager.sendData({ 
                type: 'mg_update_score', 
                userId: myId, 
                scoreValue: updatedData.scoreValue, 
                scoreText: updatedData.scoreText,
                isRetired: updatedData.isRetired
            });
        }

        this.enterSpectatorMode();
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

    endGame: function() {
        this.state = 'RESULT';
        
        const timerUI = document.getElementById('mg-timer-ui');
        if (timerUI) timerUI.style.display = 'none';

        if (this.currentPlugin && typeof this.currentPlugin.end === 'function') {
            this.currentPlugin.end();
        }
        this.currentPlugin = null;

        if (window.MinigameUI && typeof window.MinigameUI.showResult === 'function') {
            window.MinigameUI.showResult(this.currentProposal ? this.currentProposal.title : "ミニゲーム", this.resultData);
        }

        this.currentProposal = null;
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('abort-mode');
            mgBtn.classList.remove('spectator-mode');
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
        }, 5000);
    },

    update: function(delta) {
        if (this.state === 'PLAYING' && this.currentPlugin && typeof this.currentPlugin.update === 'function') {
            this.currentPlugin.update(delta);
        }
    }
};

setTimeout(() => {
    if (window.MinigameManager) window.MinigameManager.init();
}, 1000);
