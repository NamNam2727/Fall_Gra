// =====================================
// minigame_manager.js
// ミニゲームの進行、多数決、観戦モード移行などを管理するシステム
// =====================================

window.MinigameManager = {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    isSpectator: false,

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
            // アイコン読み込み失敗時のフォールバック処理
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

        // 設定の初期化
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

        // 自分が最初の提案者として処理（通信連携は次のステップで実装）
        this.currentProposal = {
            gameId: game.id,
            title: game.title,
            icon: game.icon,
            settings: { time, items, pos },
            proposerId: myId,
            timestamp: timestamp,
            votes: { [myId]: true } // 自分は最初から「参加」
        };

        this.state = 'PROPOSING';
        if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">ゲームの開始を申請しました。参加者を待機しています...</span>', 'sys');
        
        this.showProposalPopup();
        
        // 仮のタイムアウト（本来はサーバー同期で処理）
        setTimeout(() => {
            if (this.state === 'PROPOSING') {
                this.cancelProposal("タイムアウトによりゲームの申請が取り下げられました。");
            }
        }, 100000); // 100秒
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
            // TODO: 通信で参加状態を送信
            this.checkVotes(); // 仮処理
        };

        document.getElementById('mg-btn-decline').onclick = () => {
            this.myVote = false;
            popup.style.display = 'none';
            if (typeof window.addLog === 'function') window.addLog('不参加（観戦モード）を選択しました。', 'sys');
            // TODO: 通信で不参加状態を送信
            this.checkVotes(); // 仮処理
        };
    },

    cancelProposal: function(reason) {
        this.state = 'IDLE';
        this.currentProposal = null;
        document.getElementById('mg-proposal-popup').style.display = 'none';
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
    },

    checkVotes: function() {
        // 次のステップで、通信による人数計算とカウントダウン移行を実装します
        // 今回はUIの動作確認用のダミーです。
        setTimeout(() => {
            this.startCountdown();
        }, 2000);
    },

    startCountdown: function() {
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
        // 不参加なら観戦モードに移行
        if (this.myVote === false) {
            this.isSpectator = true;
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#aaaaaa;">観戦モードに移行しました。（他のプレイヤーからは見えません）</span>', 'sys');
            // TODO: 自キャラの透明化、通信情報のカット処理
        } else {
            this.isSpectator = false;
        }

        // 3, 2, 1, スタート の演出
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
                // TODO: マップリフレッシュ、アイテムクリア、初期位置ワープ処理
            } else {
                clearInterval(startTimer);
                centerMsg.remove();
                // TODO: プラグインのゲーム開始スクリプト実行
            }
        }, 1000);
    }
};

setTimeout(() => {
    if (window.MinigameManager) window.MinigameManager.init();
}, 1000);
