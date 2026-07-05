// =========================================================
// chat_system.js
// チャット機能、ログ表示、定型文（ショートカット）管理
// ★ショートカットの保存先をLocalStorageからIndexedDB(FallGraDB)に移行
// =========================================================

window.addLog = function(htmlText, type = 'sys') {
    if (type === 'chat' || type === 'sys') {
        const chatLogContent = document.getElementById('chatLogContent');
        if (chatLogContent) {
            const chatLine = document.createElement('div');
            chatLine.className = `full-log-line log-type-${type}`;
            chatLine.innerHTML = htmlText;
            chatLogContent.appendChild(chatLine);
            chatLogContent.scrollTop = chatLogContent.scrollHeight;
        }
    }

    const chatTabBtn = document.querySelector('.bottom-tab-btn[data-target="chat"]');
    const isChatActive = chatTabBtn && chatTabBtn.classList.contains('active');
    
    // チャットウィンドウが最小化(隠れている)されているか確認
    const bottomContentArea = document.getElementById('bottomContentArea');
    const isMinimized = bottomContentArea && bottomContentArea.style.height === '0px';
    
    if (isChatActive && !isMinimized) {
        return; 
    }

    const floatingLog = document.getElementById('floatingLog');
    if (!floatingLog) return;
    
    const floatLine = document.createElement('div');
    floatLine.className = `log-line log-type-${type}`;
    floatLine.innerHTML = htmlText;
    floatingLog.appendChild(floatLine);

    const removeFloatLine = () => {
        if(!floatLine.classList.contains('fade-out')) {
            floatLine.classList.add('fade-out');
            setTimeout(() => { if (floatLine.parentNode) floatLine.remove(); }, 500); 
        }
    };
    floatLine.timerId = setTimeout(removeFloatLine, 5000);

    const activeLines = Array.from(floatingLog.children).filter(child => !child.classList.contains('fade-out'));
    if (activeLines.length > 5) {
        const oldest = activeLines[0];
        clearTimeout(oldest.timerId); 
        if(!oldest.classList.contains('fade-out')) {
            oldest.classList.add('fade-out');
            setTimeout(() => { if (oldest.parentNode) oldest.remove(); }, 500);
        }
    }
};

window.sendChatMessage = function(text) {
    if (!text) return;
    
    let myName = 'Player';
    if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.name) {
        myName = window.GameState.userInfo.name;
    }

    window.addLog(`<span style="color: #00ffff;">${myName}:</span> ${text}`, 'chat');
    
    if (typeof player !== 'undefined' && player && typeof window.showChatBubble === 'function') {
        window.showChatBubble(player, text);
    }
    
    if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
        window.MultiplayerManager.sendData({
            type: 'chat',
            senderName: myName,
            text: text
        });
    }
};

function customPrompt(message, defaultValue, callback) {
    const existing = document.getElementById('custom-prompt-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-prompt-modal';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; justify-content: center; align-items: center; pointer-events: auto;';

    const box = document.createElement('div');
    box.style.cssText = 'background: rgba(30,30,40,0.95); border: 2px solid #ffaa00; padding: 20px; border-radius: 12px; text-align: center; width: 85%; max-width: 300px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);';

    const msg = document.createElement('div');
    msg.innerText = message;
    msg.style.cssText = 'color: white; margin-bottom: 15px; font-weight: bold; font-family: sans-serif; font-size: 15px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.style.cssText = 'width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 20px; border-radius: 6px; border: 1px solid #555; background: #111; color: white; font-size: 16px; outline: none;';

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; justify-content: space-between; gap: 10px;';

    const btnCancel = document.createElement('button');
    btnCancel.innerText = 'キャンセル';
    btnCancel.style.cssText = 'flex: 1; padding: 10px; border: none; border-radius: 6px; background: #555; color: white; font-weight: bold; cursor: pointer; font-size: 14px;';
    btnCancel.onclick = () => { overlay.remove(); callback(null); };

    const btnOk = document.createElement('button');
    btnOk.innerText = '決定';
    btnOk.style.cssText = 'flex: 1; padding: 10px; border: none; border-radius: 6px; background: #ffaa00; color: #000; font-weight: bold; cursor: pointer; font-size: 14px;';
    btnOk.onclick = () => { overlay.remove(); callback(input.value); };

    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnOk);
    
    box.appendChild(msg);
    box.appendChild(input);
    box.appendChild(btnContainer);
    overlay.appendChild(box);

    document.body.appendChild(overlay);
    input.focus();
}

