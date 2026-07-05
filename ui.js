// =====================================
// ui.js
// 基礎的なUI要素（移動、ジャンプ、チャット等）を生成
// ★IndexedDB(FallGraDB)の基盤を追加
// ★メニューボタン、ドロップダウンリスト、設定モーダルを追加
// =====================================

// ★ IndexedDB の簡易ラッパー（今後のマップ保存などでも流用可能）
window.FallGraDB = {
    dbName: 'FallGraDatabase',
    storeName: 'settings',
    init: function() {
        return new Promise((resolve) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
        });
    },
    save: function(key, value) {
        this.init().then(db => {
            const tx = db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put(value, key);
        });
    },
    load: function(key, defaultVal) {
        return new Promise(resolve => {
            this.init().then(db => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get(key);
                req.onsuccess = () => resolve(req.result !== undefined ? req.result : defaultVal);
                req.onerror = () => resolve(defaultVal);
            });
        });
    }
};

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
            color: #333; font-weight: bold; font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            pointer-events: auto; cursor: pointer; overflow: hidden;
        }
        #jump-btn-normal { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
        #jump-btn-normal:active { background: rgba(255, 255, 255, 0.8); transform: scale(0.95); }
        
        #jump-btn-spec { display: none; flex-direction: column; width: 100%; height: 100%; }
        .spec-btn { flex: 1; display: flex; justify-content: center; align-items: center; font-size: 24px; transition: background 0.1s; }
        .spec-btn:active { background: rgba(255, 255, 255, 0.6); }

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

        #camera-slider-container {
            position: absolute; bottom: 250px; right: 25px; width: 40px; height: 130px;
            background: rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 10px;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3); pointer-events: auto; z-index: 100;
            padding: 10px 0; box-sizing: border-box;
        }
        #camera-slider { -webkit-appearance: slider-vertical; writing-mode: bt-lr; appearance: slider-vertical; width: 8px; height: 80px; outline: none; margin-top: 5px; cursor: pointer; }
        #camera-slider-label { color: white; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 1px black; font-family: sans-serif; }

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
        
        /* ★ メニューボタンとドロップダウン、設定モーダルのスタイル */
        #menu-btn { position: absolute; right: 10px; padding: 8px 16px; background: rgba(0, 150, 255, 0.85); border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; color: #fff; font-weight: bold; font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto; cursor: pointer; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 1000; transition: all 0.2s; }
        #menu-btn:active { background: rgba(0, 150, 255, 1.0); transform: scale(0.95); }
        #menu-btn.abort-mode { background: rgba(220, 50, 50, 0.9) !important; border-color: white !important; }
        #menu-btn.abort-mode:active { background: rgba(200, 40, 40, 1.0) !important; }
        #menu-btn.spectator-mode { background: #555 !important; border-color: #777 !important; cursor: default; }
        
        #menu-dropdown { position: absolute; right: 10px; background: rgba(20, 20, 30, 0.95); border: 2px solid #aaa; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.8); display: none; flex-direction: column; z-index: 999; pointer-events: auto; font-family: sans-serif; overflow: hidden; width: 160px; }
        .menu-item { padding: 12px 15px; color: white; font-size: 14px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.1); cursor: pointer; }
        .menu-item:last-child { border-bottom: none; }
        .menu-item:hover { background: rgba(255,255,255,0.1); }
        .menu-item:active { background: rgba(255,255,255,0.2); }
        
        #settings-modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 85%; max-width: 320px; background: rgba(20, 20, 30, 0.95); border: 3px solid #00ffcc; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; flex-direction: column; z-index: 2000; pointer-events: auto; padding: 20px; font-family: sans-serif; color: white; }
        .setting-row { margin-bottom: 20px; }
        .setting-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; display: flex; justify-content: space-between; }
        .setting-slider { width: 100%; margin-top: 5px; cursor: pointer; }
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
    jumpBtn.innerHTML = `
        <div id="jump-btn-normal">JUMP</div>
        <div id="jump-btn-spec">
            <div id="spec-up" class="spec-btn" style="border-bottom: 2px solid rgba(0,0,0,0.2);">🔺</div>
            <div id="spec-down" class="spec-btn">🔻</div>
        </div>
    `;
    uiLayer.appendChild(jumpBtn);

    const normalJump = jumpBtn.querySelector('#jump-btn-normal');
    const specUp = jumpBtn.querySelector('#spec-up');
    const specDown = jumpBtn.querySelector('#spec-down');

    window.specMoveUp = false;
    window.specMoveDown = false;

    const stopPropagation = (e) => e.stopPropagation();
    
    const doSpecUp = (e) => { stopPropagation(e); window.specMoveUp = true; };
    const endSpecUp = (e) => { stopPropagation(e); window.specMoveUp = false; };
    specUp.addEventListener('mousedown', doSpecUp);
    specUp.addEventListener('touchstart', doSpecUp, {passive: false});
    specUp.addEventListener('mouseup', endSpecUp);
    specUp.addEventListener('mouseleave', endSpecUp);
    specUp.addEventListener('touchend', endSpecUp);
    specUp.addEventListener('touchcancel', endSpecUp);

    const doSpecDown = (e) => { stopPropagation(e); window.specMoveDown = true; };
    const endSpecDown = (e) => { stopPropagation(e); window.specMoveDown = false; };
    specDown.addEventListener('mousedown', doSpecDown);
    specDown.addEventListener('touchstart', doSpecDown, {passive: false});
    specDown.addEventListener('mouseup', endSpecDown);
    specDown.addEventListener('mouseleave', endSpecDown);
    specDown.addEventListener('touchend', endSpecDown);
    specDown.addEventListener('touchcancel', endSpecDown);

    window.toggleSpectatorUI = function(isSpec) {
        if (isSpec) {
            normalJump.style.display = 'none';
            jumpBtn.querySelector('#jump-btn-spec').style.display = 'flex';
        } else {
            normalJump.style.display = 'flex';
            jumpBtn.querySelector('#jump-btn-spec').style.display = 'none';
            window.specMoveUp = false;
            window.specMoveDown = false;
        }
    };

    const itemSlot = document.createElement('div');
    itemSlot.id = 'item-slot';
    uiLayer.appendChild(itemSlot);

    const preventTouch = (e) => e.stopPropagation();

    const cameraSliderContainer = document.createElement('div');
    cameraSliderContainer.id = 'camera-slider-container';
    cameraSliderContainer.innerHTML = `<div id="camera-slider-label">CAM</div><input type="range" id="camera-slider" min="0" max="100" value="50">`;
    uiLayer.appendChild(cameraSliderContainer);
    window.cameraSliderValue = 0.5;
    const cameraSlider = cameraSliderContainer.querySelector('#camera-slider');
    if (cameraSlider) {
        cameraSlider.addEventListener('input', (e) => { window.cameraSliderValue = e.target.value / 100; });
    }
    cameraSliderContainer.addEventListener('mousedown', preventTouch);
    cameraSliderContainer.addEventListener('touchstart', preventTouch, {passive: false});

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

    // ==========================================
    // ★ メニューボタンとドロップダウンの構築
    // ==========================================
    const screenHeight = window.innerHeight;
    const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 

    const menuBtn = document.createElement('div');
    menuBtn.id = 'menu-btn';
    menuBtn.innerText = 'メニュー';
    menuBtn.style.top = (topExclusionHeight + 15) + 'px';
    
    const menuDropdown = document.createElement('div');
    menuDropdown.id = 'menu-dropdown';
    menuDropdown.style.top = (topExclusionHeight + 60) + 'px';
    menuDropdown.innerHTML = `
        <div class="menu-item" id="menu-minigame">🎮 ミニゲーム</div>
        <div class="menu-item" style="color:#777;">🗺️ マップ変更</div>
        <div class="menu-item" style="color:#777;">📖 遊び方</div>
        <div class="menu-item" id="menu-setting">⚙️ 設定</div>
    `;

    // 設定モーダルの構築
    const settingsModal = document.createElement('div');
    settingsModal.id = 'settings-modal';
    settingsModal.innerHTML = `
        <div style="font-size:18px; font-weight:bold; color:#00ffcc; text-align:center; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:10px;">⚙️ 音声設定</div>
        
        <div class="setting-row">
            <div class="setting-label"><span>🎵 BGM音量</span><span id="bgm-val">50%</span></div>
            <input type="range" class="setting-slider" id="bgm-slider" min="0" max="100" value="50">
        </div>
        <div class="setting-row">
            <div class="setting-label"><span>🔊 効果音 (SE) 音量</span><span id="se-val">50%</span></div>
            <input type="range" class="setting-slider" id="se-slider" min="0" max="100" value="50">
        </div>
        <div class="setting-row" style="display:flex; justify-content:space-between; align-items:center; margin-top:30px;">
            <span style="font-size:14px; font-weight:bold;">🔇 全体ミュート</span>
            <input type="checkbox" id="mute-toggle" style="width:20px; height:20px;">
        </div>
        
        <button id="close-settings-btn" style="width:100%; margin-top:20px; padding:12px; background:#4CAF50; color:white; border:none; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer;">閉じる</button>
    `;

    uiLayer.appendChild(menuBtn);
    uiLayer.appendChild(menuDropdown);
    uiLayer.appendChild(settingsModal);

    // IndexedDBから設定を読み込んで反映
    window.FallGraDB.load('bgmVolume', 50).then(v => {
        settingsModal.querySelector('#bgm-slider').value = v;
        settingsModal.querySelector('#bgm-val').innerText = v + '%';
        if (window.BGMSystem) window.BGMSystem.setVolume(v / 100);
    });
    window.FallGraDB.load('seVolume', 50).then(v => {
        settingsModal.querySelector('#se-slider').value = v;
        settingsModal.querySelector('#se-val').innerText = v + '%';
        if (window.SESystem) window.SESystem.setVolume(v / 100);
    });
    window.FallGraDB.load('isMuted', false).then(v => {
        settingsModal.querySelector('#mute-toggle').checked = v;
        if (window.BGMSystem) window.BGMSystem.setMute(v);
        if (window.SESystem) window.SESystem.setMute(v);
    });

    // 設定モーダルのイベントリスナー
    settingsModal.querySelector('#bgm-slider').addEventListener('input', (e) => {
        const val = e.target.value;
        settingsModal.querySelector('#bgm-val').innerText = val + '%';
        if (window.BGMSystem) window.BGMSystem.setVolume(val / 100);
        window.FallGraDB.save('bgmVolume', parseInt(val));
    });
    settingsModal.querySelector('#se-slider').addEventListener('input', (e) => {
        const val = e.target.value;
        settingsModal.querySelector('#se-val').innerText = val + '%';
        if (window.SESystem) window.SESystem.setVolume(val / 100);
        window.FallGraDB.save('seVolume', parseInt(val));
    });
    settingsModal.querySelector('#mute-toggle').addEventListener('change', (e) => {
        const isMuted = e.target.checked;
        if (window.BGMSystem) window.BGMSystem.setMute(isMuted);
        if (window.SESystem) window.SESystem.setMute(isMuted);
        window.FallGraDB.save('isMuted', isMuted);
    });
    settingsModal.querySelector('#close-settings-btn').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    // ドロップダウンリストの開閉と項目のイベント
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // ★ミニゲーム中はドロップダウンを出さず、リタイア確認として機能させる (minigame_ui.js でフック)
        if (window.MinigameManager && (window.MinigameManager.state === 'PLAYING' || window.MinigameManager.state === 'COUNTDOWN')) {
            return; 
        }
        menuDropdown.style.display = menuDropdown.style.display === 'flex' ? 'none' : 'flex';
    });

    menuDropdown.querySelector('#menu-minigame').addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.style.display = 'none';
        if (window.MinigameManager) window.MinigameManager.openListView();
    });

    menuDropdown.querySelector('#menu-setting').addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.style.display = 'none';
        settingsModal.style.display = 'flex';
    });

    // 背景タップでドロップダウンを閉じる
    document.addEventListener('click', () => { menuDropdown.style.display = 'none'; });
    document.addEventListener('touchstart', () => { menuDropdown.style.display = 'none'; }, {passive: true});

    [menuBtn, menuDropdown, settingsModal].forEach(el => {
        el.addEventListener('mousedown', preventTouch);
        el.addEventListener('touchstart', preventTouch, {passive: false});
    });

    document.body.appendChild(uiLayer);

    // 分離した他モジュールのUI生成を呼び出す
    if (window.MultiplayerManager && typeof window.MultiplayerManager.initUI === 'function') {
        window.MultiplayerManager.initUI();
    }
    // ミニゲーム専用UIの初期化
    if (window.MinigameUI && typeof window.MinigameUI.initUI === 'function') {
        window.MinigameUI.initUI();
    }
}
