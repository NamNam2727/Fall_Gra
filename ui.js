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
            position: absolute; bottom: 40px; right: 15px; width: 80px; height: 80px;
            background: rgba(255, 255, 255, 0.5); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 50%;
            display: flex; justify-content: center; align-items: center; color: #333; font-weight: bold;
            font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            pointer-events: auto; cursor: pointer;
        }
        #jump-btn:active { background: rgba(255, 255, 255, 0.8); transform: scale(0.95); }

        #item-slot {
            position: absolute; bottom: 130px; right: 25px; width: 60px; height: 60px;
            background: rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 10px;
            display: flex; justify-content: center; align-items: center; font-size: 30px;
            pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            transition: transform 0.1s;
        }
        #item-slot.active { pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.9); }
        #item-slot.active:active { transform: scale(0.9); }
        #item-slot.cooling { pointer-events: none; background: rgba(0, 0, 0, 0.8); }
        .item-timer { position: absolute; font-size: 24px; color: white; font-weight: bold; text-shadow: 1px 1px 2px black; font-family: sans-serif; }

        /* カメラスライダーUI */
        #camera-slider-container {
            position: absolute; bottom: 200px; right: 25px; width: 40px; height: 130px;
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

        #bottomUIContainer { position: absolute; left: 10px; bottom: 10px; width: 250px; z-index: 20; display: flex; flex-direction: column; justify-content: flex-end; font-family: sans-serif; pointer-events: none; }
        #floatingLog { width: 100%; height: 120px; pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; margin-bottom: 5px; }
        .log-line { font-size: 13px; line-height: 1.4; color: white; text-shadow: 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black; font-weight: bold; opacity: 1; transition: opacity 0.5s ease-out; margin-top: 3px; word-wrap: break-word; }
        .log-line.fade-out { opacity: 0; }
        #bottomTabs { display: flex; pointer-events: auto; }
        .bottom-tab-btn { background-color: rgba(40, 40, 40, 0.9); border: 2px solid #555; border-bottom: none; color: #ccc; font-size: 12px; padding: 6px 15px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; margin-right: -1px; -webkit-tap-highlight-color: transparent; outline: none; }
        .bottom-tab-btn.active { background-color: rgba(20, 20, 20, 0.85); color: #fff; border-color: #777; z-index: 2; }
        #bottomContentArea { height: 140px; background-color: rgba(20, 20, 20, 0.85); border: 2px solid #777; border-bottom: none; border-radius: 0 8px 0 0; pointer-events: auto; display: flex; flex-direction: column; }
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

        #minigame-btn {
            position: absolute; right: 10px; padding: 8px 16px;
            background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9);
            border-radius: 8px; color: #fff; font-weight: bold; font-family: sans-serif;
            font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto;
            cursor: pointer; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 100;
            display: flex; justify-content: center; align-items: center;
        }
        #minigame-btn:active { background: rgba(255, 150, 0, 1.0); transform: scale(0.95); }
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

    // カメラスライダーの要素を作成
    const cameraSliderContainer = document.createElement('div');
    cameraSliderContainer.id = 'camera-slider-container';
    cameraSliderContainer.innerHTML = `
        <div id="camera-slider-label">CAM</div>
        <input type="range" id="camera-slider" min="0" max="100" value="50">
    `;
    uiLayer.appendChild(cameraSliderContainer);

    window.cameraSliderValue = 0.5;
    
    // ★エラーの完全修正: 画面に追加される前の要素から querySelector で正しく取得する
    const cameraSlider = cameraSliderContainer.querySelector('#camera-slider');
    if (cameraSlider) {
        cameraSlider.addEventListener('input', (e) => {
            window.cameraSliderValue = e.target.value / 100;
        });
    }
    
    cameraSliderContainer.addEventListener('mousedown', e => e.stopPropagation());
    cameraSliderContainer.addEventListener('touchstart', e => e.stopPropagation(), {passive: false});


    const screenHeight = window.innerHeight;
    const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 

    const minigameBtn = document.createElement('div');
    minigameBtn.id = 'minigame-btn';
    minigameBtn.innerText = 'ミニゲーム';
    minigameBtn.style.top = (topExclusionHeight + 15) + 'px';
    minigameBtn.addEventListener('click', () => {
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">ミニゲーム機能は準備中です！</span>', 'sys');
        }
    });
    uiLayer.appendChild(minigameBtn);

    const bottomUI = document.createElement('div');
    bottomUI.id = 'bottomUIContainer';
    bottomUI.innerHTML = `
        <div id="floatingLog"></div>
        <div id="bottomTabs">
            <button class="bottom-tab-btn active" data-target="chat">チャット</button>
            <button class="bottom-tab-btn" data-target="shortcut">ショートカット</button>
        </div>
        <div id="bottomContentArea">
            <div id="content-chat" class="bottom-content active">
                <div id="chatLogContent"></div>
                <div id="chatInputArea">
                    <input type="text" id="chatInput" placeholder="発言..." autocomplete="off">
                    <button id="chatSendBtn">送信</button>
                </div>
            </div>
            <div id="content-shortcut" class="bottom-content">
                <div id="shortcutGrid"></div>
                <button id="editShortcutBtn">編集モード: OFF</button>
            </div>
        </div>
    `;
    
    bottomUI.addEventListener('touchstart', e => e.stopPropagation(), {passive: false});
    bottomUI.addEventListener('pointerdown', e => e.stopPropagation());
    bottomUI.addEventListener('mousedown', e => e.stopPropagation());

    bottomUI.querySelectorAll('.bottom-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            bottomUI.querySelectorAll('.bottom-tab-btn').forEach(b => b.classList.remove('active'));
            bottomUI.querySelectorAll('.bottom-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById('content-' + target).classList.add('active');
        });
    });

    uiLayer.appendChild(bottomUI);
    // ここで初めて画面(DOM)に要素が追加される
    document.body.appendChild(uiLayer);
}
