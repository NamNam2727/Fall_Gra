// =====================================
// ui.js
// HTMLのUI要素やCSSを動的に生成して画面に追加する
// =====================================

function initUI() {
    const style = document.createElement('style');
    style.innerHTML = `
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        
        #joystick-base {
            position: absolute; width: 120px; height: 120px; border: 3px solid rgba(255, 255, 255, 0.6);
            border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.3) 100%);
            transform: translate(-50%, -50%); display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3); pointer-events: none;
        }
        #joystick-stick {
            position: absolute; width: 60px; height: 60px; background: rgba(255, 255, 255, 0.9);
            border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%, -50%); box-shadow: 0 4px 8px rgba(0,0,0,0.4);
        }
        
        #jump-btn {
            position: absolute; bottom: 10px; right: 15px; width: 80px; height: 80px;
            background: rgba(255, 255, 255, 0.5); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 50%;
            display: flex; justify-content: center; align-items: center; color: #333; font-weight: bold;
            font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            pointer-events: auto; cursor: pointer;
        }
        #jump-btn:active { background: rgba(255, 255, 255, 0.8); transform: scale(0.95); }

        #item-slot {
            position: absolute; bottom: 100px; right: 25px; width: 60px; height: 60px;
            background: rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 10px;
            display: flex; justify-content: center; align-items: center; font-size: 30px;
            pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            transition: transform 0.1s;
        }
        #item-slot.active { pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.9); }
        #item-slot.active:active { transform: scale(0.9); }
        #item-slot.cooling { pointer-events: none; background: rgba(0, 0, 0, 0.8); }
        .item-timer { position: absolute; font-size: 24px; color: white; font-weight: bold; text-shadow: 1px 1px 2px black; font-family: sans-serif; }

        #member-btn {
            position: absolute; bottom: 210px; right: -2px;
            padding: 6px 10px 6px 14px; 
            background-color: #fce4b2; 
            border: 2px solid #000; 
            border-radius: 20px 0 0 20px; 
            display: flex; justify-content: center; align-items: center; 
            color: #000; font-size: 13px; font-weight: bold; font-family: sans-serif; 
            box-shadow: -2px 4px 10px rgba(0,0,0,0.2); 
            pointer-events: auto; cursor: pointer; z-index: 100;
        }
        #member-btn:active { transform: scale(0.95); transform-origin: right center; }

        #camera-slider-container {
            position: absolute; bottom: 250px; right: 25px; width: 40px; height: 130px;
            background: rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 10px;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3); pointer-events: auto; z-index: 100;
            padding: 10px 0; box-sizing: border-box;
        }
        #camera-slider {
            -webkit-appearance: slider-vertical;
            writing-mode: bt-lr; 
            appearance: slider-vertical;
            width: 8px; height: 80px; outline: none; margin-top: 5px; cursor: pointer;
        }
        #camera-slider-label { color: white; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 1px black; font-family: sans-serif; }

        #minigame-btn {
            position: absolute; right: 10px; padding: 8px 16px;
            background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9);
            border-radius: 8px; color: #fff; font-weight: bold; font-family: sans-serif;
            font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto;
            cursor: pointer; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 100;
            display: flex; justify-content: center; align-items: center;
        }
        #minigame-btn:active { background: rgba(255, 150, 0, 1.0); transform: scale(0.95); }

        /* ★追加: ゲーム強制終了・リタイアボタン */
        #mg-abort-btn {
            position: absolute; top: 15px; left: 50%; transform: translateX(-50%); padding: 8px 15px;
            background: rgba(220, 50, 50, 0.9); border: 2px solid white; border-radius: 8px;
            color: white; font-weight: bold; font-family: sans-serif; font-size: 14px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: auto; cursor: pointer;
            z-index: 1000; display: none; /* ゲーム中のみ表示 */
        }
        #mg-abort-btn:active { transform: translateX(-50%) scale(0.95); }

        /* --- 既存メンバーウィンドウ --- */
        #member-window {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 85%; max-width: 350px; height: 60%; max-height: 400px;
            background: rgba(20, 20, 30, 0.95); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.7); display: none; flex-direction: column;
            z-index: 1000; pointer-events: auto;
        }
        .member-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 2px solid rgba(255,255,255,0.2); font-size: 16px; font-weight: bold; color: white; font-family: sans-serif; }
        .member-close-btn { background: none; border: none; color: white; font-size: 16px; cursor: pointer; padding: 5px; }
        .member-list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
        .member-item { display: flex; align-items: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 8px; }
        .member-icon { width: 40px; height: 40px; border-radius: 50%; background: #ccc; margin-right: 15px; background-size: cover; background-position: center; border: 2px solid rgba(255,255,255,0.5); display: flex; justify-content: center; align-items: center; font-size: 20px; }
        .member-name { color: white; font-size: 14px; font-weight: bold; font-family: sans-serif; }

        /* --- チャット・ショートカットエリア --- */
        #bottomUIContainer { position: absolute; left: 10px; bottom: 10px; width: 250px; z-index: 20; display: flex; flex-direction: column; justify-content: flex-end; font-family: sans-serif; pointer-events: none; }
        #floatingLog { width: 100%; height: 120px; pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; margin-bottom: 5px; }
        .log-line { font-size: 13px; line-height: 1.4; color: white; text-shadow: 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black; font-weight: bold; opacity: 1; transition: opacity 0.5s ease-out; margin-top: 3px; word-wrap: break-word; }
        .log-line.fade-out { opacity: 0; }
        #bottomTabs { display: flex; pointer-events: auto; }
        .bottom-tab-btn { background-color: rgba(40, 40, 40, 0.9); border: 2px solid #555; border-bottom: none; color: #ccc; font-size: 12px; padding: 6px 15px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; margin-right: -1px; -webkit-tap-highlight-color: transparent; outline: none; }
        .bottom-tab-btn.active { background-color: rgba(20, 20, 20, 0.85); color: #fff; border-color: #777; z-index: 2; }
        #bottomContentArea { height: 140px; background-color: rgba(20, 20, 20, 0.85); border: 2px solid #777; border-bottom: none; border-radius: 0 8px 0 0; pointer-events: auto; display: flex; flex-direction: column; overflow: hidden; transition: height 0.3s ease-in-out, border-width 0.3s ease-in-out; }
        .bottom-content { flex: 1; display: none; flex-direction: column; padding: 5px; overflow: hidden; }
        .bottom-content.active { display: flex; }
        #chatLogContent { flex: 1; overflow-y: auto; font-size: 13px; line-height: 1.5; color: #ddd; display: flex; flex-direction: column; }
        .full-log-line { margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px; word-wrap: break-word; }
        #chatInputArea { display: flex; margin-top: 5px; }
        #chatInputArea input { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid #555; color: white; padding: 8px; font-size: 14px; box-sizing: border-box; border-radius: 4px 0 0 4px; outline: none; pointer-events: auto; }
        #chatInputArea button { background: #4CAF50; border: none; color: white; padding: 8px 15px; cursor: pointer; font-size: 14px; font-weight: bold; border-radius: 0 4px 4px 0; pointer-events: auto; }
        #shortcutGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; overflow-y: auto; flex: 1; padding-bottom: 5px; }
        .shortcut-btn { background: rgba(0,0,0,0.6); border: 1px solid #666; color: white; padding: 6px; border-radius: 4px; font-size: 12px; cursor: pointer; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: bold; }
        .shortcut-btn:active { background: rgba(80,80,80,0.8); }
        #editShortcutBtn { width: 100%; background: #444; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: bold; }

        /* --- ミニゲーム用UI群 --- */
        .mg-window-base {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 90%; max-width: 400px; height: 70%; max-height: 500px;
            background: rgba(15, 15, 25, 0.95); border: 3px solid #ffaa00; border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; flex-direction: column;
            z-index: 1000; pointer-events: auto; font-family: sans-serif; color: white;
        }

        #mg-list-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 15px; overflow-y: auto; flex: 1; }
        .mg-list-item { display: flex; flex-direction: column; align-items: center; cursor: pointer; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; border: 2px solid transparent; }
        .mg-list-item:active { background: rgba(255,255,255,0.2); border-color: #ffaa00; }
        .mg-list-icon { width: 60px; height: 60px; border-radius: 12px; background-size: cover; background-position: center; margin-bottom: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.5); }
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

        #mg-proposal-popup {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 85%; max-width: 350px; background: rgba(30, 20, 20, 0.95); border: 4px solid #ff4444; border-radius: 12px;
            box-shadow: 0 10px 50px rgba(0,0,0,0.9); display: none; flex-direction: column;
            z-index: 2000; pointer-events: auto; padding: 20px; font-family: sans-serif; text-align: center;
        }
        .mg-popup-header { color: #ffaa00; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        #mg-popup-icon { width: 80px; height: 80px; margin: 0 auto 10px auto; border-radius: 12px; background-size: cover; background-position: center; border: 2px solid #fff; }
        #mg-popup-title { font-size: 20px; color: white; font-weight: bold; margin-bottom: 5px; }
        #mg-popup-rules { font-size: 13px; color: #ccc; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 6px; margin-bottom: 15px; }
        
        .mg-popup-btns { display: flex; gap: 10px; }
        .mg-popup-btn { flex: 1; padding: 12px; font-size: 16px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; color: white; }
        #mg-btn-join { background: #4CAF50; }
        #mg-btn-decline { background: #f44336; }
        .mg-popup-btn:active { transform: scale(0.95); }

        #mg-countdown-overlay {
            position: absolute; top: 20%; left: 50%; transform: translate(-50%, 0);
            display: none; flex-direction: column; align-items: center; z-index: 1500;
            pointer-events: none; font-family: sans-serif;
        }
        .mg-cd-label { font-size: 24px; color: white; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
        #mg-countdown-text { font-size: 60px; color: #ffaa00; font-weight: bold; text-shadow: 0 4px 10px rgba(0,0,0,0.9); }
    `;
    document.head.appendChild(style);

    const uiLayer = document.createElement('div');
    uiLayer.id = 'ui-layer';

    const joystickBase = document.createElement('div');
    joystickBase.id = 'joystick-base';
    const joystickStick = document.createElement('div');
    joystickStick.id = 'joystick-stick';
    joystickBase.appendChild(joystickStick);
    uiLayer.appendChild(joystickBase);

    const jumpBtn = document.createElement('div');
    jumpBtn.id = 'jump-btn';
    jumpBtn.innerText = 'JUMP';
    uiLayer.appendChild(jumpBtn);

    const itemSlot = document.createElement('div');
    itemSlot.id = 'item-slot';
    uiLayer.appendChild(itemSlot);

    const memberBtn = document.createElement('div');
    memberBtn.id = 'member-btn';
    memberBtn.innerText = 'メンバーリスト';
    uiLayer.appendChild(memberBtn);

    const memberWindow = document.createElement('div');
    memberWindow.id = 'member-window';
    memberWindow.innerHTML = `
        <div class="member-header"><span>ルームメンバー</span><button class="member-close-btn" id="member-close-btn">❌</button></div>
        <div class="member-list" id="member-list-content"></div>
    `;
    uiLayer.appendChild(memberWindow);
    window.updateMemberList = function() { /* 省略せず既存通り動作 */ };
    memberBtn.addEventListener('click', () => { window.updateMemberList(); memberWindow.style.display = 'flex'; });
    memberWindow.querySelector('#member-close-btn').addEventListener('click', () => { memberWindow.style.display = 'none'; });
    memberWindow.addEventListener('mousedown', e => e.stopPropagation());
    memberWindow.addEventListener('touchstart', e => e.stopPropagation(), {passive: false});

    const cameraSliderContainer = document.createElement('div');
    cameraSliderContainer.id = 'camera-slider-container';
    cameraSliderContainer.innerHTML = `<div id="camera-slider-label">CAM</div><input type="range" id="camera-slider" min="0" max="100" value="50">`;
    uiLayer.appendChild(cameraSliderContainer);
    window.cameraSliderValue = 0.5;
    const cameraSlider = cameraSliderContainer.querySelector('#camera-slider');
    if (cameraSlider) {
        cameraSlider.addEventListener('input', (e) => { window.cameraSliderValue = e.target.value / 100; });
    }
    cameraSliderContainer.addEventListener('mousedown', e => e.stopPropagation());
    cameraSliderContainer.addEventListener('touchstart', e => e.stopPropagation(), {passive: false});

    // ★追加: ゲーム強制終了ボタン
    const abortBtn = document.createElement('div');
    abortBtn.id = 'mg-abort-btn';
    abortBtn.innerText = 'ゲームを終了する';
    abortBtn.addEventListener('click', () => {
        if (window.MinigameManager) window.MinigameManager.abortGame();
    });
    uiLayer.appendChild(abortBtn);

    // ミニゲームウィンドウ群
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
            
            <div class="mg-setting-row">
                <span class="mg-setting-label">制限時間 (分)</span>
                <div class="mg-toggle-group" id="mg-toggle-time">
                    <div class="mg-toggle-btn" data-val="1">1</div>
                    <div class="mg-toggle-btn" data-val="2">2</div>
                    <div class="mg-toggle-btn active" data-val="3">3</div>
                    <div class="mg-toggle-btn" data-val="4">4</div>
                    <div class="mg-toggle-btn" data-val="5">5</div>
                </div>
            </div>
            
            <div class="mg-setting-row">
                <span class="mg-setting-label">アイテム数</span>
                <div class="mg-toggle-group" id="mg-toggle-item">
                    <div class="mg-toggle-btn" data-val="0">0</div>
                    <div class="mg-toggle-btn active" data-val="1">1</div>
                    <div class="mg-toggle-btn" data-val="2">2</div>
                    <div class="mg-toggle-btn" data-val="3">3</div>
                </div>
            </div>

            <div class="mg-setting-row">
                <span class="mg-setting-label">開始位置</span>
                <div class="mg-toggle-group" id="mg-toggle-pos">
                    <div class="mg-toggle-btn active" data-val="current">現在地</div>
                    <div class="mg-toggle-btn" data-val="initial">初期地</div>
                </div>
            </div>

            <button id="mg-detail-start-btn">この設定で申請する</button>
        </div>
    `;
    uiLayer.appendChild(mgDetailWindow);

    const mgPopup = document.createElement('div');
    mgPopup.id = 'mg-proposal-popup';
    mgPopup.innerHTML = `
        <div class="mg-popup-header">🎮 ゲーム開始申請 🎮</div>
        <div id="mg-popup-icon"></div>
        <div id="mg-popup-title">ゲームタイトル</div>
        <div id="mg-popup-rules">制限時間: 3分 | アイテム: 1個 | 開始: 現在地</div>
        <div class="mg-popup-btns">
            <button class="mg-popup-btn" id="mg-btn-join">参加する</button>
            <button class="mg-popup-btn" id="mg-btn-decline">参加しない</button>
        </div>
    `;
    uiLayer.appendChild(mgPopup);

    const mgCountdown = document.createElement('div');
    mgCountdown.id = 'mg-countdown-overlay';
    mgCountdown.innerHTML = `
        <div class="mg-cd-label">ゲーム開始まで</div>
        <div id="mg-countdown-text">10</div>
    `;
    uiLayer.appendChild(mgCountdown);

    const preventTouch = (e) => e.stopPropagation();
    [mgListWindow, mgDetailWindow, mgPopup, abortBtn].forEach(el => {
        el.addEventListener('mousedown', preventTouch);
        el.addEventListener('touchstart', preventTouch, {passive: false});
    });

    const screenHeight = window.innerHeight;
    const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 

    const minigameBtn = document.createElement('div');
    minigameBtn.id = 'minigame-btn';
    minigameBtn.innerText = 'ミニゲーム';
    minigameBtn.style.top = (topExclusionHeight + 15) + 'px';
    minigameBtn.addEventListener('click', () => {
        if (window.MinigameManager) window.MinigameManager.openListView();
    });
    uiLayer.appendChild(minigameBtn);

    const bottomUI = document.createElement('div');
    bottomUI.id = 'bottomUIContainer';
    bottomUI.innerHTML = `
        <div id="floatingLog"></div>
        <div id="bottomTabs">
            <button class="bottom-tab-btn active" data-target="chat">チャット</button>
            <button class="bottom-tab-btn" data-target="shortcut">ショートカット</button>
            <button class="bottom-tab-btn" id="chatToggleBtn" style="padding: 6px 15px; margin-left: auto; background-color: #333; color: white;">▼</button>
        </div>
        <div id="bottomContentArea">
            <div id="content-chat" class="bottom-content active"><div id="chatLogContent"></div><div id="chatInputArea"><input type="text" id="chatInput" placeholder="発言..." autocomplete="off"><button id="chatSendBtn">送信</button></div></div>
            <div id="content-shortcut" class="bottom-content"><div id="shortcutGrid"></div><button id="editShortcutBtn">編集モード: OFF</button></div>
        </div>
    `;
    bottomUI.addEventListener('touchstart', preventTouch, {passive: false});
    bottomUI.addEventListener('pointerdown', preventTouch);
    bottomUI.addEventListener('mousedown', preventTouch);

    const chatToggleBtn = bottomUI.querySelector('#chatToggleBtn');
    const bottomContentArea = bottomUI.querySelector('#bottomContentArea');
    let isChatMinimized = false;

    function openChat() {
        if (isChatMinimized) {
            isChatMinimized = false;
            bottomContentArea.style.height = '140px';
            bottomContentArea.style.borderWidth = '2px';
            chatToggleBtn.innerText = '▼';
        }
    }

    chatToggleBtn.addEventListener('click', () => {
        isChatMinimized = !isChatMinimized;
        if (isChatMinimized) {
            bottomContentArea.style.height = '0px';
            bottomContentArea.style.borderWidth = '0px'; 
            chatToggleBtn.innerText = '▲';
        } else {
            bottomContentArea.style.height = '140px';
            bottomContentArea.style.borderWidth = '2px';
            chatToggleBtn.innerText = '▼';
        }
    });

    bottomUI.querySelectorAll('.bottom-tab-btn[data-target]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            openChat(); 
            bottomUI.querySelectorAll('.bottom-tab-btn[data-target]').forEach(b => b.classList.remove('active'));
            bottomUI.querySelectorAll('.bottom-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById('content-' + target).classList.add('active');
        });
    });

    uiLayer.appendChild(bottomUI);
    document.body.appendChild(uiLayer);
}
