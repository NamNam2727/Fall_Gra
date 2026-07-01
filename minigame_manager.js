// =====================================
// minigame_manager.js
// ミニゲームの進行、多数決、観戦モード移行などを管理するシステム
// ★通信による多数決同期、観戦ゴースト化の処理を追加
// =====================================

window.MinigameManager = {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    participantCount: 1, 

    init: function() {
        console.log("Minigame Manager Initialized.");
        // グローバルに観戦モードのフラグを定義
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

    // ★自分がゲームの申請を出したときの処理
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
            settings: { time, items, pos },
            proposerId: myId,
            timestamp: timestamp,
            votes: { [myId]: true }
        };

        this.state = 'PROPOSING';
        this.myVote = true; // 自分は最初から参加確定
        
        let totalUsers = 1;
        if (window.GameState && window.GameState.roomUsers) {
            totalUsers = window.GameState.roomUsers.length + 1; 
        }

        if (totalUsers === 1) {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">参加者が1人のため、シングルプレイで開始します！</span>', 'sys');
            this.participantCount = 1;
            this.startCountdown();
        } else {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームの開始を申請しました。参加者を待機しています...</span>', 'sys');
            
            // ★通信: 他のプレイヤーに申請データを送信する
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({
                    type: 'mg_propose',
                    proposal: this.currentProposal
                });
            }

            // 100秒のタイムアウト監視
            setTimeout(() => {
                if (this.state === 'PROPOSING') {
                    this.cancelProposal("タイムアウトによりゲームの申請が取り下げられました。");
                }
            }, 100000); 

            this.checkVotes(); 
        }
    },

    // ★通信を受信した際のハブ（マルチプレイヤー機能から呼ばれる）
    handleNetworkMessage: function(msg) {
        if (msg.type === 'mg_propose') {
            this.receiveProposal(msg.proposal);
        } else if (msg.type === 'mg_vote') {
            this.receiveVote(msg.proposerId, msg.userId, msg.vote);
        } else if (msg.type === 'mg_start_countdown') {
            this.startCountdown();
        } else if (msg.type === 'mg_abort') {
            this.abortGame(true); // リモートからの強制終了
        }
    },

    // ★他人の申請を受信したときの処理
    receiveProposal: function(proposal) {
        if (this.state !== 'IDLE') {
            // 同時提案の競合解決：タイムスタンプが古い（数値が小さい）方を優先する
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

    showProposalPopup: function() {
        if (!this.currentProposal) return;
        const p = this.currentProposal;
        
        const popup = document.getElementById('mg-proposal-popup');
        document.getElementById('mg-popup-title').innerText = p.title;
        document.getElementById('mg-popup-rules').innerText = `制限時間: ${p.settings.time}分 | アイテム: ${p.settings.items}個 | 開始位置: ${p.settings.pos === 'current' ? '現在地' : '初期地'}`;
        
        const iconEl = document.getElementById('mg-popup-icon');
        iconEl.style.backgroundImage = `url(${p.icon})`;

        popup.style.display = 'flex';

        // 制限時間タイマー（無操作なら自動で観戦モードに）
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

    // ★自分が投票したときの送信処理
    sendMyVote: function(isJoin) {
        if (!this.currentProposal || !window.MultiplayerManager) return;
        
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
        
        window.MultiplayerManager.sendData({
            type: 'mg_vote',
            proposerId: this.currentProposal.proposerId,
            userId: myId,
            vote: isJoin
        });

        // 自分のローカルデータにも反映
        this.currentProposal.votes[myId] = isJoin;
        this.checkVotes();
    },

    // ★他人の投票を受信したときの処理
    receiveVote: function(proposerId, userId, vote) {
        if (!this.currentProposal || this.currentProposal.proposerId !== proposerId) return;
        this.currentProposal.votes[userId] = vote;
        this.checkVotes();
    },

    cancelProposal: function(reason) {
        this.state = 'IDLE';
        this.currentProposal = null;
        document.getElementById('mg-proposal-popup').style.display = 'none';
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
    },

    // ★全員の投票状況を確認し、過半数を超えたら開始
    checkVotes: function() {
        if (!this.currentProposal) return;
        
        let totalUsers = 1;
        if (window.GameState && window.GameState.roomUsers) {
            totalUsers = window.GameState.roomUsers.length + 1;
        }

        let joinCount = 0;
        let declineCount = 0;
        let votes = this.currentProposal.votes;

        for (let uid in votes) {
            if (votes[uid] === true) joinCount++;
            else if (votes[uid] === false) declineCount++;
        }

        const majority = Math.floor(totalUsers / 2) + 1;

        if (joinCount >= majority) {
            this.participantCount = joinCount;
            const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
            
            // ★ホスト（提案者）が代表して「カウントダウン開始」の合図を全員に送る
            if (this.currentProposal.proposerId === myId && this.state === 'PROPOSING') {
                if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'mg_start_countdown' });
                this.startCountdown();
            }
        } else if (declineCount >= majority) {
            if (this.state === 'PROPOSING') {
                this.cancelProposal("参加人数が集まりませんでした。（過半数が不参加）");
            }
        }
    },

    // ★全員一斉にカウントダウン開始
    startCountdown: function() {
        if (this.state === 'COUNTDOWN') return; // 重複防止
        this.state = 'COUNTDOWN';
        document.getElementById('mg-proposal-popup').style.display = 'none';
        
        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
        overlay.style.display = 'flex';
        
        let count = 10;
        countText.innerText = count;
        
        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                countText.innerText = count;
            } else {
                clearInterval(timer);
                overlay.style.display = 'none';
                this.startGame();
            }
        }, 1000);
    },

    startGame: function() {
        this.state = 'PLAYING';
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.add('abort-mode');
            mgBtn.innerText = 'ゲーム終了';
        }

        // ★観戦モードへの移行（ゴースト化・通信カット）
        if (this.myVote === false) {
            window.isSpectatorMode = true;
            if (typeof player !== 'undefined' && player) {
                // 自キャラを透明にする
                player.traverse((child) => {
                    if (child.isMesh) child.material.opacity = 0;
                });
            }
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#aaaaaa;">観戦モードに移行しました。他のプレイヤーからは見えません。</span>', 'sys');
        } else {
            window.isSpectatorMode = false;
        }

        // アイテム設定の反映とリセット
        if (window.ItemSystem && this.currentProposal) {
            window.ItemSystem.maxItems = parseInt(this.currentProposal.settings.items, 10);
            window.ItemSystem.clearAllItems();
        }

        // ★開始位置の初期化処理（現在地なら何もしない、初期地ならワープ）
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
                // TODO: 外部プラグインスクリプト(survival.jsなど)の開始処理を呼び出す
            }
        }, 1000);
    },

    abortGame: function(isRemote = false) {
        if (this.state === 'PLAYING') {
            if (!isRemote && window.MultiplayerManager) {
                // 自分が終了ボタンを押した場合は他プレイヤーにも終了指示を出す
                window.MultiplayerManager.sendData({ type: 'mg_abort' });
            }
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#ffaa00;">ゲームが強制終了されました。</span>', 'sys');
            this.endGame();
        }
    },

    endGame: function() {
        this.state = 'IDLE';
        this.currentProposal = null;
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.classList.remove('abort-mode');
            mgBtn.innerText = 'ミニゲーム';
        }

        // ★観戦モード解除（実体化）
        if (window.isSpectatorMode) {
            window.isSpectatorMode = false;
            if (typeof player !== 'undefined' && player) {
                player.traverse((child) => {
                    if (child.isMesh) child.material.opacity = 1;
                });
            }
            // 強制的に現在地を同期し直す
            if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
                window.MultiplayerManager.forceSendPos();
            }
        }
        
        // 終了時のマップ・アイテムリセット
        if (window.ItemSystem) window.ItemSystem.clearAllItems();
    }
};

setTimeout(() => {
    if (window.MinigameManager) window.MinigameManager.init();
}, 1000);
