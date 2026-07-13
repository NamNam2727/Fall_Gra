// =====================================
// minigame_ui.js
// ミニゲーム関連のUI要素（ボタンやウィンドウ）の生成のみを担当
// ★申請ポップアップに説明文(description)を表示する要素を追加
// ★申請ポップアップのタイトル中央寄せ、閉じるボタン追加、アイコン枠のFlexbox対応
// =====================================

window.MinigameUI = {
    initUI: function() {
        const style = document.createElement('style');
        style.innerHTML = `
            #minigame-btn { position: absolute; right: 10px; padding: 8px 16px; background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; color: #fff; font-weight: bold; font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto; cursor: pointer; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 100; display: flex; justify-content: center; align-items: center; transition: all 0.2s; }
            #minigame-btn:active { background: rgba(255, 150, 0, 1.0); transform: scale(0.95); }
            #minigame-btn.abort-mode { background: rgba(220, 50, 50, 0.9) !important; border-color: white !important; }
            #minigame-btn.abort-mode:active { background: rgba(200, 40, 40, 1.0) !important; }
            #minigame-btn.spectator-mode { background: #555 !important; border-color: #777 !important; cursor: default; }
            #minigame-btn.spectator-mode:active { transform: none; }
            #minigame-btn.detail-mode { background: rgba(50, 150, 255, 0.9) !important; }
            #minigame-btn.detail-mode:active { background: rgba(40, 120, 220, 1.0) !important; }

            .mg-window-base { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 400px; height: 70%; max-height: 500px; background: rgba(15, 15, 25, 0.95); border: 3px solid #ffaa00; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; flex-direction: column; z-index: 1000; pointer-events: auto; font-family: sans-serif; color: white; }

            #mg-list-container { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: min-content; align-items: start; gap: 10px; padding: 15px; overflow-y: auto; flex: 1; }
            .mg-list-item { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; cursor: pointer; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; border: 2px solid transparent; height: max-content; }
            .mg-list-item:active { background: rgba(255,255,255,0.2); border-color: #ffaa00; }
            .mg-list-icon { width: 60px; height: 60px; border-radius: 12px; background-size: cover; background-position: center; margin-bottom: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.5); flex-shrink: 0; }
            .mg-list-title { font-size: 12px; font-weight: bold; text-align: center; line-height: 1.2; word-break: break-word; }

            .mg-detail-content { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 15px; }
            #mg-detail-icon { width: 100px; height: 100px; margin: 0 auto; border-radius: 16px; background-size: cover; background-position: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; font-size: 50px; }
            #mg-detail-desc { font-size: 13px; line-height: 1.5; color: #ddd; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; }
            
            .mg-setting-row { display: flex; flex-direction: column; gap: 5px; }
            .mg-setting-label { font-size: 13px; font-weight: bold; color: #aaa; }
            .mg-toggle-group { display: flex; flex-wrap: wrap; gap: 5px; }
            .mg-toggle-btn { flex: 1; min-width: 45px; text-align: center; padding: 8px 5px; background: #333; color: #fff; border: 2px solid #555; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; }
            .mg-toggle-btn.active { background: #ffaa00; color: #000; border-color: #fff; }
            
            #mg-detail-start-btn { width: 100%; padding: 15px; background: #4CAF50; color: white; font-size: 18px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; margin-top: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
            #mg-detail-start-btn:active { transform: scale(0.98); background: #45a049; }

            #mg-proposal-popup { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 85%; max-width: 350px; background: rgba(30, 20, 20, 0.95); border: 4px solid #ff4444; border-radius: 12px; box-shadow: 0 10px 50px rgba(0,0,0,0.9); display: none; flex-direction: column; z-index: 2000; pointer-events: auto; padding: 20px; font-family: sans-serif; text-align: center; }
            .mg-popup-header { color: #ffaa00; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
            #mg-popup-icon { width: 80px; height: 80px; margin: 0 auto 10px auto; border-radius: 12px; background-size: cover; background-position: center; border: 2px solid #fff; display: flex; justify-content: center; align-items: center; font-size: 40px; }
            #mg-popup-title { font-size: 20px; color: white; font-weight: bold; margin-bottom: 5px; }
            #mg-popup-desc { font-size: 12px; color: #aaa; margin-bottom: 10px; line-height: 1.4; word-break: break-all; }
            #mg-popup-rules { font-size: 13px; color: #ccc; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 6px; margin-bottom: 15px; }
            
            .mg-popup-btns { display: flex; gap: 10px; }
            .mg-popup-btn { flex: 1; padding: 12px; font-size: 16px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; color: white; }
            .mg-popup-btn.join { background: #4CAF50; }
            .mg-popup-btn.decline { background: #f44336; }
            .mg-popup-btn.cancel { background: #555; border: 2px solid #ff4444; }
            .mg-popup-btn:active { transform: scale(0.95); }

            #mg-countdown-overlay { position: absolute; top: 20%; left: 50%; transform: translate(-50%, 0); display: none; flex-direction: column; align-items: center; z-index: 1500; pointer-events: none; font-family: sans-serif; }
            .mg-cd-label { font-size: 24px; color: white; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
            #mg-countdown-text { font-size: 60px; color: #ffaa00; font-weight: bold; text-shadow: 0 4px 10px rgba(0,0,0,0.9); }

            #mg-timer-ui { position: absolute; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); border: 2px solid #ffaa00; border-radius: 20px; padding: 5px 20px; color: white; font-size: 24px; font-weight: bold; font-family: monospace; display: none; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; }
            
            /* リザルト画面 */
            #mg-result-window { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 400px; height: 80%; max-height: 600px; background: rgba(20, 20, 30, 0.95); border: 4px solid #ffcc00; border-radius: 16px; box-shadow: 0 10px 50px rgba(0,0,0,0.9); display: none; flex-direction: column; z-index: 2500; pointer-events: auto; font-family: sans-serif; }
            .result-header { padding: 15px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2); }
            .result-title { color: #ffcc00; font-size: 24px; font-weight: bold; text-shadow: 0 2px 4px black; margin-bottom: 5px; }
            .result-subtitle { color: #ccc; font-size: 14px; }
            
            #result-list-container { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 8px; }
            .result-item { display: flex; align-items: center; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 8px; border-left: 4px solid transparent; }
            .result-item.rank-1 { border-color: gold; background: rgba(255, 215, 0, 0.2); }
            .result-item.rank-2 { border-color: silver; }
            .result-item.rank-3 { border-color: #cd7f32; }
            .result-item.retired { opacity: 0.6; background: rgba(255, 0, 0, 0.1); border-color: #ff4444; }
            .result-item.error { opacity: 0.6; background: rgba(100, 100, 100, 0.3); border-color: #888; }
            
            .result-rank { width: 30px; font-size: 18px; font-weight: bold; text-align: center; color: white; margin-right: 10px; }
            .result-icon { width: 40px; height: 40px; border-radius: 50%; background-color: #555; background-size: cover; background-position: center; border: 2px solid rgba(255,255,255,0.5); margin-right: 15px; flex-shrink: 0; }
            .result-name { flex: 1; color: white; font-size: 16px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            
            .result-score-container { display: flex; flex-direction: column; align-items: flex-end; margin-left: 10px; min-width: 60px; }
            .result-score { font-size: 16px; font-weight: bold; color: #ffaa00; white-space: nowrap; }
            .result-status { font-size: 11px; font-weight: bold; margin-top: 2px; white-space: nowrap; }
            
            .result-footer { padding: 15px; text-align: center; }
            #btn-close-result { background: #4CAF50; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
            #btn-close-result:active { transform: scale(0.95); }

            #mg-retire-popup { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 85%; max-width: 300px; background: rgba(30, 20, 20, 0.95); border: 3px solid #ffaa00; border-radius: 12px; box-shadow: 0 10px 50px rgba(0,0,0,0.9); display: none; flex-direction: column; z-index: 3000; pointer-events: auto; padding: 20px; font-family: sans-serif; text-align: center; }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const preventTouch = (e) => e.stopPropagation();
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 

        const timerUI = document.createElement('div');
        timerUI.id = 'mg-timer-ui';
        timerUI.innerText = '03:00';
        timerUI.style.top = (topExclusionHeight + 15) + 'px';
        uiLayer.appendChild(timerUI);

        const minigameBtn = document.createElement('div');
        minigameBtn.id = 'minigame-btn';
        minigameBtn.innerText = 'ミニゲーム';
        minigameBtn.style.top = (topExclusionHeight + 15) + 'px';
        
        let lastMgBtnClick = 0;
        const onMinigameClick = (e) => {
            const now = Date.now();
            if (now - lastMgBtnClick < 500) return; 
            lastMgBtnClick = now;

            if (window.MinigameManager) {
                if (window.MinigameManager.state === 'PLAYING' || window.MinigameManager.state === 'COUNTDOWN') {
                    if (!window.isSpectatorMode) {
                        if (typeof window.MinigameManager.confirmRetire === 'function') window.MinigameManager.confirmRetire(); 
                    }
                } else if (window.MinigameManager.state === 'PROPOSING') {
                    if (typeof window.MinigameManager.showProposalPopup === 'function') window.MinigameManager.showProposalPopup();
                } else {
                    if (typeof window.MinigameManager.openListView === 'function') window.MinigameManager.openListView(); 
                }
            }
        };
        
        minigameBtn.addEventListener('click', onMinigameClick);
        minigameBtn.addEventListener('mousedown', preventTouch);
        minigameBtn.addEventListener('touchstart', (e) => { preventTouch(e); onMinigameClick(e); }, {passive: false});
        uiLayer.appendChild(minigameBtn);

        const mgListWindow = document.createElement('div');
        mgListWindow.id = 'mg-list-window';
        mgListWindow.className = 'mg-window-base';
        mgListWindow.innerHTML = `
            <div class="member-header"><span>ミニゲームを選択</span><button class="member-close-btn" onclick="document.getElementById('mg-list-window').style.display='none'">❌</button></div>
            <div id="mg-list-container"></div>
        `;
        uiLayer.appendChild(mgListWindow);

        const mgDetailWindow = document.createElement('div');
        mgDetailWindow.id = 'mg-detail-window';
        mgDetailWindow.className = 'mg-window-base';
        mgDetailWindow.innerHTML = `
            <div class="member-header">
                <button class="member-close-btn" onclick="document.getElementById('mg-detail-window').style.display='none'; document.getElementById('mg-list-window').style.display='flex';" style="font-size:20px; padding:0 10px;">←</button>
                <span id="mg-detail-title" style="flex:1; text-align:center;">タイトル</span>
                <button class="member-close-btn" onclick="document.getElementById('mg-detail-window').style.display='none'">❌</button>
            </div>
            <div class="mg-detail-content">
                <div id="mg-detail-icon"></div>
                <div id="mg-detail-desc"></div>
                <div class="mg-setting-row"><span class="mg-setting-label">制限時間 (分)</span><div class="mg-toggle-group" id="mg-toggle-time"><div class="mg-toggle-btn" data-val="1">1</div><div class="mg-toggle-btn" data-val="2">2</div><div class="mg-toggle-btn active" data-val="3">3</div><div class="mg-toggle-btn" data-val="4">4</div><div class="mg-toggle-btn" data-val="5">5</div></div></div>
                <div class="mg-setting-row"><span class="mg-setting-label">アイテム数</span><div class="mg-toggle-group" id="mg-toggle-item"><div class="mg-toggle-btn" data-val="0">0</div><div class="mg-toggle-btn active" data-val="1">1</div><div class="mg-toggle-btn" data-val="2">2</div><div class="mg-toggle-btn" data-val="3">3</div></div></div>
                <div class="mg-setting-row"><span class="mg-setting-label">開始位置</span><div class="mg-toggle-group" id="mg-toggle-pos"><div class="mg-toggle-btn active" data-val="current">現在地</div><div class="mg-toggle-btn" data-val="initial">初期地</div></div></div>
                <button id="mg-detail-start-btn">この設定で申請する</button>
            </div>
        `;
        uiLayer.appendChild(mgDetailWindow);

        const mgPopup = document.createElement('div');
        mgPopup.id = 'mg-proposal-popup';
        // ★ 変更点: タイトルの中央寄せ、❌ボタン追加
        mgPopup.innerHTML = `
            <div class="member-header" style="position: relative; display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
                <div class="mg-popup-header" style="margin: 0; text-align: center; width: 100%;">🎮 ゲーム開始申請 🎮</div>
                <button class="member-close-btn" onclick="document.getElementById('mg-proposal-popup').style.display='none'" style="position: absolute; right: 0;">❌</button>
            </div>
            <div id="mg-popup-icon"></div>
            <div id="mg-popup-title">ゲームタイトル</div>
            <div id="mg-popup-desc"></div>
            <div id="mg-popup-rules">制限時間: 3分 | アイテム: 1個 | 開始: 現在地</div>
            <div class="mg-popup-btns" id="mg-popup-btns-container"></div>
        `;
        uiLayer.appendChild(mgPopup);

        const mgCountdown = document.createElement('div');
        mgCountdown.id = 'mg-countdown-overlay';
        mgCountdown.innerHTML = `<div class="mg-cd-label">ゲーム開始まで</div><div id="mg-countdown-text">10</div>`;
        uiLayer.appendChild(mgCountdown);

        const mgRetirePopup = document.createElement('div');
        mgRetirePopup.id = 'mg-retire-popup';
        mgRetirePopup.innerHTML = `
            <div style="color:#ffaa00; font-size:18px; font-weight:bold; margin-bottom:15px;">リタイア確認</div>
            <div style="margin-bottom:20px; font-size:14px; line-height:1.5; color:white;">このゲームで敗北した扱いになりますが<br>よろしいですか？</div>
            <div style="display:flex; gap:10px;">
                <button id="mg-btn-retire-yes" style="flex:1; padding:12px; background:#f44336; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">はい</button>
                <button id="mg-btn-retire-no" style="flex:1; padding:12px; background:#555; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">いいえ</button>
            </div>
        `;
        uiLayer.appendChild(mgRetirePopup);

        const mgResultWindow = document.createElement('div');
        mgResultWindow.id = 'mg-result-window';
        mgResultWindow.innerHTML = `
            <div class="result-header">
                <div class="result-title">RESULT</div>
                <div class="result-subtitle" id="result-game-name">ミニゲーム</div>
            </div>
            <div id="result-list-container"></div>
            <div class="result-footer">
                <button id="btn-close-result" onclick="document.getElementById('mg-result-window').style.display='none'">閉じる</button>
            </div>
        `;
        uiLayer.appendChild(mgResultWindow);

        [mgListWindow, mgDetailWindow, mgPopup, mgRetirePopup, mgResultWindow].forEach(el => {
            el.addEventListener('mousedown', preventTouch);
            el.addEventListener('touchstart', preventTouch, {passive: false});
        });
    },

    updateTimer: function(timeString) {
        const timerUI = document.getElementById('mg-timer-ui');
        if (timerUI) timerUI.innerText = timeString;
    },

    showResult: function(gameName, dataArray) {
        const win = document.getElementById('mg-result-window');
        const container = document.getElementById('result-list-container');
        document.getElementById('result-game-name').innerText = gameName;
        
        if (!win || !container) return;
        container.innerHTML = '';

        dataArray.sort((a, b) => {
            if (a.isError && !b.isError) return 1;
            if (!a.isError && b.isError) return -1;
            if (a.isRetired && !b.isRetired) return 1;
            if (!a.isRetired && b.isRetired) return -1;
            
            if (a.rank !== b.rank && a.rank > 0 && b.rank > 0) return a.rank - b.rank;
            return b.scoreValue - a.scoreValue; 
        });

        dataArray.forEach(data => {
            const item = document.createElement('div');
            item.className = 'result-item';
            
            if (data.isError) item.classList.add('error');
            else if (data.isRetired) item.classList.add('retired');
            else if (data.rank === 1) item.classList.add('rank-1');
            else if (data.rank === 2) item.classList.add('rank-2');
            else if (data.rank === 3) item.classList.add('rank-3');

            const rankEl = document.createElement('div');
            rankEl.className = 'result-rank';
            if (data.isError || data.isRetired) rankEl.innerText = '-';
            else if (data.rank === 1) rankEl.innerText = '👑';
            else rankEl.innerText = data.rank;

            const iconEl = document.createElement('div');
            iconEl.className = 'result-icon';
            if (data.icon) iconEl.style.backgroundImage = `url(${data.icon})`;
            else iconEl.innerText = '👤';

            const nameEl = document.createElement('div');
            nameEl.className = 'result-name';
            nameEl.innerText = data.name;

            const scoreContainer = document.createElement('div');
            scoreContainer.className = 'result-score-container';

            const scoreEl = document.createElement('div');
            scoreEl.className = 'result-score';
            scoreEl.innerText = data.scoreText || '';
            if (data.isRetired) scoreEl.style.color = '#ffaa00';

            const statusEl = document.createElement('div');
            statusEl.className = 'result-status';
            
            if (data.isError) {
                statusEl.innerText = '通信エラー';
                statusEl.style.color = '#ff4444';
                scoreEl.style.color = '#888';
            } else if (data.isRetired) {
                statusEl.innerText = 'リタイア';
                statusEl.style.color = '#ff4444';
            } else if (data.statusText) {
                statusEl.innerText = data.statusText;
                statusEl.style.color = '#00ff00';
            }

            scoreContainer.appendChild(scoreEl);
            if (statusEl.innerText !== '') {
                scoreContainer.appendChild(statusEl);
            }

            item.appendChild(rankEl);
            item.appendChild(iconEl);
            item.appendChild(nameEl);
            item.appendChild(scoreContainer); 
            
            container.appendChild(item);
        });

        win.style.display = 'flex';
    }
};

