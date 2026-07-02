// =====================================
// minigame_ui.js
// ミニゲーム関連のUI要素（ボタンやウィンドウ）の生成のみを担当
// =====================================

window.MinigameUI = {
    initUI: function() {
        const style = document.createElement('style');
        style.innerHTML = `
            #minigame-btn { position: absolute; right: 10px; padding: 8px 16px; background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; color: #fff; font-weight: bold; font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto; cursor: pointer; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 100; display: flex; justify-content: center; align-items: center; transition: all 0.2s; }
            #minigame-btn:active { background: rgba(255, 150, 0, 1.0); transform: scale(0.95); }
            #minigame-btn.abort-mode { background: rgba(220, 50, 50, 0.9) !important; border-color: white !important; }
            #minigame-btn.abort-mode:active { background: rgba(200, 40, 40, 1.0) !important; }

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
            #mg-popup-icon { width: 80px; height: 80px; margin: 0 auto 10px auto; border-radius: 12px; background-size: cover; background-position: center; border: 2px solid #fff; }
            #mg-popup-title { font-size: 20px; color: white; font-weight: bold; margin-bottom: 5px; }
            #mg-popup-rules { font-size: 13px; color: #ccc; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 6px; margin-bottom: 15px; }
            
            .mg-popup-btns { display: flex; gap: 10px; }
            .mg-popup-btn { flex: 1; padding: 12px; font-size: 16px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; color: white; }
            #mg-btn-join { background: #4CAF50; }
            #mg-btn-decline { background: #f44336; }
            .mg-popup-btn:active { transform: scale(0.95); }

            #mg-countdown-overlay { position: absolute; top: 20%; left: 50%; transform: translate(-50%, 0); display: none; flex-direction: column; align-items: center; z-index: 1500; pointer-events: none; font-family: sans-serif; }
            .mg-cd-label { font-size: 24px; color: white; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
            #mg-countdown-text { font-size: 60px; color: #ffaa00; font-weight: bold; text-shadow: 0 4px 10px rgba(0,0,0,0.9); }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const preventTouch = (e) => e.stopPropagation();
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 

        // ミニゲームボタン（ゲーム中は終了ボタン）
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
                if (window.MinigameManager.state === 'PLAYING') {
                    window.MinigameManager.abortGame(); 
                } else {
                    window.MinigameManager.openListView(); 
                }
            } else {
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#ff3300;">【エラー】ファイルが読み込めていません。</span>', 'sys');
            }
        };
        
        minigameBtn.addEventListener('click', onMinigameClick);
        minigameBtn.addEventListener('mousedown', preventTouch);
        minigameBtn.addEventListener('touchstart', (e) => { preventTouch(e); onMinigameClick(e); }, {passive: false});
        uiLayer.appendChild(minigameBtn);

        // リストウィンドウ
        const mgListWindow = document.createElement('div');
        mgListWindow.id = 'mg-list-window';
        mgListWindow.className = 'mg-window-base';
        mgListWindow.innerHTML = `
            <div class="member-header"><span>ミニゲームを選択</span><button class="member-close-btn" onclick="document.getElementById('mg-list-window').style.display='none'">❌</button></div>
            <div id="mg-list-container"></div>
        `;
        uiLayer.appendChild(mgListWindow);

        // 詳細ウィンドウ
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

        // 多数決ポップアップ
        const mgPopup = document.createElement('div');
        mgPopup.id = 'mg-proposal-popup';
        mgPopup.innerHTML = `
            <div class="mg-popup-header">🎮 ゲーム開始申請 🎮</div>
            <div id="mg-popup-icon"></div>
            <div id="mg-popup-title">ゲームタイトル</div>
            <div id="mg-popup-rules">制限時間: 3分 | アイテム: 1個 | 開始: 現在地</div>
            <div class="mg-popup-btns"><button class="mg-popup-btn" id="mg-btn-join">参加する</button><button class="mg-popup-btn" id="mg-btn-decline">参加しない</button></div>
        `;
        uiLayer.appendChild(mgPopup);

        // カウントダウン
        const mgCountdown = document.createElement('div');
        mgCountdown.id = 'mg-countdown-overlay';
        mgCountdown.innerHTML = `<div class="mg-cd-label">ゲーム開始まで</div><div id="mg-countdown-text">10</div>`;
        uiLayer.appendChild(mgCountdown);

        [mgListWindow, mgDetailWindow, mgPopup].forEach(el => {
            el.addEventListener('mousedown', preventTouch);
            el.addEventListener('touchstart', preventTouch, {passive: false});
        });
    }
};