window.initChatSystem = function() {
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInput');

    if (chatSendBtn && chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                window.sendChatMessage(chatInput.value.trim());
                chatInput.value = '';
            }
        });

        chatSendBtn.addEventListener('click', () => {
            window.sendChatMessage(chatInput.value.trim());
            chatInput.value = '';
        });
    }

    let shortcuts = null;
    let isEditMode = false;

    function renderShortcuts() {
        const grid = document.getElementById('shortcutGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        shortcuts.forEach((text, i) => {
            const btn = document.createElement('button');
            btn.className = 'shortcut-btn';
            btn.innerText = text || '(空)';
            
            if (isEditMode) {
                btn.style.borderColor = '#ffaa00';
                btn.style.color = '#ffaa00';
            }
            
            btn.addEventListener('click', () => {
                if (isEditMode) {
                    customPrompt('ショートカット文を入力してください:', text, (newText) => {
                        if (newText !== null) {
                            shortcuts[i] = newText.trim();
                            // ★IndexedDB(FallGraDB)に保存
                            if (window.FallGraDB) window.FallGraDB.save('fallGraShortcuts', shortcuts);
                            renderShortcuts();
                        }
                    });
                } else {
                    if (text) {
                        window.sendChatMessage(text);
                    }
                }
            });
            grid.appendChild(btn);
        });
    }

    const editBtn = document.getElementById('editShortcutBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            isEditMode = !isEditMode;
            editBtn.innerText = isEditMode ? '編集モード: ON' : '編集モード: OFF';
            editBtn.style.backgroundColor = isEditMode ? '#aa3333' : '#444';
            renderShortcuts();
        });
    }

    // ★非同期でIndexedDBからショートカットを読み込み
    if (window.FallGraDB) {
        window.FallGraDB.load('fallGraShortcuts', null).then(savedData => {
            if (savedData && Array.isArray(savedData)) {
                shortcuts = savedData;
            }

            // IndexedDBに無い場合、過去のLocalStorageからの引き継ぎを試みる
            if (!shortcuts || shortcuts.length === 0) {
                try {
                    let oldData = localStorage.getItem('fallGraShortcuts');
                    if (oldData) {
                        let parsed = JSON.parse(oldData);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            shortcuts = parsed;
                            // 見つけたらすぐにIndexedDBに退避
                            window.FallGraDB.save('fallGraShortcuts', shortcuts); 
                        }
                    }
                } catch(e) {}
            }

            // それでもなければデフォルト値をセット
            if (!shortcuts || shortcuts.length === 0) {
                shortcuts = [
                    "こんにちは！", "よろしく！", "ありがとう", "ごめん！", "たすけて！", "お疲れ様！"
                ];
            } else {
                let modified = false;
                for (let i = 0; i < shortcuts.length; i++) {
                    if (shortcuts[i] === "上に乗せて！") {
                        shortcuts[i] = "たすけて！";
                        modified = true;
                    }
                }
                if (modified) {
                    window.FallGraDB.save('fallGraShortcuts', shortcuts);
                }
            }

            renderShortcuts();
        });
    } else {
        // フォールバック(万が一DBが読み込めなかった場合)
        shortcuts = ["こんにちは！", "よろしく！", "ありがとう", "ごめん！", "たすけて！", "お疲れ様！"];
        renderShortcuts();
    }
};
