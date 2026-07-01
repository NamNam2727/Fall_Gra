// =====================================
// minigame_manager.js
// ミニゲームの進行、多数決、観戦モード移行などを管理するシステム
// ★シングルプレイ（1人での即時開始）対応
// =====================================

window.MinigameManager = {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    isSpectator: false,
    participantCount: 1, // 現在のゲームの参加人数

    init: function() {
        console.log("Minigame Manager Initialized.");
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
        this.myVote = true; // 自分は最初から参加
        
        // ★追加: シングルプレイ判定 (他プレイヤーがいない場合は即開始)
        let totalUsers = 1;
        if (window.GameState && window.GameState.roomUsers) {
            totalUsers = window.GameState.roomUsers.length + 1; // 自分を含める
        }

        if (totalUsers === 1) {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">参加者が1人のため、シングルプレイで開始します！</span>', 'sys');
            this.participantCount = 1;
            this.startCountdown();
        } else {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームの開始を申請しました。参加者を待機しています...</span>', 'sys');
            this.showProposalPopup();
            
            // タイムアウト設定
            setTimeout(() => {
                if (this.state === 'PROPOSING') {
                    this.cancelProposal("タイムアウトによりゲームの申請が取り下げられました。");
                }
            }, 100000); 
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

        document.getElementById('mg-btn-join').onclick = () => {
            this.myVote = true;
            popup.style.display = 'none';
            if (typeof window.addLog === 'function') window.addLog('参加を表明しました！', 'sys');
            this.checkVotes(); 
        };

        document.getElementById('mg-btn-decline').onclick = () => {
            this.myVote = false;
            popup.style.display = 'none';
            if (typeof window.addLog === 'function') window.addLog('不参加（観戦モード）を選択しました。', 'sys');
            this.checkVotes(); 
        };
    },

    cancelProposal: function(reason) {
        this.state = 'IDLE';
        this.currentProposal = null;
        document.getElementById('mg-proposal-popup').style.display = 'none';
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
    },

    checkVotes: function() {
        // ※マルチプレイ実装時に通信での多数決判定を追加します
        // 今回はUIテスト用として、即座にカウントダウンへ進みます。
        this.participantCount = 2; // ダミー人数
        setTimeout(() => {
            this.startCountdown();
        }, 1000);
    },

    startCountdown: function() {
        this.state = 'COUNTDOWN';
        document.getElementById('mg-proposal-popup').style.display = 'none';
        
        const overlay = document.getElementById('mg-countdown-overlay');
        const countText = document.getElementById('mg-countdown-text');
        overlay.style.display = 'flex';
        
        let count = 10; // TODO: 本番は10秒
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
        
        // プレイ中のみゲーム終了ボタンを表示
        document.getElementById('mg-abort-btn').style.display = 'block';

        if (this.myVote === false) {
            this.isSpectator = true;
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#aaaaaa;">観戦モードに移行しました。</span>', 'sys');
        } else {
            this.isSpectator = false;
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
            }
        }, 1000);
    },

    // ★追加: プレイ中の強制終了（リタイア）処理
    abortGame: function() {
        if (this.state === 'PLAYING') {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#ffaa00;">ゲームを終了しました。</span>', 'sys');
            this.endGame();
        }
    },

    endGame: function() {
        this.state = 'IDLE';
        this.isSpectator = false;
        this.currentProposal = null;
        document.getElementById('mg-abort-btn').style.display = 'none';
        
        // TODO: マップリフレッシュ、初期位置ワープなどのリセット処理を呼び出す
    }
};

setTimeout(() => {
    if (window.MinigameManager) window.MinigameManager.init();
}, 1000);
