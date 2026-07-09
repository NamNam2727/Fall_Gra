// =====================================
// ui.js
// 基礎的なUI要素（移動、ジャンプ、チャット等）を生成
// ★チャット欄のデフォルト高さを220pxに拡張
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

        #bottomUIContainer { position: absolute; left: 10px; bottom: 10px; width: 250px; z-index: 20; display: flex; flex-direction: column; justify-content: flex-end; font-family: sans-serif; pointer-events: none; }
        #floatingLog { width: 100%; height: 120px; pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; margin-bottom: 5px; }
        .log-line { font-size: 13px; line-height: 1.4; color: white; text-shadow: 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black; font-weight: bold; opacity: 1; transition: opacity 0.5s ease-out; margin-top: 3px; word-wrap: break-word; }
        .log-line.fade-out { opacity: 0; }
        #bottomTabs { display: flex; pointer-events: auto; }
        .bottom-tab-btn { background-color: rgba(40, 40, 40, 0.9); border: 2px solid #555; border-bottom: none; color: #ccc; font-size: 12px; padding: 6px 15px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; margin-right: -1px; -webkit-tap-highlight-color: transparent; outline: none; }
        .bottom-tab-btn.active { background-color: rgba(20, 20, 20, 0.85); color: #fff; border-color: #777; z-index: 2; }
        
        /* ★ チャット欄の高さを220pxに拡張 */
        #bottomContentArea { height: 220px; background-color: rgba(20, 20, 20, 0.85); border: 2px solid #777; border-bottom: none; border-radius: 0 8px 0 0; pointer-events: auto; display: flex; flex-direction: column; overflow: hidden; transition: height 0.3s ease-in-out, border-width 0.3s ease-in-out; }
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

    // オートカメラ専用の設定
    window.cameraSliderValue = 0.5;
    window.isCameraAuto = true; 

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

    // ★ チャットUIの開閉とリサイズ（ドラッグ）処理
    const chatToggleBtn = bottomUI.querySelector('#chatToggleBtn');
    const bottomContentArea = bottomUI.querySelector('#bottomContentArea');
    const chatTabBtn = bottomUI.querySelector('.bottom-tab-btn[data-target="chat"]');
    
    let isChatMinimized = false;
    // ★ デフォルトの高さを220に変更
    const DEFAULT_CHAT_HEIGHT = 220;
    let currentChatHeight = DEFAULT_CHAT_HEIGHT;

    function openChat() {
        if (isChatMinimized) {
            isChatMinimized = false;
            chatToggleBtn.innerText = '▼';
        }
        bottomContentArea.style.height = currentChatHeight + 'px';
        bottomContentArea.style.borderWidth = '2px';
    }

    chatToggleBtn.addEventListener('click', () => {
        isChatMinimized = !isChatMinimized;
        if (isChatMinimized) {
            bottomContentArea.style.height = '0px';
            bottomContentArea.style.borderWidth = '0px'; 
            chatToggleBtn.innerText = '▲';
        } else {
            // ▲ボタンで開く時は初期の高さにリセットする
            currentChatHeight = DEFAULT_CHAT_HEIGHT;
            bottomContentArea.style.height = currentChatHeight + 'px';
            bottomContentArea.style.borderWidth = '2px';
            chatToggleBtn.innerText = '▼';
        }
    });

    bottomUI.querySelectorAll('.bottom-tab-btn[data-target]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-target');
            
            // ショートカットタブを選んだら高さをリセットする
            if (target === 'shortcut') {
                currentChatHeight = DEFAULT_CHAT_HEIGHT;
            }
            
            openChat(); 
            
            bottomUI.querySelectorAll('.bottom-tab-btn[data-target]').forEach(b => b.classList.remove('active'));
            bottomUI.querySelectorAll('.bottom-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('content-' + target).classList.add('active');
        });
    });

    // ★ チャットタブのドラッグ処理
    let isDraggingChat = false;
    let dragStartY = 0;
    let dragStartHeight = 0;

    function onDragStart(e) {
        if (!chatTabBtn.classList.contains('active') || isChatMinimized) return;

        isDraggingChat = true;
        dragStartY = e.clientY || (e.touches && e.touches[0].clientY);
        dragStartHeight = currentChatHeight;
        
        bottomContentArea.style.transition = 'none';
        
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, {passive: false});
        document.addEventListener('touchend', onDragEnd);
    }

    function onDragMove(e) {
        if (!isDraggingChat) return;
        e.preventDefault(); 
        
        let clientY = e.clientY || (e.touches && e.touches[0].clientY);
        let dy = dragStartY - clientY; 
        
        let newHeight = dragStartHeight + dy;
        
        const minigameBtn = document.getElementById('minigame-btn');
        let maxLimitY = 50; 
        if (minigameBtn) {
            const rect = minigameBtn.getBoundingClientRect();
            maxLimitY = rect.bottom + 10; 
        }
        
        const tabsHeight = document.getElementById('bottomTabs').offsetHeight || 30;
        const maxH = window.innerHeight - 10 - tabsHeight - maxLimitY;
        
        // ★ 最低高さを220pxに変更
        newHeight = Math.max(DEFAULT_CHAT_HEIGHT, Math.min(newHeight, maxH));
        currentChatHeight = newHeight;
        
        bottomContentArea.style.height = currentChatHeight + 'px';
    }

    function onDragEnd() {
        if (!isDraggingChat) return;
        isDraggingChat = false;
        
        bottomContentArea.style.transition = 'height 0.3s ease-in-out, border-width 0.3s ease-in-out';
        
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
    }

    chatTabBtn.addEventListener('mousedown', onDragStart);
    chatTabBtn.addEventListener('touchstart', onDragStart, {passive: false});

    uiLayer.appendChild(bottomUI);
    document.body.appendChild(uiLayer);

    if (window.MultiplayerManager && typeof window.MultiplayerManager.initUI === 'function') {
        window.MultiplayerManager.initUI();
    }
    if (window.MinigameUI && typeof window.MinigameUI.initUI === 'function') {
        window.MinigameUI.initUI();
    }
    if (window.HowToPlay && typeof window.HowToPlay.initUI === 'function') {
        window.HowToPlay.initUI();
    }
}
